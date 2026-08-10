#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一次性抓取短線日誌可選標的清單（台／美 ETF 與股票）。

這是手動工具，不加入 GitHub Actions 排程。輸出給 journal.html 使用的
webapp/trade_assets.json；前端仍保留自由輸入，不會限制在清單內。

來源：
  - TWSE OpenAPI：上市公司與上市 ETF 基本資料
  - TPEx OpenAPI：上櫃市場證券行情（以現有 ETF 清單排除 ETF 後作為股票清單）
  - Nasdaq Trader：Nasdaq listed 與其他美國交易所掛牌清單
"""

import datetime
import json
import os
import re
import ssl
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE_DIR, "webapp", "trade_assets.json")
USER_AGENT = "Mozilla/5.0 (ETF Tracker; +https://github.com/garyfan1973/tw-etf-tracker-v2.0)"
TWSE_STOCKS = "https://openapi.twse.com.tw/v1/opendata/t187ap03_L"
TWSE_ETFS = "https://openapi.twse.com.tw/v1/opendata/t187ap47_L"
TPEX_QUOTES = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes"
NASDAQ_LISTED = "https://www.nasdaqtrader.com/dynamic/symdir/nasdaqlisted.txt"
OTHER_LISTED = "https://www.nasdaqtrader.com/dynamic/symdir/otherlisted.txt"
SKIP_TW_ETFS = {"00730"}


def fetch_bytes(url, insecure=False):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    context = ssl._create_unverified_context() if insecure else None
    with urllib.request.urlopen(request, timeout=45, context=context) as response:
        return response.read()


def fetch_json(url, insecure=False):
    return json.loads(fetch_bytes(url, insecure).decode("utf-8-sig"))


def tw_etfs():
    items = {}
    for row in fetch_json(TWSE_ETFS):
        symbol = str(row.get("基金代號", "")).strip().upper()
        name = str(row.get("基金簡稱", "")).strip()
        if symbol and name and symbol not in SKIP_TW_ETFS and re.fullmatch(r"[0-9A-Z]{4,6}", symbol):
            items[symbol] = {"market": "tw", "asset_type": "etf", "symbol": symbol, "name": name, "exchange": "TWSE"}
    for row in fetch_json(TPEX_QUOTES, insecure=True):
        symbol = str(row.get("SecuritiesCompanyCode", "")).strip().upper()
        name = str(row.get("CompanyName", "")).strip()
        if symbol.startswith("00") and symbol not in SKIP_TW_ETFS and name and re.fullmatch(r"[0-9A-Z]{4,6}", symbol):
            items.setdefault(symbol, {"market": "tw", "asset_type": "etf", "symbol": symbol, "name": name, "exchange": "TPEx"})
    if not items:
        raise RuntimeError("無法取得台灣 ETF 清單")
    return items


def tw_stocks(etf_symbols):
    items = {}
    for row in fetch_json(TWSE_STOCKS):
        symbol = str(row.get("公司代號", "")).strip().upper()
        name = str(row.get("公司簡稱", "")).strip()
        if symbol and name and symbol not in etf_symbols and re.fullmatch(r"[0-9A-Z]{4,6}", symbol):
            items[symbol] = {"market": "tw", "asset_type": "stock", "symbol": symbol, "name": name, "exchange": "TWSE"}
    for row in fetch_json(TPEX_QUOTES, insecure=True):
        symbol = str(row.get("SecuritiesCompanyCode", "")).strip().upper()
        name = str(row.get("CompanyName", "")).strip()
        if symbol and name and symbol not in etf_symbols and re.fullmatch(r"[0-9A-Z]{4,6}", symbol):
            items.setdefault(symbol, {"market": "tw", "asset_type": "stock", "symbol": symbol, "name": name, "exchange": "TPEx"})
    if not items:
        raise RuntimeError("無法取得台灣股票清單")
    return items


def parse_pipe(text):
    rows = []
    lines = text.splitlines()
    if not lines:
        return rows
    headers = lines[0].split("|")
    for line in lines[1:]:
        if not line or line.startswith("File Creation Time"):
            continue
        values = line.split("|")
        if len(values) != len(headers):
            continue
        rows.append(dict(zip(headers, values)))
    return rows


def us_assets():
    items = {}
    for row in parse_pipe(fetch_bytes(NASDAQ_LISTED).decode("utf-8-sig")):
        symbol = row.get("Symbol", "").strip().upper()
        name = row.get("Security Name", "").strip()
        if row.get("Test Issue") == "Y" or not symbol or not name or not re.fullmatch(r"[A-Z0-9.\-]+", symbol):
            continue
        if row.get("ETF") == "Y":
            kind, exchange = "etf", "NASDAQ"
        else:
            kind, exchange = "stock", "NASDAQ"
        items["{}:{}".format(exchange, symbol)] = {"market": "us", "asset_type": kind, "symbol": symbol, "name": name, "exchange": exchange}

    exchanges = {"N": "NYSE", "A": "NYSE American", "P": "NYSE Arca", "Z": "BATS", "V": "IEX"}
    for row in parse_pipe(fetch_bytes(OTHER_LISTED).decode("utf-8-sig")):
        symbol = row.get("ACT Symbol", "").strip().upper()
        name = row.get("Security Name", "").strip()
        exchange = exchanges.get(row.get("Exchange", ""), row.get("Exchange", "Other"))
        if row.get("Test Issue") == "Y" or not symbol or not name or not re.fullmatch(r"[A-Z0-9.\-]+", symbol):
            continue
        kind = "etf" if row.get("ETF") == "Y" else "stock"
        items.setdefault("{}:{}".format(exchange, symbol), {"market": "us", "asset_type": kind, "symbol": symbol, "name": name, "exchange": exchange})
    if not items:
        raise RuntimeError("無法取得美國標的清單")
    return items


def main():
    etfs = tw_etfs()
    stocks = tw_stocks(set(etfs))
    us = us_assets()
    assets = sorted(list(etfs.values()) + list(stocks.values()) + list(us.values()), key=lambda x: (x["market"], x["asset_type"], x["symbol"], x["exchange"]))
    result = {
        "updated_at": datetime.datetime.now(datetime.timezone.utc).astimezone().isoformat(timespec="seconds"),
        "sources": [TWSE_STOCKS, TWSE_ETFS, TPEX_QUOTES, NASDAQ_LISTED, OTHER_LISTED],
        "counts": {
            "tw_etf": sum(x["market"] == "tw" and x["asset_type"] == "etf" for x in assets),
            "tw_stock": sum(x["market"] == "tw" and x["asset_type"] == "stock" for x in assets),
            "us_etf": sum(x["market"] == "us" and x["asset_type"] == "etf" for x in assets),
            "us_stock": sum(x["market"] == "us" and x["asset_type"] == "stock" for x in assets),
        },
        "assets": assets,
    }
    with open(OUT, "w", encoding="utf-8") as output:
        json.dump(result, output, ensure_ascii=False, indent=2)
        output.write("\n")
    print("已更新短線日誌標的清單：{}".format(OUT))
    print(json.dumps(result["counts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
