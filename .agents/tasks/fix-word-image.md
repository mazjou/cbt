# Laporan Investigasi: Gambar Tidak Ter-import dari Word (.docx)

## Ringkasan Temuan

Ada **dua** route handler identik yang terdaftar untuk `POST /exams/:id/questions/import-word` di `src/routes/teacher.js`. Route pertama (baris 1616) adalah implementasi yang benar — ia mem-parse gambar, membuat preview, dan menyimpannya ke sesi. Route kedua (baris 2202) adalah handler lama yang melakukan import langsung tanpa preview. Karena Express menjalankan route pertama yang cocok dan langsung `res.render()`/`res.redirect()` (tidak memanggil `next()`), **route kedua tidak pernah tercapai**.

Masalah gambar bukan terletak di sana. Gambar *berhasil diekstrak* oleh mammoth — tapi ada **satu bug kondisi** di parser blok yang mencegahnya dikaitkan ke soal dalam banyak skenario Word nyata.

---

## Alur Ekstraksi Gambar (Step by Step)

### Route yang aktif: baris 1616 (`question_import_word_preview`)

**Step 1 — Upload dan konversi DOCX ke HTML**  
`mammoth.convertToHtml()` dipanggil dengan opsi `convertImage` custom. Setiap gambar embedded dalam DOCX ditulis ke disk di `uploads/questions/<timestamp>_<nanoid>.<ext>` dan mendapatkan `src = /public/uploads/questions/<fname>`. Mammoth juga menambahkan atribut `data-img-idx` ke setiap `<img>`. Hasilnya adalah string HTML dengan semua gambar sudah tersimpan sebagai file statis.

**Step 2 — Parse HTML ke blok**  
Cheerio mem-load HTML tersebut. Setiap child langsung dari `<body>` diperlakukan sebagai satu blok. Untuk setiap blok, kode mengambil:
- `text`: teks gabungan dari blok (`.text().replace(/\u00a0/g,' ').trim()`)
- `imgs[]`: daftar `src` dari semua `<img>` yang ada di dalam blok

```js
// src/routes/teacher.js  baris ~1657–1668
$('body').children().each((_, el) => {
  const $el = $(el);
  const text = $el.text().replace(/\u00a0/g, ' ').trim();
  const imgs = [];
  $el.find('img').each((__, img) => {
    const src = $(img).attr('src'); if (src) imgs.push(src);
  });
  if ($el.is('img')) { const src = $el.attr('src'); if (src) imgs.push(src); }
  if (text || imgs.length) blocks.push({ text, imgs });
});
```

**Step 3 — Parser blok ke objek soal**  
Parser iterasi setiap blok dengan FSM sederhana:

| Pola | Aksi |
|------|------|
| `^\d+[.)]\s*(.*)$` | Mulai soal baru; teks setelah nomor jadi `question_text`; `imgs[0]` jadi `question_image` |
| Blok kosong (`!t`) + ada gambar | Assign ke konteks: jika `lastLabel` → `option_images[lastLabel]`; else → `question_image` soal |
| `^[A-E][.)]\s*(.*)$` | Set `options[lbl]`; set `lastLabel = lbl`; `imgs[0]` jadi `option_images[lbl]` |
| `KUNCI:`, `TIPE:`, `NILAI:` | Update field terkait; reset `lastLabel = null` |
| Teks lain | Lanjutan soal atau lanjutan opsi tergantung `lastLabel` |

**Step 4 — Validasi dan preview**  
Setiap soal yang berhasil di-parse divalidasi (opsi A–E harus terisi, kunci harus valid). Soal valid masuk `preview[]`, yang gagal masuk `errors[]`. Keduanya disimpan di `req.session.importPreview`.

**Step 5 — Render preview**  
Template `question_import_word_preview.ejs` menghitung jumlah soal bergambar dengan:
```js
const withQImg = preview.filter(q => q.question_image).length
```
Jika `question_image` null untuk semua soal, preview menampilkan "Soal bergambar: 0".

**Step 6 — Commit ke database**  
Route `POST /exams/:id/questions/import/commit` membaca `sess.preview` dari sesi, lalu bulk-insert ke tabel `questions` (menyertakan kolom `question_image`) dan tabel `options` (menyertakan kolom `option_image`).

---

## Lokasi Bug

### Bug 1 — Kondisi assign gambar soal: `!lastLabel` (UTAMA)

