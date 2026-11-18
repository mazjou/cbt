# Findings Report: Browser Detection for CBT Exam Pages

## Summary

Neither `exam_detail.ejs` nor `attempt_take.ejs` contains any browser detection or Chrome-specific warning logic today. The fullscreen system in `attempt_take.ejs` already handles iOS via a hard-coded bypass (`isIOS` flag), but there is no equivalent for other non-Chrome browsers (Edge, Samsung Browser, Xiaomi/MIUI Browser, UC Browser, Firefox, Opera). When these browsers reject `requestFullscreen()`, the error is silently swallowed (`catch(e) {}`), and `updateFsBanner()` immediately shows the "Mode Ujian Aktif" popup because `isFullscreen()` returns `false`. Since no flag prevents re-showing, the popup reappears on every `fullscreenchange` or `visibilitychange` event — the exact repeating-popup problem reported in production.

---

## Evidence

### `exam_detail.ejs` — no browser detection at all

The file is entirely server-rendered EJS markup plus Tailwind CSS classes. There is no `<script>` block whatsoever. The page contains:

- Flash message cards (error / info / success), lines 10–50
- Exam info card, lines 52–98
- A branch: if `attempts_count >= max_attempts` → show results card; else → show "Mulai Ujian" card with a POST form, lines 100–176

There is no `detectBrowser()`, no `window.chrome` check, no user-agent test. The student can reach the "Mulai Ujian" button with any browser and no warning is displayed.

### `attempt_take.ejs` — existing fullscreen logic and its gap

**iOS bypass (already present, lines ~1370–1380 in the script block):**

```js
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
```

`updateFsBanner()` returns early when `isIOS` is true:

```js
function updateFsBanner() {
  if (!antiCheatBar) return;
  if (isIOS) {
    antiCheatBar.style.display = 'none';
    return;
  }
  if (isFullscreen()) {
    antiCheatBar.style.display = 'none';
  } else {
    antiCheatBar.style.display = 'flex';   // ← popup shown
  }
}
```

**`requestFullscreen()` error swallowed silently (lines ~1395–1410):**

```js
async function requestFullscreen() {
  try {
    const el = document.documentElement;
    if (isIOS) { ... return; }
    if (el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: 'hide' });
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else if (isMobile) {
      window.scrollTo(0, 1);
      ...
    }
  } catch (e) {
    // Fullscreen ditolak browser — ujian tetap jalan
  }
}
```

When a browser like Samsung Browser or Xiaomi Browser silently rejects `requestFullscreen()`, the promise rejects, the catch block runs with no side effects, and `updateFsBanner()` is called 500 ms later. At that point `document.fullscreenElement` is `null`, so the popup is shown again. The cycle repeats on every `fullscreenchange` and `visibilitychange` event (both are listened to globally).

**No existing browser-name detection anywhere in either file.**

The only UA-based string in the script is `isMobile` (checks `Android|iPhone|iPad|iPod`) and `isIOS`. There is no `detectBrowser()` function, no `window.chrome` test, and no logic tied to Samsung/MIUI/UC browser strings.

**`reportViolation()` is available (lines ~1255–1285):**

