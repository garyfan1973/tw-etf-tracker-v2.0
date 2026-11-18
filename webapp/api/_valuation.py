"""Point-in-time Taiwan valuation history, paired with unadjusted official closes."""
from concurrent.futures import ThreadPoolExecutor, as_completed
import datetime as dt
import json
import math
from pathlib import Path
import re
import urllib.error
import urllib.request

WEB = Path(__file__).resolve().parents[1]
HISTORY_DIR = WEB / "price-history" / "valuation"
TAIPEI = dt.timezone(dt.timedelta(hours=8))
FETCH_DEADLINE_SECONDS = 75
SOURCES = {
    "TWSE": {"name": "臺灣證券交易所", "url": "https://www.twse.com.tw/zh/trading/historical/bwibbu.html"},
    "TPEX": {"name": "證券櫃檯買賣中心", "url": "https://www.tpex.org.tw/zh-tw/mainboard/trading/info/stock-pe.html"},
}


def positive(value):
    try:
        number = float(str(value).replace(",", "").strip())
        return number if math.isfinite(number) and number > 0 else None
    except (ValueError, TypeError):
        return None


def iso_date(value):
    parts = re.findall(r"\d+", str(value))
    if len(parts) != 3:
        return None
    year, month, day = map(int, parts)
    try:
        return dt.date(year + 1911 if year < 1911 else year, month, day).isoformat()
    except ValueError:
        return None


def fetch_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; InvestmentResearch/1.0)"})
    try:
        with urllib.request.urlopen(request, timeout=7) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # TWSE publishes both routes; one occasionally returns a redirect loop
        # or unavailable CDN response. Only retry the equivalent official route.
        if error.code not in {403, 308} or "/rwd/zh/afterTrading/" not in url:
            raise
        base, query = url.replace("/rwd/zh/afterTrading/", "/exchangeReport/").split("?", 1)
        fallback = base + "?response=json&" + query.replace("&response=json", "")
        request = urllib.request.Request(fallback, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=7) as response:
            return json.load(response)


def parse_table(payload, required):
    """Match named fields rather than depending on TWSE/TPEx column positions."""
    tables = payload.get("tables", [payload])
    for table in tables:
        fields = [re.sub(r"\s+", "", str(field)) for field in table.get("fields", [])]
        if not all(field in fields for field in required):
            continue
        indexes = {field: fields.index(field) for field in fields}
        result = {}
        for values in table.get("data", []):
            row = {field: values[index] for field, index in indexes.items() if index < len(values)}
            date = iso_date(row.get("日期"))
            if date:
                result[date] = row
        return result
    stat = str(payload.get("stat", "")).lower()
    if stat == "ok":
        raise ValueError("官方資料欄位格式已變更")
    if "沒有" in stat or "查無" in stat or "no data" in stat:
        return {}
    raise ValueError("官方資料暫時無法讀取")


def month_rows(code, exchange, month):
    if exchange == "TWSE":
        query = f"date={month.replace('-', '')}01&stockNo={code}&response=json"
        valuation = fetch_json("https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU?" + query)
        prices = fetch_json("https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?" + query)
        close_field = "收盤價"
    else:
        query = f"date={month.replace('-', '/')}/01&code={code}&response=json"
        valuation = fetch_json("https://www.tpex.org.tw/www/zh-tw/afterTrading/peQryStock?" + query)
        prices = fetch_json("https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?" + query)
        close_field = "收盤"
    ratios = parse_table(valuation, ("日期", "本益比", "股價淨值比"))
    closes = parse_table(prices, ("日期", close_field))
    rows = []
    for date, price in sorted(closes.items()):
        if not date.startswith(month):
            continue
        close = positive(price.get(close_field))
        if close is None:
            continue
        ratio = ratios.get(date, {})
        pe, pb = positive(ratio.get("本益比")), positive(ratio.get("股價淨值比"))
        rows.append({"date": date, "close": close, "pe": pe, "pb": pb,
                     "eps": round(close / pe, 6) if pe else None,
                     "bookValue": round(close / pb, 6) if pb else None,
                     "reportPeriod": str(ratio.get("財報年/季") or "")})
    return rows


def read_saved(code):
    try:
        return json.loads((HISTORY_DIR / f"{code}.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def exchange_for(code):
    try:
        assets = json.loads((WEB / "trade_assets.json").read_text(encoding="utf-8")).get("assets", [])
    except (OSError, ValueError):
        assets = []
    for asset in assets:
        if asset.get("market") == "tw" and asset.get("symbol") == code:
            if asset.get("asset_type") != "stock":
                raise ValueError("ETF 不適用個股估值河流圖")
            exchange = str(asset.get("exchange", "")).upper()
            if exchange not in {"TWSE", "TPEX", "OTC"}:
                raise ValueError("目前僅支援台灣上市、上櫃普通股")
            return "TPEX" if exchange in {"TPEX", "OTC"} else "TWSE"
    raise ValueError("目前僅支援台灣上市、上櫃普通股")


def requested_months(today):
    start = dt.date(today.year - 5, today.month, 1)
    months = []
    while start <= today:
        months.append(start.strftime("%Y-%m"))
        start = dt.date(start.year + (start.month == 12), start.month % 12 + 1, 1)
    return months


def build_history(code, saved=None, today=None):
    if not re.fullmatch(r"[1-9]\d{3}", code):
        raise ValueError("目前僅支援台灣上市、上櫃普通股")
    today = today or dt.datetime.now(TAIPEI).date()
    exchange = exchange_for(code)
    saved = saved if saved is not None else read_saved(code)
    months = requested_months(today)
    completed = set(saved.get("completedMonths", [])) & set(months)
    by_date = {row["date"]: row for row in saved.get("rows", [])
               if row.get("date", "")[:7] in months and row["date"] <= today.isoformat()}
    # Refresh both recent months; retry every failed historical month next time.
    pending = [month for month in months if month not in completed or month in months[-2:]]
    failed = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(month_rows, code, exchange, month): month for month in pending}
        remaining = dict(futures)
        try:
            for future in as_completed(futures, timeout=FETCH_DEADLINE_SECONDS):
                month = remaining.pop(future)
                try:
                    rows = future.result()
                except Exception:
                    failed.append(month)
                    continue
                by_date = {date: row for date, row in by_date.items() if not date.startswith(month)}
                by_date.update({row["date"]: row for row in rows if row["date"] <= today.isoformat()})
                completed.add(month)
        except TimeoutError:
            # Return a marked partial result before the function's 120s limit.
            # Running requests have their own 7s timeout; queued work is cancelled.
            failed.extend(remaining.values())
            for future in remaining:
                future.cancel()
    if not by_date:
        raise RuntimeError("目前無法取得可用的官方歷史估值與收盤價，請稍後重試")
    rows = [by_date[date] for date in sorted(by_date)]
    previous = None
    for row in rows:
        row["gapBefore"] = bool(previous and (dt.date.fromisoformat(row["date"]) - previous).days > 14)
        previous = dt.date.fromisoformat(row["date"])
    return {"ok": True, "schemaVersion": 1, "symbol": code, "market": "TW", "exchange": exchange,
            "currency": "TWD", "asOf": rows[-1]["date"], "requestedFrom": months[0] + "-01",
            "checkedAt": today.isoformat(), "source": SOURCES[exchange],
            "completedMonths": sorted(completed - set(failed)), "failedMonths": sorted(failed), "rows": rows}
