#!/usr/bin/env python3
"""Fetch index, foreign-exchange and U.S. Treasury data for the market pages."""

import csv
import datetime as dt
import io
import json
import os
import time
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_FILE = os.path.join(BASE_DIR, "webapp", "market_data.json")
YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/{}?interval=1d&range={}"
TREASURY_CSV = "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/{year}/all?type=daily_treasury_yield_curve&field_tdr_date_value={year}&page&_format=csv"
TWSE_MARKET_STATISTICS = "https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?date={date}&response=json"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
US_MARKET_TIMEZONE = ZoneInfo("America/New_York")
US_CLOSE_SETTLE_TIME = dt.time(16, 15)

INDICES = [
    {"id": "twii", "name": "台灣加權指數", "region": "台灣", "symbol": "^TWII", "currency": "TWD"},
    {"id": "nikkei", "name": "日經 225", "region": "日本", "symbol": "^N225", "currency": "JPY"},
    {"id": "kospi", "name": "韓國綜合指數", "region": "韓國", "symbol": "^KS11", "currency": "KRW"},
    {"id": "dow", "name": "道瓊工業指數", "region": "美國", "symbol": "^DJI", "currency": "USD"},
    {"id": "nasdaq", "name": "Nasdaq 綜合指數", "region": "美國", "symbol": "^IXIC", "currency": "USD"},
    {"id": "nasdaq100", "name": "Nasdaq 100", "region": "美國", "symbol": "^NDX", "currency": "USD"},
    {"id": "sp500", "name": "S&P 500", "region": "美國", "symbol": "^GSPC", "currency": "USD"},
    {"id": "sox", "name": "費城半導體指數", "region": "美國", "symbol": "^SOX", "currency": "USD"},
    {"id": "russell2000", "name": "Russell 2000", "region": "美國", "symbol": "^RUT", "currency": "USD"},
    {"id": "vix", "name": "VIX 恐慌指數", "region": "美國・波動率", "symbol": "^VIX", "currency": "POINTS"},
    {"id": "oil", "name": "WTI 原油", "region": "商品", "symbol": "CL=F", "currency": "USD"},
    {"id": "brent", "name": "布蘭特原油", "region": "商品", "symbol": "BZ=F", "currency": "USD"},
]

DOLLAR_INDEX = {"id": "dxy", "name": "美元指數", "region": "匯市", "symbol": "DX-Y.NYB", "currency": "POINTS", "historyDays": 520}

CURRENCIES = [
    {"code": "USD", "name": "美元", "symbol": None, "mode": "identity"},
    {"code": "TWD", "name": "新台幣", "symbol": "TWD=X", "mode": "invert"},
    {"code": "JPY", "name": "日圓", "symbol": "JPY=X", "mode": "invert"},
    {"code": "EUR", "name": "歐元", "symbol": "EURUSD=X", "mode": "direct"},
    {"code": "GBP", "name": "英鎊", "symbol": "GBPUSD=X", "mode": "direct"},
    {"code": "CNY", "name": "人民幣", "symbol": "CNY=X", "mode": "invert"},
    {"code": "HKD", "name": "港幣", "symbol": "HKD=X", "mode": "invert"},
    {"code": "KRW", "name": "韓元", "symbol": "KRW=X", "mode": "invert"},
    {"code": "AUD", "name": "澳幣", "symbol": "AUDUSD=X", "mode": "direct"},
    {"code": "CAD", "name": "加幣", "symbol": "CAD=X", "mode": "invert"},
    {"code": "CHF", "name": "瑞士法郎", "symbol": "CHF=X", "mode": "invert"},
    {"code": "SGD", "name": "新加坡幣", "symbol": "SGD=X", "mode": "invert"},
]