```js
// src/routes/teacher.js  baris ~1718–1721
// Gambar inline di baris soal (bukan opsi)
if (imgs.length && !cur.question_image && !lastLabel) cur.question_image = imgs[0];
```

Kondisi `!lastLabel` di sini **hanya** mengizinkan assign gambar ke soal ketika tidak ada opsi yang sudah di-parse sebelumnya. Dalam dokumen Word nyata, gambar soal biasanya disisipkan:
1. Di dalam paragraf yang sama dengan nomor soal (teks + gambar dalam 1 `<p>`)
2. Sebagai paragraf mandiri tepat di bawah nomor soal (blok `!t` + `imgs`)
3. Di dalam teks soal yang panjang, *setelah* sebagian opsi sudah muncul

Untuk kasus 1 dan 2 di atas nomor soal — blok kosong berisi gambar — sudah ditangani oleh:

```js
// baris ~1690–1700
if (!t && imgs.length) {
  if (cur) {
    if (lastLabel && !cur.option_images[lastLabel]) {
      cur.option_images[lastLabel] = imgs[0];
    } else if (!cur.question_image) {
      cur.question_image = imgs[0];           // ← ini benar
    }
  }
  continue;
}
```

Tapi kasus 3 dan kasus di mana blok memiliki *teks sekaligus gambar* (misalnya "Perhatikan gambar ini!" sebagai teks soal, diikuti `<img>` dalam paragraf yang sama) jatuh ke kode baris 1718. Di sana, cek `!lastLabel` **memblokir** assign gambar jika ada opsi yang sudah ter-parse sebelumnya di soal yang sama.

**Contoh skenario yang gagal:**
```
1. Soal tentang gambar ini:
A. Jawaban A
B. Jawaban B
C. Jawaban C
D. Jawaban D
E. Jawaban E
[gambar teks soal — disisipkan setelah opsi sudah diparse, atau dalam blok bersama teks biasa]
KUNCI: C
NILAI: 1
```

Jika gambar disisipkan di dalam Word sebagai paragraf tersendiri *tapi* mammoth merendernya sebagai bagian dari blok yang mengandung teks non-kosong, kondisi `!lastLabel` akan false (karena `lastLabel = 'E'`) dan `cur.question_image` tidak di-set.

### Bug 2 — Gambar yang disisipkan di dalam paragraf teks soal tidak selalu terdeteksi

Ketika Word menyisipkan gambar di tengah paragraf teks (inline image), mammoth mengeluarkan `<p>Teks soal <img src="..."/> lebih lanjut</p>`. Blok ini memiliki `text = "Teks soal lebih lanjut"` (non-kosong) **dan** `imgs = [...]`. Parser mencapai kondisi baris 1718 — tapi hanya jika `!lastLabel` terpenuhi. Jika gambar inline muncul di paragraf teks soal sebelum opsi apapun, `lastLabel` masih `null` dan gambar ter-assign dengan benar. Jika paragraf berisi gambar muncul *setelah* opsi ter-parse (misalnya di lanjutan teks soal yang formatnya tidak berurutan), `lastLabel` sudah terisi dan gambar tidak di-assign.

### Bug 3 — Route duplikat di baris 2202 (kode mati)

Route `POST /exams/:id/questions/import-word` didefinisikan **dua kali**:
- Baris 1616: implementasi lengkap dengan preview dan session storage
- Baris 2202: implementasi lama yang langsung insert ke DB tanpa preview, menggunakan pool driver MySQL (`:paramname` syntax) yang tidak kompatibel dengan PostgreSQL driver yang dipakai (pg), serta tidak menyimpan `question_image` ke DB dengan benar (hanya mengembalikan `{ src }` dari `convertImage` tanpa `data-img-idx`)

Express selalu menjalankan baris 1616 dan **tidak pernah mencapai** baris 2202. Kode mati ini membingungkan dan harus dihapus.

---

## Penyebab "Soal bergambar: 0" di Preview

Urutan khas di dokumen Word guru:
```
1. Pertanyaan soal
A. Opsi A
B. Opsi B
C. Opsi C
D. Opsi D
E. Opsi E
[gambar — inline atau paragraf tersendiri]
KUNCI: B
```

Karena gambar ada **setelah** opsi A–E, `lastLabel = 'E'` pada saat parser memproses blok gambar. Jika blok gambar berisi teks (non-empty), kondisi `!lastLabel` di baris 1718 adalah `false` → gambar tidak ter-assign. Jika blok gambar kosong (hanya `<img>`), ia masuk cabang `!t && imgs.length` di baris ~1690 — tapi di sana, `lastLabel` masih `'E'`, sehingga gambar malah di-assign ke `option_images['E']` bukan ke `question_image`.

