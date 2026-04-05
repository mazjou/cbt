# Instruksi Mengganti Logo

Logo navbar sudah diubah untuk menggunakan gambar logo SMK Negeri 1 Kras.

## Langkah-langkah:

1. Simpan file gambar logo SMK Negeri 1 Kras (yang Anda kirimkan) dengan nama `logo.png`

2. Letakkan file `logo.png` tersebut di folder:
   ```
   src/public/images/logo.png
   ```

3. Logo akan otomatis muncul di navbar dengan ukuran 48x48 pixel (h-12 w-12)

## Catatan:

- Format gambar yang didukung: PNG, JPG, JPEG, SVG
- Jika ingin menggunakan nama file lain, ubah di file `src/views/partials/navbar.ejs` pada baris:
  ```html
  <img src="/public/images/logo.png" alt="Logo SMK Negeri 1 Kras" class="h-12 w-12 object-contain">
  ```
- Ukuran logo bisa disesuaikan dengan mengubah class `h-12 w-12` (saat ini 48x48px)
- `object-contain` memastikan logo tidak terdistorsi

## Alternatif jika logo terlalu besar/kecil:

Ubah class di navbar.ejs:
- Logo lebih besar: `h-14 w-14` atau `h-16 w-16`
- Logo lebih kecil: `h-10 w-10` atau `h-8 w-8`
