const XLSX = require('xlsx');
const path = require('path');

// Create workbook
const wb = XLSX.utils.book_new();

// Sample data with proper headers
const data = [
  {
    'question_text': 'Apa fungsi CPU pada komputer?',
    'image': '',
    'points': 1,
    'A': 'Menyimpan data',
    'B': 'Mengolah data',
    'C': 'Menampilkan data',
    'D': 'Mengirim data',
    'E': 'Mencetak data',
    'correct': 'B'
  },
  {
    'question_text': 'Manakah yang termasuk perangkat input?',
    'image': '',
    'points': 1,
    'A': 'Monitor',
    'B': 'Printer',
    'C': 'Keyboard',
    'D': 'Speaker',
    'E': 'Proyektor',
    'correct': 'C'
  },
  {
    'question_text': 'Berapa hasil dari 2 + 2 x 3?',
    'image': 'gambar_matematika.jpg',
    'points': 2,
    'A': '10',
    'B': '8',
    'C': '12',
    'D': '6',
    'E': '14',
    'correct': 'B'
  }
];

// Create worksheet from data
const ws = XLSX.utils.json_to_sheet(data);

// Set column widths
ws['!cols'] = [
  { wch: 50 },  // question_text
  { wch: 25 },  // image
  { wch: 8 },   // points
  { wch: 30 },  // A
  { wch: 30 },  // B
  { wch: 30 },  // C
  { wch: 30 },  // D
  { wch: 30 },  // E
  { wch: 8 }    // correct
];

// Add worksheet to workbook
XLSX.utils.book_append_sheet(wb, ws, 'Soal');

// Add instruction sheet
const instructions = [
  ['PANDUAN IMPORT SOAL UJIAN'],
  [''],
  ['KOLOM WAJIB:'],
  ['1. question_text', 'Teks soal (wajib diisi)'],
  ['2. points', 'Nilai/bobot soal (angka, default: 1)'],
  ['3. A, B, C, D, E', 'Opsi jawaban (semua wajib diisi)'],
  ['4. correct', 'Kunci jawaban (isi dengan huruf: A/B/C/D/E)'],
  [''],
  ['KOLOM OPSIONAL:'],
  ['5. image', 'Nama file gambar atau URL (boleh kosong)'],
  ['', 'Jika pakai nama file, upload gambarnya saat import'],
  ['', 'Contoh: gambar1.jpg atau https://example.com/image.jpg'],
  [''],
  ['TIPS:'],
  ['• Jangan ubah nama kolom header'],
  ['• Pastikan kunci jawaban sesuai (A/B/C/D/E)'],
  ['• Points harus angka positif'],
  ['• Hapus baris contoh sebelum import'],
  ['• Maksimal 200 soal per file untuk performa optimal'],
  [''],
  ['CONTOH FORMAT:'],
  ['Lihat sheet "Soal" untuk contoh format yang benar']
];

const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
wsInstructions['!cols'] = [{ wch: 20 }, { wch: 60 }];

// Style the instruction sheet (basic)
wsInstructions['A1'].s = {
  font: { bold: true, sz: 14 },
  alignment: { horizontal: 'center' }
};

XLSX.utils.book_append_sheet(wb, wsInstructions, 'Panduan');

// Write file
const outputPath = path.join(__dirname, '..', 'src', 'public', 'templates', 'question_import_template.xlsx');
XLSX.writeFile(wb, outputPath);

console.log('✅ Template berhasil dibuat:', outputPath);
