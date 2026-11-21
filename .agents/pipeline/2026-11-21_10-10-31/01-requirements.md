# Requirements — Tipe Soal MULTI_TF

**Pipeline:** `2026-11-21_10-10-31`  
**Step:** 01 — Requirements  
**Status:** Draft

---

## Summary

Tambahkan tipe soal baru bernama **MULTI_TF** ke LMS CBT. Tipe ini menyajikan satu stem pertanyaan diikuti beberapa **pernyataan** (sub-soal), masing-masing dijawab Benar atau Salah secara independen. Penilaian bersifat parsial: setiap pernyataan yang dijawab benar menambah poin secara proporsional; menjawab semua benar menghasilkan poin penuh. Tipe ini mirip soal paket TKA UTBK "Hubungan Antarpernyataan / Pernyataan Majemuk".

Fitur ini harus bisa dibuat manual oleh guru, diimpor lewat Word / Excel / CSV, dan mendukung gambar serta tabel di teks soal maupun teks pernyataan.

---

## Assumptions

> Asumsi-asumsi ini dibuat berdasarkan analisis kode dan permintaan pengguna. Design review diharapkan mengoreksi yang tidak tepat.

1. **Nama tipe:** `MULTI_TF` — ditambahkan ke daftar valid di semua tempat yang memeriksa `question_type` (saat ini: `MCQ`, `CHECKBOX`, `TRUE_FALSE`, `COMPLEX`).
2. **Penyimpanan pernyataan:** Setiap pernyataan disimpan sebagai satu baris di tabel `options` (atau `question_bank_options`), dengan `option_label` A–E (maks 5), `is_correct` = true/false (jawaban benar per pernyataan), dan teks pernyataan di `option_text`. Ini menggunakan skema tabel yang sudah ada tanpa migrasi kolom baru — hanya perlu memastikan `question_type` diterima sebagai `VARCHAR(20)` (sudah dilakukan migrasi `migrate-question-types.js`).
3. **Scoring parsial:** `floor(pernyataan_benar_dipilih / total_pernyataan × poin_soal)`. Menjawab semua pernyataan dengan benar = poin penuh. Menjawab salah tidak dikenakan penalti — hanya tidak mendapat poin atas pernyataan tersebut.
4. **Penyimpanan jawaban siswa:** Jawaban per pernyataan disimpan di `attempt_answers` dengan kolom `selected_option_ids` (JSON array berisi option_id yang dijawab "Benar" oleh siswa). Kolom ini sudah ada dari migrasi sebelumnya.
5. **Jumlah pernyataan:** 2–5 (minimum 2 agar bermakna, maksimum 5 sesuai permintaan pengguna).
6. **Import Word:** Parser `.docx` yang sudah ada di `teacher.js` (via `mammoth` + `cheerio`) perlu diperluas untuk mengenali sinyal tipe `TIPE: MULTI_TF` dan format pernyataan.
7. **Import Excel/CSV:** Kolom `question_type` = `MULTI_TF`, kunci jawaban menggunakan format `A:B,B:S,C:B,D:S` (label:B/S untuk Benar/Salah per pernyataan), teks pernyataan di kolom `A`–`E` seperti biasa.
8. **Gambar dan tabel:** Didukung lewat editor Summernote yang sudah ada (HTML rich text) untuk stem dan teks pernyataan. Gambar soal (satu gambar utama) dan gambar per pernyataan (option_image) juga didukung sama seperti tipe lain.
9. **Antarmuka ujian siswa:** Setiap pernyataan ditampilkan sebagai baris dengan dua tombol toggle (Benar / Salah) yang bisa dipilih secara independen.
10. **Review hasil:** Tampilan detail jawaban benar/salah per pernyataan setelah ujian selesai.

---

## Functional Requirements

### FR-1 — Pembuatan Soal Manual (Guru)

- **FR-1.1** Guru dapat memilih tipe `MULTI_TF` ("Multi Benar/Salah") pada form tambah soal di bank soal (`/teacher/question-bank/new`) dan pada form tambah soal ujian (`/teacher/exams/:id` → tombol tambah soal).
- **FR-1.2** Setelah memilih `MULTI_TF`, form menampilkan field untuk stem pertanyaan (rich text dengan Summernote, mendukung gambar dan tabel) dan 2–5 field teks pernyataan (A–E), masing-masing dengan tombol kunci jawaban Benar/Salah.
- **FR-1.3** Guru menetapkan jawaban benar setiap pernyataan secara independen (bukan satu kunci global).
- **FR-1.4** Validasi server: minimal 2 pernyataan harus diisi (A dan B), maksimal 5 (A–E). Setiap pernyataan yang teksnya diisi harus memiliki kunci jawaban (B atau S). Stem pertanyaan wajib diisi.
- **FR-1.5** Guru dapat menetapkan poin soal (integer ≥ 1). Poin parsial dihitung otomatis saat penilaian; guru tidak perlu mengisi poin per pernyataan.
- **FR-1.6** Guru dapat mengedit soal `MULTI_TF` yang sudah ada: mengubah teks stem, teks pernyataan, kunci jawaban, dan poin.

