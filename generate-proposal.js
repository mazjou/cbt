'use strict';
/**
 * Generator Proposal Word (.docx)
 * Jalankan: node generate-proposal.js
 * Output: proposal-lms-cbt-smkn1kras.docx
 */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  PageOrientation, convertInchesToTwip, UnderlineType, TableOfContents,
  StyleLevel, LevelFormat, PageNumber, NumberFormat
} = require('docx');
const fs = require('fs');

// ── Warna ───────────────────────────────────────────────────────────────────
const BIRU    = '1E40AF';
const BIRU_MID= '2563EB';
const BIRU_LT = 'DBEAFE';
const ABU     = 'F1F5F9';
const ABU_GEL = '475569';
const HITAM   = '1E293B';
const HIJAU   = '166534';
const HIJAU_LT= 'DCFCE7';
const MERAH   = '991B1B';

// ── Helper: Heading ─────────────────────────────────────────────────────────
const h1 = (text) => new Paragraph({
  text,
  heading: HeadingLevel.HEADING_1,
  thematicBreak: false,
  spacing: { before: 300, after: 120 },
  run: { color: BIRU, bold: true },
});

const h2 = (text) => new Paragraph({
  text,
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 240, after: 80 },
  run: { color: BIRU_MID, bold: true },
});

const h3 = (text) => new Paragraph({
  text,
  heading: HeadingLevel.HEADING_3,
  spacing: { before: 160, after: 60 },
  run: { color: ABU_GEL, bold: true },
});

const p = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, size: 24, color: HITAM, ...opts })],
  spacing: { before: 60, after: 60 },
  alignment: opts.center ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
});

const pBold = (text) => new Paragraph({
  children: [new TextRun({ text, size: 24, bold: true, color: HITAM })],
  spacing: { before: 60, after: 60 },
});

const br = () => new Paragraph({ text: '', spacing: { before: 40, after: 40 } });

// ── Helper: Tabel ───────────────────────────────────────────────────────────
const cellHeader = (text, bgColor = BIRU, width = null) => new TableCell({
  children: [new Paragraph({
    children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 20 })],
    alignment: AlignmentType.CENTER,
  })],
  shading: { type: ShadingType.SOLID, color: bgColor },
  width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
  margins: { top: 80, bottom: 80, left: 100, right: 100 },
});

const cellData = (text, bgColor = null, center = false) => new TableCell({
  children: [new Paragraph({
    children: [new TextRun({ text: String(text), size: 20, color: HITAM })],
    alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
  })],
  shading: bgColor ? { type: ShadingType.SOLID, color: bgColor } : undefined,
  margins: { top: 60, bottom: 60, left: 100, right: 100 },
});

const tableFromData = (headers, rows, colWidths = null) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({
      children: headers.map((h, i) => cellHeader(h, BIRU, colWidths ? colWidths[i] : null)),
      tableHeader: true,
    }),
    ...rows.map((row, ri) => new TableRow({
      children: row.map((cell, ci) => cellData(cell, ri % 2 === 0 ? null : ABU)),
    })),
  ],
  borders: {
    top:    { style: BorderStyle.SINGLE, size: 2, color: BIRU },
    bottom: { style: BorderStyle.SINGLE, size: 2, color: BIRU },
    left:   { style: BorderStyle.SINGLE, size: 2, color: BIRU },
    right:  { style: BorderStyle.SINGLE, size: 2, color: BIRU },
    insideH:{ style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
    insideV:{ style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
  },
});

