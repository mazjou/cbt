# PROPOSAL APLIKASI
# LEARNING MANAGEMENT SYSTEM (LMS)
# SMKN 1 KRAS

---

## PENDAHULUAN

### Latar Belakang

Perkembangan teknologi informasi dan komunikasi telah membawa perubahan signifikan dalam dunia pendidikan. Sistem pembelajaran konvensional yang mengandalkan tatap muka dan ujian berbasis kertas mulai beralih ke sistem digital yang lebih efisien dan terukur. SMKN 1 Kras sebagai institusi pendidikan yang progresif perlu mengadopsi teknologi pembelajaran modern untuk meningkatkan kualitas pendidikan dan efisiensi administrasi akademik.

Aplikasi Learning Management System (LMS) ini dirancang khusus untuk memenuhi kebutuhan pembelajaran digital di SMKN 1 Kras, dengan fokus pada manajemen materi pembelajaran, ujian online (Computer Based Test/CBT), dan monitoring aktivitas belajar siswa secara real-time.

### Tujuan Pengembangan

1. Menyediakan platform pembelajaran digital yang terintegrasi untuk guru dan siswa
2. Memfasilitasi pelaksanaan ujian online yang aman, terukur, dan efisien
3. Meningkatkan transparansi dan akurasi dalam penilaian akademik
4. Memudahkan monitoring dan evaluasi proses pembelajaran
5. Mengurangi penggunaan kertas dan biaya operasional ujian
6. Menyediakan data dan laporan akademik yang komprehensif

### Ruang Lingkup

Aplikasi ini mencakup:
- Manajemen pengguna (Admin, Kepala Sekolah, Guru, dan Siswa)
- Manajemen kelas, mata pelajaran, dan guru pengampu
- Sistem materi pembelajaran dengan berbagai format konten
- Sistem ujian online (CBT) dengan fitur anti-kecurangan
- Sistem penilaian dan pelaporan otomatis
- Dashboard monitoring untuk berbagai tingkat pengguna

---

## ANALISIS KEBUTUHAN

### Kebutuhan Fungsional

#### 1. Manajemen Pengguna dan Akses
- Sistem autentikasi dan otorisasi berbasis role (ADMIN, PRINCIPAL, TEACHER, STUDENT)
- Manajemen akun pengguna (tambah, edit, hapus, aktif/nonaktif)
- Reset password oleh administrator
- Import data pengguna massal dari file Excel/CSV

#### 2. Manajemen Data Master
- Manajemen kelas (kode kelas, nama kelas)
- Manajemen mata pelajaran (kode mapel, nama mapel)
- Manajemen guru pengampu
- Import data massal dengan preview dan validasi

#### 3. Sistem Materi Pembelajaran
- Upload dan publikasi materi pembelajaran
- Dukungan berbagai format: teks HTML, video YouTube, dokumen PDF
- Kategorisasi materi per mata pelajaran dan kelas
- Tracking pembacaan materi oleh siswa
- Auto-complete materi berdasarkan durasi waktu baca
- Riwayat akses materi per siswa

#### 4. Sistem Ujian Online (CBT)
- Pembuatan ujian dengan pengaturan lengkap:
  - Jadwal mulai dan selesai
  - Durasi ujian
  - Passing grade
  - Kode akses ujian
  - Acak soal dan opsi jawaban
  - Batas maksimal percobaan
- Manajemen soal pilihan ganda (A-E)
- Upload gambar pada soal
- Import soal dari Excel/CSV dengan preview dan validasi
- Sistem timer otomatis
- Auto-save jawaban siswa
- Anti-kecurangan: tracking tab switching, fullscreen exit, copy-paste
- Review jawaban setelah submit

#### 5. Sistem Penilaian dan Pelaporan
- Penilaian otomatis untuk soal pilihan ganda
- Perhitungan skor dan persentase
- Riwayat ujian dan nilai siswa
- Laporan detail per ujian
- Laporan siswa yang belum mengerjakan
- Export data nilai

#### 6. Dashboard dan Monitoring
- Dashboard admin: statistik pengguna, kelas, mapel
- Dashboard kepala sekolah: monitoring ujian dan materi
- Dashboard guru: manajemen ujian, materi, dan nilai
- Dashboard siswa: daftar ujian dan materi yang tersedia