### FR-2 — Tampilan Soal saat Ujian (Siswa)

- **FR-2.1** Soal `MULTI_TF` ditampilkan dengan stem pertanyaan di atas, diikuti daftar pernyataan berlabel A, B, C, ... .
- **FR-2.2** Setiap pernyataan memiliki dua tombol toggle: **Benar** dan **Salah**. Siswa memilih salah satu per pernyataan secara independen.
- **FR-2.3** Siswa dapat menjawab sebagian pernyataan dan melewati sisanya (jawaban parsial diizinkan).
- **FR-2.4** Status "sudah dijawab" pada navigator soal (drawer) dianggap terpenuhi jika minimal satu pernyataan sudah dijawab.
- **FR-2.5** Jawaban tersimpan secara otomatis (autosave) saat siswa mengklik tombol Benar/Salah, sama seperti tipe lain.
- **FR-2.6** Saat halaman dimuat ulang (resume ujian), pilihan siswa sebelumnya ditampilkan kembali.

### FR-3 — Penilaian

- **FR-3.1** Penilaian dilakukan per pernyataan: setiap pernyataan yang dijawab sesuai kunci mendapat poin parsial `floor(1 / N × poin_soal)` di mana N = jumlah total pernyataan, kecuali pembagian tidak rata mengakibatkan poin terakhir menyesuaikan sisa (lihat FR-3.2).
- **FR-3.2** Rumus total poin soal: `floor(benar_terjawab / N × poin_soal)`. Menjawab semua N pernyataan dengan benar = poin penuh. Jawaban salah tidak dikenakan penalti.
- **FR-3.3** Kalkulasi dilakukan di `submission-utils.js` pada fungsi `finalizeAttemptWithBackup`, dengan menambahkan branch `MULTI_TF` sejajar dengan branch `COMPLEX`/`CHECKBOX`.
- **FR-3.4** Nilai `partial_points` dan `is_correct` (true hanya jika semua benar) disimpan ke `attempt_answers.partial_points` dan `attempt_answers.is_correct` seperti tipe CHECKBOX/COMPLEX.

### FR-4 — Import Word (.docx)

- **FR-4.1** Parser Word yang ada diperluas untuk mengenali penanda `TIPE: MULTI_TF` dalam dokumen.
- **FR-4.2** Format pernyataan dalam dokumen Word: setiap pernyataan diawali huruf dan tanda titik (misal `A. Pernyataan`), diikuti jawaban benar via sinyal inline `KUNCI_A: B` atau `KUNCI_A: S` (Benar/Salah) per pernyataan, atau format alternating seperti tabel dua kolom (teks | B/S).
- **FR-4.3** Template Word yang bisa diunduh guru diperbarui dengan contoh soal `MULTI_TF`.
- **FR-4.4** Gambar yang disisipkan di dalam dokumen Word (di stem atau di dekat pernyataan) diekstrak dan disimpan sebagai gambar soal atau gambar opsi seperti tipe lain.

### FR-5 — Import Excel / CSV

- **FR-5.1** Template import Excel diperbarui dengan contoh baris `MULTI_TF`.
- **FR-5.2** Format kunci jawaban untuk `MULTI_TF` di kolom `correct`: `A:B,B:S,C:B,D:S` (label pernyataan : B untuk Benar / S untuk Salah). Urutan boleh sembarang asal konsisten dengan kolom A–E yang diisi.
- **FR-5.3** Parser import (`question_bank.js` dan `teacher.js`) mengenali tipe `MULTI_TF` dan memproses kunci jawaban sesuai format FR-5.2.
- **FR-5.4** Baris dengan tipe `MULTI_TF` yang tidak memenuhi format kunci (kurang dari 2 pernyataan atau format salah) ditolak dengan pesan error yang jelas di halaman preview.

### FR-6 — Tampilan Hasil Ujian

- **FR-6.1** Pada halaman hasil ujian siswa (`attempt_result.ejs`), soal `MULTI_TF` menampilkan status per pernyataan: jawaban siswa, jawaban benar, dan apakah benar atau salah.
- **FR-6.2** Pada halaman detail attempt guru/admin, scoring parsial soal `MULTI_TF` ditampilkan (misal: "2 / 4 pernyataan benar → 2 poin dari 4").

### FR-7 — Bank Soal

- **FR-7.1** Soal `MULTI_TF` di bank soal dapat dilihat, diedit, dan dihapus seperti tipe lain.
- **FR-7.2** Soal `MULTI_TF` dari bank soal dapat diimpor ke ujian melalui mekanisme yang sudah ada.
- **FR-7.3** Export bank soal ke Excel mencakup soal `MULTI_TF` dengan format kunci per FR-5.2.

---

## Non-Functional Requirements

