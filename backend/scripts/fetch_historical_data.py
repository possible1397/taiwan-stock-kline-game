"""
台股歷史 K 線資料爬取腳本（使用 TWSE / TPEx 官方 API）
改寫自 yfinance 版本，改用台灣官方資料源，穩定不怕被封鎖。

使用方式：
    # 首次完整執行（抓近 N 年，預設 3 年）
    python scripts/fetch_historical_data.py

    # 只更新最近 2 個月（適合每週定期排程）
    python scripts/fetch_historical_data.py --update

    # 從第 N 支股票斷點續傳
    python scripts/fetch_historical_data.py --start-from 101

注意：
    - TWSE API 有流量限制，腳本已加入自動重試與間隔
    - 每支股票需要按月份分批抓取，耗時較長但穩定
"""
import os
import sys
import json
import time
import argparse
import logging
import re
from datetime import datetime, timedelta, date
from dateutil.relativedelta import relativedelta

import requests
from sqlalchemy.orm import Session
from sqlalchemy import text

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import SessionLocal, engine
from models import Base, StockInfo, StockDaily

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger(__name__)

STOCK_LIST_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "stock_list.json")
YEARS_BACK = 3                   # 抓取幾年的歷史資料（3年即可玩）
SLEEP_BETWEEN_STOCKS = 1.5       # 每支股票之間等待秒數
SLEEP_BETWEEN_MONTHS = 0.8       # 每月份之間等待秒數
MAX_RETRIES = 3                  # 單次請求最大重試次數
MIN_DATA_DAYS = 120              # 最少要有幾天的資料才算有效

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Referer": "https://www.twse.com.tw/",
}


def init_db():
    Base.metadata.create_all(bind=engine)
    log.info("DB tables ready")


def load_stock_list() -> list[dict]:
    if not os.path.exists(STOCK_LIST_FILE):
        log.error(f"Stock list not found: {STOCK_LIST_FILE}")
        log.error("Please run: python scripts/fetch_stock_list.py")
        sys.exit(1)
    with open(STOCK_LIST_FILE, "r", encoding="utf-8") as f:
        stocks = json.load(f)
    log.info(f"Loaded {len(stocks)} stocks")
    return stocks


def parse_tw_price(s: str) -> float:
    """解析台股價格字串（去除逗號、處理特殊符號）"""
    s = s.replace(",", "").strip()
    if s in ("--", "X", ""):
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_tw_date(s: str) -> date:
    """解析民國年日期 115/01/02 -> 2026-01-02"""
    parts = s.split("/")
    year = int(parts[0]) + 1911
    return date(year, int(parts[1]), int(parts[2]))


def fetch_twse_month(code: str, year: int, month: int) -> list[dict]:
    """從 TWSE 抓單月日K資料"""
    date_str = f"{year}{month:02d}01"
    url = "https://www.twse.com.tw/exchangeReport/STOCK_DAY"
    params = {"response": "json", "date": date_str, "stockNo": code}

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(url, params=params, headers=HEADERS, timeout=15)
            if resp.status_code != 200:
                time.sleep(3 * attempt)
                continue
            data = resp.json()
            if data.get("stat") != "OK" or not data.get("data"):
                return []

            rows = []
            for row in data["data"]:
                try:
                    d = parse_tw_date(row[0])
                    open_p = parse_tw_price(row[3])
                    high_p = parse_tw_price(row[4])
                    low_p  = parse_tw_price(row[5])
                    close_p = parse_tw_price(row[6])
                    vol = float(row[1].replace(",", "")) if row[1] else 0.0
                    if open_p <= 0 or close_p <= 0:
                        continue
                    rows.append({
                        "date": d, "open": open_p, "high": high_p,
                        "low": low_p, "close": close_p, "volume": vol
                    })
                except (ValueError, IndexError):
                    continue
            return rows

        except Exception as e:
            log.warning(f"    TWSE [{code}] {year}/{month:02d} attempt {attempt}: {e}")
            time.sleep(3 * attempt)
    return []


def fetch_tpex_month(code: str, year: int, month: int) -> list[dict]:
    """從 TPEx 抓單月日K資料"""
    tw_year = year - 1911
    date_str = f"{tw_year}/{month:02d}"
    url = "https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php"
    params = {"l": "zh-tw", "d": date_str, "stkno": code, "o": "json"}

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(url, params=params, headers=HEADERS, timeout=15)
            if resp.status_code != 200:
                time.sleep(3 * attempt)
                continue
            data = resp.json()
            raw_rows = data.get("aaData", [])
            if not raw_rows:
                return []

            rows = []
            for row in raw_rows:
                try:
                    d = parse_tw_date(row[0])
                    open_p  = parse_tw_price(row[4])
                    high_p  = parse_tw_price(row[5])
                    low_p   = parse_tw_price(row[6])
                    close_p = parse_tw_price(row[2])
                    vol = float(row[1].replace(",", "")) if row[1] else 0.0
                    if open_p <= 0 or close_p <= 0:
                        continue
                    rows.append({
                        "date": d, "open": open_p, "high": high_p,
                        "low": low_p, "close": close_p, "volume": vol
                    })
                except (ValueError, IndexError):
                    continue
            return rows

        except Exception as e:
            log.warning(f"    TPEx [{code}] {year}/{month:02d} attempt {attempt}: {e}")
            time.sleep(3 * attempt)
    return []