### Kebutuhan Non-Fungsional

#### 1. Keamanan
- Enkripsi password menggunakan bcrypt
- Session management dengan timeout otomatis
- Validasi input untuk mencegah SQL injection dan XSS
- Helmet.js untuk security headers
- Kode akses ujian untuk verifikasi

#### 2. Performa
- Response time < 2 detik untuk operasi normal
- Dukungan concurrent users minimal 100 siswa
- Optimasi query database dengan indexing
- Caching session untuk mengurangi beban database

#### 3. Usability
- Interface responsif (desktop dan mobile)
- Desain intuitif dengan Tailwind CSS
- Notifikasi flash message untuk feedback user
- Navigasi yang jelas dan konsisten

#### 4. Reliability
- Error handling yang komprehensif
- Logging aktivitas sistem
- Backup data berkala
- Recovery mechanism untuk data penting

#### 5. Maintainability
- Kode terstruktur dengan pola MVC
- Dokumentasi kode yang jelas
- Modular architecture untuk kemudahan pengembangan
- Version control dengan Git

---

## SPESIFIKASI TEKNIS

### Arsitektur Sistem

Aplikasi ini dibangun dengan arsitektur Model-View-Controller (MVC) menggunakan teknologi modern:

#### Technology Stack

**Backend:**
- Node.js v18+ (Runtime environment)
- Express.js v4.19 (Web framework)
- MySQL v8.0+ (Database)
- mysql2 v3.11 (Database driver dengan prepared statements)

**Frontend:**
- EJS v3.1 (Template engine)
- Tailwind CSS v3 (UI framework via CDN)
- Vanilla JavaScript (Client-side interactivity)

**Security & Session:**
- bcryptjs v2.4 (Password hashing)
- express-session v1.17 (Session management)
- helmet v7.1 (Security headers)
- connect-flash v0.1 (Flash messages)

**File Processing:**
- multer v1.4 (File upload)
- xlsx v0.18 (Excel processing)
- mammoth v1.8 (Word document processing)
- cheerio v1.0 (HTML parsing)

**Utilities:**
- nanoid v5.0 (Unique ID generation)
- morgan v1.10 (HTTP request logger)
- method-override v3.0 (HTTP method override)
- dotenv v16.4 (Environment variables)

### Struktur Database

Database menggunakan MySQL dengan 11 tabel utama:

1. **users** - Data pengguna (admin, guru, siswa, kepala sekolah)
2. **classes** - Data kelas
3. **subjects** - Data mata pelajaran
4. **materials** - Data materi pembelajaran
5. **material_reads** - Tracking pembacaan materi
6. **exams** - Data ujian
7. **questions** - Data soal ujian
8. **options** - Data opsi jawaban
9. **attempts** - Data percobaan ujian siswa
10. **attempt_answers** - Data jawaban siswa
11. **attempt_violations** - Log pelanggaran anti-kecurangan

### Fitur Keamanan

1. **Authentication & Authorization**
   - Session-based authentication
   - Role-based access control (RBAC)
   - Password hashing dengan bcrypt (10 rounds)

2. **Data Protection**
   - Prepared statements untuk mencegah SQL injection
   - Input validation dan sanitization
   - XSS protection dengan helmet.js
   - CSRF protection dengan SameSite cookies

3. **Exam Security**
   - Kode akses ujian
   - Timer otomatis dengan server-side validation
   - Tracking pelanggaran (tab switching, fullscreen exit)
   - Unique attempt per siswa
   - Auto-submit saat waktu habis

### Struktur Folder Aplikasi

```
lms-smkn1-kras/
├── src/
│   ├── db/              # Database connection & setup
│   ├── middleware/      # Authentication & authorization
│   ├── routes/          # Route handlers (admin, teacher, student, etc)
│   ├── views/           # EJS templates
│   │   ├── admin/       # Admin views
│   │   ├── teacher/     # Teacher views
│   │   ├── student/     # Student views
│   │   ├── principal/   # Principal views
│   │   └── partials/    # Reusable components
│   ├── public/          # Static files
│   │   ├── images/      # Images & logos
│   │   ├── templates/   # Import templates
│   │   └── uploads/     # User uploads
│   └── server.js        # Main application file
├── sql/                 # Database schema & migrations
├── .env                 # Environment variables
└── package.json         # Dependencies & scripts
```

