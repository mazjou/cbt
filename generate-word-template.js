const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');
const fs = require('fs');

async function generate() {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'TEMPLATE IMPORT SOAL - MICROSOFT WORD', bold: true, size: 28 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'LMS CBT — Format Soal Pilihan Ganda', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun('')] }),
        new Paragraph({ children: [new TextRun({ text: 'ATURAN FORMAT:', bold: true, size: 24, color: '1a56db' })] }),
        new Paragraph({ children: [new TextRun({ text: '- Nomor soal: "1." atau "1)"', size: 20 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: '- Opsi: "A." atau "A)"', size: 20 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: '- Kunci jawaban: "KUNCI: B"', size: 20 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: '- Poin: "NILAI: 2" (opsional, default = 1)', size: 20 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: '- Multi jawaban: "KUNCI: A,C,D" + "TIPE: CHECKBOX"', size: 20 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: '- Benar/Salah: opsi hanya A (Benar) dan B (Salah) + "TIPE: TRUE_FALSE"', size: 20 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: '- Multiple T/F: tiap opsi A-E adalah pernyataan, kunci per baris: "KUNCI_A: B" / "KUNCI_B: S" + "TIPE: MULTI_TF"', size: 20 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: '- Gambar SOAL: sisipkan tepat setelah nomor soal (sebelum atau sesudah opsi)', size: 20 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: '- Gambar OPSI: sisipkan tepat setelah huruf opsi (mis: "A." lalu enter lalu Insert Picture)', size: 20 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun('')] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '>>> HAPUS SEMUA TEKS DI ATAS GARIS INI SEBELUM UPLOAD <<<', bold: true, color: 'CC0000', size: 20 })] }),
        new Paragraph({ children: [new TextRun({ text: '================================================================', color: '888888', size: 18 })] }),
        new Paragraph({ children: [new TextRun('')] }),

        // Soal 1 MCQ biasa
        new Paragraph({ children: [new TextRun({ text: '1. Ibu kota negara Indonesia adalah?', bold: true, size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'A. Surabaya', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'B. Bandung', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'C. Jakarta', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'D. Yogyakarta', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'E. Medan', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'KUNCI: C', bold: true, color: '007700', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'NILAI: 1', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun('')] }),

        // Soal 2 dengan gambar soal
        new Paragraph({ children: [new TextRun({ text: '2. Perhatikan gambar berikut ini!', bold: true, size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: '[SISIPKAN GAMBAR SOAL DI SINI: Insert > Picture]', italics: true, color: '0000AA', size: 20 })] }),
        new Paragraph({ children: [new TextRun({ text: 'A. Pilihan A', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'B. Pilihan B', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'C. Pilihan C', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'D. Pilihan D', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'E. Pilihan E', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'KUNCI: A', bold: true, color: '007700', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'NILAI: 2', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun('')] }),

        // Soal 3 dengan gambar opsi
        new Paragraph({ children: [new TextRun({ text: '3. Manakah gambar yang menunjukkan segitiga?', bold: true, size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'A.', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: '[GAMBAR OPSI A: Insert > Picture di baris baru setelah "A."]', italics: true, color: '0000AA', size: 20 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'B.', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: '[GAMBAR OPSI B: Insert > Picture di baris baru setelah "B."]', italics: true, color: '0000AA', size: 20 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'C.', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: '[GAMBAR OPSI C: Insert > Picture di baris baru setelah "C."]', italics: true, color: '0000AA', size: 20 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'D.', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: '[GAMBAR OPSI D: Insert > Picture di baris baru setelah "D."]', italics: true, color: '0000AA', size: 20 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'E.', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: '[GAMBAR OPSI E: Insert > Picture di baris baru setelah "E."]', italics: true, color: '0000AA', size: 20 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'KUNCI: C', bold: true, color: '007700', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'NILAI: 3', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun('')] }),

        // Soal 4 CHECKBOX
        new Paragraph({ children: [new TextRun({ text: '4. Manakah yang termasuk bilangan prima? (pilih semua yang benar)', bold: true, size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'A. 2', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'B. 4', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'C. 5', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'D. 7', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'E. 9', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'KUNCI: A,C,D', bold: true, color: '007700', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'TIPE: CHECKBOX', bold: true, color: '0055AA', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'NILAI: 4', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun('')] }),

        // Soal 5 TRUE_FALSE (Benar/Salah)
        new Paragraph({ children: [new TextRun({ text: '5. Air mendidih pada suhu 100 derajat Celcius pada tekanan 1 atm.', bold: true, size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'A. Benar', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'B. Salah', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'KUNCI: A', bold: true, color: '007700', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'TIPE: TRUE_FALSE', bold: true, color: '0055AA', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'NILAI: 2', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun('')] }),

        // Soal 6 MULTI_TF (Multiple True-False)
        new Paragraph({ children: [new TextRun({ text: '6. Perhatikan pernyataan-pernyataan berikut tentang fotosintesis!', bold: true, size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'A. Fotosintesis membutuhkan cahaya matahari', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'B. CO2 dihasilkan sebagai produk fotosintesis', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'C. Klorofil berperan sebagai pigmen penangkap cahaya', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'D. O2 dilepaskan sebagai produk samping fotosintesis', size: 22 })], indent: { left: 400 } }),
        new Paragraph({ children: [new TextRun({ text: 'KUNCI_A: B', bold: true, color: '007700', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'KUNCI_B: S', bold: true, color: 'CC0000', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'KUNCI_C: B', bold: true, color: '007700', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'KUNCI_D: B', bold: true, color: '007700', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'TIPE: MULTI_TF', bold: true, color: '0055AA', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'NILAI: 4', size: 22, color: '555555' })] }),
        new Paragraph({ children: [new TextRun({ text: '(Keterangan: B = Benar, S = Salah. Poin proporsional: benar 3 dari 4 = 3 poin)', italics: true, color: '555555', size: 18 })] }),
        new Paragraph({ children: [new TextRun('')] }),

        new Paragraph({ children: [new TextRun({ text: '================================================================', color: '888888', size: 18 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Hapus contoh soal di atas dan ketik soal Anda mulai dari nomor 1', italics: true, color: '007700', size: 18 })] }),
        new Paragraph({ children: [new TextRun('')] }),
      ]
    }]
  });

  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync('src/public/templates/import_template_word.docx', buf);
  console.log('OK - file size:', buf.length, 'bytes');
}
generate().catch(e => { console.error(e); process.exit(1); });