// ── Konten Dokumen ──────────────────────────────────────────────────────────
const sections = [{
  properties: {
    page: {
      margin: {
        top: convertInchesToTwip(1.18),
        bottom: convertInchesToTwip(1.18),
        left: convertInchesToTwip(1.38),
        right: convertInchesToTwip(1.18),
      },
    },
  },
  children: [

    // ── COVER ───────────────────────────────────────────────────────────────
    new Paragraph({
      children: [new TextRun({ text: 'PROPOSAL PENGEMBANGAN APLIKASI', bold: true, size: 36, color: BIRU })],
      alignment: AlignmentType.CENTER, spacing: { before: 600, after: 120 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Learning Management System (LMS) & Computer-Based Test (CBT)', bold: true, size: 28, color: BIRU_MID })],
      alignment: AlignmentType.CENTER, spacing: { before: 0, after: 120 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'SMK NEGERI 1 KRAS KABUPATEN KEDIRI', bold: true, size: 30, color: HITAM })],
      alignment: AlignmentType.CENTER, spacing: { before: 0, after: 600 },
    }),
    new Paragraph({
      children: [new TextRun({ text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', color: BIRU })],
      alignment: AlignmentType.CENTER, spacing: { before: 0, after: 400 },
    }),
    p('Disusun oleh   :  Tim Pengembang Teknologi Informasi'),
    p('Instansi         :  SMK Negeri 1 Kras'),
    p('Alamat           :  Dsn. Demangan Ds. Setonorejo Kec. Kras Kab. Kediri Jawa Timur 64172'),
    p('Website          :  lms.smkn1kras.sch.id'),
    p('Tahun             :  2026/2027'),
    br(), br(),

    // ── BAB I ───────────────────────────────────────────────────────────────
    h1('BAB I — LATAR BELAKANG'),
    h2('1.1 Pendahuluan'),
    p('Perkembangan teknologi informasi yang pesat menuntut lembaga pendidikan untuk bertransformasi secara digital. SMK Negeri 1 Kras sebagai sekolah kejuruan yang mencetak tenaga profesional di bidang teknologi dan industri memiliki tanggung jawab untuk menjadi pelopor pemanfaatan teknologi dalam proses pembelajaran.'),
    p('Saat ini, proses ujian berbasis kertas (paper-based test) masih mendominasi evaluasi pembelajaran. Proses ini memiliki sejumlah keterbatasan: tidak efisien dalam waktu, biaya cetak yang tinggi, proses koreksi yang lama, dan sulitnya analisis soal secara mendalam.'),
    p('Selain itu, pengelolaan nilai raport tengah semester yang masih manual menyebabkan keterlambatan pelaporan, potensi kesalahan input, dan minimnya transparansi kepada orang tua/wali siswa.'),

    h2('1.2 Kondisi Eksisting'),
    p('SMK Negeri 1 Kras saat ini telah memiliki infrastruktur jaringan yang memadai:'),
    br(),
    tableFromData(
      ['Komponen', 'Spesifikasi/Keterangan'],
      [
        ['Server LMS', 'VPS 10.10.102.11'],
        ['Server Database', 'PostgreSQL 10.10.102.12'],
        ['Server Cache', 'Redis 10.10.102.8'],
        ['Reverse Proxy', 'Caddy (SSL otomatis)'],
        ['Domain', 'lms.smkn1kras.sch.id'],
        ['Process Manager', 'PM2 Cluster (4 worker)'],
        ['Siswa Terdaftar', '> 1.000 siswa aktif'],
        ['Guru/Tenaga Pendidik', '> 80 guru'],
      ]
    ),
    br(),

    // ── BAB II ──────────────────────────────────────────────────────────────
    h1('BAB II — IDENTIFIKASI MASALAH'),
    h2('2.1 Masalah dalam Proses Ujian'),
    tableFromData(
      ['No', 'Masalah', 'Dampak'],
      [
        ['1', 'Ujian masih sebagian berbasis kertas', 'Pemborosan kertas, waktu koreksi lama'],
        ['2', 'Soal ujian mudah bocor', 'Integritas ujian diragukan'],
        ['3', 'Tidak ada analisis soal otomatis', 'Kualitas soal sulit ditingkatkan'],
        ['4', 'Hasil ujian terlambat diketahui', 'Siswa tidak bisa segera belajar dari kesalahan'],
        ['5', 'Tidak ada bank soal terpusat', 'Pembuatan soal tidak efisien'],
      ]
    ),
    br(),
    h2('2.2 Masalah dalam Pengelolaan Nilai'),
    tableFromData(
      ['No', 'Masalah', 'Dampak'],
      [
        ['1', 'Input nilai raport manual', 'Potensi kesalahan tinggi, lambat'],
        ['2', 'Tidak ada TP per kelas', 'Tidak bisa ukur capaian per kompetensi'],
        ['3', 'Data siswa tidak sinkron DAPODIK', 'Duplikasi data, TTL tidak terisi'],
        ['4', 'Wali kelas tidak bisa cetak raport mandiri', 'Ketergantungan pada admin'],
        ['5', 'Orang tua tidak bisa akses nilai', 'Transparansi rendah'],
      ]
    ),
    br(),

    // ── BAB III ─────────────────────────────────────────────────────────────
    h1('BAB III — TUJUAN PENGEMBANGAN'),
    h2('3.1 Tujuan Umum'),
    p('Mengembangkan platform Learning Management System (LMS) dan Computer-Based Test (CBT) yang komprehensif, handal, dan terintegrasi dengan sistem data sekolah untuk meningkatkan kualitas pembelajaran dan efisiensi administrasi di SMK Negeri 1 Kras.'),
    h2('3.2 Tujuan Khusus'),
    p('1.  Modernisasi Ujian — Mengalihkan 100% ujian formatif dan sumatif ke platform digital dengan keamanan tinggi.'),
    p('2.  Otomasi Penilaian — Mengurangi waktu koreksi dari rata-rata 3 hari menjadi instan (0 detik) untuk soal objektif.'),
    p('3.  Integrasi Data — Menghubungkan LMS dengan DAPODIK/SDMS untuk sinkronisasi data siswa otomatis.'),
    p('4.  Transparansi Nilai — Memungkinkan siswa dan orang tua mengakses nilai secara real-time.'),
    p('5.  Analitik Pembelajaran — Menyediakan dashboard analitik untuk kepala sekolah dan guru.'),
    p('6.  Efisiensi Administrasi — Mengurangi beban administrasi guru hingga 60%.'),
    br(),

    // ── BAB IV ──────────────────────────────────────────────────────────────
    h1('BAB IV — RUANG LINGKUP APLIKASI'),
    h2('4.1 Modul yang Sudah Ada (Existing)'),
    tableFromData(
      ['Modul', 'Fitur Utama', 'Status'],
      [
        ['Ujian (CBT)', 'Pilihan ganda, B/S, isian, anti-cheat, auto-submit', '✅ Aktif'],
        ['Raport Tengah Semester', 'Input TP, import Excel, cetak raport, watermark', '✅ Aktif'],
        ['Manajemen Pengguna', 'Multi-role, import massal, sinkronisasi SDMS', '✅ Aktif'],
        ['Bank Soal', 'Kategorisasi per mapel, import/export, analisis soal', '✅ Aktif'],
        ['Monitoring', 'Dashboard real-time, monitoring Redis, audit log', '✅ Aktif'],
        ['Panitia Ujian', 'Manajemen panitia, cetak kartu, QR code', '✅ Aktif'],
      ]
    ),
    br(),
    h2('4.2 Modul yang Akan Dikembangkan (6 Bulan ke Depan)'),
    tableFromData(
      ['Fase', 'Modul Baru', 'Bulan'],
      [
        ['Fase 1', 'PWA (Progressive Web App), notifikasi push, enkripsi soal, backup otomatis', 'Bulan 1-2'],
        ['Fase 2', 'Modul tugas digital, upload materi, presensi QR Code, forum diskusi', 'Bulan 3-4'],
        ['Fase 3', 'Dashboard analitik KS, laporan orang tua, integrasi e-Rapor, aplikasi Android', 'Bulan 5-6'],
      ]
    ),
    br(),

    // ── BAB V ───────────────────────────────────────────────────────────────
    h1('BAB V — ANALISIS KEUNTUNGAN'),
    h2('5.1 Keuntungan untuk Guru'),
    h3('5.1.1 Efisiensi Waktu'),
    tableFromData(
      ['Aktivitas', 'Sebelum LMS', 'Setelah LMS', 'Penghematan'],
      [
        ['Koreksi ujian 40 siswa', '3–4 jam', '0 menit (otomatis)', '± 3,5 jam/ujian'],
        ['Input nilai raport', '2–3 jam', '15–30 menit (import Excel)', '± 2 jam/semester'],
        ['Distribusi soal ujian', '30 menit (fotokopi)', '0 menit (otomatis)', '± 30 menit/ujian'],
        ['Rekap nilai akhir', '1–2 jam', '5 menit (unduh Excel)', '± 1,5 jam/semester'],
        ['Analisis butir soal', 'Tidak tersedia', 'Otomatis', 'Fitur baru'],
      ]
    ),
    br(),
    p('Estimasi total penghematan: 1 guru dengan 5 kelas dapat menghemat ±40 jam/semester atau setara dengan ±5 hari kerja.', { bold: true }),
    br(),
    h3('5.1.2 Peningkatan Kualitas Pengajaran'),
    p('1.  Analisis Soal Otomatis — Guru dapat melihat tingkat kesukaran soal, daya beda, dan distribusi jawaban per opsi.'),
    p('2.  Bank Soal Terpusat — Soal yang sudah dibuat dapat digunakan kembali dan dijadikan template.'),
    p('3.  Tujuan Pembelajaran (TP) Terukur — Guru dapat melacak capaian tiap siswa per Tujuan Pembelajaran secara spesifik.'),
    p('4.  Feedback Cepat — Guru dapat segera mengetahui mana materi yang belum dikuasai siswa.'),
    p('5.  Dokumentasi Digital — Semua soal, nilai, dan aktivitas tersimpan permanen.'),
    br(),
    h2('5.2 Keuntungan untuk Siswa'),
    tableFromData(
      ['Aspek', 'Manfaat'],
      [
        ['Hasil Ujian Instan', 'Nilai langsung diketahui setelah submit ujian'],
        ['Pembahasan Soal', 'Siswa dapat melihat jawaban benar setelah ujian'],
        ['Ujian Adil', 'Anti-kecurangan memastikan penilaian objektif'],
        ['Timer Jelas', 'Countdown transparan, auto-save setiap perubahan jawaban'],
        ['Aksesibilitas', 'Ujian bisa diikuti dari HP/tablet, tidak harus di lab'],
        ['Transparansi Nilai', 'Nilai TP per kompetensi bisa dilihat kapan saja'],
        ['Akses Orang Tua', 'Raport digital bisa dipantau orang tua dari HP'],
      ]
    ),
    br(),
    h2('5.3 Keuntungan untuk Sekolah/Institusi'),
    h3('5.3.1 Efisiensi Biaya Tahunan'),
    tableFromData(
      ['Komponen Penghematan', 'Sebelumnya/Tahun', 'Setelah LMS', 'Penghematan'],
      [
        ['Kertas ujian (200 lembar × 1000 siswa)', 'Rp 6.000.000', 'Rp 0', 'Rp 6.000.000'],
        ['Toner/tinta printer soal', 'Rp 4.800.000', 'Rp 0', 'Rp 4.800.000'],
        ['Pengiriman/distribusi soal', 'Rp 1.200.000', 'Rp 0', 'Rp 1.200.000'],
        ['Waktu koreksi guru (40 guru × 8 jam)', 'Rp 8.000.000', 'Rp 0', 'Rp 8.000.000'],
        ['TOTAL PENGHEMATAN', '', '', 'Rp 20.000.000+/tahun'],
      ]
    ),
    br(),
    h3('5.3.2 Peningkatan Reputasi Sekolah'),
    p('1.  Menjadi sekolah percontohan digitalisasi pendidikan di Kabupaten Kediri.'),
    p('2.  Nilai akreditasi lebih tinggi (komponen pemanfaatan TIK dalam pembelajaran).'),
    p('3.  Daya tarik calon siswa baru meningkat — keunggulan kompetitif sekolah.'),
    p('4.  Potensi menjadi narasumber dalam forum pendidikan digital tingkat provinsi.'),
    br(),

    // ── BAB VI ──────────────────────────────────────────────────────────────
    h1('BAB VI — SPESIFIKASI TEKNIS'),
    h2('6.1 Stack Teknologi'),
    tableFromData(
      ['Layer', 'Teknologi', 'Versi'],
      [
        ['Backend', 'Node.js + Express.js', 'v20 LTS'],
        ['Database', 'PostgreSQL', 'v14+'],
        ['Cache/Session', 'Redis', 'v7+'],
        ['Frontend', 'EJS + Tailwind CSS', 'Terkini'],
        ['Mobile', 'Capacitor (iOS/Android)', 'v5'],
        ['Real-time', 'Socket.IO', 'v4'],
        ['Process Manager', 'PM2', 'v5'],
        ['Reverse Proxy', 'Caddy (SSL otomatis)', 'v2'],
      ]
    ),
    br(),
    h2('6.2 Keamanan Sistem'),
    p('1.  HTTPS wajib dengan sertifikat SSL otomatis (Caddy).'),
    p('2.  Session management dengan Redis (bukan cookie plaintext).'),
    p('3.  Password hashing dengan bcrypt (salt rounds 10).'),
    p('4.  Redis ACL — blokir perintah berbahaya FLUSHDB/FLUSHALL.'),
    p('5.  Input sanitization untuk semua form input.'),
    p('6.  Parameterized query (mencegah SQL injection).'),
    p('7.  Anti-cheat: deteksi tab switch, fullscreen enforcement, max pelanggaran.'),
    br(),

    // ── BAB VII ─────────────────────────────────────────────────────────────
    h1('BAB VII — RENCANA PENGEMBANGAN 6 BULAN'),
    h2('Fase 1: Penguatan Fondasi & Stabilisasi (Bulan 1–2)'),
    tableFromData(
      ['No', 'Aktivitas', 'Output', 'Bulan'],
      [
        ['1.1', 'Audit keamanan sistem existing', 'Laporan kerentanan', '1'],
        ['1.2', 'Implementasi backup otomatis terjadwal', 'Script backup + cron job', '1'],
        ['1.3', 'Enkripsi soal ujian di database', 'Soal terenkripsi AES-256', '1'],
        ['1.4', 'Rate limiting API endpoint', 'Proteksi brute force', '1'],
        ['1.5', 'Logging aktivitas lengkap (audit trail)', 'Tabel audit_log', '1'],
        ['1.6', 'Perbaikan bug existing', 'Bug-free release v2.0', '1'],
        ['2.1', 'Implementasi Progressive Web App (PWA)', 'Manifest + Service Worker', '2'],
        ['2.2', 'Push notification jadwal & nilai ujian', 'Notifikasi H-1 & H ujian', '2'],
        ['2.3', 'Optimasi performa (lazy loading, caching)', 'Page load < 2 detik', '2'],
        ['2.4', 'Deploy Fase 1 ke produksi', 'Release v2.0', '2'],
      ]
    ),
    br(),
    h2('Fase 2: Fitur Pembelajaran (Bulan 3–4)'),
    tableFromData(
      ['No', 'Aktivitas', 'Output', 'Bulan'],
      [
        ['3.1', 'Modul materi pembelajaran (PDF/video)', 'Halaman materi per mapel', '3'],
        ['3.2', 'Integrasi YouTube embed untuk video', 'Player video inline', '3'],
        ['3.3', 'Modul tugas dengan deadline', 'Form upload tugas siswa', '3'],
        ['3.4', 'Penilaian tugas oleh guru', 'Form input nilai tugas', '3'],
        ['3.5', 'Kalender akademik digital', 'Tampilan kalender', '3'],
        ['4.1', 'Presensi digital via QR Code', 'Generator QR + scanner', '4'],
        ['4.2', 'Rekap presensi per siswa per bulan', 'Laporan presensi Excel', '4'],
        ['4.3', 'Forum diskusi per kelas', 'Thread diskusi', '4'],
        ['4.4', 'Pengumuman sekolah digital', 'Modul pengumuman', '4'],
        ['4.5', 'Deploy Fase 2 ke produksi', 'Release v2.1', '4'],
      ]
    ),
    br(),
    h2('Fase 3: Analitik & Integrasi (Bulan 5–6)'),
    tableFromData(
      ['No', 'Aktivitas', 'Output', 'Bulan'],
      [
        ['5.1', 'Dashboard kepala sekolah (ringkasan nilai)', 'Dashboard KS interaktif', '5'],
        ['5.2', 'Grafik tren nilai per mapel per semester', 'Chart interaktif', '5'],
        ['5.3', 'Laporan siswa bermasalah (nilai/presensi rendah)', 'Alert system', '5'],
        ['5.4', 'Laporan perkembangan siswa untuk orang tua', 'PDF laporan', '5'],
        ['6.1', 'Integrasi e-Rapor Kemendikbud (export format)', 'File export e-Rapor', '6'],
        ['6.2', 'Aplikasi mobile Android (via Capacitor)', 'APK Android', '6'],
        ['6.3', 'Testing menyeluruh (UAT guru & siswa)', 'Laporan UAT', '6'],
        ['6.4', 'Pelatihan guru dan tenaga kependidikan', 'Modul pelatihan', '6'],
        ['6.5', 'Dokumentasi pengguna (manual book)', 'Buku panduan digital', '6'],
        ['6.6', 'Deploy final & serah terima', 'Release v3.0', '6'],
      ]
    ),
    br(),

    // ── BAB VIII ────────────────────────────────────────────────────────────
    h1('BAB VIII — RINCIAN ANGGARAN'),
    h2('8.1 Biaya Pengembangan'),
    tableFromData(
      ['No', 'Komponen', 'Volume', 'Satuan', 'Total'],
      [
        ['1', 'Developer Backend (6 bulan)', '1 orang', 'Rp 4.000.000/bln', 'Rp 24.000.000'],
        ['2', 'Developer Frontend/Mobile (4 bulan)', '1 orang', 'Rp 3.500.000/bln', 'Rp 14.000.000'],
        ['3', 'Quality Assurance (3 bulan)', '1 orang', 'Rp 2.500.000/bln', 'Rp 7.500.000'],
        ['4', 'Technical Writer (2 bulan)', '1 orang', 'Rp 2.000.000/bln', 'Rp 4.000.000'],
        ['', 'SUBTOTAL PENGEMBANGAN', '', '', 'Rp 49.500.000'],
      ]
    ),
    br(),
    h2('8.2 Total Anggaran & ROI'),
    tableFromData(
      ['Komponen', 'Biaya'],
      [
        ['Pengembangan (6 bulan)', 'Rp 49.500.000'],
        ['Infrastruktur (1 tahun)', 'Rp 5.400.000'],
        ['Pelatihan & Sosialisasi', 'Rp 6.500.000'],
        ['Contingency (10%)', 'Rp 6.140.000'],
        ['TOTAL ANGGARAN', 'Rp 67.540.000'],
        ['Penghematan + Pendapatan Tambahan/Tahun', 'Rp 46.500.000'],
        ['Break-even Point', '±17 bulan'],
      ]
    ),
    br(),

    // ── BAB IX ──────────────────────────────────────────────────────────────
    h1('BAB IX — RISIKO DAN MITIGASI'),
    tableFromData(
      ['No', 'Risiko', 'Kemungkinan', 'Mitigasi'],
      [
        ['1', 'Server down saat ujian berlangsung', 'Rendah', 'Auto-failover, backup server, auto-save jawaban setiap 30 detik'],
        ['2', 'Guru menolak adopsi teknologi', 'Sedang', 'Pelatihan intensif, pendampingan langsung, helpdesk'],
        ['3', 'Koneksi internet tidak stabil', 'Sedang', 'Mode offline PWA, sync saat online kembali'],
        ['4', 'Data hilang/rusak', 'Sangat Rendah', 'Backup otomatis harian ke 2 lokasi berbeda'],
        ['5', 'Keamanan data bocor', 'Rendah', 'Enkripsi, HTTPS, audit log, Redis ACL'],
        ['6', 'Anggaran tidak tersedia', 'Sedang', 'Ajukan ke BOS/BOP, hibah BPMU, kerjasama CSR'],
        ['7', 'Integrasi DAPODIK gagal', 'Sedang', 'Input manual sebagai fallback, sinkronisasi berkala'],
      ]
    ),
    br(),

    // ── BAB X ───────────────────────────────────────────────────────────────
    h1('BAB X — INDIKATOR KEBERHASILAN (KPI)'),
    tableFromData(
      ['Kategori', 'Indikator', 'Target'],
      [
        ['Teknis', 'Uptime sistem', '≥ 99.5%'],
        ['Teknis', 'Response time halaman', '< 2 detik'],
        ['Teknis', 'Kapasitas ujian bersamaan', '≥ 500 siswa'],
        ['Penggunaan', 'Guru aktif menggunakan sistem', '≥ 80% (64/80 guru)'],
        ['Penggunaan', 'Ujian via CBT', '≥ 70% dari total ujian'],
        ['Penggunaan', 'Nilai raport diinput via LMS', '100%'],
        ['Kualitas', 'Kepuasan guru (survei)', '≥ 4.0/5.0'],
        ['Kualitas', 'Kepuasan siswa (survei)', '≥ 4.2/5.0'],
        ['Kualitas', 'Bug kritis per bulan', '< 3'],
      ]
    ),
    br(),

    // ── BAB XI ──────────────────────────────────────────────────────────────
    h1('BAB XI — PENUTUP'),
    h2('11.1 Kesimpulan'),
    p('Pengembangan LMS-CBT SMK Negeri 1 Kras merupakan investasi strategis yang tidak hanya memberikan manfaat finansial melalui penghematan biaya operasional, tetapi juga meningkatkan kualitas pendidikan secara signifikan. Dengan estimasi penghematan Rp 46,5 juta per tahun dan break-even point dalam 17 bulan, proyek ini layak secara ekonomi.'),
    p('Lebih dari sekadar penghematan biaya, LMS-CBT mentransformasi cara guru mengajar dan siswa belajar. Guru dapat fokus pada kualitas pengajaran bukan administrasi, siswa mendapat feedback instan dan akses materi 24/7, kepala sekolah memiliki data real-time untuk pengambilan keputusan, dan orang tua dapat memantau perkembangan anak secara transparan.'),
    br(),
    h2('11.2 Rekomendasi'),
    p('1.  Segera setujui anggaran untuk Fase 1 (Bulan 1-2) sebagai prioritas utama, senilai Rp 15.000.000.'),
    p('2.  Bentuk tim inti minimal: 1 developer, 1 koordinator IT sekolah, 1 wakil guru sebagai liaison.'),
    p('3.  Tetapkan champion per jurusan — guru yang antusias teknologi untuk membantu sosialisasi.'),
    p('4.  Jadwalkan ujian perdana CBT di bulan ke-2 sebagai pilot project untuk 2-3 kelas.'),
    p('5.  Evaluasi rutin setiap akhir fase dengan melibatkan perwakilan guru dan siswa.'),
    br(), br(),

    // ── TTD ─────────────────────────────────────────────────────────────────
    new Paragraph({
      children: [new TextRun({ text: 'Ditetapkan di : Kras, Kabupaten Kediri', size: 24 })],
      spacing: { before: 200, after: 60 },
    }),
    p('Tanggal          : Oktober 2026'),
    br(), br(),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
        insideH: { style: BorderStyle.NONE }, insideV: { style: BorderStyle.NONE },
      },
      rows: [
        new TableRow({ children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Kepala SMK Negeri 1 Kras,', size: 24 })], alignment: AlignmentType.CENTER })], borders: { top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE} } }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Koordinator Pengembangan TI,', size: 24 })], alignment: AlignmentType.CENTER })], borders: { top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE} } }),
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [br(), br(), br()] , borders: { top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE} } }),
          new TableCell({ children: [br(), br(), br()] , borders: { top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE} } }),
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'JATMIKO, M.Pd.', bold: true, size: 24, underline: { type: UnderlineType.SINGLE } })], alignment: AlignmentType.CENTER })], borders: { top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE} } }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '................................', size: 24, underline: { type: UnderlineType.SINGLE } })], alignment: AlignmentType.CENTER })], borders: { top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE} } }),
        ]}),
        new TableRow({ children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'NIP. 19762034234312', size: 22 })], alignment: AlignmentType.CENTER })], borders: { top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE} } }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'NIP.', size: 22 })], alignment: AlignmentType.CENTER })], borders: { top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE} } }),
        ]}),
      ],
    }),
  ],
}];

