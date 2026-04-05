# Fix: Mobile Responsive Kelola Ujian

## Masalah

Tampilan tabel kelola ujian di mobile terlalu panjang dan sulit dibaca karena:
- Tabel dengan banyak kolom (9 kolom)
- Horizontal scroll yang tidak nyaman
- Text terpotong dan sulit dibaca
- Tombol aksi terlalu kecil untuk di-tap

## Solusi

Membuat dua tampilan berbeda:
1. **Mobile**: Card layout yang compact dan mudah dibaca
2. **Desktop**: Tabel lengkap seperti biasa

## Implementasi

### Mobile Cards (< lg breakpoint)

```html
<div class="lg:hidden space-y-4">
  <!-- Card untuk setiap ujian -->
</div>
```

#### Struktur Card:

**Header Card:**
- ID dan Status badge di atas
- Judul ujian (max 2 baris dengan line-clamp)
- Quick info grid 3 kolom: Soal, Durasi, Kode

**Body Card:**
- Mata Pelajaran
- Kelas
- Action buttons (Detail, Edit, Publish/Unpublish)

### Desktop Table (≥ lg breakpoint)

```html
<div class="hidden lg:block">
  <!-- Tabel lengkap seperti biasa -->
</div>
```

Tetap menggunakan tabel dengan semua kolom.

## Fitur Mobile Card

### Header
- Gradient background (indigo-purple)
- ID badge (#1, #2, dst)
- Status badge (Published/Draft)
- Judul dengan line-clamp-2 (max 2 baris)

### Quick Info Grid
3 kolom dengan background putih:
- **Soal**: Jumlah soal
- **Durasi**: Dalam menit (format: 60')
- **Kode**: Access code atau "—"

### Detail Info
- Mata Pelajaran
- Kelas (bisa multiple kelas)

### Action Buttons
3 tombol dengan lebar sama (flex-1):
- **Detail**: Border slate, untuk lihat detail
- **Edit**: Border amber, untuk edit ujian
- **Publish/Unpublish**: Background emerald/slate

## Responsive Breakpoints

### Mobile (< 1024px)
- Cards visible
- Table hidden
- Stats grid: 2 kolom
- Header buttons: full width
- Padding lebih kecil

### Desktop (≥ 1024px)
- Cards hidden
- Table visible
- Stats grid: 4 kolom
- Header buttons: auto width
- Padding normal

## Styling

### Colors
- Header card: Gradient indigo-purple
- Quick info: White background
- Borders: Slate-200
- Shadows: Soft shadow

### Typography
- Title: text-base font-bold
- Labels: text-xs text-slate-500
- Values: text-sm font-medium

### Spacing
- Card gap: space-y-4
- Internal padding: p-4
- Button gap: gap-2

## Keuntungan

✅ **Mobile Friendly**:
   - Tidak perlu horizontal scroll
   - Semua info terlihat jelas
   - Tombol mudah di-tap

✅ **Informasi Terorganisir**:
   - Info penting di atas (ID, status, judul)
   - Quick stats dalam grid
   - Detail lengkap di body

✅ **Action Mudah**:
   - 3 tombol besar dan jelas
   - Full width untuk mudah di-tap
   - Warna berbeda untuk setiap aksi

✅ **Desktop Tetap Optimal**:
   - Tabel lengkap dengan semua kolom
   - Tidak ada perubahan UX
   - Tetap efisien untuk data banyak

## File yang Dimodifikasi

- `src/views/teacher/exams.ejs`

## Testing

### Mobile (< 1024px)
- ✅ Cards tampil, table hidden
- ✅ Semua info terbaca jelas
- ✅ Tombol mudah di-tap
- ✅ Tidak ada horizontal scroll
- ✅ Stats grid 2 kolom

### Desktop (≥ 1024px)
- ✅ Table tampil, cards hidden
- ✅ Semua kolom terlihat
- ✅ Stats grid 4 kolom
- ✅ Layout seperti biasa

## Notes

- Menggunakan Tailwind `lg:` breakpoint (1024px)
- `line-clamp-2` untuk judul agar tidak terlalu panjang
- `flex-1` pada buttons untuk lebar sama
- Grid 3 kolom untuk quick info (optimal di mobile)
- Border dan shadow untuk depth

---

**Status**: ✅ Fixed
**Updated**: 2026-03-08
