# 台股 K 線修練場

> 用真實台股歷史 K 線做「猜漲跌」訓練的跨平台 App。前端為 PWA，透過 Capacitor 打包成 Android 原生應用，後端為 FastAPI + PostgreSQL。

隨機抽取一段真實歷史 K 線（隱藏個股名稱與日期），玩家判斷接下來的走勢方向，系統依結果結算虛擬資金並累積經驗值。目的是在不看新聞、不知道是哪支股票的條件下，單純訓練技術面的型態判讀。

## 功能

- **盲測 K 線**：隨機抽取 1,700+ 支台股、近 10 年的任意區間，隱藏股名與日期
- **多種時間尺度**：可選擇不同的預測期間（horizon），對應不同的交易風格
- **台股模式**：套用台股漲跌幅限制與交易日規則
- **虛擬資金結算**：依預測正確與否調整資金，記錄勝率、連勝、最大連勝
- **成就與指標解鎖**：隨關卡進度解鎖技術指標，避免新手一開始被過多資訊淹沒
- **每日挑戰**：每天固定題目，可比較成績
- **帳號系統**：JWT 驗證，進度雲端同步

## 技術架構

```
┌─────────────────────────────┐
│  PWA 前端 (Vanilla JS)      │  ← 可直接瀏覽器開啟，支援離線
│  Lightweight Charts 繪圖    │
└──────────────┬──────────────┘
               │  Capacitor 8
┌──────────────▼──────────────┐
│  Android 原生封裝            │  ← gradlew assembleRelease 出 APK/AAB
└──────────────┬──────────────┘
               │  REST / JWT
┌──────────────▼──────────────┐
│  FastAPI 後端                │
│  ├ routers/auth.py  帳號     │
│  ├ routers/game.py  賽局邏輯 │
│  └ game_logic.py    結算     │
└──────────────┬──────────────┘
               │  SQLAlchemy
┌──────────────▼──────────────┐
│  PostgreSQL                  │
│  stock_daily / users /       │
│  game_sessions / achievements│
└─────────────────────────────┘
```

| 層 | 技術 |
| --- | --- |
| 前端 | Vanilla JS、PWA（Service Worker + manifest）、Lightweight Charts |
| 行動端 | Capacitor 8（Android） |
| 後端 | FastAPI、SQLAlchemy、python-dotenv |
| 資料庫 | PostgreSQL（本機開發可用 SQLite） |
| 部署 | Dockerfile（後端） |

## 快速開始

詳細步驟見 [`SETUP_GUIDE.md`](SETUP_GUIDE.md)，以下為摘要。

### 1. 後端

```bash
cd backend
cp .env.example .env          # 填入你的 PostgreSQL 連線資訊
pip install -r requirements.txt
```

### 2. 抓取股票資料

```bash
python scripts/fetch_stock_list.py        # 產生台股個股清單
python scripts/fetch_historical_data.py   # 抓 10 年歷史 K 線（首次需數小時）
```

中斷後可續跑：

```bash
python scripts/fetch_historical_data.py --start-from 500
```

### 3. 啟動

```bash
npm run start:backend     # FastAPI，API 文件在 /api/docs
npm run start:frontend    # 前端靜態伺服器
```

### 4. 打包 Android

```bash
npm run cap:sync
npm run cap:build:android     # 產出 release APK
```

## 專案結構

```
├── index.html, js/, css/      PWA 前端
├── libs/                      第三方繪圖函式庫
├── backend/
│   ├── main.py                FastAPI 進入點
│   ├── models.py              SQLAlchemy 資料模型
│   ├── game_logic.py          抽樣與結算邏輯
│   ├── routers/               auth / game API
│   └── scripts/               資料抓取腳本
├── android/                   Capacitor 專案
└── SETUP_GUIDE.md             完整安裝說明
```

## 設計上的幾個決定

**為什麼隱藏股名與日期？** 一旦知道是哪支股票、哪一年，就會用後見之明判斷（「這是 2020 年 3 月，接下來會崩」）。盲測才能逼出真正的型態判讀能力。

**為什麼要分期間（horizon）？** 同一段 K 線在不同時間尺度下的「正確答案」可能相反。讓使用者明確選定預測期間，才能形成可檢討的訓練回饋。

**為什麼逐步解鎖技術指標？** 一次給 20 個指標的結果是每個都不會用。依進度解鎖，讓使用者有機會逐項建立對單一指標的手感。

## 授權

MIT
