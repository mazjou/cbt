# Fix: Mobile Layout Live Classes

## Masalah

Tampilan Live Classes di mobile offside (keluar dari layar) karena:
- Tombol action di kanan terlalu lebar
- Layout horizontal tidak responsive
- Text terlalu panjang dan overflow
- Info detail terlalu banyak di satu baris

## Solusi

### 1. Header Responsive
```html
<!-- Before -->
<div class="flex items-center justify-between">

<!-- After -->
<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
```

- Mobile: Stack vertical (tombol di bawah judul)
- Desktop: Horizontal seperti biasa
- Tombol "Buat Live Class" full width di mobile

### 2. Card Layout Responsive
```html
<!-- Before -->
<div class="flex items-start justify-between mb-4">

<!-- After -->
<div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
```

- Mobile: Content dan tombol stack vertical
- Desktop: Side by side seperti biasa

### 3. Title & Badge
```html
<!-- Before -->
<div class="flex items-center gap-3 mb-2">

<!-- After -->
<div class="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
```

- Mobile: Badge di bawah title
- Desktop: Badge di samping title
- Badge dengan `w-fit` agar tidak full width

### 4. Info Grid
```html
<!-- Before -->
<div class="flex items-center gap-4 text-sm">

<!-- After -->
<div class="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm">
```

- Mobile: Grid 2 kolom untuk info
- Desktop: Flex horizontal
- Text size lebih kecil di mobile (xs)
- Truncate untuk text panjang

### 5. Action Buttons
```html
<!-- Before -->
<div class="flex flex-col gap-2 ml-4">

<!-- After -->
<div class="flex sm:flex-col gap-2 w-full sm:w-auto sm:ml-4">
```

- Mobile: Horizontal (side by side)
- Desktop: Vertical (stack)
- Full width di mobile dengan `flex-1`
- Text tombol lebih pendek ("Masuk" bukan "Masuk Room")

### 6. Date Format
```javascript
// Before
weekday: 'long', month: 'long'

// After  
weekday: 'short', month: 'short'
```

- Format tanggal lebih pendek di mobile
- "Selasa, 3 Maret 2026" → "Sel, 3 Mar 2026"

### 7. Text Sizing
- Title: `text-lg sm:text-xl` (lebih kecil di mobile)
- Info: `text-xs sm:text-sm` (lebih kecil di mobile)
- Button: `text-sm` (konsisten)
- Padding: `p-4 sm:p-6` (lebih kecil di mobile)

### 8. Description
```html
<p class="text-slate-600 text-xs sm:text-sm mb-3 line-clamp-2">
```

- `line-clamp-2`: Maksimal 2 baris
- Prevent overflow dengan ellipsis

## Hasil

### Mobile (< 640px)
- ✅ Semua konten dalam layar
- ✅ Tombol tidak terpotong
- ✅ Layout vertical yang rapi
- ✅ Text readable dengan size yang tepat
- ✅ Info dalam grid 2 kolom
- ✅ Action buttons horizontal (side by side)

### Desktop (≥ 640px)
- ✅ Layout horizontal seperti biasa
- ✅ Tombol vertical di kanan
- ✅ Info dalam satu baris
- ✅ Text size normal

## Breakpoints

- `sm:` = 640px (tablet portrait)
- Default = mobile (< 640px)

## Testing

Test di berbagai ukuran:
- ✅ Mobile portrait (360px - 414px)
- ✅ Mobile landscape (640px - 768px)
- ✅ Tablet (768px - 1024px)
- ✅ Desktop (> 1024px)

## File Modified

- `src/views/teacher/live_classes.ejs`

---

**Status**: ✅ Fixed
**Updated**: 2026-03-08
