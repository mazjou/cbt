@echo off
echo 🚀 Building Android APK for LMS SMKN 1 Kras
echo ============================================

REM Check if Capacitor is initialized
if not exist "android" (
  echo 📱 Initializing Capacitor Android platform...
  call npx cap add android
)

REM Copy web assets
echo 📦 Copying web assets...
call npx cap copy android

REM Sync Capacitor
echo 🔄 Syncing Capacitor...
call npx cap sync android

REM Update Capacitor
echo ⬆️  Updating Capacitor...
call npx cap update android

echo.
echo ✅ Build preparation complete!
echo.
echo Next steps:
echo 1. Open Android Studio: npx cap open android
echo 2. Wait for Gradle sync to complete
echo 3. Build -^> Build Bundle(s) / APK(s) -^> Build APK(s)
echo 4. APK will be in: android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo Or build from command line:
echo cd android ^&^& gradlew assembleDebug

pause