// ── Generate ─────────────────────────────────────────────────────────────────
const doc = new Document({
  creator: 'Tim TI SMK Negeri 1 Kras',
  title: 'Proposal Pengembangan LMS-CBT SMK Negeri 1 Kras',
  description: 'Proposal pengembangan aplikasi Learning Management System dan Computer-Based Test',
  styles: {
    paragraphStyles: [
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        run: { bold: true, color: BIRU, size: 28 },
        paragraph: { spacing: { before: 300, after: 120 } },
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        run: { bold: true, color: BIRU_MID, size: 26 },
        paragraph: { spacing: { before: 240, after: 80 } },
      },
      {
        id: 'Heading3',
        name: 'Heading 3',
        basedOn: 'Normal',
        next: 'Normal',
        run: { bold: true, color: ABU_GEL, size: 24 },
        paragraph: { spacing: { before: 160, after: 60 } },
      },
    ],
  },
  sections,
});

Packer.toBuffer(doc).then((buffer) => {
  const outputPath = 'proposal-lms-cbt-smkn1kras.docx';
  fs.writeFileSync(outputPath, buffer);
  console.log(`✅ File berhasil dibuat: ${outputPath}`);
  console.log(`   Ukuran: ${(buffer.length / 1024).toFixed(1)} KB`);
}).catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
