# 📱 Panduan Build APK Android - LMS SMKN 1 Kras

## Overview

Aplikasi ini akan dikonversi menjadi APK Android menggunakan **Capacitor** dengan fitur:
- ✅ Native push notifications (Firebase Cloud Messaging)
- ✅ Offline capability
- ✅ Native UI components
- ✅ Camera access untuk upload foto
- ✅ File picker native
- ✅ Splash screen & app icon
- ✅ Back button handling
- ✅ Status bar customization

## Teknologi

- **Capacitor 6** - Native runtime untuk web apps
- **Firebase Cloud Messaging** - Push notifications
- **Android Studio** - Build APK
- **Cordova plugins** - Native features

## Prerequisites

1. **Node.js** (sudah terinstall)
2. **Android Studio** - Download dari https://developer.android.com/studio
3. **JDK 17** - Biasanya sudah include di Android Studio
4. **Gradle** - Sudah include di Android Studio

## Langkah-langkah

### 1. Install Capacitor

```bash
npm install @capacitor/core @capacitor/cli
npm install @capacitor/android
npm install @capacitor/push-notifications
npm install @capacitor/camera
npm install @capacitor/filesystem
npm install @capacitor/splash-screen
npm install @capacitor/status-bar
npm install @capacitor/network
```

### 2. Initialize Capacitor

```bash
npx cap init
```

Isi:
- App name: `LMS SMKN 1 Kras`
- App ID: `id.sch.smkn1kras.lms`
- Web directory: `public` (atau `dist` jika ada build process)

### 3. Add Android Platform

```bash
npx cap add android
```

### 4. Setup Firebase (untuk Push Notifications)

1. Buat project di https://console.firebase.google.com
2. Add Android app dengan package name: `id.sch.smkn1kras.lms`
3. Download `google-services.json`
4. Copy ke `android/app/google-services.json`

### 5. Build & Sync

```bash
# Build web assets (jika perlu)
# npm run build

# Sync ke Android
npx cap sync android
```

### 6. Open di Android Studio

```bash
npx cap open android
```

### 7. Build APK

Di Android Studio:
1. Build → Build Bundle(s) / APK(s) → Build APK(s)
2. Tunggu proses build selesai
3. APK akan ada di: `android/app/build/outputs/apk/debug/app-debug.apk`

## File yang Perlu Dibuat

Saya akan membuat file-file berikut untuk Anda:
1. `capacitor.config.json` - Konfigurasi Capacitor
2. `android/app/src/main/res/values/strings.xml` - App name
3. `android/app/src/main/AndroidManifest.xml` - Permissions
4. `src/public/manifest.json` - PWA manifest
5. `src/public/service-worker.js` - Service worker untuk offline
6. `capacitor-plugins.js` - Native plugin integrations

## Estimasi Ukuran APK

- Debug APK: ~15-20 MB
- Release APK (signed): ~10-15 MB
- AAB (untuk Play Store): ~8-12 MB

## Testing

1. **Emulator**: Test di Android Studio emulator
2. **Real Device**: 
   - Enable USB debugging di HP
   - Connect via USB
   - Run dari Android Studio

## Distribution

### Debug APK (untuk testing)
- Share file APK langsung
- Install dengan "Install from Unknown Sources"

### Release APK (untuk production)
1. Generate signing key
2. Build signed APK
3. Upload ke Google Play Store atau distribute langsung

## Fitur Native yang Akan Ditambahkan

1. **Push Notifications Native**
   - Notifikasi muncul bahkan saat app tertutup
   - Sound & vibration
   - Notification badges
   - Deep linking ke materi/ujian

2. **Offline Mode**
   - Cache materi yang sudah dibuka
   - Queue ujian untuk submit nanti
   - Sync otomatis saat online

3. **Camera Integration**
   - Upload foto profil
   - Upload gambar soal
   - Scan QR code untuk akses ujian

4. **File Picker**
   - Upload file dari storage
   - Download materi PDF

5. **Native UI**
   - Splash screen dengan logo sekolah
   - Status bar dengan warna brand
   - Back button handling
   - Pull to refresh

## Lanjutkan?

Apakah Anda ingin saya lanjutkan membuat semua file konfigurasi dan setup Capacitor sekarang?

Saya akan membuat:
1. ✅ Konfigurasi Capacitor
2. ✅ Setup Firebase FCM
3. ✅ Native plugins integration
4. ✅ Service worker untuk offline
5. ✅ Build scripts
6. ✅ Icon & splash screen assets
7. ✅ Dokumentasi lengkap

Estimasi waktu: 15-20 menit untuk setup lengkap.