def upsert_stock_info(db: Session, stock: dict) -> StockInfo:
    obj = db.query(StockInfo).filter(StockInfo.code == stock["code"]).first()
    if obj is None:
        obj = StockInfo(
            code=stock["code"],
            name=stock["name"],
            market=stock["market"],
            is_active=True,
        )
        db.add(obj)
        db.flush()
    else:
        obj.name = stock["name"]
        obj.is_active = True
    return obj


def fetch_and_save_stock(db: Session, stock: dict, start_date: date, end_date: date) -> bool:
    code = stock["code"]
    market = stock["market"]

    # 產生需要抓取的月份列表
    months = []
    cur = date(start_date.year, start_date.month, 1)
    while cur <= end_date:
        months.append((cur.year, cur.month))
        cur += relativedelta(months=1)

    all_rows = []
    for year, month in months:
        if market == "TWSE":
            rows = fetch_twse_month(code, year, month)
        else:
            rows = fetch_tpex_month(code, year, month)
        all_rows.extend(rows)
        time.sleep(SLEEP_BETWEEN_MONTHS)

    if len(all_rows) < MIN_DATA_DAYS:
        log.debug(f"  [{code}] insufficient data ({len(all_rows)} days), skip")
        return False

    # 寫入 DB
    stock_obj = upsert_stock_info(db, stock)

    if not all_rows:
        log.debug(f"  [{code}] no data rows, skip")
        return False

    # 使用 INSERT OR IGNORE 避免 UNIQUE constraint 錯誤（相容 SQLite）
    inserted = 0
    for r in all_rows:
        try:
            db.execute(text(
                "INSERT OR IGNORE INTO stock_daily "
                "(stock_id, date, open, high, low, close, volume) "
                "VALUES (:sid, :date, :open, :high, :low, :close, :vol)"
            ), {
                "sid":   stock_obj.id,
                "date":  r["date"].isoformat(),
                "open":  r["open"],
                "high":  r["high"],
                "low":   r["low"],
                "close": r["close"],
                "vol":   r["volume"],
            })
            inserted += 1
        except Exception as e:
            log.warning(f"    [{code}] row {r['date']} error: {e}")
    db.commit()

    log.info(f"  [OK] [{code}] {stock['name']} -- {inserted} rows inserted ({len(all_rows)} total from API)")
    return inserted >= MIN_DATA_DAYS or db.query(StockDaily).filter(StockDaily.stock_id == stock_obj.id).count() >= MIN_DATA_DAYS


def main():
    parser = argparse.ArgumentParser(description="Taiwan Stock Historical K-Line Fetcher")
    parser.add_argument("--update", action="store_true",
                        help="Only update recent 2 months (for weekly cron)")
    parser.add_argument("--start-from", type=int, default=0,
                        help="Resume from stock index N")
    parser.add_argument("--years", type=int, default=YEARS_BACK,
                        help=f"Years of history to fetch (default: {YEARS_BACK})")
    args = parser.parse_args()

    today = date.today()
    if args.update:
        start_date = today - relativedelta(months=2)
        log.info(f"Update mode: {start_date} to {today}")
    else:
        start_date = date(today.year - args.years, today.month, 1)
        log.info(f"Full mode: {start_date} to {today} ({args.years} years)")

    init_db()

    stocks = load_stock_list()
    if args.start_from > 0:
        stocks = stocks[args.start_from:]
        log.info(f"Resuming from index {args.start_from}, {len(stocks)} remaining")

    total = len(stocks)
    success = 0
    failed = 0

    db = SessionLocal()
    try:
        for i, stock in enumerate(stocks):
            log.info(f"[{i + 1 + args.start_from}/{total + args.start_from}] {stock['code']} {stock['name']}")
            ok = fetch_and_save_stock(db, stock, start_date, today)
            if ok:
                success += 1
            else:
                failed += 1
            time.sleep(SLEEP_BETWEEN_STOCKS)
    finally:
        db.close()

    log.info(f"Done! Success: {success}, Failed/Skipped: {failed}")


if __name__ == "__main__":
    main()