---

## FITUR UTAMA APLIKASI

### A. Modul Administrator

#### 1. Manajemen Pengguna
- Tambah, edit, hapus pengguna
- Reset password pengguna
- Aktifkan/nonaktifkan akun
- Import pengguna dari Excel/CSV dengan preview
- Filter dan pencarian pengguna

#### 2. Manajemen Kelas
- CRUD kelas (kode dan nama kelas)
- Import kelas dari Excel/CSV
- Validasi data sebelum import

#### 3. Manajemen Mata Pelajaran
- CRUD mata pelajaran
- Import mapel dari Excel/CSV
- Assign guru pengampu

#### 4. Manajemen Guru
- CRUD data guru
- Import guru dari Excel/CSV
- Assign mata pelajaran

### B. Modul Kepala Sekolah (Principal)

#### 1. Monitoring Ujian
- Lihat semua ujian yang sedang berlangsung
- Statistik partisipasi siswa
- Monitoring nilai rata-rata per ujian

#### 2. Monitoring Materi
- Lihat semua materi yang dipublikasi
- Statistik akses materi oleh siswa
- Laporan engagement pembelajaran

### C. Modul Guru (Teacher)

#### 1. Manajemen Materi Pembelajaran
- Buat materi baru dengan editor rich text
- Upload konten: HTML, embed YouTube, upload PDF
- Set target kelas dan mata pelajaran
- Publikasi/unpublish materi
- Set auto-complete berdasarkan durasi baca
- Lihat statistik pembaca materi
- Lihat siswa yang belum membaca
- Lihat riwayat akses per siswa

#### 2. Manajemen Ujian
- Buat ujian baru dengan pengaturan:
  - Judul dan deskripsi
  - Mata pelajaran dan kelas target
  - Jadwal mulai dan selesai
  - Durasi ujian (menit)
  - Passing grade
  - Shuffle soal dan opsi
  - Maksimal percobaan
  - Kode akses
- Publikasi/unpublish ujian
- Edit detail ujian

#### 3. Manajemen Soal
- Tambah soal pilihan ganda (A-E)
- Upload gambar pada soal (opsional)
- Edit dan hapus soal
- Import soal dari Excel/CSV
- Preview dan validasi sebelum import
- Upload gambar multiple saat import

#### 4. Penilaian dan Laporan
- Lihat daftar nilai per ujian
- Detail jawaban siswa per soal
- Lihat pelanggaran anti-kecurangan
- Export nilai ke Excel/CSV
- Laporan statistik ujian

### D. Modul Siswa (Student)

#### 1. Akses Materi Pembelajaran
- Lihat daftar materi yang tersedia
- Filter materi per mata pelajaran
- Buka dan baca materi
- Tracking progress pembacaan
- Auto-complete setelah durasi tertentu
- Lihat riwayat materi yang sudah dibaca

#### 2. Mengerjakan Ujian
- Lihat daftar ujian yang tersedia
- Filter berdasarkan status (upcoming, ongoing, completed)
- Verifikasi kode akses sebelum mulai
- Interface ujian dengan:
  - Timer countdown
  - Navigasi antar soal
  - Tandai soal untuk review
  - Auto-save jawaban
  - Submit manual atau auto-submit
- Lihat hasil ujian setelah submit
- Review jawaban (benar/salah)

#### 3. Riwayat dan Nilai
- Lihat riwayat semua ujian yang pernah dikerjakan
- Lihat detail nilai per ujian
- Statistik performa (rata-rata, tertinggi, terendah)

---

## KEUNGGULAN APLIKASI

### 1. User-Friendly Interface
- Desain modern dan responsif dengan Tailwind CSS
- Navigasi intuitif untuk semua level pengguna
- Flash messages untuk feedback real-time
- Loading indicators untuk operasi yang membutuhkan waktu

### 2. Sistem Import yang Robust
- Preview data sebelum import
- Validasi data dengan laporan error detail
- Dukungan format Excel (.xlsx) dan CSV
- Template import yang sudah disediakan

### 3. Fitur Anti-Kecurangan
- Tracking tab switching (keluar dari tab ujian)
- Tracking fullscreen exit
- Monitoring copy-paste
- Log semua pelanggaran dengan timestamp
- Laporan pelanggaran untuk guru

