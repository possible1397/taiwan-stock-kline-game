# 📱 台股K線修練場 — App 上架完整指南

## 目前完成狀態

| 項目 | 狀態 |
|------|------|
| 遊戲功能（音效、動畫、手勢、教學等） | ✅ 完成 |
| PWA manifest + Service Worker | ✅ 完成 |
| Capacitor Android 專案 | ✅ 完成 |
| 後端 API（FastAPI + SQLite） | ✅ 完成（本機可用） |
| 股票資料（130支、95,150筆行情） | ✅ 已有 |
| 後端部署到 Railway | ⏳ 需執行 |
| Android APK 建置 | ⏳ 需 Android Studio |
| Google Play 上架 | ⏳ 需開發者帳號 |
| iOS App Store 上架 | ⏳ 需 Mac + Apple 帳號 |

---

## 🔵 Step 1：部署後端到 Railway（必要）

App 需要一個公開的 API 網址。

```bash
# 1. 安裝 Railway CLI
npm install -g @railway/cli

# 2. 登入
railway login

# 3. 進入專案目錄，連結到 Railway
cd D:\Project\taiwan-stock-kline-game
railway link

# 4. 部署（使用已有的 railway.toml + Dockerfile）
railway up

# 5. 取得部署網址（格式如 https://xxxxx.up.railway.app）
railway open
```

**部署完成後**，把 `js/api.js` 第一行的 URL 改成你的實際 Railway 網址：
```javascript
const RAILWAY_URL = "https://你的實際網址.up.railway.app";
```

然後重新執行 `bash build.sh` 同步前端。

---

## 🤖 Step 2：Android App 打包上架

### 2a. 安裝必要工具

1. 下載安裝 [Android Studio](https://developer.android.com/studio)
2. 在 Android Studio 中安裝 Android SDK (API 33+)

### 2b. 建置 Debug APK（先測試）

```bash
# 在專案根目錄執行
bash build.sh android
```

或手動：
```bash
cd android
./gradlew assembleDebug
# APK 位置：android/app/build/outputs/apk/debug/app-debug.apk
```

**用 USB 安裝到手機測試：**
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

### 2c. 建立 Release Keystore（簽名）

```bash
keytool -genkey -v -keystore release.keystore \
  -alias klinetrainer \
  -keyalg RSA -keysize 2048 \
  -validity 10000
```

⚠️ **重要：保存好 keystore 檔案和密碼，遺失後無法更新 App！**

### 2d. 設定 Gradle 簽名

編輯 `android/app/build.gradle`，在 `android { ... }` 內加入：
```groovy
signingConfigs {
    release {
        storeFile file("../../release.keystore")
        storePassword "你的keystore密碼"
        keyAlias "klinetrainer"
        keyPassword "你的key密碼"
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
    }
}
```

### 2e. 建置 Release AAB（上架用）

```bash
bash build.sh release
# AAB 位置：android/app/build/outputs/bundle/release/app-release.aab
```

### 2f. 上架 Google Play

1. 前往 [Google Play Console](https://play.google.com/console)
2. 支付 **$25 美金**開發者帳號費（一次性）
3. 建立新應用程式
4. 上傳 `app-release.aab`
5. 填寫應用程式資訊：
   - **應用程式名稱**：台股K線修練場
   - **簡短說明**：透過真實台股歷史K線，訓練你的技術分析直覺！
   - **完整說明**：猜漲跌、賺虛擬資金、升級稱號，從股市嫩鳥晉升東方股神！
   - **類別**：教育 / 金融
   - **評級**：所有年齡層
6. 上傳截圖（至少 2 張手機截圖）
7. 提交審核（通常 1-3 個工作天）

---

## 🍎 Step 3：iOS App Store 上架（需要 Mac）

### 需求

- macOS 電腦（必要，Windows 無法建置 iOS）
- [Xcode](https://developer.apple.com/xcode/) 15+
- [Apple Developer Program](https://developer.apple.com/programs/)（**$99 美金/年**）

### 步驟

```bash
# 在 Mac 上執行
npm install @capacitor/ios --save
npx cap add ios
bash build.sh          # 同步前端
npx cap open ios       # 在 Xcode 開啟
```

在 Xcode 中：
1. 設定 Bundle ID：`com.klinetrainer.taiwan`
2. 設定 Team（Apple Developer 帳號）
3. Product → Archive → Distribute App → App Store Connect

---

## 🌐 Step 4：PWA 快速上架 Android（不需 Android Studio）

如果暫時不想安裝 Android Studio，可以用 **PWA Builder** 快速打包：

1. 先部署到 Railway（Step 1）
2. 前往 [pwabuilder.com](https://www.pwabuilder.com/)
3. 輸入你的 Railway 網址
4. 點擊 "Package For Stores" → Android
5. 下載 APK/AAB，上傳到 Google Play

---

## 📊 App Store 素材準備清單

- [ ] App 圖示：512×512 PNG（已有 `icons/icon-512.png`）
- [ ] 截圖：手機截圖 4-8 張（1080×1920 或 1242×2208）
- [ ] 特色圖片：1024×500 PNG（Google Play 封面）
- [ ] 隱私政策 URL（Google Play 要求）
- [ ] 簡短說明：最多 80 字
- [ ] 完整說明：最多 4000 字

---

## 🔄 每次更新 App 流程

```bash
# 1. 修改前端代碼
# 2. 同步到 www/ 和 Capacitor
bash build.sh

# 3. 建置新版本
bash build.sh release

# 4. 到 Google Play Console 上傳新 AAB
#    版本號記得更新：android/app/build.gradle → versionCode
```

---

## 📞 技術支援資源

- [Capacitor 文件](https://capacitorjs.com/docs)
- [Google Play Console 說明](https://support.google.com/googleplay/android-developer)
- [PWA Builder](https://www.pwabuilder.com/)
- [Railway 部署文件](https://docs.railway.app/)
