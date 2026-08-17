#!/usr/bin/env python3
"""Build per-symbol two-year OHLCV files for the interactive K-line chart."""

import argparse
import concurrent.futures
import datetime
import glob
import json
import os
import time
import urllib.parse
import urllib.request


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
WEBAPP_DIR = os.path.join(BASE_DIR, "webapp")
OUT_DIR = os.path.join(WEBAPP_DIR, "price-history")
ASSET_FILE = os.path.join(WEBAPP_DIR, "trade_assets.json")
YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/{}?interval=1d&range={}"
YAHOO_SUFFIX = {"US": "", "JP": ".T", "KS": ".KS", "HK": ".HK"}
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"


def number(value):
    if not isinstance(value, (int, float)):
        return None
    return round(float(value), 4)


def load_exchange_map():
    try:
        with open(ASSET_FILE, encoding="utf-8") as handle:
            assets = json.load(handle).get("assets", [])
    except (OSError, ValueError):
        return {}
    return {
        str(item.get("symbol", "")).upper(): str(item.get("exchange", "")).upper()
        for item in assets
        if item.get("market") == "tw" and item.get("symbol")
    }


def collect_symbols():
    symbols = {}
    for path in glob.glob(os.path.join(DATA_DIR, "*.json")):
        name = os.path.basename(path)
        if name.endswith("_dividends.json") or name == "tracked.json" or name == "etf_names.json":
            continue
        try:
            with open(path, encoding="utf-8") as handle:
                snapshot = json.load(handle)
        except (OSError, ValueError):
            continue
        etf_code = name.split("_", 1)[0].upper()
        symbols[("TW", etf_code)] = {"market": "TW", "symbol": etf_code, "expected": snapshot.get("date")}
        for holding in snapshot.get("holdings", []):
            code = str(holding.get("code") or "").strip().upper()
            market = str(holding.get("market") or "TW").strip().upper()
            if not code or holding.get("assetType", "stock") != "stock":
                continue
            key = (market, code)
            expected = holding.get("quoteDate") or snapshot.get("date")
            current = symbols.get(key)
            if current is None or str(expected or "") > str(current.get("expected") or ""):
                symbols[key] = {"market": market, "symbol": code, "expected": expected}
    return sorted(symbols.values(), key=lambda item: (item["market"], item["symbol"]))


def yahoo_symbol(item, exchanges):
    market, symbol = item["market"], item["symbol"]
    if market == "TW":
        return symbol + (".TWO" if exchanges.get(symbol) in {"TPEX", "OTC"} else ".TW")
    suffix = YAHOO_SUFFIX.get(market)
    return symbol + suffix if suffix is not None else None


def output_path(item):
    return os.path.join(OUT_DIR, item["market"], item["symbol"] + ".json")


def load_existing(item):
    try:
        with open(output_path(item), encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return None


def fetch_chart(symbol, period, retries=3):
    url = YAHOO_CHART.format(urllib.parse.quote(symbol, safe=".-^="), period)
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=25) as response:
                payload = json.load(response)
            result = (payload.get("chart", {}).get("result") or [None])[0]
            if result:
                return result
        except Exception:
            if attempt + 1 == retries:
                raise
            time.sleep(1.5 * (attempt + 1))
    return None


def parse_rows(result):
    timestamps = result.get("timestamp") or []
    quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
    timezone = datetime.timezone(datetime.timedelta(seconds=result.get("meta", {}).get("gmtoffset", 0) or 0))
    rows = []
    for index, timestamp in enumerate(timestamps):
        close = number((quote.get("close") or [None] * len(timestamps))[index])
        if close is None:
            continue
        def at(name):
            values = quote.get(name) or []
            return number(values[index]) if index < len(values) else None
        rows.append({
            "date": datetime.datetime.fromtimestamp(timestamp, timezone).strftime("%Y-%m-%d"),
            "open": at("open"), "high": at("high"), "low": at("low"), "close": close,
            "volume": (quote.get("volume") or [None] * len(timestamps))[index],
        })
    return rows


def update_symbol(item, exchanges, full=False):
    existing = load_existing(item)
    existing_rows = existing.get("rows", []) if existing else []
    latest = existing_rows[-1]["date"] if existing_rows else ""
    expected = str(item.get("expected") or "")
    if not full and existing_rows and expected and latest >= expected:
        return "skip", item, len(existing_rows)
    symbol = yahoo_symbol(item, exchanges)
    if not symbol:
        return "unsupported", item, 0
    result = fetch_chart(symbol, "2y" if full or not existing_rows else "1mo")
    fetched_rows = parse_rows(result)
    merged = {row["date"]: row for row in existing_rows}
    merged.update({row["date"]: row for row in fetched_rows})
    rows = [merged[key] for key in sorted(merged)][-520:]
    if not rows:
        return "empty", item, 0
    payload = {
        "market": item["market"], "symbol": item["symbol"], "yahooSymbol": symbol,
        "currency": result.get("meta", {}).get("currency"), "source": "Yahoo Finance",
        "updatedAt": rows[-1]["date"], "rows": rows,
    }
    path = output_path(item)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"
    previous = ""
    try:
        with open(path, encoding="utf-8") as handle:
            previous = handle.read()
    except OSError:
        pass
    if encoded != previous:
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(encoded)
        return "updated", item, len(rows)
    return "unchanged", item, len(rows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--full", action="store_true", help="force a two-year refresh for every symbol")
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("symbols", nargs="*", help="optional symbol filter")
    args = parser.parse_args()
    wanted = {value.upper() for value in args.symbols}
    items = [item for item in collect_symbols() if not wanted or item["symbol"] in wanted]
    exchanges = load_exchange_map()
    counts = {}
    failures = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = {executor.submit(update_symbol, item, exchanges, args.full): item for item in items}
        for future in concurrent.futures.as_completed(futures):
            item = futures[future]
            try:
                state, _, row_count = future.result()
                counts[state] = counts.get(state, 0) + 1
                if state in {"updated", "empty", "unsupported"}:
                    print("{} {}/{} {} rows".format(state, item["market"], item["symbol"], row_count))
            except Exception as error:
                failures.append((item, str(error)))
                print("failed {}/{}: {}".format(item["market"], item["symbol"], error))
    print("price history: {} symbols; {}".format(len(items), ", ".join("{}={}".format(k, v) for k, v in sorted(counts.items()))))
    if failures and len(failures) == len(items):
        raise SystemExit("all price history requests failed")


if __name__ == "__main__":
    main()