### 4. Fleksibilitas Konten
- Materi: HTML editor, YouTube embed, PDF upload
- Soal: teks dan gambar
- Multiple format import (Excel, CSV, Word)

### 5. Tracking dan Analytics
- Real-time tracking pembacaan materi
- Statistik partisipasi ujian
- Laporan performa siswa
- Dashboard monitoring untuk semua role

### 6. Skalabilitas
- Arsitektur modular untuk pengembangan fitur baru
- Database teroptimasi dengan indexing
- Session management yang efisien
- Support concurrent users

### 7. Keamanan Berlapis
- Authentication & authorization
- Password encryption
- SQL injection prevention
- XSS protection
- Session timeout
- Kode akses ujian

---

## IMPLEMENTASI DAN DEPLOYMENT

### Persyaratan Sistem

#### Server Requirements
- OS: Linux (Ubuntu 20.04+) / Windows Server 2019+
- CPU: 2 cores minimum (4 cores recommended)
- RAM: 4 GB minimum (8 GB recommended)
- Storage: 20 GB minimum (SSD recommended)
- Network: 100 Mbps minimum

#### Software Requirements
- Node.js v18.x atau lebih tinggi
- MySQL v8.0 atau lebih tinggi
- Web Server: Nginx atau Apache (untuk production)
- SSL Certificate (untuk HTTPS)

### Tahapan Implementasi

#### Fase 1: Persiapan (1 minggu)
- Setup server dan environment
- Instalasi dependencies
- Konfigurasi database
- Setup SSL certificate

#### Fase 2: Deployment (1 minggu)
- Deploy aplikasi ke server
- Konfigurasi web server (Nginx/Apache)
- Setup process manager (PM2)
- Testing koneksi dan performa

#### Fase 3: Data Migration (1 minggu)
- Import data kelas
- Import data guru
- Import data siswa
- Import data mata pelajaran
- Verifikasi data

#### Fase 4: Training (1 minggu)
- Training untuk administrator
- Training untuk guru
- Training untuk siswa
- Penyediaan dokumentasi dan panduan

#### Fase 5: Pilot Testing (2 minggu)
- Uji coba dengan kelas terbatas
- Monitoring dan bug fixing
- Gathering feedback
- Optimasi berdasarkan feedback

#### Fase 6: Full Deployment (1 minggu)
- Rollout ke seluruh sekolah
- Monitoring intensif
- Support dan maintenance

### Panduan Instalasi

#### 1. Clone Repository
```bash
git clone <repository-url>
cd lms-smkn1-kras
```

#### 2. Install Dependencies
```bash
npm install
```

#### 3. Konfigurasi Environment
```bash
cp .env.example .env
# Edit .env dengan konfigurasi database dan session secret
```

#### 4. Setup Database
```bash
npm run db:setup
```

#### 5. Jalankan Aplikasi
```bash
# Development
npm run dev

# Production
npm start
```

#### 6. Akses Aplikasi
```
http://localhost:3000
```

### Akun Default

Setelah setup database, tersedia akun default:
- **Admin**: username `admin`, password `admin123`
- **Guru**: username `guru`, password `guru123`
- **Siswa**: username `siswa`, password `siswa123`

> **Penting**: Segera ganti password default setelah instalasi!

---

## MAINTENANCE DAN SUPPORT

### Maintenance Rutin

#### 1. Backup Data
- Backup database harian (automated)
- Backup file uploads mingguan
- Retention policy: 30 hari

#### 2. Monitoring
- Server uptime monitoring
- Database performance monitoring
- Error logging dan alerting
- User activity logging

#### 3. Update dan Patch
- Security updates bulanan
- Feature updates per quarter
- Bug fixes sesuai kebutuhan

### Technical Support

#### Level 1: User Support
- Bantuan login dan password reset
- Panduan penggunaan fitur
- Troubleshooting masalah umum
- Response time: < 4 jam

#### Level 2: Technical Support
- Troubleshooting teknis
- Bug investigation
- Performance issues
- Response time: < 24 jam

#### Level 3: Development Support
- Feature requests
- Custom development
- System integration
- Response time: < 3 hari kerja

### Dokumentasi

