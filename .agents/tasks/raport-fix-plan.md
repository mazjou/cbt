# Implementation Plan — Raport Tengah Semester: Multi-Kelas per Mapel

## Ringkasan Masalah

`raport_subjects` saat ini punya `class_id` dan `teacher_id` langsung (1 mapel = 1 kelas = 1 guru).
Matematika kelas X, XI, XII bisa punya guru berbeda — ini harus dimodelkan via tabel relasi
`raport_subject_classes` (many-to-many antara mapel ↔ kelas, dengan teacher override per kelas).

Kolom `class_id` dan `teacher_id` lama di `raport_subjects` **tidak dihapus** — dibiarkan agar tidak
break data/query lama (migration additive only).

---

## Urutan Perubahan

```
1. SQL migration (tabel baru)
2. Admin route GET /admin/raport/:id  → query baru (include classes per subject)
3. Admin route POST tambah kelas      → INSERT raport_subject_classes
4. Admin route DELETE hapus kelas     → DELETE raport_subject_classes (AJAX JSON)
5. Admin view raport_detail.ejs       → tampilkan kelas per mapel + tombol +Tambah Kelas
6. Teacher route GET /teacher/raport  → query via raport_subject_classes
7. Teacher route GET /teacher/raport/:period_id/:subject_id/:class_id
8. Teacher route POST /teacher/raport/:period_id/:subject_id/:class_id
9. Teacher view raport.ejs            → link ke URL baru (3 params)
10. Teacher view raport_scores.ejs    → form action pakai class_id, tampilkan nama kelas
```

---

## Item 1 — File SQL Migration

**File:** `d:\WEBSITE\cbt\sql\add_raport_subject_classes.sql`

```sql
-- Migration: tambah tabel raport_subject_classes
-- Jalankan sekali: psql -d <dbname> -f add_raport_subject_classes.sql

CREATE TABLE IF NOT EXISTS raport_subject_classes (
  id            SERIAL PRIMARY KEY,
  raport_subject_id INT NOT NULL REFERENCES raport_subjects(id) ON DELETE CASCADE,
  class_id      INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id    INT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(raport_subject_id, class_id)
);
```

**Catatan:** Tidak ada ALTER TABLE — kolom lama `raport_subjects.class_id` dan
`raport_subjects.teacher_id` tetap ada.

**Verify:** Jalankan file ini di psql. Konfirmasi tabel terbuat dengan `\dt raport_subject_classes`.

---

## Item 2 — Admin Route GET `/admin/raport/:id`

**File:** `d:\WEBSITE\cbt\src\routes\admin.js` — modifikasi fungsi `router.get('/raport/:id', ...)`

**Perubahan:**

Ganti query `rows` yang sekarang join `users` dan `classes` langsung dari `raport_subjects`,
dengan query baru yang mengambil data `raport_subject_classes`:

```javascript
// Query 1: ambil subjects (tanpa join teacher/class langsung dari raport_subjects)
const [subjectRows] = await pq(`
  SELECT
    rsg.id   AS group_id,   rsg.name AS group_name, rsg.sort_order AS group_sort,
    rs.id    AS subject_id, rs.subject_name,        rs.sort_order  AS subject_sort,
    rs.teacher_id           AS default_teacher_id,
    u.full_name             AS default_teacher_name
  FROM raport_subject_groups rsg
  LEFT JOIN raport_subjects rs ON rs.group_id = rsg.id
  LEFT JOIN users u ON u.id = rs.teacher_id
  WHERE rsg.period_id = $1
  ORDER BY rsg.sort_order ASC, rsg.id ASC, rs.sort_order ASC, rs.id ASC
