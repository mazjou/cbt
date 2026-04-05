#!/bin/bash

echo "🚀 Building Android APK for LMS SMKN 1 Kras"
echo "============================================"

# Check if Capacitor is initialized
if [ ! -d "android" ]; then
  echo "📱 Initializing Capacitor Android platform..."
  npx cap add android
fi

# Copy web assets
echo "📦 Copying web assets..."
npx cap copy android

# Sync Capacitor
echo "🔄 Syncing Capacitor..."
npx cap sync android

# Update Capacitor
echo "⬆️  Updating Capacitor..."
npx cap update android

echo ""
echo "✅ Build preparation complete!"
echo ""
echo "Next steps:"
echo "1. Open Android Studio: npx cap open android"
echo "2. Wait for Gradle sync to complete"
echo "3. Build → Build Bundle(s) / APK(s) → Build APK(s)"
echo "4. APK will be in: android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "Or build from command line:"
echo "cd android && ./gradlew assembleDebug"
