# TATA_USAHA role: SDMS pegawai sync, TU dashboard, and route wiring

This change introduces a new TATA_USAHA (Tata Usaha) role for school administrative staff whose records already arrive from SDMS as `sdms_pegawai`. A new `syncPegawaiToUsers` step hooks into the existing pegawai webhook upsert to create and update `users` accounts — username = NIP, role = TATA_USAHA, a bcrypt-hashed default password — skipping pegawai without a NIP and deactivating the linked account when a pegawai is removed from SDMS. A gated `/tata-usaha` dashboard renders counts of active students, classes, teachers, and TU staff, and the role is wired through the login redirect, navbar, and admin user management.

**Watch for:** every TU account is provisioned with the same well-known default password (`smkn1kras`) and nothing forces a rotation; that default is also persisted in plaintext in the `plain_password` column alongside its bcrypt hash.

**Verdict**: APPROVED

## High-level view

The SDMS-to-users sync is additive and defensively guarded. A pegawai whose NIP already belongs to a non-TATA_USAHA account is skipped rather than clobbered, so a NIP shared with a teacher account does not get overwritten or duplicated; pegawai with no NIP never get an account at all. When SDMS removes a pegawai (soft delete), the linked TU account is deactivated so it can no longer log in with the default password. `is_active` follows `status_kepegawaian`, though the mapping is a denylist of inactive terms, so an unrecognized or empty status defaults to active.

The TU dashboard is a single `GET /tata-usaha` route and view, both gated with `requireRole('TATA_USAHA')`. The navbar gives TU only Beranda, Profil, and Keluar — no exam, grade, or raport links — and every other role's router (`/teacher`, `/student`, `/admin`, `/principal`) rejects TU with a 403, so the "no TU access to exam/grade/raport" constraint holds at both the UI and the route layer.

The post-login redirect for TU lives in the `/dashboard` route rather than `auth.js`, because `auth.js` sends every successful login to `/dashboard` and `dashboard.js` is where PRINCIPAL, TEACHER, and STUDENT are already routed. Existing role logic is only extended, never altered.

Admin user management now exposes TATA_USAHA in the filter, create, and edit dropdowns and in the bulk delete-by-role confirmation map. The create and edit handlers pass `role` straight through from the form with no whitelist, so TU accounts can be added, edited, and deleted like any other role.

<details>
<summary>Issues (3)</summary>

1. **Shared default password** — all TU accounts are created with `smkn1kras` and nothing forces a change on first login, so any pegawai account is guessable until an admin manually resets it. Generate a per-account password (or force a change on first login) and at minimum instruct staff to change it immediately.
2. **Default password stored in plaintext** — the sync writes `smkn1kras` into the `plain_password` column, readable in the admin UI, mirroring the existing teacher/student pattern. Avoid persisting the default in plaintext going forward.
3. **Fail-open status mapping** — `is_active` uses a denylist of inactive terms (`tidak aktif`, `pensiun`, etc.), so an unrecognized or empty `status_kepegawaian` yields an active account. Treat unknown/empty status as inactive (fail-closed), or at least log unrecognized values.

</details>

<details>
<summary>Details</summary>

### SDMS pegawai → users account sync

`upsertPegawai` already persisted the pegawai row into `sdms_pegawai`; this change appends `syncPegawaiToUsers(data)` right after, so every webhook `pegawai.created`/`pegawai.updated` now also reconciles a `users` account. The sync keys on NIP as the username, skips when NIP or nama is empty, and derives `is_active` from `status_kepegawaian` via a denylist of inactive terms.

Two guards are worth calling out because they are not obvious from the task spec. First, before writing, the sync loads the existing user by username and checks its role; if the username (NIP) is already held by a non-TATA_USAHA account, it logs and returns rather than touching that account. This prevents a NIP that coincides with a teacher account from being silently repurposed or from spawning a duplicate TU account. Second, on the update path it deliberately does not rewrite `role` or `password_hash`, so an admin who later changes the role or resets the password is not fighting the sync.