`, [id]);

// Query 2: ambil semua kelas yang terdaftar per subject
const [classRows] = await pq(`
  SELECT
    rsc.id            AS sc_id,
    rsc.raport_subject_id,
    rsc.class_id,
    rsc.teacher_id,
    c.name            AS class_name,
    u.full_name       AS teacher_name
  FROM raport_subject_classes rsc
  JOIN classes c ON c.id = rsc.class_id
  LEFT JOIN users u ON u.id = rsc.teacher_id
  WHERE rsc.raport_subject_id IN (
    SELECT rs.id FROM raport_subjects rs
    JOIN raport_subject_groups rsg ON rsg.id = rs.group_id
    WHERE rsg.period_id = $1
  )
  ORDER BY c.name ASC
`, [id]);
```

Kemudian bangun nested map: untuk setiap subject, kumpulkan kelas-kelas dari `classRows`:

```javascript
// Index classRows per subject_id
const classMap = new Map(); // subject_id -> [{ sc_id, class_id, class_name, teacher_id, teacher_name }]
for (const cr of classRows) {
  if (!classMap.has(cr.raport_subject_id)) classMap.set(cr.raport_subject_id, []);
  classMap.get(cr.raport_subject_id).push({
    sc_id:        cr.sc_id,
    class_id:     cr.class_id,
    class_name:   cr.class_name,
    teacher_id:   cr.teacher_id,
    teacher_name: cr.teacher_name
  });
}

// Bangun groupMap (sama seperti sekarang, tapi subjects punya field 'classes')
const groupMap = new Map();
for (const row of subjectRows) {
  if (!groupMap.has(row.group_id)) {
    groupMap.set(row.group_id, {
      id:         row.group_id,
      name:       row.group_name,
      sort_order: row.group_sort,
      subjects:   []
    });
  }
  if (row.subject_id) {
    groupMap.get(row.group_id).subjects.push({
      id:                   row.subject_id,
      name:                 row.subject_name,
      sort_order:           row.subject_sort,
      teacher_id:           row.default_teacher_id,
      teacher_name:         row.default_teacher_name,   // guru default
      classes:              classMap.get(row.subject_id) || []
    });
  }
}
```

Data ke view tetap: `{ period, groups, teachers, classes }`.

**Verify:** `node --check src/routes/admin.js`

---

## Item 3 — Admin Route POST Tambah Kelas per Mapel

**File:** `d:\WEBSITE\cbt\src\routes\admin.js` — tambah route baru SETELAH route DELETE subjects

