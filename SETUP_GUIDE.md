# 台股K線修練場 — 後端啟動指南

## 第一步：安裝 Python 環境

確認電腦有安裝 Python 3.10+：
```
python --version
```

## 第二步：安裝 PostgreSQL（本機測試用）

前往 https://www.postgresql.org/download/ 下載安裝。
安裝時記住你設定的密碼（預設帳號是 postgres）。

安裝完成後，建立資料庫：
```sql
-- 用 pgAdmin 或 psql 執行
CREATE DATABASE taiwan_stock_game;
```

## 第三步：設定環境變數

```bash
cd backend
copy .env.example .env
```

用記事本打開 `.env`，把 `yourpassword` 改成你的 PostgreSQL 密碼。

## 第四步：安裝 Python 套件

```bash
cd backend
pip install -r requirements.txt
```

## 第五步：抓取台股股票清單

```bash
cd backend
python scripts/fetch_stock_list.py
```

這會在 `backend/data/stock_list.json` 產生所有台股個股清單。

## 第六步：抓取歷史 K 線資料（重要！時間較長）

```bash
python scripts/fetch_historical_data.py
```

⚠️ 首次執行需要數小時（1,700+ 支股票 × 10 年資料）。
可以先讓它跑著，明天再來繼續後面的步驟。

如果中斷了，可以從某支股票繼續：
```bash
python scripts/fetch_historical_data.py --start-from 500
```

## 第七步：啟動後端伺服器

```bash
cd backend
python main.py
```

看到以下訊息表示成功：
```
✅ 資料庫資料表已就緒
INFO:     Started server process
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

## 第八步：啟動前端

```bash
cd ..   # 回到專案根目錄
python start_server.py
```

或直接用瀏覽器打開 `index.html`（需要後端跑在 localhost:8000）。

---

## 部署到 Railway（上線）

1. 前往 https://railway.app 註冊帳號（免費）
2. 新增專案 → 從 GitHub 部署（先把專案推上 GitHub）
3. 新增 PostgreSQL 服務（Railway 內建）
4. 設定環境變數：
   - `DATABASE_URL`：Railway 自動提供
   - `SECRET_KEY`：自己設一個隨機字串
5. 部署完成後，把前端 `js/api.js` 第一行的網址改成 Railway 給你的網址

---

## API 文件

後端啟動後，可以在瀏覽器打開：
- http://localhost:8000/api/docs （Swagger UI）
- http://localhost:8000/api/redoc （ReDoc）