TENORS = [
    ("1M", "1 個月", ("1 Mo", "1 Month")), ("1.5M", "1.5 個月", ("1.5 Month", "1.5 Mo")),
    ("2M", "2 個月", ("2 Mo", "2 Month")), ("3M", "3 個月", ("3 Mo", "3 Month")),
    ("4M", "4 個月", ("4 Mo", "4 Month")), ("6M", "6 個月", ("6 Mo", "6 Month")),
    ("1Y", "1 年", ("1 Yr", "1 Year")), ("2Y", "2 年", ("2 Yr", "2 Year")),
    ("3Y", "3 年", ("3 Yr", "3 Year")), ("5Y", "5 年", ("5 Yr", "5 Year")),
    ("7Y", "7 年", ("7 Yr", "7 Year")), ("10Y", "10 年", ("10 Yr", "10 Year")),
    ("20Y", "20 年", ("20 Yr", "20 Year")), ("30Y", "30 年", ("30 Yr", "30 Year")),
]


def number(value, digits=6):
    try:
        return round(float(value), digits)
    except (TypeError, ValueError):
        return None


def read_url(url, retries=3):
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json,text/csv,*/*"})
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read()
        except Exception:
            if attempt + 1 == retries:
                raise
            time.sleep(1.5 * (attempt + 1))


def fetch_yahoo(symbol, range_period="1y"):
    url = YAHOO_CHART.format(urllib.parse.quote(symbol, safe=".-^="), range_period)
    payload = json.loads(read_url(url))
    result = (payload.get("chart", {}).get("result") or [None])[0]
    if not result:
        raise RuntimeError("Yahoo Finance returned no chart result for {}".format(symbol))
    return result


def parse_yahoo_rows(result):
    timestamps = result.get("timestamp") or []
    quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
    offset = result.get("meta", {}).get("gmtoffset", 0) or 0
    timezone = dt.timezone(dt.timedelta(seconds=offset))
    rows = []
    for index, timestamp in enumerate(timestamps):
        def at(field, digits=6):
            values = quote.get(field) or []
            return number(values[index], digits) if index < len(values) else None

        close = at("close")
        if close is not None:
            rows.append({
                "date": dt.datetime.fromtimestamp(timestamp, timezone).strftime("%Y-%m-%d"),
                "open": at("open"), "high": at("high"), "low": at("low"), "close": close,
                "volume": at("volume", 0),
            })
    return rows


def completed_index_rows(config, rows, now=None):
    """Exclude a still-forming U.S. cash-index daily candle before 16:15 ET."""
    if not str(config.get("region", "")).startswith("美國") or not rows:
        return rows
    current = now or dt.datetime.now(dt.timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=dt.timezone.utc)
    market_now = current.astimezone(US_MARKET_TIMEZONE)
    if rows[-1]["date"] == market_now.date().isoformat() and market_now.time().replace(tzinfo=None) < US_CLOSE_SETTLE_TIME:
        return rows[:-1]
    return rows


def build_index(config, result, now=None):
    rows = parse_yahoo_rows(result)
    rows = completed_index_rows(config, rows, now)
    if not rows:
        raise RuntimeError("No index rows for {}".format(config["symbol"]))
    for row in rows:
        if row.get("volume") is not None and row["volume"] <= 0:
            row["volume"] = None
    latest, previous = rows[-1], rows[-2] if len(rows) > 1 else rows[-1]
    change = latest["close"] - previous["close"]
    volume = latest.get("volume")
    if volume is not None and volume <= 0:
        volume = None
    item = {
        **config, "source": "Yahoo Finance", "asOf": latest["date"], "latest": latest["close"],
        "change": round(change, 4), "changePct": round(change / previous["close"] * 100, 4) if previous["close"] else None,
        "volume": volume,
        "week52Low": min((row.get("low") if row.get("low") is not None else row["close"]) for row in rows[-260:]),
        "week52High": max((row.get("high") if row.get("high") is not None else row["close"]) for row in rows[-260:]),
        "decimals": 2, "rows": rows[-int(config.get("historyDays") or 260):],
    }
    if str(config.get("region", "")).startswith("美國"):
        item["quoteBasis"] = "regular_close"
        item["quoteLabel"] = "正常盤收盤"
    return item


def parse_twse_market_turnovers(payload):
    fields = payload.get("fields") or []
    if "日期" not in fields or "成交金額" not in fields:
        return {}
    date_index, turnover_index = fields.index("日期"), fields.index("成交金額")
    result = {}
    for row in payload.get("data") or []:
        if max(date_index, turnover_index) >= len(row):
            continue
        parts = str(row[date_index]).split("/")
        if len(parts) != 3 or not all(part.isdigit() for part in parts):
            continue
        date = "{:04d}-{:02d}-{:02d}".format(int(parts[0]) + 1911, int(parts[1]), int(parts[2]))
        value = str(row[turnover_index]).replace(",", "")
        if value.isdigit():
            result[date] = int(value)
    return result


def apply_twse_market_turnover(item, payload, previous=None):
    previous_official = {
        row.get("date"): row.get("turnover")
        for row in (previous or {}).get("rows", [])
        if row.get("turnoverOfficial") and row.get("date")
    }
    previous_official.update(parse_twse_market_turnovers(payload))
    for row in item.get("rows", []):
        prior_turnover = previous_official.get(row.get("date"))
        row["turnover"] = prior_turnover
        row.pop("volume", None)
        row.pop("volumeOfficial", None)
        row.pop("turnoverOfficial", None)
        if prior_turnover is not None:
            row["turnoverOfficial"] = True
    latest = item.get("rows", [])[-1]
    item.pop("volume", None)
    item.pop("volumeLabel", None)
    item["turnover"] = latest.get("turnover")
    item["turnoverLabel"] = "成交金額"
    item["source"] = "Yahoo Finance／臺灣證券交易所"
    return item


def backfill_twse_market_turnover(item, previous=None):
    previous_official = {
        row.get("date"): row.get("turnover")
        for row in (previous or {}).get("rows", [])
        if row.get("turnoverOfficial") and row.get("date") and row.get("turnover") is not None
    }
    months = sorted({row.get("date", "")[:7] for row in item.get("rows", []) if row.get("date")})
    for month in months:
        try:
            payload = json.loads(read_url(TWSE_MARKET_STATISTICS.format(date=month.replace("-", "") + "01")))
            previous_official.update(parse_twse_market_turnovers(payload))
        except Exception:
            continue

    for row in item.get("rows", []):
        row.pop("volume", None)
        row.pop("volumeOfficial", None)
        value = previous_official.get(row.get("date"))
        row["turnover"] = value
        if value is not None:
            row["turnoverOfficial"] = True
        else:
            row.pop("turnoverOfficial", None)
    latest = item.get("rows", [])[-1]
    item.pop("volume", None)
    item.pop("volumeLabel", None)
    item["turnover"] = latest.get("turnover")
    item["turnoverLabel"] = "成交金額"
    item["source"] = "Yahoo Finance／臺灣證券交易所"
    return item


def normalize_currency_rows(rows, mode):
    normalized = []
    for row in rows:
        close = number(row.get("close"))
        if close is None or close == 0:
            continue
        normalized.append({"date": row["date"], "usdPerUnit": round(1 / close if mode == "invert" else close, 8)})
    return normalized


def build_currency(config, result=None, today=None):
    if config["mode"] == "identity":
        date = today or dt.date.today().isoformat()
        rows = [{"date": date, "usdPerUnit": 1.0}]
    else:
        rows = normalize_currency_rows(parse_yahoo_rows(result), config["mode"])
    if not rows:
        raise RuntimeError("No currency rows for {}".format(config["code"]))
    return {"code": config["code"], "name": config["name"], "symbol": config["symbol"], "source": "Yahoo Finance" if config["symbol"] else "基準貨幣", "asOf": rows[-1]["date"], "usdPerUnit": rows[-1]["usdPerUnit"], "rows": rows[-260:]}


def parse_treasury_csv(content):
    reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig") if isinstance(content, bytes) else content))
    results = []
    for source_row in reader:
        raw_date = source_row.get("Date") or source_row.get("NEW_DATE")
        if not raw_date:
            continue
        parsed_date = None
        for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
            try:
                parsed_date = dt.datetime.strptime(raw_date.strip(), fmt).date().isoformat()
                break
            except ValueError:
                pass
        if not parsed_date:
            continue
        rates = {}
        for key, _, aliases in TENORS:
            value = next((source_row.get(alias) for alias in aliases if source_row.get(alias) not in (None, "")), None)
            parsed = number(value, 4)
            if parsed is not None:
                rates[key] = parsed
        if rates:
            results.append({"date": parsed_date, "rates": rates})
    return sorted(results, key=lambda row: row["date"])


def load_existing():
    try:
        with open(OUT_FILE, encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return {}


def by_key(rows, key):
    return {row.get(key): row for row in rows or []}


def main(backfill_twse_turnover=False):
    existing = load_existing()
    old_indices = by_key(existing.get("indices"), "id")
    old_currencies = by_key(existing.get("currencies"), "code")
    indices, currencies, failures = [], [], []
    for config in INDICES:
        try:
            item = build_index(config, fetch_yahoo(config["symbol"]))
            if config["id"] == "twii":
                previous = old_indices.get(config["id"])
                if backfill_twse_turnover:
                    item = backfill_twse_market_turnover(item, previous)
                else:
                    date_key = item["asOf"][:7].replace("-", "") + "01"
                    official = json.loads(read_url(TWSE_MARKET_STATISTICS.format(date=date_key)))
                    item = apply_twse_market_turnover(item, official, previous)
            indices.append(item)
            print("updated index {}".format(config["symbol"]))
        except Exception as error:
            if config["id"] in old_indices:
                indices.append(old_indices[config["id"]])
            failures.append("{}: {}".format(config["symbol"], error))
    for config in CURRENCIES:
        try:
            result = fetch_yahoo(config["symbol"]) if config["symbol"] else None
            currencies.append(build_currency(config, result))
            print("updated currency {}".format(config["code"]))
        except Exception as error:
            if config["code"] in old_currencies:
                currencies.append(old_currencies[config["code"]])
            failures.append("{}: {}".format(config["code"], error))
    try:
        dollar_index = build_index(DOLLAR_INDEX, fetch_yahoo(DOLLAR_INDEX["symbol"], "2y"))
        print("updated dollar index {}".format(DOLLAR_INDEX["symbol"]))
    except Exception as error:
        dollar_index = existing.get("dollarIndex")
        failures.append("{}: {}".format(DOLLAR_INDEX["symbol"], error))
    # 美元本身永遠是 1 USD；補齊其他匯率共同涵蓋的交易日，讓 USD 交叉匯率也有完整走勢。
    currency_dates = sorted({row["date"] for item in currencies if item["code"] != "USD" for row in item.get("rows", [])})[-260:]
    usd = next((item for item in currencies if item["code"] == "USD"), None)
    if usd and currency_dates:
        usd["rows"] = [{"date": date, "usdPerUnit": 1.0} for date in currency_dates]
        usd["asOf"] = currency_dates[-1]
    try:
        raw = read_url(TREASURY_CSV.format(year=dt.date.today().year))
        treasuries = parse_treasury_csv(raw)[-90:]
        if not treasuries:
            raise RuntimeError("Treasury CSV contained no yield curve rows")
        print("updated Treasury yield curve")
    except Exception as error:
        treasuries = existing.get("treasuries") or []
        failures.append("Treasury: {}".format(error))
    if not indices or len(currencies) < 2 or not treasuries or not dollar_index:
        raise SystemExit("macro market data is incomplete: {}".format("; ".join(failures)))
    payload = {
        "updatedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "indices": indices, "currencies": currencies,
        "dollarIndex": dollar_index,
        "treasuryTenors": [{"key": key, "label": label} for key, label, _ in TENORS if any(key in row["rates"] for row in treasuries)],
        "treasuries": treasuries,
        "sources": {"indices": "Yahoo Finance", "currencies": "Yahoo Finance", "dollarIndex": "Yahoo Finance", "treasuries": "U.S. Department of the Treasury"},
    }
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"
    with open(OUT_FILE, "w", encoding="utf-8") as handle:
        handle.write(encoded)
    print("wrote {} ({} indices, {} currencies, {} Treasury dates)".format(OUT_FILE, len(indices), len(currencies), len(treasuries)))
    if failures:
        print("warnings: {}".format("; ".join(failures)))


if __name__ == "__main__":
    main("--backfill-twse-turnover" in os.sys.argv[1:])