The `softDeletePegawai` path was extended symmetrically: after marking `sdms_pegawai.is_active=false`, it re-reads the pegawai's NIP and deactivates the matching `users` row (`username=NIP AND role='TATA_USAHA'`). This closes the gap where a removed pegawai could keep logging in on the default password.

The dynamic column handling for `jabatan`/`unit_kerja` is checked once and cached via `information_schema`; the INSERT/UPDATE column lists are built conditionally and parameterized, with column names hardcoded rather than interpolated from input.

### Login redirect and existing-role preservation

The login handler in `auth.js` ends every successful authentication with `res.redirect('/dashboard')`, and the `/dashboard` route in `dashboard.js` is where per-role branching happens. The new TATA_USAHA `if` block sits between the existing PRINCIPAL and TEACHER checks. Existing role wiring is only extended — a new label map key, a new `homeUrl` ternary branch inserted before the final `/student` fallback, and a new dropdown option — none of the existing STUDENT/TEACHER/PRINCIPAL/ADMIN branches or the navbar's existing role label maps were changed. `softDeletePegawai` is a flag flip, and the admin delete-by-role for TATA_USAHA is an admin-initiated action that already existed for the other roles.

### Admin user management

The create (`POST /users`) and edit (`POST /users/:id/edit`, `POST /users/:id/ajax-update`) handlers accept `role` from the request body with no allowlist, so the role passes through unchanged. The `delete-by-role` route's `VALID_ROLES` array, its `roleLabel` confirmation map, and the matching client-side `ROLE_CONFIRM_MAP` in the view were all extended with `TATA_USAHA` (`HAPUS TATA USAHA`).

### Security posture: default password and plaintext storage

Every TU account is created with the default password `smkn1kras` (per the task spec), bcrypt-hashed into `password_hash` for verification, and also written verbatim into `plain_password`. The login path authenticates against `password_hash` only, so the plaintext column is admin-readable but not a runtime auth bypass. The concrete risk is that the default is shared and well-known: until an admin resets a given account, its password is `smkn1kras` for everyone, and there is no first-login forced change to break that window. The role-collision guard and the soft-delete deactivation are the parts of this change that actively reduce risk; the default-password window is the part that introduces it.

### Test coverage

No automated tests were added. The new sync and dashboard paths are exercised only by the webhook and by a logged-in TU respectively, and the commit's verification is `node --check` plus the live SDMS sync already running in production. The role-collision guard, the empty-NIP skip, and the soft-delete deactivation are covered only by code reading, not by assertions.

</details>

<details>
<summary>File map</summary>

- `src/sdms-webhook.js` — adds `syncPegawaiToUsers` (pegawai→users account sync with role-collision guard) and account deactivation in `softDeletePegawai`.
- `src/routes/tata-usaha.js` — new TU dashboard route, `requireRole('TATA_USAHA')`, four count queries.
- `src/views/tata-usaha/index.ejs` — new dashboard view (welcome line + four stat cards), rendered inside the shared layout.
- `src/routes/dashboard.js` — adds the TATA_USAHA → `/tata-usaha` redirect branch.
- `src/server.js` — imports and mounts the `/tata-usaha` router.
- `src/views/partials/navbar.ejs` — adds the `Tata Usaha` role label and the `/tata-usaha` `homeUrl` branch.
- `src/routes/admin.js` — adds TATA_USAHA to the delete-by-role allowlist and confirmation map.
- `src/views/admin/users.ejs` — adds TATA_USAHA to the filter, create, and delete-by-role dropdowns.
- `src/views/admin/users_edit.ejs` — adds TATA_USAHA to the edit-role dropdown.
- `src/middleware/auth.js` — unchanged; `requireRole` already accepts any role string.

Full diff: `git -C d:/WEBSITE/cbt diff 94e584441b7c9d76bc0c4369fafe563712dc7b2c HEAD`

</details>
