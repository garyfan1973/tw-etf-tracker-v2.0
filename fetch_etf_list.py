#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""抓取目前台灣上市、上櫃 ETF 清單，供前端 ETF 代號智慧搜尋使用。

資料來源：
  - TWSE OpenAPI：上市基金基本資料彙總表
  - TPEx OpenAPI：上櫃市場日行情（依 ETF 證券編碼範圍篩選）
"""

import datetime
import json
import os
import re
import time
import urllib.error
import urllib.request

TWSE_URL = "https://openapi.twse.com.tw/v1/opendata/t187ap47_L"
TPEX_URL = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes"
USER_AGENT = "Mozilla/5.0 (ETF Tracker; +https://github.com/garyfan1973/tw-etf-tracker-v2.0)"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE_DIR, "webapp", "etf_directory.json")
EXCLUDED_CODES = {"00730"}


def fetch_json(url, attempts=3):
    """抓取 API；遇到暫時性拒絕或網路錯誤時重試。"""
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json,text/plain,*/*",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
        "Referer": "https://www.twse.com.tw/",
    }
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.load(resp)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            print("抓取失敗（第 {}/{} 次）{}：{}".format(attempt, attempts, url, exc))
            if attempt < attempts:
                time.sleep(2 ** (attempt - 1))
    raise last_error


def load_previous_items():
    """讀取上一版清單，讓單一來源暫時失敗時可以保留舊資料。"""
    try:
        with open(OUT, encoding="utf-8") as f:
            return json.load(f).get("etfs", [])
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return []


def main():
    previous = load_previous_items()
    items = {}

    def previous_market(market):
        return {
            row["code"]: row for row in previous
            if row.get("market") == market and row.get("code") not in EXCLUDED_CODES
        }

    try:
        listed = {}
        for row in fetch_json(TWSE_URL):
            code = str(row.get("基金代號", "")).strip().upper()
            name = str(row.get("基金簡稱", "")).strip()
            if code not in EXCLUDED_CODES and re.fullmatch(r"[0-9A-Z]{4,6}", code) and name:
                listed[code] = {"code": code, "name": name, "market": "上市"}
        if not listed:
            raise ValueError("TWSE 回傳資料無法解析出 ETF")
        items.update(listed)
    except Exception as exc:
        print("TWSE ETF 清單暫時無法取得，沿用上一版上市清單：{}".format(exc))
        items.update(previous_market("上市"))

    try:
        # TPEx 的主板行情同時包含一般股票；ETF 證券代號使用 00 開頭的編碼。
        otc = {}
        for row in fetch_json(TPEX_URL):
            code = str(row.get("SecuritiesCompanyCode", "")).strip().upper()
            name = str(row.get("CompanyName", "")).strip()
            if code not in EXCLUDED_CODES and re.fullmatch(r"00[0-9A-Z]{2,4}", code) and name:
                otc[code] = {"code": code, "name": name, "market": "上櫃"}
        if not otc:
            raise ValueError("TPEx 回傳資料無法解析出 ETF")
        items.update({code: row for code, row in otc.items() if code not in items})
    except Exception as exc:
        print("TPEx ETF 清單暫時無法取得，沿用上一版上櫃清單：{}".format(exc))
        items.update({code: row for code, row in previous_market("上櫃").items() if code not in items})

    if not items:
        raise RuntimeError("兩個 ETF 清單來源都失敗，且沒有可沿用的上一版資料")

    result = {
        "updated_at": datetime.datetime.now(datetime.timezone.utc).astimezone().isoformat(timespec="seconds"),
        "sources": [TWSE_URL, TPEX_URL],
        "etfs": sorted(items.values(), key=lambda x: x["code"]),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("已更新 {} 檔台股 ETF：{}".format(len(result["etfs"]), OUT))


if __name__ == "__main__":
    main()
