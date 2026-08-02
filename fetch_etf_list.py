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
import urllib.request

TWSE_URL = "https://openapi.twse.com.tw/v1/opendata/t187ap47_L"
TPEX_URL = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes"
USER_AGENT = "Mozilla/5.0 (ETF Tracker; +https://github.com/garyfan1973/tw-etf-tracker-v2.0)"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE_DIR, "webapp", "etf_directory.json")


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def main():
    items = {}
    for row in fetch_json(TWSE_URL):
        code = str(row.get("基金代號", "")).strip().upper()
        name = str(row.get("基金簡稱", "")).strip()
        if re.fullmatch(r"[0-9A-Z]{4,6}", code) and name:
            items[code] = {"code": code, "name": name, "market": "上市"}

    # TPEx 的主板行情同時包含一般股票；ETF 證券代號使用 00 開頭的編碼。
    for row in fetch_json(TPEX_URL):
        code = str(row.get("SecuritiesCompanyCode", "")).strip().upper()
        name = str(row.get("CompanyName", "")).strip()
        if re.fullmatch(r"00[0-9A-Z]{2,4}", code) and name and code not in items:
            items[code] = {"code": code, "name": name, "market": "上櫃"}

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