```javascript
// POST /admin/raport/subjects/:sid/classes - tambah kelas ke mapel
router.post('/raport/subjects/:sid/classes', async (req, res) => {
  const { sid } = req.params;
  const { class_id, teacher_id } = req.body;
  try {
    // Ambil period_id untuk redirect
    const [[subj]] = await pq(
      `SELECT rsg.period_id
       FROM raport_subjects rs
       JOIN raport_subject_groups rsg ON rsg.id = rs.group_id
       WHERE rs.id = $1`,
      [sid]
    );
    if (!subj) {
      req.flash('error', 'Mapel tidak ditemukan.');
      return res.redirect('/admin/raport');
    }
    await pq(
      `INSERT INTO raport_subject_classes (raport_subject_id, class_id, teacher_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (raport_subject_id, class_id) DO UPDATE SET teacher_id = EXCLUDED.teacher_id`,
      [sid, class_id, teacher_id || null]
    );
    req.flash('success', 'Kelas berhasil ditambahkan ke mata pelajaran.');
    res.redirect('/admin/raport/' + subj.period_id);
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal menambahkan kelas: ' + e.message);
    res.redirect('back');
  }
});
```

**Verify:** `node --check src/routes/admin.js`

---

## Item 4 — Admin Route DELETE Hapus Kelas per Mapel (AJAX)

**File:** `d:\WEBSITE\cbt\src\routes\admin.js` — tambah route baru

```javascript
// DELETE /admin/raport/subject-classes/:scid - hapus relasi kelas dari mapel (AJAX)
router.delete('/raport/subject-classes/:scid', async (req, res) => {
  try {
    await pq(`DELETE FROM raport_subject_classes WHERE id = $1`, [req.params.scid]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: e.message });
  }
});
```

**Verify:** `node --check src/routes/admin.js`

---

## Item 5 — Admin View `raport_detail.ejs`

**File:** `d:\WEBSITE\cbt\src\views\admin\raport_detail.ejs`

### 5a. Perubahan di area render tiap subject (dalam loop `g.subjects.forEach`)

Ganti blok subject row yang sekarang menampilkan `teacher_name` dan `class_name` menjadi:

```ejs
<div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100" id="subject-row-<%= s.id %>">
  <div class="flex-1">
    <div class="flex items-center gap-3 mb-2">
      <span class="w-6 h-6 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold flex items-center justify-center"><%= idx + 1 %></span>
      <p class="text-sm font-semibold text-slate-800"><%= s.name %></p>
      <span class="text-xs text-slate-400">Guru default: <%= s.teacher_name || 'belum diset' %></span>
    </div>

    <%# Daftar kelas terdaftar %>
    <div class="ml-9 space-y-1" id="classes-list-<%= s.id %>">
      <% if (!s.classes || !s.classes.length) { %>
        <p class="text-xs text-amber-600 italic">Belum ada kelas — tambahkan kelas agar guru bisa mengisi nilai</p>
      <% } %>
      <% (s.classes || []).forEach(sc => { %>
        <div class="flex items-center gap-2 text-xs" id="sc-row-<%= sc.sc_id %>">
          <span class="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium"><%= sc.class_name %></span>
          <span class="text-slate-500"><%= sc.teacher_name || s.teacher_name || 'Guru default' %></span>
          <button onclick="hapusSubjectClass(<%= sc.sc_id %>)"
            class="ml-auto p-1 text-red-400 hover:text-red-600 rounded transition-all" title="Hapus kelas ini">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      <% }) %>
    </div>

    <%# Tombol +Tambah Kelas — inline details/summary %>
    <div class="ml-9 mt-2">
      <details class="group">
        <summary class="cursor-pointer inline-flex items-center gap-1 text-xs font-semibold text-green-600 hover:text-green-800 list-none">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          +Tambah Kelas
        </summary>
        <form method="POST" action="/admin/raport/subjects/<%= s.id %>/classes"
          class="mt-2 p-3 bg-green-50 rounded-lg border border-green-100 flex flex-wrap gap-2 items-end">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Kelas <span class="text-red-500">*</span></label>
            <select name="class_id" required
              class="px-2 py-1.5 border-2 border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-xs bg-white min-w-[140px]">
              <option value="">-- Pilih Kelas --</option>
              <% classes.forEach(c => { %>
                <option value="<%= c.id %>"><%= c.name %></option>
              <% }) %>
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Guru Pengampu</label>
            <select name="teacher_id"
              class="px-2 py-1.5 border-2 border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-xs bg-white min-w-[160px]">
              <option value="">-- Guru Default --</option>
              <% teachers.forEach(t => { %>
                <option value="<%= t.id %>"><%= t.full_name %></option>
              <% }) %>
            </select>
          </div>
          <button type="submit"
            class="px-3 py-1.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 text-xs shadow">
            Tambah
          </button>
        </form>
      </details>
    </div>
  </div>

  <%# Tombol edit/hapus mapel (sama seperti sebelumnya) %>
  <div class="flex gap-1 self-start">
    <button onclick="editMapel(<%= s.id %>, '<%= s.name.replace(/'/g, "\\'") %>', <%= s.sort_order %>, '<%= s.teacher_id || '' %>', '')"
      class="p-1.5 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-all" title="Edit mapel">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
      </svg>
    </button>
    <button onclick="hapusMapel(<%= s.id %>)"
      class="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Hapus mapel">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
      </svg>
    </button>
  </div>
</div>
```

### 5b. Tambah fungsi JS `hapusSubjectClass` di blok `<script>`

Tambahkan ke blok `<script>` yang sudah ada (setelah fungsi `hapusMapel`):

```javascript
async function hapusSubjectClass(scId) {
  if (!confirm('Hapus kelas ini dari mata pelajaran?')) return;
  try {
    const resp = await fetch(`/admin/raport/subject-classes/${scId}`, { method: 'DELETE' });
    const data = await resp.json();
    if (data.ok) {
      const row = document.getElementById(`sc-row-${scId}`);
      if (row) row.remove();
    } else {
      alert('Gagal: ' + (data.message || 'Terjadi kesalahan.'));
    }
  } catch (e) {
    alert('Gagal menghapus kelas.');
  }
}
```

### 5c. Modal Edit Mapel — hapus field `class_id` (tidak relevan lagi)

Di modal `modalEditMapel`, hapus blok `<div>` yang berisi select `class_id` (field lama).
Edit mapel sekarang hanya mengubah `subject_name`, `sort_order`, dan `teacher_id` (default).
Route `POST /admin/raport/subjects/:sid/edit` cukup tidak memproses `class_id` lagi
(kolom lama tetap ada di DB, tapi tidak perlu diisi dari UI baru).

**Verify:** Buka browser admin, navigasi ke detail periode, pastikan tiap mapel menampilkan
daftar kelas dan tombol +Tambah Kelas berfungsi.

---

## Item 6 — Teacher Route GET `/teacher/raport`

**File:** `d:\WEBSITE\cbt\src\routes\teacher.js` — ganti query di `router.get('/raport', ...)`

Query lama join `raport_subjects.teacher_id = user.id` — ini sekarang harus diganti dengan
join melalui `raport_subject_classes`:

```javascript
router.get('/raport', async (req, res) => {
  const user = req.session.user;
  try {
    const [rows] = await pool.query(`
      SELECT
        p.id       AS period_id,
        p.name     AS period_name,
        p.semester,
        p.school_year,
        rs.id      AS subject_id,
        rs.subject_name,
        rsg.name   AS group_name,
        rsc.class_id,
        c.name     AS class_name,
        rsc.id     AS sc_id
      FROM raport_periods p
      JOIN raport_subject_groups rsg ON rsg.period_id = p.id
      JOIN raport_subjects rs ON rs.group_id = rsg.id
      JOIN raport_subject_classes rsc ON rsc.raport_subject_id = rs.id
      JOIN classes c ON c.id = rsc.class_id
      WHERE p.is_active = true
        AND rsc.teacher_id = $1
      ORDER BY p.created_at DESC, rsg.sort_order ASC, rs.sort_order ASC, c.name ASC
    `, [user.id]);

    // Bangun nested per periode
    const periodMap = new Map();
    for (const row of rows) {
      if (!periodMap.has(row.period_id)) {
        periodMap.set(row.period_id, {
          id:           row.period_id,
          name:         row.period_name,
          semester:     row.semester,
          school_year:  row.school_year,
          subjects:     []
        });
      }
      // Setiap kombinasi subject + class menjadi 1 entry
      periodMap.get(row.period_id).subjects.push({
        subject_id:   row.subject_id,
        subject_name: row.subject_name,
        group_name:   row.group_name,
        class_id:     row.class_id,
        class_name:   row.class_name
      });
    }
    const periods = [...periodMap.values()];

    res.render('teacher/raport', { title: 'Raport Tengah Semester', user, periods });
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal memuat data raport.');
    res.redirect('/teacher');
  }
});
```

**Catatan desain:** Setiap baris di `periods[x].subjects` adalah kombinasi unik
(subject, class) — bukan subject saja. Ini yang memungkinkan Matematika kelas X dan
Matematika kelas XI muncul sebagai dua entri terpisah jika satu guru mengajar keduanya.

**Verify:** `node --check src/routes/teacher.js`

---

## Item 7 — Teacher Route GET `/teacher/raport/:period_id/:subject_id/:class_id`

**File:** `d:\WEBSITE\cbt\src\routes\teacher.js`

Ganti route `router.get('/raport/:period_id/:subject_id', ...)` yang ada dengan versi baru
yang menerima tiga parameter:

```javascript
// GET /teacher/raport/:period_id/:subject_id/:class_id - form input nilai
router.get('/raport/:period_id/:subject_id/:class_id', async (req, res) => {
  const user = req.session.user;
  const { period_id, subject_id, class_id } = req.params;
  try {
    // Validasi: guru harus terdaftar di raport_subject_classes untuk subject + class ini
    const [[scRow]] = await pool.query(`
      SELECT rsc.id, rs.subject_name, rsg.name AS group_name,
             p.name AS period_name, p.semester, p.school_year,
             c.name AS class_name
      FROM raport_subject_classes rsc
      JOIN raport_subjects rs  ON rs.id  = rsc.raport_subject_id
      JOIN raport_subject_groups rsg ON rsg.id = rs.group_id
      JOIN raport_periods p    ON p.id   = rs.period_id
      JOIN classes c           ON c.id   = rsc.class_id
      WHERE rsc.raport_subject_id = $1
        AND rsc.class_id          = $2
        AND rsc.teacher_id        = $3
        AND rs.period_id          = $4
    `, [subject_id, class_id, user.id, period_id]);

    if (!scRow) {
      req.flash('error', 'Mata pelajaran tidak ditemukan atau Anda tidak berwenang untuk kelas ini.');
      return res.redirect('/teacher/raport');
    }

    // Ambil siswa kelas ini beserta nilai yang sudah ada
    const [students] = await pool.query(`
      SELECT u.id, u.full_name, u.username,
             c.name AS class_name,
             sc.score, sc.notes
      FROM users u
      LEFT JOIN classes c ON c.id = u.class_id
      LEFT JOIN raport_scores sc
        ON sc.student_id        = u.id
        AND sc.period_id         = $1
        AND sc.raport_subject_id = $2
      WHERE u.role      = 'STUDENT'
        AND u.is_active = true
        AND u.class_id  = $3
      ORDER BY u.full_name ASC
    `, [period_id, subject_id, class_id]);

    res.render('teacher/raport_scores', {
      title:      'Input Nilai Raport',
      user,
      subject:    scRow,    // subject_name, group_name, period_name, semester, school_year, class_name
      period_id,
      subject_id,
      class_id,
      students
    });
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal memuat data nilai.');
    res.redirect('/teacher/raport');
  }
});
```

**Perhatian routing:** Route baru ini memiliki 3 params (`/:period_id/:subject_id/:class_id`),
sedangkan yang lama hanya 2 params. Hapus (atau komentari) route lama 2-param agar tidak konflik.
Route POST lama `/:period_id/:subject_id` juga harus diganti (Item 8).

**Verify:** `node --check src/routes/teacher.js`

---

## Item 8 — Teacher Route POST `/teacher/raport/:period_id/:subject_id/:class_id`

**File:** `d:\WEBSITE\cbt\src\routes\teacher.js`

Ganti route `router.post('/raport/:period_id/:subject_id', ...)` dengan:

```javascript
// POST /teacher/raport/:period_id/:subject_id/:class_id - simpan nilai (bulk upsert)
router.post('/raport/:period_id/:subject_id/:class_id', async (req, res) => {
  const user = req.session.user;
  const { period_id, subject_id, class_id } = req.params;
  try {
    // Validasi: guru berhak mengisi nilai untuk subject + class ini
    const [[scRow]] = await pool.query(`
      SELECT rsc.id FROM raport_subject_classes rsc
      WHERE rsc.raport_subject_id = $1
        AND rsc.class_id          = $2
        AND rsc.teacher_id        = $3
    `, [subject_id, class_id, user.id]);

    if (!scRow) {
      req.flash('error', 'Akses ditolak.');
      return res.redirect('/teacher/raport');
    }

    const scores = req.body.scores || {};
    for (const [studentId, data] of Object.entries(scores)) {
      const score = data.score !== '' && data.score !== undefined ? parseFloat(data.score) : null;
      const notes = data.notes || null;
      await pool.query(`
        INSERT INTO raport_scores
          (period_id, student_id, raport_subject_id, score, notes, updated_by, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (period_id, student_id, raport_subject_id)
        DO UPDATE SET score      = EXCLUDED.score,
                      notes      = EXCLUDED.notes,
                      updated_by = EXCLUDED.updated_by,
                      updated_at = NOW()
      `, [period_id, studentId, subject_id, score, notes, user.id]);
    }

    req.flash('success', 'Nilai berhasil disimpan.');
    res.redirect(`/teacher/raport/${period_id}/${subject_id}/${class_id}`);
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal menyimpan nilai: ' + e.message);
    res.redirect(`/teacher/raport/${period_id}/${subject_id}/${class_id}`);
  }
});
```

**Verify:** `node --check src/routes/teacher.js`

---

## Item 9 — Teacher View `raport.ejs`

**File:** `d:\WEBSITE\cbt\src\views\teacher\raport.ejs`

Di dalam loop `p.subjects.forEach(s => { ... })`, ubah `href` link dari:

```ejs
href="/teacher/raport/<%= p.id %>/<%= s.subject_id %>"
```

menjadi:

```ejs
href="/teacher/raport/<%= p.id %>/<%= s.subject_id %>/<%= s.class_id %>"
```

Tambahkan juga tampilan nama kelas di bawah nama mapel, karena mapel yang sama bisa muncul
dua kali (misal: Matematika kelas X dan Matematika kelas XI):

```ejs
<p class="text-xs text-slate-500 truncate"><%= s.group_name %></p>
<p class="text-xs text-indigo-600 font-medium mt-0.5"><%= s.class_name %></p>
```

**Verify:** Guru login → menu Raport → tampil daftar mapel dengan kelas masing-masing.

---

## Item 10 — Teacher View `raport_scores.ejs`

**File:** `d:\WEBSITE\cbt\src\views\teacher\raport_scores.ejs`

**10a.** Ubah `action` form dari:

```ejs
action="/teacher/raport/<%= period_id %>/<%= subject_id %>"
```

menjadi:

```ejs
action="/teacher/raport/<%= period_id %>/<%= subject_id %>/<%= class_id %>"
```

**10b.** Di header subtitle, tambahkan nama kelas (`subject.class_name` tersedia karena
route GET Item 7 meng-set `subject: scRow` yang memiliki `class_name`):

```ejs
<p class="mt-1 text-blue-100">
  <%= subject.group_name %> &bull; <%= subject.period_name %> &bull;
  Sem. <%= subject.semester %> T.P. <%= subject.school_year %> &bull;
  <strong>Kelas <%= subject.class_name %></strong>
</p>
```

**10c.** Di sub-header daftar siswa, pastikan menggunakan `subject.class_name` (bukan
`subject.class_name || 'belum dispesifikasikan'` — sekarang selalu ada karena URL wajib
punya class_id):

```ejs
<p class="text-sm text-indigo-600 font-medium mt-0.5">Kelas: <%= subject.class_name %></p>
```

**Verify:** Dari halaman daftar raport guru, klik salah satu mapel+kelas → halaman nilai
menampilkan nama kelas di header dan hanya siswa dari kelas tersebut.

---

## Potensi Masalah & Hal yang Perlu Diwaspadai

### 1. Konflik route 2-param vs 3-param
Route lama `GET /raport/:period_id/:subject_id` dan `POST /raport/:period_id/:subject_id`
harus dihapus dari `teacher.js`. Jika dibiarkan bersamaan dengan route baru 3-param,
Express bisa salah match. **Solusi:** Ganti (replace) kedua route lama, jangan tambah.

### 2. `raport_subject_classes` bisa kosong untuk mapel lama
Mapel yang sudah ada sebelum migration tidak punya record di `raport_subject_classes`.
Guru tidak akan melihat mapel tersebut di halaman raport sampai admin menambahkan kelas.
**Komunikasikan ini ke admin:** setelah migrasi, semua mapel lama harus diisi kelas-kelasnya
via UI baru.

### 3. Fallback data lama `raport_subjects.teacher_id`
Untuk halaman print raport (`/admin/raport/:period_id/print/:student_id` dan `print-all`),
query saat ini join langsung dari `raport_subjects` tanpa melalui `raport_subject_classes`.
Ini tetap bekerja untuk keperluan cetak karena print hanya butuh `subject_name` dan `score`,
bukan `teacher_id` per kelas. **Tidak perlu diubah** dalam task ini.

### 4. UNIQUE constraint di `raport_subject_classes`
`UNIQUE(raport_subject_id, class_id)` berarti satu kelas hanya bisa muncul sekali per mapel.
Route POST Item 3 menggunakan `ON CONFLICT ... DO UPDATE SET teacher_id` — artinya jika
admin submit form tambah kelas untuk kelas yang sudah ada, teacher_id-nya di-update
(bukan error). Ini perilaku yang diharapkan.

### 5. Guru default di `raport_subjects.teacher_id`
Field ini masih berguna sebagai fallback tampilan di admin (ditampilkan sebagai "Guru default").
Tapi untuk otorisasi di route guru, hanya `raport_subject_classes.teacher_id` yang dicek.
Jika `raport_subject_classes.teacher_id` NULL, guru tidak bisa login ke form nilai mapel itu
meskipun dia guru default. **Solusi:** Saat INSERT `raport_subject_classes`, selalu isi
`teacher_id` (tidak boleh NULL untuk kelas yang ingin aktif diisi nilainya).
Bisa tambahkan `required` di select teacher di form tambah kelas, atau handle di backend
dengan validasi `if (!teacher_id) { req.flash('error', 'Pilih guru pengampu untuk kelas ini'); }`.

### 6. Ordering routes di admin.js — potensi route shadowing
Di `admin.js`, ada pola `router.post('/raport/subjects/:sid/edit', ...)` dan route baru
`router.post('/raport/subjects/:sid/classes', ...)`. Karena prefix sama (`/raport/subjects/:sid`),
urutan tidak masalah — Express match full path. Tapi route
`DELETE /raport/subject-classes/:scid` harus ditambahkan **sebelum** `GET /raport/:id`
karena `/raport/:id` bisa match `/raport/subject-classes` jika Express interpret
`subject-classes` sebagai `:id`. **Solusi:** Tempatkan semua route spesifik
(`/raport/subjects/...`, `/raport/subject-classes/...`, `/raport/groups/...`) **sebelum**
`router.get('/raport/:id', ...)`. Cek posisi saat ini — sudah benar karena route detail
ada di bawah semua route spesifik (line 6083+).

### 7. `node --check` hanya validasi syntax
Verifikasi route secara fungsional tetap perlu test manual di browser setelah server restart.
Jalankan `node --check src/routes/admin.js` dan `node --check src/routes/teacher.js`
sebagai gerbang minimum sebelum commit.

---

## Ringkasan File yang Diubah

| File | Aksi |
|------|------|
| `sql/add_raport_subject_classes.sql` | **BUAT BARU** |
| `src/routes/admin.js` | Modifikasi GET `/raport/:id` + tambah POST + tambah DELETE |
| `src/routes/teacher.js` | Ganti GET `/raport` + ganti GET/POST `/raport/:period_id/:subject_id` |
| `src/views/admin/raport_detail.ejs` | Tambah tampilan kelas per mapel + form +Tambah Kelas + JS hapusSubjectClass |
| `src/views/teacher/raport.ejs` | Ubah href link → 3 params + tampilkan nama kelas |
| `src/views/teacher/raport_scores.ejs` | Ubah form action → 3 params + tampilkan nama kelas di header |