```js
async function reportViolation(type, details) {
  if (anti.max === 0) return;
  if (anti.locked) return;
  ...
  await fetch(`/student/attempts/${anti.attemptId}/violation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, details })
  });
  ...
}
```

This can be called with a custom `type` string to log browser-related warnings server-side.

**`dismissOverlayAndStart()` hides the initial overlay and calls `requestFullscreen` (lines ~1415–1435):** After the overlay is hidden the student can work, but every subsequent fullscreen exit (or failed entry) triggers `updateFsBanner()` → popup appears again.

---

## Root Cause

The repeating popup is caused by `updateFsBanner()` having only one bypass path: `isIOS`. Any other browser that cannot enter fullscreen will always evaluate `isFullscreen()` as `false` and therefore always show the popup. No dismissal flag, no non-Chrome bypass exists.

---

## Recommendations

Implement the changes described in the brief. The order below follows file dependency.

### 1. Add `detectBrowser()` / `isChrome()` helpers (shared shape)

The same function block should be inlined into both files (they are standalone EJS pages with no shared JS module system visible in the codebase). The function exactly as specified in the brief correctly handles all reported browsers.

### 2. `exam_detail.ejs` — persistent non-Chrome banner

Insert a `<script>` block at the very top of the file (before the flex header div). The script should:

1. Call `detectBrowser()` / `isChrome()` on `DOMContentLoaded` (or immediately, since the file is rendered at the bottom of the layout body).
2. If not Chrome, inject a fixed banner `div` as the first child of the page container — or prepend it to `document.body` with `position: static` inside a wrapper so it pushes content down and is always visible. Using `position: fixed` at the top (with a high `z-index`) is also acceptable since the layout does not have a fixed top nav on this page.
3. The banner must be persistent (no close button), show the detected browser name, include the warning text and "Download Chrome" link as specified.

The existing flash-message blocks (`flash.error`, `flash.info`, `flash.success`) are already inside the main container. The banner should be injected **before** those blocks so it appears at the absolute top.

### 3. `attempt_take.ejs` — browser warning overlay + fullscreen popup suppression

**A. Browser warning overlay**

Insert a new overlay `div` (id `browserWarningOverlay`) in the HTML section, immediately **before** the existing `#fsOverlay` div. It should start `display:flex` when the browser is non-Chrome, and `display:none` for Chrome. Its z-index must be higher than `#fsOverlay` (which is `9999`) — use `10000`.

The two buttons:
- "Buka di Chrome" → `window.open(window.location.href, '_blank')` (Chrome will handle the URL if installed; there is no cross-platform way to target Chrome specifically, so opening in a new tab is the correct fallback).
- "Lanjutkan Tetap di [browser]" → sets `window._browserWarningDismissed = true`, hides the overlay, then calls `dismissOverlayAndStart()`.

**B. Suppress repeating fullscreen popup**

In `updateFsBanner()`, add a guard immediately after the `isIOS` guard:

```js
if (window._browserWarningDismissed && !isChrome()) {
  antiCheatBar.style.display = 'none';
  return;
}
```

This prevents the popup from showing again once the student has acknowledged the warning and chosen to continue.

**C. One-time violation log**

After setting `window._browserWarningDismissed = true` in the "Lanjutkan" button handler, call:

```js
reportViolation('Browser Tidak Direkomendasikan', detectBrowser());
```

Call this only once (the flag ensures it cannot be re-triggered).

**D. `detectBrowser()` / `isChrome()` placement**

Place the function block at the very start of the first `<script>` block in the file (before the watermark IIFE), so `isChrome()` is available to all subsequent code including `updateFsBanner()`. The browser overlay HTML can be rendered unconditionally (it starts hidden for Chrome via inline JS that checks `isChrome()` immediately after the DOM element is defined).

---

## Files to Modify

| File | Change |
|---|---|
| `d:\WEBSITE\cbt\src\views\student\exam_detail.ejs` | Add `detectBrowser()` / `isChrome()` JS + persistent non-Chrome banner via script at top of file |
| `d:\WEBSITE\cbt\src\views\student\attempt_take.ejs` | Add `detectBrowser()` / `isChrome()` at top of first script block; add `#browserWarningOverlay` HTML before `#fsOverlay`; add `_browserWarningDismissed` guard in `updateFsBanner()`; call `reportViolation` once on continue |

## No Other Files Need Changes

The violation reporting endpoint `/student/attempts/:id/violation` already exists and is called today for tab-switch and copy/paste events. The new "Browser Tidak Direkomendasikan" violation type requires no server-side schema change — it is stored as a free-form string in the same `type` column used by existing violation types.
