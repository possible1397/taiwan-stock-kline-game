#!/usr/bin/env bash
# =========================================
# 台股K線修練場 — 一鍵建置腳本
# =========================================
# 使用方式：
#   bash build.sh          # 同步前端到 www/ 並 Capacitor sync
#   bash build.sh android  # 建置 Android Debug APK
#   bash build.sh release  # 建置 Android Release APK (需 keystore)
# =========================================

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
WWW_DIR="$PROJECT_DIR/www"

echo "📦 Step 1: 同步前端資源到 www/ ..."
rm -rf "$WWW_DIR"
mkdir -p "$WWW_DIR"
cp "$PROJECT_DIR/index.html"    "$WWW_DIR/"
cp "$PROJECT_DIR/manifest.json" "$WWW_DIR/"
cp "$PROJECT_DIR/sw.js"         "$WWW_DIR/"
cp -r "$PROJECT_DIR/css"        "$WWW_DIR/"
cp -r "$PROJECT_DIR/js"         "$WWW_DIR/"
cp -r "$PROJECT_DIR/libs"       "$WWW_DIR/"
cp -r "$PROJECT_DIR/icons"      "$WWW_DIR/"
echo "  ✅ 前端資源已同步到 www/"

echo ""
echo "🔄 Step 2: Capacitor sync ..."
cd "$PROJECT_DIR"
npx cap sync android
echo "  ✅ Capacitor sync 完成"

if [ "$1" = "android" ]; then
  echo ""
  echo "🤖 Step 3: 建置 Android Debug APK ..."
  cd "$PROJECT_DIR/android"
  ./gradlew assembleDebug
  APK_PATH="$PROJECT_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
  echo "  ✅ Debug APK 建置完成："
  echo "     $APK_PATH"

elif [ "$1" = "release" ]; then
  echo ""
  echo "🚀 Step 3: 建置 Android Release APK ..."
  echo "  ⚠️  確保已設定 keystore (見 PUBLISH_GUIDE.md)"
  cd "$PROJECT_DIR/android"
  ./gradlew assembleRelease
  AAB_PATH="$PROJECT_DIR/android/app/build/outputs/bundle/release/app-release.aab"
  APK_PATH="$PROJECT_DIR/android/app/build/outputs/apk/release/app-release-unsigned.apk"
  echo "  ✅ Release 建置完成："
  echo "     AAB: $AAB_PATH"
  echo "     APK: $APK_PATH"

else
  echo ""
  echo "✅ 建置完成！下一步："
  echo "   bash build.sh android  → 建置 Debug APK 測試"
  echo "   bash build.sh release  → 建置 Release AAB 上架"
  echo "   npx cap open android   → 在 Android Studio 開啟"
fi
