const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');
const fs = require('fs');

// Field metadata bank soal yang didukung:
// MAPEL: nama/kode mata pelajaran
// KELAS: X / XI / XII / SEMUA
// BAB: nama bab atau materi
// KESULITAN: EASY / MEDIUM / HARD
// TIPE: MCQ / CHECKBOX / TRUE_FALSE / MULTI_TF (default MCQ)
// NILAI: poin soal (default 1)

async function generate() {
  const doc = new Document({
    sections: [{
      children: [
        // Judul
        new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'TEMPLATE IMPORT SOAL - BANK SOAL', bold: true, size: 28 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'LMS CBT -- Format Import Bank Soal dari Microsoft Word', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun('')] }),

        // Aturan format
        new Paragraph({ children: [new TextRun({ text: 'ATURAN FORMAT:', bold: true, size: 24, color: '1a56db' })] }),
        new Paragraph({ children: [new TextRun({ text: '- Nomor soal: "1." atau "1)"', size: 20 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: '- Opsi jawaban: "A." atau "A)"', size: 20 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: '- Kunci jawaban: "KUNCI: C" (huruf kapital)', size: 20 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: '- Mata pelajaran: "MAPEL: Matematika" (wajib)', size: 20, color: 'CC0000' })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: '- Tingkat kelas: "KELAS: X" atau "KELAS: XI" atau "KELAS: XII" atau "KELAS: SEMUA"', size: 20 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: '- Bab/Materi: "BAB: Trigonometri" (opsional)', size: 20 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: '- Tingkat kesulitan: "KESULITAN: EASY" atau "MEDIUM" atau "HARD" (opsional, default MEDIUM)', size: 20 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: '- Poin soal: "NILAI: 2" (opsional, default = 1)', size: 20 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: '- Tipe soal: "TIPE: MCQ/CHECKBOX/TRUE_FALSE/MULTI_TF" (opsional, default MCQ)', size: 20 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: '- Multi jawaban: KUNCI: A,C,D + TIPE: CHECKBOX', size: 20 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: '- Multiple T/F: KUNCI_A: B / KUNCI_B: S + TIPE: MULTI_TF (B=Benar, S=Salah)', size: 20 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: '- Gambar soal: Insert > Picture tepat setelah nomor soal', size: 20 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: '- CATATAN: MAPEL wajib diisi per soal atau akan diminta saat proses import', size: 20, color: 'CC0000' })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun('')] }),

        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '>>> HAPUS SEMUA TEKS DI ATAS GARIS INI SEBELUM UPLOAD <<<', bold: true, color: 'CC0000', size: 20 })] }),
        new Paragraph({ children: [new TextRun({ text: '================================================================', color: '888888', size: 18 })] }),
        new Paragraph({ children: [new TextRun('')] }),

        // Contoh 1 MCQ
        new Paragraph({ children: [new TextRun({ text: '1. Ibu kota negara Indonesia adalah?', bold: true, size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'A. Surabaya', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'B. Bandung', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'C. Jakarta', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'D. Yogyakarta', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'E. Medan', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'KUNCI: C', bold: true, color: '007700', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'MAPEL: IPS', bold: true, color: 'AA0000', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'KELAS: X', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun({ text: 'BAB: Wawasan Nusantara', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun({ text: 'KESULITAN: EASY', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun({ text: 'NILAI: 1', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun('')] }),

        // Contoh 2 MCQ dengan gambar
        new Paragraph({ children: [new TextRun({ text: '2. Perhatikan gambar berikut ini!', bold: true, size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: '[SISIPKAN GAMBAR SOAL DI SINI: Insert > Picture]', italics: true, color: '0000AA', size: 20 })] }),
        new Paragraph({ children: [new TextRun({ text: 'A. Pilihan A', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'B. Pilihan B', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'C. Pilihan C', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'D. Pilihan D', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'E. Pilihan E', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'KUNCI: A', bold: true, color: '007700', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'MAPEL: IPA', bold: true, color: 'AA0000', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'KELAS: XI', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun({ text: 'BAB: Sistem Pencernaan', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun({ text: 'KESULITAN: MEDIUM', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun({ text: 'NILAI: 2', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun('')] }),

        // Contoh 3 CHECKBOX
        new Paragraph({ children: [new TextRun({ text: '3. Manakah yang termasuk bilangan prima? (pilih semua yang benar)', bold: true, size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'A. 2', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'B. 4', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'C. 5', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'D. 7', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'E. 9', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'KUNCI: A,C,D', bold: true, color: '007700', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'TIPE: CHECKBOX', bold: true, color: '0055AA', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'MAPEL: Matematika', bold: true, color: 'AA0000', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'KELAS: X', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun({ text: 'BAB: Bilangan', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun({ text: 'KESULITAN: MEDIUM', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun({ text: 'NILAI: 4', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun('')] }),

        // Contoh 4 TRUE_FALSE
        new Paragraph({ children: [new TextRun({ text: '4. Air mendidih pada suhu 100 derajat Celcius pada tekanan 1 atm.', bold: true, size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'A. Benar', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'B. Salah', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'KUNCI: A', bold: true, color: '007700', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'TIPE: TRUE_FALSE', bold: true, color: '0055AA', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'MAPEL: IPA', bold: true, color: 'AA0000', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'KELAS: XI', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun({ text: 'BAB: Fisika Zat', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun({ text: 'KESULITAN: EASY', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun({ text: 'NILAI: 2', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun('')] }),

        // Contoh 5 MULTI_TF
        new Paragraph({ children: [new TextRun({ text: '5. Perhatikan pernyataan berikut tentang fotosintesis!', bold: true, size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'A. Fotosintesis membutuhkan cahaya matahari', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'B. CO2 dihasilkan sebagai produk fotosintesis', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'C. Klorofil berperan sebagai pigmen penangkap cahaya', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'D. O2 dilepaskan sebagai produk samping fotosintesis', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'E. Reaksi fotosintesis terjadi di dalam mitokondria', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'KUNCI_A: B', bold: true, color: '007700', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'KUNCI_B: S', bold: true, color: 'CC0000', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'KUNCI_C: B', bold: true, color: '007700', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'KUNCI_D: B', bold: true, color: '007700', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'KUNCI_E: S', bold: true, color: 'CC0000', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'TIPE: MULTI_TF', bold: true, color: '0055AA', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'MAPEL: IPA', bold: true, color: 'AA0000', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'KELAS: XII', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun({ text: 'BAB: Fotosintesis', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun({ text: 'KESULITAN: HARD', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun({ text: 'NILAI: 5', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun({ text: '(B = Benar, S = Salah. Poin proporsional: benar 4 dari 5 = 4 poin)', italics: true, color: '555555', size: 18 })] }),
        new Paragraph({ children: [new TextRun('')] }),

        new Paragraph({ children: [new TextRun({ text: '================================================================', color: '888888', size: 18 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Hapus contoh soal di atas dan ketik soal Anda mulai dari nomor 1', italics: true, color: '007700', size: 18 })] }),
        new Paragraph({ children: [new TextRun('')] }),
        new Paragraph({ children: [new TextRun('')] }),
      ]
    }]
  });

  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync('src/public/templates/import_template_bank_word.docx', buf);
  console.log('OK - file size:', buf.length, 'bytes');
}
generate().catch(e => { console.error(e); process.exit(1); });
