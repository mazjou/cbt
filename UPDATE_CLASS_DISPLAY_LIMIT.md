# Update: Limit Class Display to 3 with Detail Button

## Perubahan

Menampilkan maksimal 3 kelas pertama, sisanya ditampilkan dengan tombol "+X lainnya" yang bisa diklik untuk melihat semua kelas.

## Implementasi

### Logika

```javascript
// Parse class names and limit to 3
const classNames = e.class_names ? e.class_names.split(', ') : [];
const displayClasses = classNames.slice(0, 3);
const remainingCount = classNames.length - 3;
```

### Tampilan

#### Jika tidak ada kelas:
```
Semua Kelas
```

#### Jika 1-3 kelas:
```
XII KULINER 1, XII KULINER 2, XII KULINER 3
```

#### Jika lebih dari 3 kelas:
```
XII KULINER 1, XII KULINER 2, XII KULINER 3 [+2 lainnya]
```

Tombol "+X lainnya" bisa diklik untuk menampilkan alert dengan semua kelas.

## Fitur Tombol Detail

### Mobile Card
```html
<button 
  type="button" 
  onclick="alert('Semua Kelas:\\n<%= classNames.join('\\n') %>')"
  class="ml-1 inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-xs font-semibold hover:bg-indigo-200 transition-colors"
>
  +<%= remainingCount %> lainnya
</button>
```

### Desktop Table
```html
<button 
  type="button" 
  onclick="alert('Semua Kelas:\\n<%= classNames.join('\\n') %>')"
  class="ml-1 inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-xs font-semibold hover:bg-indigo-200 transition-colors"
  title="<%= e.class_names %>"
>
  +<%= remainingCount %>
</button>
```

## Contoh

### Data Asli:
```
XII KULINER 1, XII KULINER 2, XII KULINER 3, XII TKJ 1, XII TKJ 2
```

### Tampilan:
```
XII KULINER 1, XII KULINER 2, XII KULINER 3 [+2 lainnya]
```

### Klik "+2 lainnya":
Alert popup menampilkan:
```
Semua Kelas:
XII KULINER 1
XII KULINER 2
XII KULINER 3
XII TKJ 1
XII TKJ 2
```

## Styling

### Tombol Badge
- Background: `bg-indigo-100`
- Text: `text-indigo-700`
- Hover: `hover:bg-indigo-200`
- Size: `text-xs`
- Padding: `px-2 py-0.5`
- Border radius: `rounded-md`

### Responsive
- Mobile: Tombol dengan text "+X lainnya"
- Desktop: Tombol dengan text "+X" (lebih compact)
- Hover effect pada kedua versi

## Keuntungan

✅ **Tampilan Lebih Rapi**:
   - Tidak ada text panjang yang overflow
   - Maksimal 3 kelas ditampilkan
   - Sisanya tersembunyi dengan indikator jelas

✅ **User Friendly**:
   - Tombol badge yang menarik
   - Hover effect untuk feedback
   - Alert popup untuk detail lengkap

✅ **Konsisten**:
   - Berlaku di mobile card
   - Berlaku di desktop table
   - Logika sama di kedua tampilan

✅ **Informasi Lengkap**:
   - User tetap bisa lihat semua kelas
   - Cukup klik tombol "+X lainnya"
   - Alert menampilkan list lengkap

## Alternative (Future Enhancement)

Bisa diganti dengan modal yang lebih cantik:
```javascript
// Instead of alert, use modal
onclick="showClassModal('<%= classNames.join(', ') %>')"
```

Atau tooltip yang muncul saat hover:
```html
<span title="<%= e.class_names %>">
  +<%= remainingCount %> lainnya
</span>
```

## File yang Dimodifikasi

- `src/views/teacher/exams.ejs`

## Testing

### Skenario 1: Tidak ada kelas
- ✅ Tampil: "Semua Kelas"
- ✅ Tidak ada tombol detail

### Skenario 2: 1-3 kelas
- ✅ Tampil semua kelas
- ✅ Tidak ada tombol detail

### Skenario 3: Lebih dari 3 kelas
- ✅ Tampil 3 kelas pertama
- ✅ Tombol "+X lainnya" muncul
- ✅ Klik tombol → alert dengan semua kelas
- ✅ Alert format: satu kelas per baris

## Notes

- Menggunakan `split(', ')` untuk parse class names
- `slice(0, 3)` untuk ambil 3 pertama
- `join('\\n')` untuk format alert (newline)
- Tombol hanya muncul jika kelas > 3
- Alert simple tapi efektif untuk MVP

---

**Status**: ✅ Implemented
**Updated**: 2026-03-08
