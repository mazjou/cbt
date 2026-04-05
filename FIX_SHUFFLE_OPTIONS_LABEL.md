# Fix: Shuffle Options Label A, B, C, D, E

## Masalah

Ketika fitur "Acak Opsi Jawaban" (shuffle_options) diaktifkan pada ujian, label A, B, C, D, E ikut teracak. Misalnya:
- Soal 1: C, A, E, B, D
- Soal 2: B, D, A, E, C

Padahal yang seharusnya diacak adalah ISI jawaban, bukan label A, B, C, D, E nya.

## Yang Seharusnya Terjadi

Label A, B, C, D, E tetap berurutan, tapi ISI jawaban yang diacak:
- Opsi A: berisi jawaban yang sebelumnya di C
- Opsi B: berisi jawaban yang sebelumnya di A
- Opsi C: berisi jawaban yang sebelumnya di E
- dst.

## Penyebab

Di `src/routes/student.js`, query mengambil opsi dengan:

```javascript
ORDER BY question_id ASC, ${attempt.shuffle_options ? 'RAND()' : 'option_label ASC'};
```

Ini mengacak baris opsi secara keseluruhan, termasuk label A, B, C, D, E yang sudah tersimpan di database.

## Solusi

Setelah mengambil opsi dengan urutan acak, reassign label A, B, C, D, E secara berurutan:

```javascript
// Group options by question_id
for (const o of opts) {
  if (!optionsMap[o.question_id]) optionsMap[o.question_id] = [];
  optionsMap[o.question_id].push(o);
}

// If shuffle_options is enabled, reassign labels A, B, C, D, E in order
if (attempt.shuffle_options) {
  const labels = ['A', 'B', 'C', 'D', 'E'];
  for (const qid in optionsMap) {
    optionsMap[qid].forEach((opt, idx) => {
      opt.option_label = labels[idx] || opt.option_label;
    });
  }
}
```

## Cara Kerja

### Tanpa Shuffle (shuffle_options = 0)
1. Query: `ORDER BY option_label ASC` → A, B, C, D, E
2. Tidak ada reassign label
3. Hasil: A, B, C, D, E (urutan asli)

### Dengan Shuffle (shuffle_options = 1)
1. Query: `ORDER BY RAND()` → urutan acak (misal: C, A, E, B, D)
2. Reassign label berurutan:
   - Opsi pertama (yang tadinya C) → jadi A
   - Opsi kedua (yang tadinya A) → jadi B
   - Opsi ketiga (yang tadinya E) → jadi C
   - Opsi keempat (yang tadinya B) → jadi D
   - Opsi kelima (yang tadinya D) → jadi E
3. Hasil: Label A, B, C, D, E berurutan, tapi ISI nya acak

## Contoh

### Database Asli:
```
A: Jakarta
B: Bandung
C: Surabaya
D: Medan
E: Makassar
```

### Setelah Shuffle (dengan fix):
```
A: Surabaya  (tadinya C)
B: Jakarta   (tadinya A)
C: Makassar  (tadinya E)
D: Bandung   (tadinya B)
E: Medan     (tadinya D)
```

Label tetap A, B, C, D, E, tapi isi jawaban teracak!

## Keuntungan

✅ Label A, B, C, D, E selalu berurutan (tidak membingungkan siswa)
✅ Isi jawaban tetap teracak (mencegah contek)
✅ Konsisten dengan standar ujian pada umumnya
✅ Lebih mudah dibaca dan dipahami siswa

## File yang Dimodifikasi

- `src/routes/student.js` - Route `/attempts/:id`

## Testing

1. Buat ujian dengan "Acak Opsi Jawaban" dicentang
2. Mulai ujian sebagai siswa
3. Cek setiap soal:
   - ✅ Label harus A, B, C, D, E (berurutan)
   - ✅ Isi jawaban berbeda dari urutan asli (teracak)
4. Refresh halaman atau buka attempt baru:
   - ✅ Urutan isi jawaban berbeda lagi (random setiap kali)
   - ✅ Label tetap A, B, C, D, E

## Notes

- Shuffle dilakukan setiap kali halaman dimuat (RAND() di query)
- Setiap siswa mendapat urutan acak yang berbeda
- Setiap attempt baru mendapat urutan acak yang berbeda
- Label A, B, C, D, E tidak pernah berubah posisi

---

**Status**: ✅ Fixed
**Updated**: 2026-03-08
