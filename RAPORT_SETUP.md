# Panduan Setup Cetak Raport

Panduan ini menjelaskan cara mengkonfigurasi fitur cetak raport agar menampilkan
informasi sekolah, logo, kepala sekolah, dan wali kelas yang benar.

---

## 1. Informasi Sekolah di `.env`

Buka file `.env` di root project, lalu isi variabel berikut:

```env
SCHOOL_NAME=SMK NEGERI 1 KRAS
SCHOOL_ADDRESS=Desa Kras, Kec. Kras, Kab. Kediri, Jawa Timur
PRINCIPAL_NAME=Nama Lengkap Kepala Sekolah
PRINCIPAL_NIP=196XXXXXXXXXXXXXXXXX
```

- `SCHOOL_NAME` — nama sekolah yang muncul di kop surat raport.
- `SCHOOL_ADDRESS` — alamat sekolah yang muncul di bawah nama sekolah.
- `PRINCIPAL_NAME` — nama kepala sekolah yang muncul di kolom TTD kanan.
- `PRINCIPAL_NIP` — NIP kepala sekolah yang muncul di bawah nama kepsek.

---

## 2. Logo Sekolah

1. Siapkan file gambar logo sekolah (format PNG, JPG, atau SVG, ukuran disarankan 70×70 px atau lebih).
2. Taruh file tersebut di folder `public/uploads/`, misalnya: `public/uploads/logo.png`.
3. Tambahkan/ubah baris berikut di file `.env`:
   ```env
   SCHOOL_LOGO=/uploads/logo.png
   ```
   Nilai ini adalah path publik relatif terhadap domain, bukan path sistem file.
4. Restart server. Logo akan muncul di pojok kiri kop surat setiap raport.

> Jika `SCHOOL_LOGO` kosong atau tidak diset, akan ditampilkan placeholder bertuliskan "LOGO".

---

## 3. Wali Kelas

Wali kelas disimpan per kelas di database, bukan di `.env`.

Langkah pengisian:
1. Login sebagai Admin dan buka menu **Kelola Kelas** (`/admin/classes`).
2. Di baris kelas yang ingin diset wali kelasnya, klik tombol **Wali Kelas**.
3. Isi **Nama Wali Kelas** dan **NIP Wali Kelas** pada form yang muncul.
4. Klik **Simpan**.

Nama dan NIP wali kelas akan otomatis muncul di kolom TTD kiri pada raport siswa
dari kelas tersebut.

---

## 4. Migration Database

Sebelum menggunakan fitur wali kelas, jalankan migration SQL berikut **satu kali**
di database PostgreSQL:

```bash
psql -d <nama_database> -f sql/add_homeroom_teacher.sql
```

Ganti `<nama_database>` dengan nama database yang digunakan (biasanya `cbt_smk`).

Migration ini menambahkan dua kolom ke tabel `classes`:
- `homeroom_teacher_name VARCHAR(120)` — nama wali kelas
- `homeroom_teacher_nip VARCHAR(30)` — NIP wali kelas

Jika kolom sudah ada (misalnya migration pernah dijalankan sebelumnya), perintah ini
aman untuk dijalankan kembali karena menggunakan `ADD COLUMN IF NOT EXISTS`.