1. **User Manual**
   - Panduan untuk Admin
   - Panduan untuk Guru
   - Panduan untuk Siswa
   - FAQ

2. **Technical Documentation**
   - API Documentation
   - Database Schema
   - Deployment Guide
   - Troubleshooting Guide

---

## ESTIMASI BIAYA

### Biaya Pengembangan
- Analisis dan Desain: Rp 5.000.000
- Development: Rp 15.000.000
- Testing dan QA: Rp 3.000.000
- Dokumentasi: Rp 2.000.000
- **Total Pengembangan: Rp 25.000.000**

### Biaya Infrastruktur (Tahun Pertama)
- Server VPS (4 vCPU, 8GB RAM): Rp 500.000/bulan x 12 = Rp 6.000.000
- Domain dan SSL: Rp 500.000
- Backup Storage: Rp 200.000/bulan x 12 = Rp 2.400.000
- **Total Infrastruktur: Rp 8.900.000**

### Biaya Training dan Implementasi
- Training Admin dan Guru: Rp 3.000.000
- Sosialisasi Siswa: Rp 1.000.000
- Deployment dan Setup: Rp 2.000.000
- **Total Training: Rp 6.000.000**

### Biaya Maintenance (Per Tahun)
- Technical Support: Rp 12.000.000
- Updates dan Bug Fixes: Rp 6.000.000
- Monitoring dan Backup: Rp 3.000.000
- **Total Maintenance: Rp 21.000.000**

### TOTAL BIAYA TAHUN PERTAMA
**Rp 60.900.000**

### TOTAL BIAYA TAHUN KEDUA DAN SETERUSNYA
**Rp 29.900.000** (Infrastruktur + Maintenance)

---

## MANFAAT DAN ROI

### Manfaat Kuantitatif

#### 1. Penghematan Biaya Operasional
- Penghematan kertas ujian: ~Rp 10.000.000/tahun
- Penghematan biaya fotocopy: ~Rp 5.000.000/tahun
- Penghematan waktu koreksi: ~500 jam/tahun
- **Total Penghematan: Rp 15.000.000/tahun**

#### 2. Peningkatan Efisiensi
- Waktu pembuatan soal: -60%
- Waktu koreksi ujian: -90%
- Waktu distribusi materi: -80%
- Waktu pelaporan nilai: -70%

#### 3. Peningkatan Kapasitas
- Jumlah ujian per semester: +100%
- Variasi soal: +200%
- Akses materi: 24/7 unlimited

### Manfaat Kualitatif

#### 1. Peningkatan Kualitas Pembelajaran
- Akses materi yang lebih mudah dan fleksibel
- Feedback nilai yang lebih cepat
- Tracking progress belajar siswa
- Data analytics untuk evaluasi pembelajaran

#### 2. Transparansi dan Akuntabilitas
- Sistem penilaian yang objektif dan terukur
- Audit trail untuk semua aktivitas
- Laporan yang komprehensif dan real-time

#### 3. Modernisasi Pendidikan
- Adopsi teknologi pembelajaran digital
- Persiapan siswa menghadapi era digital
- Meningkatkan citra sekolah

### Return on Investment (ROI)

**Investasi Tahun Pertama**: Rp 60.900.000
**Penghematan Tahunan**: Rp 15.000.000
**ROI Period**: ~4 tahun

Dengan manfaat kualitatif yang signifikan, ROI aktual lebih cepat dari perhitungan di atas.

---

## ROADMAP PENGEMBANGAN

### Fase 1: Core Features (Sudah Tersedia)
✅ Manajemen pengguna dan role
✅ Manajemen kelas dan mata pelajaran
✅ Sistem materi pembelajaran
✅ Sistem ujian online (CBT)
✅ Penilaian otomatis
✅ Dashboard monitoring
✅ Import data massal
✅ Anti-kecurangan dasar

### Fase 2: Enhancement (Q2 2026)
- Soal essay dengan penilaian manual
- Bank soal terpusat
- Randomisasi soal dari bank soal
- Notifikasi email/SMS
- Mobile app (Android/iOS)
- Offline mode untuk ujian

### Fase 3: Advanced Features (Q3 2026)
- Video conference integration (Zoom/Google Meet)
- Forum diskusi per mata pelajaran
- Assignment dan tugas online
- Peer review system
- Gamification (badges, leaderboard)
- AI-powered question generator