Penyisipan gambar oleh guru di Word biasanya setelah nomor soal tapi kerap juga mengikuti opsi — keduanya menyebabkan gambar salah assign atau tidak ter-assign.

---

## Rekomendasi Perbaikan

### Fix 1 — Hapus kondisi `!lastLabel` di baris 1718

```js
// SEBELUM (baris ~1718)
if (imgs.length && !cur.question_image && !lastLabel) cur.question_image = imgs[0];

// SESUDAH
if (imgs.length && !cur.question_image) cur.question_image = imgs[0];
```

Ini memungkinkan gambar di-assign ke `question_image` kapanpun muncul dalam blok teks, selama soal belum punya gambar. Risiko: kalau guru menaruh gambar setelah opsi dan bermaksud gambar itu untuk opsi terakhir (bukan soal), logika menjadi ambigu. Tapi itu adalah edge case; lebih baik assign ke soal daripada tidak di-assign sama sekali.

### Fix 2 — Perbaiki logika blok kosong + gambar ketika `lastLabel` aktif

```js
// SEBELUM (baris ~1690–1700)
if (!t && imgs.length) {
  if (cur) {
    if (lastLabel && !cur.option_images[lastLabel]) {
      cur.option_images[lastLabel] = imgs[0];  // ← gambar salah masuk opsi
    } else if (!cur.question_image) {
      cur.question_image = imgs[0];
    }
  }
  continue;
}
```

Pertimbangkan strategi yang lebih aman: jika soal belum punya `question_image` **dan** blok gambar muncul setelah `KUNCI:` atau setelah semua opsi sudah ada teks, assign ke soal bukan ke opsi. Atau: tambahkan kata kunci `GAMBAR_SOAL:` di template Word sebagai penanda eksplisit bahwa gambar berikutnya milik soal, bukan opsi.

Perbaikan minimal yang aman:

```js
if (!t && imgs.length) {
  if (cur) {
    // Hanya assign ke opsi jika opsi tersebut belum ada teks DAN belum ada gambar
    if (lastLabel && !cur.option_images[lastLabel] && !cur.options[lastLabel]) {
      cur.option_images[lastLabel] = imgs[0];
    } else if (!cur.question_image) {
      // Gambar tanpa konteks opsi → gambar soal
      cur.question_image = imgs[0];
    }
  }
  continue;
}
```

### Fix 3 — Hapus route duplikat di baris 2202

Hapus seluruh blok handler kedua (`router.post('/exams/:id/questions/import-word', ...` di baris 2202–2410). Kode ini tidak pernah berjalan (terhalang route pertama), menggunakan syntax MySQL yang salah untuk PostgreSQL, dan tidak memiliki preview — bertentangan dengan alur yang sudah ada.

### Fix 4 — Update template Word

Template Word yang diunduh guru harus mencantumkan instruksi eksplisit: "Sisipkan gambar soal tepat di bawah nomor soal, sebelum opsi A." Ini memastikan gambar ada di blok setelah `mQ` match, sehingga `startNew(mQ[2], imgs)` langsung men-capture `imgs[0]` sebagai `question_image` tanpa bergantung pada logika `lastLabel`.

---

## Ringkasan File yang Terdampak

| File | Baris | Masalah |
|------|-------|---------|
| `src/routes/teacher.js` | ~1718 | Kondisi `!lastLabel` mencegah assign gambar ke soal |
| `src/routes/teacher.js` | ~1690–1700 | Gambar kosong setelah opsi salah masuk `option_images` |
| `src/routes/teacher.js` | 2202–2410 | Route duplikat — kode mati, harus dihapus |
| `src/views/teacher/question_import_word_preview.ejs` | Semua | Tidak ada bug — preview sudah benar menampilkan `question_image` |

---

## Kesimpulan

Gambar **berhasil diekstrak** dari DOCX (tersimpan ke disk) tetapi **tidak ter-assign ke soal** akibat kondisi `!lastLabel` yang terlalu ketat. Bug paling mudah direproduksi saat guru menyisipkan gambar setelah opsi-opsi (posisi lazim di Word). Perbaikan utama: hapus syarat `!lastLabel` di baris 1718 dan perbaiki logika assign blok gambar kosong di baris ~1690.
