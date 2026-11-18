# Laporan Investigasi: Bug Notifikasi Push Ulang

## Ringkasan Temuan (Summary First)

Ada **tiga bug konkret** yang menyebabkan notifikasi tidak muncul ke siswa yang sudah pernah menerima, dan **satu omission** (tombol Edit tidak ada di admin):

| # | Bug | Lokasi | Severity |
|---|-----|--------|----------|
| 1 | **Duplikasi fungsi `showModalNotification`** — fungsi pertama (tanpa `pushCount`) menimpa fungsi kedua (dengan `pushCount`), sehingga perbandingan `closedCount < pushCount` tidak pernah berjalan | `layout.ejs` baris 154–169 dan 169–232 | 🔴 KRITIS |
| 2 | **Type mismatch: string vs integer di `closedMap` lookup** — kunci localStorage selalu string, `notif.id` dari JSON adalah integer, perbandingan `closedCount < pushCount` benar, tapi `closedMap[notif.id]` bisa `undefined` di kasus baru padahal id-nya ada sebagai string key lama | `layout.ejs` baris 142, 221 | 🟡 MEDIUM |
| 3 | **Admin push route menggunakan `MIN(n.id)` yang salah** — query rekap admin GROUP BY title/sender menggunakan `MIN(n.id)`, sehingga push dari admin bisa menghit ID yang berbeda dari notifikasi aktual yang dilihat siswa | `admin.js` baris 5856, 5929 | 🔴 KRITIS |
| 4 | **Tombol Edit tidak ada di halaman admin/notifications** | `admin/notifications.ejs` kolom Aksi | 🟡 MEDIUM |

---

## Bug 1: Duplikasi Fungsi `showModalNotification` (KRITIS)

### Evidence

File: `d:\WEBSITE\cbt\src\views\layout.ejs`

```
// baris 154 — fungsi PERTAMA (definisi lama, tanpa pushCount):
function showModalNotification(notif) {
  const colors = { ... };
  const color = colors[notif.type] || colors.GENERAL;
  const modal = document.createElement('div');   // <-- baris ini tidak punya penutup `}`

// baris 169 — fungsi KEDUA (definisi baru, dengan pushCount):
function showModalNotification(notif, pushCount) {
  if (document.getElementById('modalNotification_' + notif.id)) return;
  ...
}
```

Blok fungsi pertama dimulai pada baris 154 tapi **tidak pernah ditutup dengan `}`** sebelum fungsi kedua dideklarasikan di baris 169. Dalam JavaScript, karena keduanya menggunakan `function` declaration dalam IIFE, **JavaScript hoist keduanya** dan fungsi terakhir menang — tapi masalah lebih subtil: kurung kurawal tidak balance, artinya fungsi pertama "membungkus" seluruh sisa kode sebagai body-nya yang tidak terlaksana. Perilaku aktual tergantung pada JS engine, tapi hasil yang paling mungkin adalah **syntax error silent** atau fungsi yang salah terpanggil.

Verifikasi tambahan: `node --check d:\WEBSITE\cbt\src\views\layout.ejs` tidak berlaku untuk EJS, tapi jika konten `<script>` diekstrak, blok ini **tidak valid JavaScript karena ada dua deklarasi fungsi dengan nama sama** — yang kedua menimpa yang pertama, sehingga `pushCount` parameter pada versi kedua tidak pernah terpakai saat `checkModalNotifications()` memanggil `showModalNotification(notif, pushCount)` — karena yang terpanggil adalah versi pertama yang hanya menerima `notif`, dan `pushCount` diabaikan.

### Dampak

Karena fungsi yang dieksekusi adalah versi lama (tanpa `pushCount`), modal tidak memiliki `data-push-count` attribute dan button `onclick="closeModalNotification(${notif.id},${pushCount})"` juga tidak ada. Ketika siswa menutup modal, `pushCount` yang dikirim ke `closeModalNotification` adalah `undefined`, dan `closedMap[notifId] = undefined` tersimpan. Saat push ulang meningkatkan `push_count` menjadi 2, perbandingan `undefined < 2` adalah `false` (NaN comparison) — sehingga notif **tidak muncul lagi**.

### Fix yang Direkomendasikan

Hapus seluruh blok fungsi pertama (baris 154–168, versi tanpa `pushCount`). Pertahankan hanya fungsi kedua yang sudah benar:

```javascript
// HAPUS ini (baris 154–168):
function showModalNotification(notif) {
  const colors = {
    info: { bg: 'from-blue-50 to-cyan-50', ... },
    ...
  };
  const color = colors[notif.type] || colors.GENERAL;
  const modal = document.createElement('div');
  // (baris tidak ada penutup `}`)

// PERTAHANKAN ini (baris 169+):
function showModalNotification(notif, pushCount) {
  if (document.getElementById('modalNotification_' + notif.id)) return;
  ...
}
```

