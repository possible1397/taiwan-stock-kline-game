"""
台股個股清單爬取腳本
從 TWSE（上市）與 TPEx（上櫃）官網取得所有個股清單，排除 ETF 及特殊商品。

使用方式：
    python scripts/fetch_stock_list.py

輸出：
    backend/data/stock_list.json
"""
import json
import os
import time
import requests
import pandas as pd

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "stock_list.json")

# 排除關鍵字（ETF、特別股、存託憑證等）
EXCLUDE_KEYWORDS = [
    "ETF", "基金", "REITs", "存託", "特別股", "受益憑證",
    "債券", "期貨", "指數", "黃金", "石油"
]

# 排除的股票代號前綴（通常是 ETF 或特殊商品）
EXCLUDE_CODE_PREFIXES = ["00"]  # 00 開頭幾乎都是 ETF


def is_excluded(code: str, name: str) -> bool:
    """判斷是否應排除此股票"""
    # 排除 00 開頭（ETF）
    if any(code.startswith(p) for p in EXCLUDE_CODE_PREFIXES):
        return True
    # 排除名稱含特定關鍵字
    if any(kw in name for kw in EXCLUDE_KEYWORDS):
        return True
    # 代號超過 5 碼通常是認購權證等衍生品
    if len(code) > 5:
        return True
    return False


def fetch_twse_stocks() -> list[dict]:
    """取得 TWSE 上市個股清單"""
    print("📡 正在抓取 TWSE 上市股票清單...")
    url = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"

    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        raw = resp.json()
    except Exception as e:
        print(f"  ⚠️  TWSE API 失敗，改用備用方式: {e}")
        return fetch_twse_stocks_backup()

    stocks = []
    for item in raw:
        code = item.get("Code", "").strip()
        name = item.get("Name", "").strip()
        if not code or not name:
            continue
        if is_excluded(code, name):
            continue
        stocks.append({
            "code": code,
            "name": name,
            "market": "TWSE",
            "yahoo_symbol": f"{code}.TW"
        })

    print(f"  ✅ TWSE 取得 {len(stocks)} 支個股")
    return stocks


def fetch_twse_stocks_backup() -> list[dict]:
    """TWSE 備用方式：抓取上市公司列表"""
    url = "https://isin.twse.com.tw/isin/C_public.jsp?strMode=2"
    try:
        resp = requests.get(url, timeout=15)
        resp.encoding = "big5"
        tables = pd.read_html(resp.text)
        df = tables[0]
        df.columns = df.iloc[0]
        df = df.iloc[1:]

        stocks = []
        for _, row in df.iterrows():
            cell = str(row.iloc[0]).strip()
            if len(cell) < 5 or "　" not in cell:
                continue
            parts = cell.split("　")
            if len(parts) < 2:
                continue
            code = parts[0].strip()
            name = parts[1].strip()
            if not code.isdigit() or is_excluded(code, name):
                continue
            stocks.append({
                "code": code,
                "name": name,
                "market": "TWSE",
                "yahoo_symbol": f"{code}.TW"
            })
        return stocks
    except Exception as e:
        print(f"  ❌ TWSE 備用方式也失敗: {e}")
        return []


def fetch_tpex_stocks() -> list[dict]:
    """取得 TPEx 上櫃個股清單"""
    print("📡 正在抓取 TPEx 上櫃股票清單...")
    url = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes"

    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        raw = resp.json()
    except Exception as e:
        print(f"  ⚠️  TPEx API 失敗: {e}")
        return []

    stocks = []
    for item in raw:
        code = str(item.get("SecuritiesCompanyCode", "")).strip()
        name = item.get("CompanyName", "").strip()
        if not code or not name:
            continue
        if is_excluded(code, name):
            continue
        stocks.append({
            "code": code,
            "name": name,
            "market": "TPEx",
            "yahoo_symbol": f"{code}.TWO"
        })

    print(f"  ✅ TPEx 取得 {len(stocks)} 支個股")
    return stocks


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    twse = fetch_twse_stocks()
    time.sleep(1)
    tpex = fetch_tpex_stocks()

    all_stocks = twse + tpex

    # 去重（以代號為主鍵）
    seen = set()
    unique_stocks = []
    for s in all_stocks:
        if s["code"] not in seen:
            seen.add(s["code"])
            unique_stocks.append(s)

    unique_stocks.sort(key=lambda x: x["code"])

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(unique_stocks, f, ensure_ascii=False, indent=2)

    print(f"\n🎉 完成！共整理出 {len(unique_stocks)} 支台股個股")
    print(f"   TWSE 上市: {len(twse)} 支")
    print(f"   TPEx 上櫃: {len(tpex)} 支")
    print(f"   已儲存至: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