### Fase 4: Analytics & Integration (Q4 2026)
- Advanced analytics dan reporting
- Predictive analytics untuk performa siswa
- Integration dengan sistem akademik lain
- API untuk third-party integration
- Data warehouse untuk big data analysis
- Machine learning untuk personalized learning

---

## RISIKO DAN MITIGASI

### Risiko Teknis

#### 1. Server Downtime
**Risiko**: Server mati saat ujian berlangsung
**Mitigasi**: 
- High availability setup dengan backup server
- Regular maintenance di luar jam ujian
- Monitoring 24/7 dengan alerting

#### 2. Data Loss
**Risiko**: Kehilangan data ujian atau nilai
**Mitigasi**:
- Automated daily backup
- Redundant storage
- Disaster recovery plan

#### 3. Security Breach
**Risiko**: Hacking atau data breach
**Mitigasi**:
- Regular security audit
- Penetration testing
- Security updates
- Firewall dan IDS/IPS

### Risiko Operasional

#### 1. User Resistance
**Risiko**: Guru atau siswa tidak mau menggunakan sistem
**Mitigasi**:
- Training yang komprehensif
- User-friendly interface
- Continuous support
- Incentive program

#### 2. Internet Connectivity
**Risiko**: Koneksi internet lambat atau putus
**Mitigasi**:
- Backup internet connection
- Optimasi aplikasi untuk low bandwidth
- Offline mode (future development)
- Jadwal ujian di jam optimal

#### 3. Hardware Limitation
**Risiko**: Perangkat siswa tidak memadai
**Mitigasi**:
- Minimum requirement yang rendah
- Responsive design untuk berbagai device
- Lab komputer sekolah sebagai backup

---

## KESIMPULAN

Aplikasi Learning Management System (LMS) SMKN 1 Kras merupakan solusi komprehensif untuk digitalisasi pembelajaran dan ujian di era modern. Dengan fitur-fitur yang lengkap, keamanan yang terjamin, dan interface yang user-friendly, aplikasi ini siap meningkatkan kualitas pendidikan dan efisiensi operasional sekolah.

### Keunggulan Utama:
1. ✅ Sistem terintegrasi untuk materi dan ujian
2. ✅ Fitur anti-kecurangan yang robust
3. ✅ Import data massal dengan validasi
4. ✅ Dashboard monitoring real-time
5. ✅ Penilaian otomatis dan akurat
6. ✅ Tracking aktivitas belajar siswa
7. ✅ Keamanan berlapis
8. ✅ Skalabel dan mudah dikembangkan

### Rekomendasi:
Kami merekomendasikan untuk segera mengimplementasikan aplikasi ini dengan tahapan yang terstruktur, dimulai dari pilot testing di beberapa kelas, kemudian rollout bertahap ke seluruh sekolah. Dengan dukungan training yang memadai dan technical support yang responsif, transisi ke sistem digital dapat berjalan lancar.

### Next Steps:
1. Approval proposal oleh pihak sekolah
2. Persiapan infrastruktur server
3. Deployment dan konfigurasi
4. Training untuk admin dan guru
5. Pilot testing
6. Full deployment
7. Monitoring dan continuous improvement

---

## LAMPIRAN

### A. Screenshot Aplikasi
(Tersedia dalam dokumentasi terpisah)

### B. Database Schema
(Lihat file: `sql/schema.sql`)

### C. API Documentation
(Tersedia dalam dokumentasi teknis)

### D. User Manual
(Tersedia dalam dokumentasi terpisah)

### E. Template Import
Tersedia di folder: `src/public/templates/`
- Template import siswa (Excel/CSV)
- Template import guru (Excel/CSV)
- Template import kelas (Excel/CSV)
- Template import mata pelajaran (Excel/CSV)
- Template import soal (Excel/CSV)

---

## KONTAK

**Tim Pengembang**
Email: [email]
Telepon: [phone_number]
Website: [website]

**SMKN 1 Kras**
Alamat: [address]
Email: [email]
Telepon: [phone_number]

---

**Dokumen ini dibuat pada:** 2 Maret 2026
**Versi:** 1.0
**Status:** Draft untuk Review

---

*Proposal ini bersifat rahasia dan hanya untuk keperluan internal SMKN 1 Kras*