- **NFR-1 — Konsistensi:** Implementasi mengikuti pola kode yang ada. Tipe `MULTI_TF` diperlakukan sejajar dengan `CHECKBOX`/`COMPLEX` di semua switch/if yang memeriksa `question_type`.
- **NFR-2 — Migrasi database:** Tidak memerlukan perubahan skema tabel baru. Kolom `question_type VARCHAR(20)` dan `selected_option_ids TEXT` sudah ada dari migrasi sebelumnya. Hanya perlu memastikan nilai `'MULTI_TF'` diterima.
- **NFR-3 — Validasi input:** Semua input dari pengguna (form, import) divalidasi di sisi server sebelum diproses. Error dikembalikan via flash message atau baris error di preview.
- **NFR-4 — Keamanan file:** Upload gambar menggunakan filter ekstensi yang sudah ada (`DANGEROUS_EXTENSIONS`). Tidak ada perubahan kebijakan keamanan upload.
- **NFR-5 — Autosave:** Jawaban `MULTI_TF` ikut mekanisme autosave yang sudah ada (kirim ke endpoint `/quiz-api` atau endpoint autosave yang berlaku), sehingga tidak ada kehilangan jawaban saat koneksi terputus sebentar.

---

## Acceptance Criteria

1. **AC-1:** Guru membuka form tambah soal bank soal atau soal ujian, memilih tipe `MULTI_TF`, mengisi stem + 3 pernyataan + kunci masing-masing, klik simpan → soal tersimpan di DB dengan `question_type = 'MULTI_TF'` dan 3 baris di `options`/`question_bank_options` dengan `is_correct` sesuai kunci.

2. **AC-2:** Guru mencoba menyimpan soal `MULTI_TF` dengan hanya 1 pernyataan diisi → server mengembalikan error "Minimal 2 pernyataan harus diisi" dan soal tidak tersimpan.

3. **AC-3:** Siswa membuka halaman ujian yang berisi soal `MULTI_TF` dengan 4 pernyataan → setiap pernyataan menampilkan dua tombol toggle (Benar / Salah) yang bisa dipilih secara independen; memilih Benar untuk pernyataan A tidak memengaruhi pernyataan B.

4. **AC-4:** Siswa menjawab 3 dari 4 pernyataan dengan benar pada soal `MULTI_TF` bernilai 4 poin → setelah submit, `attempt_answers.partial_points` = `floor(3/4 × 4)` = 3, dan skor akhir mencerminkan nilai tersebut.

5. **AC-5:** Siswa menjawab semua 4 pernyataan dengan benar pada soal `MULTI_TF` bernilai 4 poin → `is_correct = true`, `partial_points = 4`.

6. **AC-6:** Siswa menjawab 0 pernyataan (tidak menjawab soal sama sekali) → `partial_points = 0`, `is_correct = false`, tidak ada penalti.

7. **AC-7:** Guru mengunduh template import Excel → sheet berisi contoh baris dengan `question_type = MULTI_TF` dan kolom `correct` berisi format `A:B,B:S,C:B` (sesuai FR-5.2).

8. **AC-8:** Guru mengupload file Excel berisi 2 soal `MULTI_TF` valid → halaman preview menampilkan kedua soal tanpa error; commit menyimpan keduanya ke bank soal.

9. **AC-9:** Guru mengupload file Excel berisi soal `MULTI_TF` dengan kolom `correct` = `A:B` (hanya 1 pernyataan) → halaman preview menampilkan baris tersebut sebagai error dengan pesan "MULTI_TF: minimal 2 pernyataan wajib diisi".

10. **AC-10:** Guru mengupload file Word dengan soal `TIPE: MULTI_TF` dan 3 pernyataan → parser menghasilkan soal `MULTI_TF` dengan 3 pernyataan dan kunci yang benar; soal muncul di preview import.

11. **AC-11:** Halaman hasil ujian siswa untuk attempt yang mengandung soal `MULTI_TF` menampilkan status per pernyataan (benar/salah) dan poin yang diperoleh untuk soal tersebut.

12. **AC-12:** Soal `MULTI_TF` di bank soal dapat diedit; perubahan kunci jawaban pernyataan B dari Benar ke Salah tersimpan dengan benar.

13. **AC-13:** Export bank soal ke Excel menghasilkan baris dengan `question_type = MULTI_TF` dan kolom `correct` dalam format `A:B,B:S,...` yang bisa diimpor ulang tanpa error.

---

## Out of Scope

- **Penilaian negatif (penalti):** Menjawab salah tidak dikurangi poin. Jika dikemudian hari diminta, itu fitur terpisah.
- **Lebih dari 5 pernyataan per soal:** Pembatasan 5 adalah keputusan produk sesuai permintaan pengguna; perluasan ke N > 5 bukan bagian dari fitur ini.
- **Tipe soal campuran dalam satu nomor (soal majemuk dengan sub-soal MCQ):** MULTI_TF khusus untuk sub-soal Benar/Salah saja.
- **Import dari PDF:** Hanya Word, Excel, dan CSV yang didukung.
- **Shuffling pernyataan:** Acak urutan pernyataan (seperti shuffle options untuk MCQ) tidak diminta dan tidak diimplementasikan.
- **Perubahan antarmuka laporan/raport agregat:** Laporan nilai per soal dan raport siswa tidak diubah dalam scope ini.
- **Migrasi soal existing ke MULTI_TF:** Konversi soal TRUE_FALSE lama ke MULTI_TF bukan bagian scope ini.
