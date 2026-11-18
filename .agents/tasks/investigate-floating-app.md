# Laporan Investigasi: Deteksi Floating App / Screen Overlay di Android

**File yang dianalisis:** `src/views/student/attempt_take.ejs`  
**Tanggal investigasi:** 2025

---

## Ringkasan Eksekutif

**Sistem anti-cheat saat ini TIDAK BISA mendeteksi floating app / screen overlay di Android.**

Ketika siswa membuka aplikasi floating (floating browser, floating notes, screen mirroring, dll) di atas browser yang sedang menampilkan halaman ujian, **tidak ada satupun event anti-cheat yang terpicu**. Browser tetap dianggap aktif, `visibilitychange` tidak muncul, `blur` tidak muncul, dan `document.hasFocus()` tetap `true`. Semua deteksi yang ada saat ini sama sekali buta terhadap skenario ini.

---

## 1. Analisis Event Browser pada Skenario Overlay Android

### `visibilitychange` — TIDAK terpicu

`visibilitychange` dipicu oleh [Page Visibility API](https://developer.mozilla.org/en-us/docs/web/api/page_visibility_api) hanya ketika tab/halaman tidak lagi terlihat oleh pengguna: misalnya pindah tab, minimize browser, atau beralih ke aplikasi lain sepenuhnya. Ketika floating app muncul **di atas** browser, browser masih aktif di bawah — tab tidak disembunyikan, `document.visibilityState` tetap `"visible"`, dan event tidak dikirim.

### `blur` / `window.blur` — TIDAK terpicu

`blur` pada `window` terpicu ketika jendela browser kehilangan fokus input (misalnya pengguna mengklik jendela lain di desktop, atau berpindah aplikasi di mobile). Floating app yang menggunakan Android `SYSTEM_ALERT_WINDOW` permission ditampilkan oleh sistem operasi **di atas** browser — browser tidak kehilangan fokus karena pengguna tidak beralih ke aplikasi lain. Browser tetap menjadi foreground app; overlay hanya "menggantung" di atas layar menggunakan layer sistem. Akibatnya, `blur` tidak terpicu.

> Catatan tambahan dari kode: sistem sudah dengan sengaja menonaktifkan listener `blur` di perangkat mobile (`if (!isMobileDevice)`) karena blur sering muncul palsu saat keyboard virtual muncul/hilang. Artinya di Android, `blur` benar-benar tidak digunakan sama sekali.

### `document.hasFocus()` — TETAP `true`

`hasFocus()` mengecek apakah dokumen atau elemen di dalamnya memiliki fokus input. Karena browser tidak kehilangan fokus saat overlay muncul di atasnya, `hasFocus()` tetap mengembalikan `true`. Tidak ada perubahan yang bisa dideteksi.

### `fullscreenchange` — BERVARIASI, tidak andal

Jika siswa memulai ujian dalam fullscreen, beberapa floating app dapat memaksa keluar dari fullscreen — event `fullscreenchange` akan terpicu dan sistem saat ini sudah mencatatnya sebagai pelanggaran. **Namun ini tidak universal**: banyak floating app bisa tampil di atas fullscreen tanpa keluar dari mode fullscreen sama sekali (terutama di Android dengan bubble overlay seperti Facebook Messenger Chat Heads atau picture-in-picture). Mekanisme ini tidak bisa diandalkan sebagai pendeteksi overlay.

---

## 2. Apakah Ada Web API yang Bisa Mendeteksi Overlay?

**Tidak ada.** Ini adalah keterbatasan fundamental platform web:

- Web API hanya bisa mengamati kondisi **tab/dokumen di dalam browser**, bukan apa yang terjadi di **atas browser** di level sistem operasi.
- Android `SYSTEM_ALERT_WINDOW` adalah fitur OS-level. Browser (Chrome, Firefox, Samsung Browser) tidak mendapat notifikasi apapun ketika aplikasi lain menggambar di atasnya menggunakan permission ini.
- [Screen Capture API (`getDisplayMedia`)](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API) bisa menangkap layar, tetapi membutuhkan persetujuan eksplisit dari pengguna dan tidak bisa digunakan untuk mendeteksi keberadaan overlay secara diam-diam.
- Native Android API `View#onFilterTouchEventForSecurity()` dan flag `FLAG_WINDOW_IS_OBSCURED` bisa mendeteksi overlay, tetapi ini hanya tersedia untuk **native Android app**, bukan untuk halaman web di browser.

---

## 3. Status Deteksi Saat Ini di `attempt_take.ejs`

| Mekanisme Anti-Cheat | Lokasi di File | Mendeteksi Floating App? |
|---|---|---|
| `visibilitychange` | Baris ~1370 | ❌ Tidak |
| `window.blur` | Baris ~1374 (desktop only) | ❌ Tidak (dinonaktifkan di mobile) |
| `fullscreenchange` | Baris ~1348 | ⚠️ Sebagian (hanya jika overlay memaksa keluar fullscreen) |
| Copy/paste/cut | Baris ~1393 | ❌ Tidak relevan |
| Keyboard shortcut | Baris ~1398 | ❌ Tidak relevan |
| Translate detection (MutationObserver) | Baris ~1215 | ❌ Tidak relevan |
| Browser warning (non-Chrome) | Baris ~1130 | ❌ Tidak relevan |
| Heartbeat setiap 60 detik | Baris ~1163 | ❌ Tidak |

**Kesimpulan:** Tidak ada mekanisme deteksi saat ini yang menangani kasus floating app di Android.

---

## 4. Rekomendasi Perbaikan

Karena Web API tidak bisa mendeteksi overlay secara teknis, pendekatannya harus bergeser ke **kombinasi deteksi tidak langsung + kebijakan** berikut:

### 4.1. Deteksi Interaksi Terhenti (Idle Detection)

Jika siswa menggunakan floating app, ia kemungkinan besar berhenti berinteraksi dengan halaman ujian (tidak ada klik, scroll, atau pilih jawaban). Pasang timer inaktivitas:

```javascript
let lastInteraction = Date.now();
const IDLE_THRESHOLD_MS = 3 * 60 * 1000; // 3 menit tanpa interaksi

['click', 'touchstart', 'keydown', 'scroll', 'mousemove'].forEach(ev => {
  document.addEventListener(ev, () => { lastInteraction = Date.now(); }, { passive: true });
});

setInterval(() => {
  if (Date.now() - lastInteraction > IDLE_THRESHOLD_MS) {
    reportViolation('Tidak Ada Aktivitas', `Tidak ada interaksi selama ${IDLE_THRESHOLD_MS/60000} menit`);
    lastInteraction = Date.now(); // reset agar tidak spam
  }
}, 60000);
```

**Keterbatasan:** siswa yang memang berpikir lama juga bisa terkena. Sesuaikan threshold (3–5 menit).

### 4.2. Deteksi Picture-in-Picture (PiP) API

Android Chrome mendukung [Picture-in-Picture API](https://developer.mozilla.org/en-US/docs/Web/API/Picture-in-Picture_API). Ketika video dari halaman lain masuk ke mode PiP dan tumpang tindih di atas browser, event `enterpictureinpicture` dapat dideteksi dari `document`:

```javascript
document.addEventListener('enterpictureinpicture', () => {
  reportViolation('Picture-in-Picture Aktif', 'Video PiP overlay terdeteksi di atas halaman ujian');
});
```

Ini hanya mendeteksi **PiP video dari browser yang sama** — tidak mendeteksi floating app dari aplikasi lain.

### 4.3. Panduan Teknis untuk Pengawas: Periksa "Display over other apps"

Instruksikan pengawas untuk meminta siswa membuka **Pengaturan → Aplikasi → Akses Khusus → Tampil di atas aplikasi lain** sebelum ujian dimulai, dan memastikan tidak ada aplikasi yang memiliki izin tersebut (kecuali yang diperlukan sistem). Ini adalah satu-satunya cara yang andal secara teknis.

Tambahkan tampilan checklist ini di halaman persiapan ujian (sebelum `fsOverlay`):

```html
<div id="preExamChecklist">
  <p>Sebelum memulai, nonaktifkan:</p>
  <ul>
    <li>Aplikasi floating / overlay (Pengaturan → Aplikasi → Tampil di atas aplikasi lain)</li>
    <li>Split screen / multi-window</li>
    <li>Screen mirroring / cast</li>
  </ul>
</div>
```

### 4.4. Blokir Multi-Window Android (Kebijakan Fullscreen)

Sistem sudah menggunakan `requestFullscreen`. Di Android Chrome, fullscreen menonaktifkan sebagian fitur multi-window. Tambahkan pengecekan berkala apakah fullscreen masih aktif (saat ini sudah ada lewat `fullscreenchange`, tapi tidak ada polling):

```javascript
// Polling fullscreen setiap 10 detik sebagai fallback
setInterval(() => {
  if (!isIOS && !isFullscreen() && !anti.locked) {
    reportViolation('Keluar Fullscreen (Polling)', 'fullscreen_poll');
    requestFullscreen();
  }
}, 10000);
```

Ini mendeteksi kasus di mana siswa keluar dari fullscreen untuk membuka split-screen atau floating window, tapi `fullscreenchange` tidak terpicu dengan benar.

### 4.5. Kebijakan Administratif (Paling Efektif)

Semua solusi teknis di atas bersifat parsial. Kebijakan berikut lebih efektif:

- **Gunakan browser khusus ujian** (misalnya Safe Exam Browser versi Android) yang memblokir overlay di level OS. Versi open-source tersedia.
- **Wajibkan MDM (Mobile Device Management)** di perangkat sekolah untuk menonaktifkan izin `SYSTEM_ALERT_WINDOW` secara paksa.
- **Pengawas aktif** selama ujian yang memperhatikan layar fisik siswa.
- **Rekam layar** menggunakan Google Meet / Zoom yang diwajibkan siswa aktifkan selama ujian (efektif tapi membutuhkan koneksi stabil).

---

## 5. Prioritas Implementasi

| Prioritas | Rekomendasi | Kompleksitas | Efektivitas |
|---|---|---|---|
| 1 | Checklist persiapan (nonaktifkan overlay) | Rendah | Sedang |
| 2 | Idle detection (tidak ada interaksi) | Rendah | Sedang |
| 3 | Polling fullscreen setiap 10 detik | Sangat rendah | Rendah-Sedang |
| 4 | PiP detection | Rendah | Rendah (terbatas) |
| 5 | Safe Exam Browser Android | Tinggi (setup) | Tinggi |
| 6 | MDM di perangkat sekolah | Sangat tinggi | Sangat tinggi |

---

## 6. Kesimpulan

Sistem anti-cheat di `attempt_take.ejs` sudah baik untuk mendeteksi pindah tab, translate otomatis, copy-paste, dan keluar fullscreen di desktop/PC. Namun terhadap **floating app / screen overlay Android**, sistem ini tidak mampu mendeteksi karena keterbatasan fundamental Web API — browser tidak mendapat notifikasi dari OS ketika aplikasi lain menggambar di atasnya.

Langkah paling realistis tanpa mengganti platform adalah: (1) tambahkan idle detection sebagai sinyal tidak langsung, (2) tambahkan polling fullscreen, dan (3) buat checklist yang menginstruksikan siswa menonaktifkan izin overlay sebelum ujian dimulai. Untuk keamanan lebih tinggi, perlu pertimbangkan Safe Exam Browser Android.