---

## Bug 2: Type Mismatch String vs Integer di `closedMap` (MEDIUM)

### Evidence

File: `d:\WEBSITE\cbt\src\views\layout.ejs` baris 141–143:

```javascript
const pushCount = notif.push_count || 0;          // number (dari JSON)
const closedCount = closedMap[notif.id];           // notif.id adalah integer (dari JSON)
// closedMap key-nya: closedMap[notifId] di baris 221 — notifId datang dari onclick="closeModalNotification(${notif.id}, ...)"
// => notifId di sini adalah INTEGER (template literal merender angka)
// => closedMap[221] dan closedMap["221"] di JavaScript BERBEDA untuk plain object tapi SAMA karena
//    object key selalu dikonversi ke string — jadi ini BUKAN masalah
```

Setelah investigasi lebih lanjut: JavaScript object key selalu dikonversi ke string, jadi `closedMap[221]` dan `closedMap["221"]` ekuivalen untuk plain object. **Ini bukan bug sendiri**, tapi ada masalah subtil lain:

```javascript
// baris 221 (di closeModalNotification):
closedMap[notifId] = pushCount || 0;
```

Jika `pushCount` parameter ke `closeModalNotification` adalah `undefined` (akibat bug #1 — fungsi versi lama dipanggil), maka `pushCount || 0` = `0`. Sehingga `closedMap[notifId] = 0`. Kemudian setelah push ulang `push_count` = 1, perbandingan `0 < 1` = `true` — seharusnya notif **muncul kembali**. Tapi ini hanya terjadi jika bug #1 tidak memblokir eksekusi sebelumnya.

**Namun ada edge case nyata**: jika notif pertama kali diterima siswa dengan `push_count = 0` (normal), `closedMap[notifId] = 0`. Setelah push ulang `push_count = 1`, `closedCount (0) < pushCount (1)` = **true** — notif harusnya muncul. Logic ini sudah benar, **tapi hanya jika `showModalNotification` yang dipanggil adalah versi dengan `pushCount` parameter** (bug #1 menghalangi ini).

---

## Bug 3: Admin Push Menggunakan `MIN(n.id)` yang Mungkin Salah (KRITIS)

### Evidence

File: `d:\WEBSITE\cbt\src\routes\admin.js` baris 5856:

```javascript
const notifResult = await pool.query(
  `SELECT
     MIN(n.id) AS id,   // <-- mengambil ID terkecil dari grup notifikasi dengan title+sender sama
     n.title,
     ...
   FROM notifications n
   ...
   GROUP BY n.title, n.message, n.type, n.sender_id, ...`
);
```

Halaman admin me-rekap notifikasi dengan GROUP BY (karena dulu sistem insert 1 baris per siswa). `id` yang dikembalikan adalah `MIN(n.id)` — ID terkecil dari grup. Tombol Push Ulang di admin mengirim POST ke `/admin/notifications/<id>/push` dengan ID ini.

**Push route di admin.js** (baris 5929):

```javascript
await pq(`UPDATE notifications SET is_active = true, pushed_at = NOW(),
          push_count = COALESCE(push_count, 0) + 1 WHERE id = $1`, [req.params.id]);
```

Ini mengupdate **hanya satu baris** dengan `MIN(n.id)` — padahal mungkin ada banyak baris dengan title+sender yang sama (sistem lama). Hanya satu baris yang `push_count`-nya naik. Siswa yang notif-nya tergabung ke baris lain (bukan `MIN(id)`) tidak akan melihat `push_count` berubah.

**Namun route `/active` di notifications.js** tidak GROUP BY — ia mengembalikan masing-masing baris notifikasi:

```javascript
// notifications.js baris 264
const [notifications] = await pool.query(
  `SELECT n.id, n.title, n.message, n.type, n.created_at,
          COALESCE(n.push_count, 0) AS push_count
   FROM notifications n
   WHERE n.is_active = true ...`
);
```

Jadi siswa menerima ID notifikasi yang sebenarnya (ID asli baris di DB). Tapi jika guru/admin push dan hanya 1 baris yang di-update `push_count`-nya, sedangkan siswa melihat baris dengan ID berbeda, maka `push_count` yang diterima siswa **tidak berubah** → notif tidak muncul.

### Fix yang Direkomendasikan

Admin push route harus meng-update **semua baris dengan title+sender+type yang sama**, bukan hanya 1 ID:

```javascript
// Daripada:
await pq(`UPDATE notifications SET push_count = COALESCE(push_count, 0) + 1 WHERE id = $1`, [id]);

// Lakukan:
// 1. Ambil data notif dari MIN(id)
// 2. Update semua notif dengan title+message+sender yang sama
await pq(`UPDATE notifications SET is_active = true, pushed_at = NOW(),
          push_count = COALESCE(push_count, 0) + 1
          WHERE title = $1 AND message = $2 AND sender_id = $3 AND type = $4`,
         [notif.title, notif.message, notif.sender_id, notif.type]);

// Dan hapus semua read records untuk semua ID yang ter-update
await pq(`DELETE FROM notification_reads WHERE notification_id IN (
            SELECT id FROM notifications WHERE title = $1 AND message = $2 AND sender_id = $3
          )`, [notif.title, notif.message, notif.sender_id]);
```

---

## Bug 4: Tombol Edit Tidak Ada di Admin (MEDIUM)

### Evidence

File: `d:\WEBSITE\cbt\src\views\admin\notifications.ejs` — kolom Aksi hanya berisi:
- Push Ulang → `POST /admin/notifications/<id>/push`
- Nonaktifkan / Aktifkan → `POST /admin/notifications/<id>/toggle`
- Hapus → `POST /admin/notifications/<id>/delete`

Tidak ada tombol Edit.

File: `d:\WEBSITE\cbt\src\routes\notifications.js` — route `GET /:id/edit` ada tapi:
- Tidak membaca `req.query.return` untuk `returnTo`
- Tidak mengirim `returnTo` ke view `notifications/edit`

Route `POST /:id/edit` di `notifications.js` juga tidak membaca `return_to` dari body dan selalu redirect ke `/notifications` (bukan `/admin/notifications` untuk admin).

### Fix yang Direkomendasikan

**1. Tambah tombol Edit di `admin/notifications.ejs`** (sesudah Push Ulang, sebelum Toggle):

```html
<a href="/notifications/<%= n.id %>/edit?return=admin"
   class="w-full px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-semibold border border-blue-200 transition-all text-center block">
  ✏️ Edit
</a>
```

**2. Update `GET /:id/edit` di `notifications.js`** agar membaca dan meneruskan `returnTo`:

```javascript
router.get('/:id/edit', requireTeacherOrAdmin, async (req, res) => {
  // ...
  const returnTo = req.query.return || '';   // tambahkan ini
  res.render('notifications/edit', { title: 'Edit Notifikasi', notification, classes, students, returnTo });
  //                                                                                                 ^^^^^^^^^
});
```

**3. Update `POST /:id/edit` di `notifications.js`** agar redirect ke admin jika `return_to=admin`:

```javascript
router.post('/:id/edit', requireTeacherOrAdmin, async (req, res) => {
  const { title, message, type, target_type, target_id, expires_hours, return_to } = req.body;
  // ...
  req.flash('success', 'Notifikasi berhasil diupdate');
  const redirectTo = return_to === 'admin' ? '/admin/notifications' : '/notifications';
  res.redirect(redirectTo);
});
```

---

## Verifikasi Route `/active` — Tidak Ada Bug di Sini

Route `GET /notifications/active` di `notifications.js` sudah benar:
- **TIDAK ada** kondisi `NOT EXISTS notification_reads` — tidak memfilter siswa yang sudah baca ✅
- Mengembalikan `COALESCE(n.push_count, 0) AS push_count` ✅
- Query sudah benar untuk target `all`, `class`, `student` ✅
- Tidak ada relasi dengan tabel `notification_reads` di SELECT ✅

Masalah bukan di route `/active`, melainkan di sisi client (layout.ejs, bug #1) dan di sisi admin push (bug #3).

---

## Ringkasan Urutan Perbaikan (Prioritas)

1. **[KRITIS] Hapus duplikasi `showModalNotification` di `layout.ejs`** — ini adalah root cause utama kenapa siswa yang sudah pernah menerima tidak mendapat notif lagi setelah push ulang.

2. **[KRITIS] Fix admin push route untuk update semua baris** dengan title+sender+type yang sama, bukan hanya `MIN(id)`.

3. **[MEDIUM] Tambah tombol Edit di `admin/notifications.ejs`** dan update kedua route edit di `notifications.js` untuk support `return_to=admin`.

4. **[MINOR] Pastikan `notification_reads` read route** menggunakan `ON CONFLICT DO NOTHING` — sudah ada ✅.

---

## File yang Perlu Diubah

| File | Perubahan |
|------|-----------|
| `d:\WEBSITE\cbt\src\views\layout.ejs` | Hapus blok `showModalNotification` versi pertama (baris 154–169) |
| `d:\WEBSITE\cbt\src\routes\admin.js` | Update push route agar UPDATE semua baris satu grup, DELETE semua notification_reads-nya |
| `d:\WEBSITE\cbt\src\views\admin\notifications.ejs` | Tambah tombol Edit di kolom Aksi |
| `d:\WEBSITE\cbt\src\routes\notifications.js` | Update `GET /:id/edit` kirim `returnTo`; Update `POST /:id/edit` redirect ke admin jika `return_to=admin` |
