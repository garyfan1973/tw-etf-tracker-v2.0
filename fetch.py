#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""主動式 ETF 每日持股抓取與加減碼比對工具。

資料來源：MoneyDJ ETF 持股明細（伺服器端渲染，含完整每日持股）
  https://www.moneydj.com/ETF/X/Basic/Basic0007B.xdjhtm?etfid=<代號>.tw

流程：
  1. 抓取指定 ETF 的當日完整持股（個股、投資比例%、持有股數）。
  2. 存成 data/<代號>_<日期>.json 快照（同一天覆蓋）。
  3. 讀取所有歷史快照，產生 webapp/data.js 給查詢網頁使用。

比對邏輯（以「持有股數」判定經理人加減碼，最能反映實際操作）：
  - 新增：今天有、前一交易日沒有
  - 剔除：前一交易日有、今天沒有
  - 加碼：持有股數增加
  - 減碼：持有股數減少
"""

import datetime
import csv
import html
import io
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import zoneinfo

# 要追蹤的 ETF 清單，之後要加 00980A、00982A 直接加進來即可
ETFS = {
    # 主動式 ETF
    "00981A": "主動統一台股增長",
    "00982A": "主動群益台灣強棒",
    "00990A": "主動元大AI新經濟",
    "00992A": "主動群益科技創新",
    "00400A": "主動國泰動能高息",
    # 被動式 ETF
    "0050": "元大台灣50",
    "0052": "富邦科技",
    "0056": "元大高股息",
    "00878": "國泰永續高股息",
    "00881": "國泰台灣5G+",
    "00919": "群益台灣精選高息",
    "00922": "國泰台灣領袖50",
}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
WEBAPP_DIR = os.path.join(BASE_DIR, "webapp")

SOURCE_URL = "https://www.moneydj.com/ETF/X/Basic/Basic0007B.xdjhtm?etfid={etfid}.tw"
# 配息狀況（歷次＋已公告未來配息）
DIV_URL = "https://www.moneydj.com/ETF/X/Basic/Basic0005.xdjhtm?etfid={etfid}.tw"
# 每日行情：使用指定日期的盤後行情，避免「最新行情」端點回傳舊交易日資料
TWSE_QUOTE_URL = "https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date={date}&type=ALLBUT0999&response=json"
TPEX_QUOTE_URL = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes?date={date}"
# 三大法人買賣超（外資／投信／自營商）：指定日期盤後彙總（買賣超股數）
TWSE_INST_URL = "https://www.twse.com.tw/rwd/zh/fund/T86?date={date}&selectType=ALLBUT0999&response=json"
TPEX_INST_URL = "https://www.tpex.org.tw/openapi/v1/tpex_3itrade_hedge?date={date}"
# 融資融券餘額：上市證交所 MI_MARGN、上櫃 TPEx OpenAPI
TWSE_MARGIN_URL = "https://www.twse.com.tw/exchangeReport/MI_MARGN?date={date}&selectType=ALL&response=json"
TPEX_MARGIN_URL = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_margin_balance?date={date}"
# ETF 總覽：證交所 ETF e添富商品頁（伺服器端含資產規模、受益人次、分類）
TWSE_ETF_INFO_URL = "https://www.twse.com.tw/zh/ETFortune/etfInfo/{etf_id}"
# 股東／受益人持股級距：TDCC 官方開放 CSV（每週最後營業日）
TDCC_DISTRIBUTION_URL = "https://opendata.tdcc.com.tw/getOD.ashx?id=1-5"
# 海外行情：Yahoo Finance（免金鑰）。市場別 -> Yahoo 代號後綴
YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval=1d&range=10d"
YAHOO_SUFFIX = {"US": "", "JP": ".T", "KS": ".KS", "HK": ".HK"}
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
TZ_TAIPEI = zoneinfo.ZoneInfo("Asia/Taipei")


def today_str():
    """回傳台北時區的今日日期字串（YYYY-MM-DD）。"""
    return datetime.datetime.now(TZ_TAIPEI).strftime("%Y-%m-%d")


def curl_text(url):
    """抓取網頁 HTML 原始碼。

    優先用系統 curl（macOS 上比 Python 的 LibreSSL 對憑證相容性更好），
    失敗才退回 urllib。
    """
    try:
        out = subprocess.run(
            ["curl", "-s", "-m", "30", "-A", USER_AGENT, url],
            capture_output=True, timeout=35,
        )
        if out.returncode == 0 and out.stdout:
            return out.stdout.decode("utf-8", errors="ignore")
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def fetch_html(etf_id):
    """抓取某 ETF 的 MoneyDJ 持股頁 HTML。"""
    return curl_text(SOURCE_URL.format(etfid=etf_id))


def fetch_json(url):
    """用 curl 抓 JSON（避開 macOS LibreSSL 憑證問題），失敗退回 urllib。"""
    try:
        out = subprocess.run(
            ["curl", "-s", "-m", "30", "-A", USER_AGENT, url],
            capture_output=True, timeout=35,
        )
        if out.returncode == 0 and out.stdout:
            return json.loads(out.stdout.decode("utf-8", errors="ignore"))
    except (FileNotFoundError, subprocess.TimeoutExpired, json.JSONDecodeError):
        pass
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8", errors="ignore"))


def fetch_json_retry(url, attempts=3, delay=2):
    """抓取容易短暫回傳空內容的 JSON API，失敗時重試後再拋出錯誤。"""
    last_error = None
    for attempt in range(attempts):
        try:
            return fetch_json(url)
        except Exception as exc:  # noqa: BLE001 - 保留最後一次原始錯誤給呼叫端記錄
            last_error = exc
            if attempt + 1 < attempts:
                print("  ! JSON API 暫時失敗，第 {}/{} 次重試：{}".format(
                    attempt + 1, attempts, exc))
                time.sleep(delay)
    raise last_error


def _num(value):
    """把 '2,425.00' / '--' / '' / '+0.17' 轉成 float，無效回 None。"""
    if value is None:
        return None
    s = str(value).replace(",", "").strip()
    if s in ("", "--", "---", "N/A"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _int(value):
    """把 '1,234' / '-5,600' / '--' 轉成 int，無效回 None。"""
    n = _num(value)
    return int(round(n)) if n is not None else None


def _quote_fields(open_p, high, low, close, change):
    """由開高低收與漲跌，組出統一的行情欄位（含前日收盤、漲跌幅、振幅）。"""
    prev_close = None
    change_pct = None
    if close is not None and change is not None:
        prev_close = round(close - change, 4)
        if prev_close:
            change_pct = round(change / prev_close * 100, 2)
    amplitude = None
    if high is not None and low is not None and prev_close:
        amplitude = round((high - low) / prev_close * 100, 2)
    return {
        "open": open_p, "high": high, "low": low, "close": close,
        "prevClose": prev_close, "change": change,
        "changePct": change_pct, "amplitude": amplitude,
    }


def _twse_quote_rows(payload):
    """從 TWSE 指定日期盤後 JSON 找出個股行情表。"""
    if not isinstance(payload, dict):
        return []
    rows = []
    for table in payload.get("tables", []):
        fields = table.get("fields", [])
        data = table.get("data", [])
        required = {"證券代號", "開盤價", "最高價", "最低價", "收盤價"}
        if required.issubset(fields):
            rows.extend(dict(zip(fields, row)) for row in data)
    return rows


def _signed_change(row):
    """解析 TWSE 的漲跌方向與價差欄位。"""
    value = _num(row.get("漲跌價差") or row.get("漲跌") or row.get("Change"))
    # TWSE 的 MI_INDEX 回應會把符號包在 HTML 中，例如
    # ``<p style= color:green>-</p>``；若直接比對字串，負號會被漏掉，
    # 導致 2,370 - 55 被誤算成前收 2,315、漲幅 +2.38%。
    sign = html.unescape(str(row.get("漲跌(+/-)") or row.get("漲跌符號") or ""))
    sign = re.sub(r"<[^>]+>", "", sign).strip()
    if value is not None and sign in ("-", "－"):
        return -abs(value)
    return value


def fetch_quotes(data_date):
    """抓指定資料日全市場行情，回傳 {股票代號: 統一行情欄位}。

    只接受指定日期的盤後資料；若來源回傳空資料，不拿最新端點的舊交易日資料冒充。
    """
    quotes = {}
    # 上市
    try:
        payload = fetch_json(TWSE_QUOTE_URL.format(date=data_date.replace("-", "")))
        for r in _twse_quote_rows(payload):
            code = str(r.get("證券代號", "")).strip()
            if not code:
                continue
            q = _quote_fields(
                _num(r.get("開盤價")), _num(r.get("最高價")),
                _num(r.get("最低價")), _num(r.get("收盤價")),
                _signed_change(r),
            )
            q["volume"] = _num(r.get("成交股數"))  # 成交股數
            q["quoteDate"] = data_date
            quotes[code] = q
    except Exception as exc:
        print("  ! 上市行情抓取失敗：{}".format(exc))
    # 上櫃
    try:
        for r in fetch_json(TPEX_QUOTE_URL.format(date=data_date.replace("-", ""))):
            code = str(r.get("SecuritiesCompanyCode", "")).strip()
            if not code:
                continue
            q = _quote_fields(
                _num(r.get("Open")), _num(r.get("High")),
                _num(r.get("Low")), _num(r.get("Close")),
                _num(r.get("Change")),
            )
            q["volume"] = _num(r.get("TradingShares"))
            q["quoteDate"] = data_date
            quotes.setdefault(code, q)  # 不覆蓋已有的上市資料
    except Exception as exc:
        print("  ! 上櫃行情抓取失敗：{}".format(exc))
    print("  指定行情日 {}：取得 {} 檔個股行情".format(data_date, len(quotes)))
    return quotes


def _tpex_inst_field(row, *tokens):
    """從 TPEx 三大法人列（欄名為英文）依關鍵字挑買賣超股數欄位。

    TPEx OpenAPI 欄名較長且偶有版本差異，改以關鍵字子字串比對，
    盡量容忍欄名微調；找不到回 None。
    """
    for key, val in row.items():
        name = str(key)
        if all(t.lower() in name.lower() for t in tokens):
            n = _int(val)
            if n is not None:
                return n
    return None


def fetch_institutional(data_date):
    """抓指定資料日全市場三大法人買賣超股數。

    回傳 {股票代號: {foreign, trust, dealer, total}}（皆為買賣超股數，
    正為買超、負為賣超）。金額由網頁端以「買賣超股數 × 當日收盤價」估算。
    上市走 TWSE T86；上櫃走 TPEx OpenAPI（best-effort，欄名以關鍵字比對）。
    """
    inst = {}
    # 上市（TWSE T86）：欄位齊全，依欄名對齊
    try:
        payload = fetch_json(TWSE_INST_URL.format(date=data_date.replace("-", "")))
        fields = payload.get("fields", []) if isinstance(payload, dict) else []
        idx = {name: i for i, name in enumerate(fields)}

        def gi(row, *names):
            for n in names:
                j = idx.get(n)
                if j is not None and j < len(row):
                    v = _int(row[j])
                    if v is not None:
                        return v
            return None

        for row in (payload.get("data", []) if isinstance(payload, dict) else []):
            ci = idx.get("證券代號")
            if ci is None or ci >= len(row):
                continue
            code = str(row[ci]).strip()
            if not code:
                continue
            # 外資 = 外陸資（不含外資自營商）＋ 外資自營商，以對齊三大法人合計
            fmain = gi(row, "外陸資買賣超股數(不含外資自營商)", "外資買賣超股數")
            fdealer = gi(row, "外資自營商買賣超股數")
            foreign = None
            if fmain is not None or fdealer is not None:
                foreign = (fmain or 0) + (fdealer or 0)
            inst[code] = {
                "foreign": foreign,
                "trust": gi(row, "投信買賣超股數"),
                "dealer": gi(row, "自營商買賣超股數", "自營商買賣超股數(自行買賣)"),
                "total": gi(row, "三大法人買賣超股數"),
            }
    except Exception as exc:
        print("  ! 上市三大法人抓取失敗：{}".format(exc))
    # 上櫃（TPEx OpenAPI）：best-effort，欄名以關鍵字比對
    try:
        rows = fetch_json_retry(TPEX_INST_URL.format(date=data_date.replace("-", "")))
        for r in (rows if isinstance(rows, list) else []):
            if not isinstance(r, dict):
                continue
            code = str(r.get("SecuritiesCompanyCode") or r.get("Code") or "").strip()
            if not code or code in inst:
                continue
            foreign = _tpex_inst_field(r, "Foreign", "Net")
            trust = _tpex_inst_field(r, "Investment", "Trust", "Net")
            dealer = _tpex_inst_field(r, "Dealer", "Net")
            total = (_tpex_inst_field(r, "Total", "Net")
                     or _tpex_inst_field(r, "Three", "Net"))
            if any(v is not None for v in (foreign, trust, dealer, total)):
                inst[code] = {"foreign": foreign, "trust": trust,
                              "dealer": dealer, "total": total}
    except Exception as exc:
        print("  ! 上櫃三大法人抓取失敗：{}".format(exc))
    print("  指定行情日 {}：取得 {} 檔三大法人買賣超".format(data_date, len(inst)))
    return inst


def fetch_margin(data_date):
    """抓指定日期逐檔融資融券餘額與當日增減（上市＋上櫃）。"""
    margin = {}
    try:
        payload = fetch_json(TWSE_MARGIN_URL.format(date=data_date.replace("-", "")))
        tables = payload.get("tables", []) if isinstance(payload, dict) else []
        table = next((t for t in tables if "彙總" in str(t.get("title", ""))), None)
        fields = table.get("fields", []) if table else []
        idx = {name: i for i, name in enumerate(fields)}
        for row in (table.get("data", []) if table else []):
            code_i = idx.get("代號")
            if code_i is None or code_i >= len(row):
                continue
            code = str(row[code_i]).strip()
            if not code:
                continue
            # 上市回應有兩組同名欄位，必須依位置區分融資與融券。
            positions = [i for i, name in enumerate(fields) if name == "買進"]
            sell_positions = [i for i, name in enumerate(fields) if name == "賣出"]
            cash_positions = [i for i, name in enumerate(fields) if name in ("現金償還", "現券償還")]
            prev_positions = [i for i, name in enumerate(fields) if name == "前日餘額"]
            balance_positions = [i for i, name in enumerate(fields) if name == "今日餘額"]
            def at(values, position):
                return _int(row[values[position]]) if len(values) > position and values[position] < len(row) else None
            margin[code] = {
                "marginBuy": at(positions, 0), "marginSell": at(sell_positions, 0),
                "marginCashRedemption": at(cash_positions, 0),
                "marginPrevBalance": at(prev_positions, 0), "marginBalance": at(balance_positions, 0),
                "shortBuy": at(positions, 1), "shortSell": at(sell_positions, 1),
                "shortStockRedemption": at(cash_positions, 1),
                "shortPrevBalance": at(prev_positions, 1), "shortBalance": at(balance_positions, 1),
                "offsetting": _int(row[idx["資券互抵"]]), "date": data_date,
            }
    except Exception as exc:
        print("  ! 上市融資融券抓取失敗：{}".format(exc))
    try:
        rows = fetch_json(TPEX_MARGIN_URL.format(date=data_date.replace("-", "")))
        for row in (rows if isinstance(rows, list) else []):
            if not isinstance(row, dict):
                continue
            code = str(row.get("SecuritiesCompanyCode") or "").strip()
            if not code:
                continue
            margin[code] = {
                "marginBuy": _int(row.get("MarginPurchase")),
                "marginSell": _int(row.get("MarginSales")),
                "marginCashRedemption": _int(row.get("CashRedemption")),
                "marginPrevBalance": _int(row.get("MarginPurchaseBalancePreviousDay")),
                "marginBalance": _int(row.get("MarginPurchaseBalance")),
                "shortBuy": _int(row.get("ShortSale")),
                "shortSell": _int(row.get("ShortConvering")),
                "shortStockRedemption": _int(row.get("StockRedemption")),
                "shortPrevBalance": _int(row.get("ShortSaleBalancePreviousDay")),
                "shortBalance": _int(row.get("ShortSaleBalance")),
                "offsetting": _int(row.get("Offsetting")), "date": data_date,
            }
    except Exception as exc:
        print("  ! 上櫃融資融券抓取失敗：{}".format(exc))
    print("  指定行情日 {}：取得 {} 檔融資融券".format(data_date, len(margin)))
    return margin


def _iso_date(s):
    """2026/07/21 -> 2026-07-21，無效回空字串。"""
    m = re.match(r"(20\d{2})/(\d{1,2})/(\d{1,2})", s or "")
    if not m:
        return ""
    return "{}-{:02d}-{:02d}".format(int(m.group(1)), int(m.group(2)), int(m.group(3)))


def parse_dividends(page_html):
    """從 MoneyDJ 配息頁解析歷次＋已公告配息。

    回傳：[{ex, pay, base, amount, yield}, ...]（日期為 YYYY-MM-DD）
    """
    grid = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page_html, re.S):
        cells = [
            html.unescape(re.sub(r"<[^>]+>", "", c)).strip()
            for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)
        ]
        grid.append(cells)
    # 找含「除息日」的表頭，之後依欄位位置對齊（登記日常空白，不能濾空格）
    header = hi = None
    for i, cells in enumerate(grid):
        if "除息日" in cells:
            header, hi = cells, i
            break
    if hi is None:
        return []
    col = {name: j for j, name in enumerate(header)}

    def g(cells, name):
        j = col.get(name)
        return cells[j] if (j is not None and j < len(cells)) else ""

    out = []
    for cells in grid[hi + 1:]:
        if len(cells) < len(header):
            continue
        ex = _iso_date(g(cells, "除息日"))
        if not ex:  # 遇到附註等非資料列就停止
            continue
        out.append({
            "ex": ex,
            "pay": _iso_date(g(cells, "發放日")),
            "base": _iso_date(g(cells, "配息基準日")),
            "amount": _num(g(cells, "配息總額")),
            "yield": _num(g(cells, "年化配息率(%)") or g(cells, "年化配息率")),
        })
    return out


def fetch_dividends(etf_id):
    """抓取並解析某 ETF 的配息紀錄。"""
    try:
        return parse_dividends(curl_text(DIV_URL.format(etfid=etf_id)))
    except Exception as exc:
        print("  ! 配息抓取失敗：{}".format(exc))
        return []


def parse_twse_etf_overview(page_html):
    """解析證交所 ETF e添富商品頁的總覽資料。"""
    def text_after(label):
        m = re.search(r"<p>\s*" + re.escape(label) + r"\s*</p>\s*<p>\s*<b>(.*?)</b>", page_html, re.S)
        return html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip() if m else ""

    def metric(label):
        m = re.search(r"<p>\s*" + re.escape(label) + r"\s*</p>\s*<span>(.*?)</span>", page_html, re.S)
        return _num(re.sub(r"<[^>]+>", "", m.group(1))) if m else None

    tags = [html.unescape(re.sub(r"<[^>]+>", "", x)).strip()
            for x in re.findall(r'<span class="result">\s*<a[^>]*>(.*?)</a>\s*</span>', page_html, re.S)]
    return {
        "name": text_after("證券簡稱"),
        "securityType": text_after("證券類別"),
        "issuer": text_after("發行公司"),
        "index": text_after("標的指數"),
        "fundSizeHundredMillion": metric("資產規模(億元)"),
        "beneficiaryTenThousands": metric("受益人次(萬人)"),
        "tags": tags,
        "source": "TWSE ETF e添富",
        "fetchedAt": datetime.datetime.now(TZ_TAIPEI).isoformat(timespec="seconds"),
    }


def fetch_twse_etf_overviews(etf_ids):
    """抓取 ETF 總覽資料；單檔失敗不影響其他資料。"""
    result = {}
    for etf_id in etf_ids:
        try:
            overview = parse_twse_etf_overview(curl_text(TWSE_ETF_INFO_URL.format(etf_id=etf_id)))
            if overview.get("name") or overview.get("fundSizeHundredMillion") is not None:
                result[etf_id] = overview
        except Exception as exc:
            print("  ! ETF 總覽抓取失敗 {}：{}".format(etf_id, exc))
    print("ETF 總覽：取得 {}/{} 檔".format(len(result), len(etf_ids)))
    return result


TDCC_LEVEL_LABELS = {
    1: "<1張", 2: "1-5張", 3: "5-10張", 4: "10-15張", 5: "15-20張",
    6: "20-30張", 7: "30-40張", 8: "40-50張", 9: "50-100張",
    10: "100-200張", 11: "200-400張", 12: "400-600張",
    13: "600-800張", 14: "800-1千張", 15: "1千張以上",
}


def parse_tdcc_distribution(csv_text, wanted_codes):
    """解析 TDCC 1-5 CSV，轉成前端股東級距模型。"""
    def tdcc_date(value):
        value = value.strip().replace("/", "-")
        if re.fullmatch(r"\d{8}", value):
            value = value[:4] + "-" + value[4:6] + "-" + value[6:]
        return _iso_date(value.replace("-", "/"))

    rows = csv.reader(io.StringIO(csv_text.lstrip("\ufeff")))
    grouped = {}
    for row in rows:
        if len(row) < 6 or row[0] == "資料日期":
            continue
        date_raw, code, level_raw, holders_raw, shares_raw, pct_raw = [str(x).strip() for x in row[:6]]
        code = code.upper()
        if code not in wanted_codes:
            continue
        try:
            level = int(level_raw)
        except ValueError:
            continue
        item = grouped.setdefault(code, {"date": tdcc_date(date_raw), "levels": {}, "total": None})
        holders, shares, pct = _int(holders_raw), _int(shares_raw), _num(pct_raw)
        if level == 17:
            # 第 17 級是集保中心提供的官方合計；第 16 級是差額調整，不列入級距圖。
            if holders is not None and shares is not None:
                item["total"] = {"holders": holders, "shares": shares, "holdingPct": pct}
            continue
        if level not in TDCC_LEVEL_LABELS:
            continue
        if holders is None or shares is None:
            continue
        item["levels"][level] = {"holders": holders, "shares": shares, "holdingPct": pct}
    result = {}
    for code, item in grouped.items():
        # 優先採用第 17 級官方合計；若來源沒有該列，才由 1-15 級回算。
        official_total = item.get("total") or {}
        total_holders = official_total.get("holders") or sum(v["holders"] for v in item["levels"].values())
        total_shares = official_total.get("shares") or sum(v["shares"] for v in item["levels"].values())
        result[code] = {
            "date": item["date"],
            "totalHolders": total_holders,
            "totalShares": total_shares,
            "buckets": [],
            "source": "TDCC 集保戶股權分散表",
        }
        # 重新以 1-15 級計算比例；第 16/17 級沒有被放入 levels，因此不會重複計算。
        for level in range(1, 16):
            row = item["levels"].get(level, {"holders": 0, "shares": 0, "holdingPct": 0})
            result[code]["buckets"].append({
                "label": TDCC_LEVEL_LABELS[level],
                "holders": row["holders"],
                "shares": row["shares"],
                "peoplePct": round(row["holders"] / total_holders * 100, 2) if total_holders else 0,
                "holdingPct": round(row["shares"] / total_shares * 100, 2) if total_shares else 0,
            })
    return result


def fetch_tdcc_distribution(etf_ids):
    """抓取 TDCC 官方股東級距 CSV。"""
    try:
        text = curl_text(TDCC_DISTRIBUTION_URL)
        result = parse_tdcc_distribution(text, {x.upper() for x in etf_ids})
        print("TDCC 股東分佈：取得 {}/{} 檔".format(len(result), len(etf_ids)))
        return result
    except Exception as exc:
        print("  ! TDCC 股東分佈抓取失敗：{}".format(exc))
        return {}


def yahoo_symbol(holding):
    """由持股的市場別組出 Yahoo 代號；不支援或無代號回 None。"""
    suffix = YAHOO_SUFFIX.get(holding.get("market"))
    if suffix is None or not holding.get("code"):
        return None
    return holding["code"] + suffix


def fetch_oversea_quote(symbol, data_date):
    """抓 Yahoo 單一海外標的、挑「資料日或之前最近一個交易日」的日行情。

    回傳統一欄位（含 currency、quoteDate），失敗回 None。
    """
    d = fetch_json(YAHOO_URL.format(sym=symbol))
    res = d["chart"]["result"][0]
    meta = res["meta"]
    off = meta.get("gmtoffset", 0) or 0
    ts = res.get("timestamp") or []
    q = res["indicators"]["quote"][0]
    # 依當地時區換算每列的日期
    rows = []
    for i in range(len(ts)):
        local = datetime.datetime.utcfromtimestamp(ts[i] + off).strftime("%Y-%m-%d")
        rows.append((local, q["open"][i], q["high"][i], q["low"][i],
                     q["close"][i], q["volume"][i]))
    if not rows:
        return None
    # 選資料日；沒有就取 <= 資料日、且有收盤的最近一列
    idx = None
    for i, r in enumerate(rows):
        if r[0] == data_date and r[4] is not None:
            idx = i
            break
    if idx is None:
        cand = [i for i, r in enumerate(rows) if r[0] <= data_date and r[4] is not None]
        idx = cand[-1] if cand else None
    if idx is None:
        return None
    local, o, hi, lo, cl, vol = rows[idx]
    r2 = lambda v: round(v, 2) if isinstance(v, (int, float)) else None
    # 前一個有效收盤當作前日收盤
    prev = None
    for j in range(idx - 1, -1, -1):
        if rows[j][4] is not None:
            prev = rows[j][4]
            break
    if prev is None:
        prev = meta.get("chartPreviousClose")
    close = r2(cl)
    change = round(close - prev, 2) if (close is not None and prev) else None
    fields = _quote_fields(r2(o), r2(hi), r2(lo), close, change)
    fields["volume"] = vol
    fields["currency"] = meta.get("currency")
    fields["quoteDate"] = local
    return fields


def fetch_oversea(holdings, data_date):
    """對海外持股逐一補上 Yahoo 行情，回傳成功筆數。"""
    matched = 0
    for h in holdings:
        sym = yahoo_symbol(h)
        if not sym:
            continue
        try:
            q = fetch_oversea_quote(sym, data_date)
        except Exception:
            q = None
        if q:
            h.update(q)
            matched += 1
    return matched


def parse_data_date(page_html):
    """從頁面擷取真實「資料日期」（交易日），回傳 YYYY-MM-DD。

    來源頁面格式：資料日期：2026/07/31
    抓不到時退回台北時區今日日期。
    """
    m = re.search(r"資料日期[：:]\s*(20\d{2})[/-](\d{1,2})[/-](\d{1,2})", page_html)
    if m:
        return "{}-{:02d}-{:02d}".format(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return today_str()


def classify_asset(name, code=""):
    """依來源名稱辨識非股票資產；無法辨識時視為股票。"""
    text = str(name or "").replace(" ", "").lower()
    if any(token in text for token in ("現金", "cash", "貨幣", "存款")):
        return "cash"
    if any(token in text for token in ("期貨", "future", "futures")):
        return "future"
    if any(token in text for token in ("選擇權", "option", "options")):
        return "option"
    if any(token in text for token in ("債券", "bond", "bonds")):
        return "bond"
    return "stock"


def asset_unit(asset_type):
    """回傳其他資產數量的顯示單位。"""
    return {"future": "口", "option": "口", "bond": "面額"}.get(asset_type, "")


def parse_holdings(page_html):
    """從 HTML 解析出持股清單（含海外市場）。

    來源同一頁除了持股，還有一個「相關 ETF」小工具（表頭含 ETF代碼），
    以及跨市場持股：台積電(2330.TW)、NVIDIA(NVDA.US)、Kioxia(285A.JP)、
    Samsung Elec Mech(009150.KS)，也有無代號的海外股（INFINEON TECHNOLOGIES AG）。
    因此改採「區段解析」：從『個股名稱』表頭開始，遇到『ETF代碼』即停止。

    回傳：股票列含 shares；其他資產列含 assetType、quantity、amount。
    其他資產不會被當成股票股數，也不參與股票加減碼計算。
    market 為市場別（TW/US/JP/KS/…），無代號者為空字串。
    """
    holdings = []
    in_section = False
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page_html, re.S):
        raw_cells = [
            html.unescape(re.sub(r"<[^>]+>", "", c)).strip()
            for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)
        ]
        cells = [c for c in raw_cells if c]
        if not cells:
            continue
        joined = " ".join(cells)
        if "個股名稱" in joined:      # 進入持股區段
            in_section = True
            continue
        if "ETF代碼" in joined:       # 相關 ETF 小工具，持股區段結束
            break
        if not in_section or len(raw_cells) < 2:
            continue
        weight = _num(raw_cells[1])
        if weight is None:            # 頁尾導覽等非資料列
            continue
        # 名稱可能含代號：名稱(代號.市場)，市場如 TW/US/JP/KS
        m = re.match(r"^(.*?)\(([0-9A-Za-z]+)\.([A-Za-z]{2,3})\)\s*$", raw_cells[0])
        if m:
            name, code, market = m.group(1).strip(), m.group(2), m.group(3).upper()
        else:
            name, code, market = cells[0].strip(), "", ""  # 無代號的海外股
        asset_type = classify_asset(name, code)
        if asset_type == "stock":
            if len(raw_cells) < 3:
                continue
            try:
                shares = int(raw_cells[2].replace(",", ""))
            except ValueError:
                continue
            holdings.append({
                "code": code, "name": name, "market": market,
                "assetType": "stock", "weight": weight, "shares": shares,
            })
            continue

        # 非股票資產的來源欄位可能是口數、面額或市值；保留原始數字，
        # 但不填入 shares，避免前端誤當成股票股數。
        quantity = _num(raw_cells[2]) if len(raw_cells) >= 3 else None
        amount = _num(raw_cells[3]) if len(raw_cells) >= 4 else None
        holdings.append({
            "code": code, "name": name, "market": market,
            "assetType": asset_type, "weight": weight,
            "quantity": quantity, "unit": asset_unit(asset_type),
            "amount": amount,
        })
    return holdings


def save_snapshot(etf_id, holdings, date, self_quote=None, self_institutional=None, self_margin=None):
    """依「資料日期」儲存快照（同一交易日覆蓋）。回傳快照 dict。

    self_quote：ETF 自身當日行情（供個人持股算市值/損益用）。
    self_institutional：ETF 自身三大法人買賣超股數（供近三日趨勢表使用）。
    """
    snapshot = {
        "date": date,
        "fetched_at": datetime.datetime.now(TZ_TAIPEI).isoformat(timespec="seconds"),
        "count": len(holdings),
        "self": self_quote,
        "selfInstitutional": self_institutional,
        "selfMargin": self_margin,
        "holdings": holdings,
    }
    path = os.path.join(DATA_DIR, "{}_{}.json".format(etf_id, date))
    with open(path, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)
    return snapshot


def load_snapshots(etf_id):
    """讀取某 ETF 全部歷史快照，依日期排序（舊 -> 新）。"""
    snapshots = []
    prefix = "{}_".format(etf_id)
    for name in os.listdir(DATA_DIR):
        if name.endswith("_dividends.json"):
            continue  # 配息檔不是持股快照
        if name.startswith(prefix) and name.endswith(".json"):
            with open(os.path.join(DATA_DIR, name), encoding="utf-8") as f:
                snapshots.append(json.load(f))
    snapshots.sort(key=lambda s: s["date"])
    return snapshots


def backfill_margin_history(etf_ids, margin_cache, limit=3):
    """回補最近快照的融資融券，讓新頁籤首次上線即可顯示資料。"""
    updated = 0
    for etf_id in etf_ids:
        snapshots = load_snapshots(etf_id)
        for snapshot in snapshots[-limit:]:
            data_date = snapshot["date"]
            if data_date not in margin_cache:
                print("== 回補 {} 融資融券 ==".format(data_date))
                margin_cache[data_date] = fetch_margin(data_date)
            margin_data = margin_cache[data_date]
            changed = False
            self_margin = margin_data.get(etf_id)
            if self_margin:
                snapshot["selfMargin"] = dict(self_margin, date=data_date)
                changed = True
            for holding in snapshot.get("holdings", []):
                code = holding.get("code")
                margin = margin_data.get(code) if code else None
                if margin:
                    holding["margin"] = dict(margin, date=data_date)
                    changed = True
            if changed:
                path = os.path.join(DATA_DIR, "{}_{}.json".format(etf_id, data_date))
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(snapshot, f, ensure_ascii=False, indent=2)
                updated += 1
    print("融資融券歷史資料回補完成：更新 {} 份快照".format(updated))


# ---- 會員關注代號（B 方案：自動納入所有會員關注的 ETF）----

def load_supabase_config():
    """從 webapp/config.js 讀 Supabase URL 與 anon key；未設定回 (None, None)。"""
    path = os.path.join(WEBAPP_DIR, "config.js")
    if not os.path.exists(path):
        return None, None
    txt = open(path, encoding="utf-8").read()
    u = re.search(r'SUPABASE_URL\s*=\s*"([^"]+)"', txt)
    k = re.search(r'SUPABASE_ANON_KEY\s*=\s*"([^"]+)"', txt)
    url = u.group(1) if u else ""
    key = k.group(1) if k else ""
    if not url or not key or "YOUR_" in url or "YOUR_" in key:
        return None, None
    return url, key


def _rpc_codes(url, key, fn):
    """呼叫 Supabase security definer 函式，回傳字串陣列（代號）；失敗回 None。"""
    endpoint = url.rstrip("/") + "/rest/v1/rpc/" + fn
    out = subprocess.run(
        ["curl", "-s", "-m", "20", "-X", "POST", endpoint,
         "-H", "apikey: " + key, "-H", "Authorization: Bearer " + key,
         "-H", "Content-Type: application/json", "-d", "{}"],
        capture_output=True, timeout=25,
    )
    data = json.loads(out.stdout.decode("utf-8", errors="ignore"))
    if isinstance(data, list):
        return [str(c).upper() for c in data if c]
    return None


def fetch_member_codes():
    """取得所有會員相關的 ETF 代號（關注清單＋個人持股）。

    優先呼叫 all_member_codes()（watchlist ∪ holdings），沒有就退回
    all_watchlist_codes()。用公開 anon key + security definer，不需 service_role。
    """
    url, key = load_supabase_config()
    if not url:
        return []
    try:
        for fn in ("all_member_codes", "all_watchlist_codes"):
            codes = _rpc_codes(url, key, fn)
            if codes is not None:
                return codes
    except Exception as exc:
        print("  ! 讀取會員關注代號失敗：{}".format(exc))
    return []


def parse_etf_name(page_html):
    """從 MoneyDJ 頁面 <title> 取 ETF 名稱（去掉網站後綴）。"""
    m = re.search(r"<title>(.*?)</title>", page_html, re.S)
    if not m:
        return ""
    return re.split(r"[-|｜]", html.unescape(m.group(1)).strip())[0].strip()


def load_names():
    """讀 data/etf_names.json（code->name），內建 ETFS 名稱優先。"""
    names = {}
    p = os.path.join(DATA_DIR, "etf_names.json")
    if os.path.exists(p):
        try:
            names.update(json.load(open(p, encoding="utf-8")))
        except Exception:
            pass
    names.update(ETFS)
    return names


def save_names(names):
    p = os.path.join(DATA_DIR, "etf_names.json")
    json.dump(names, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)


def load_tracked():
    """目前追蹤清單（內建 ∪ 會員關注），由 main 寫入 data/tracked.json。"""
    p = os.path.join(DATA_DIR, "tracked.json")
    if os.path.exists(p):
        try:
            return set(json.load(open(p, encoding="utf-8")))
        except Exception:
            pass
    return set(ETFS)


def save_tracked(codes):
    p = os.path.join(DATA_DIR, "tracked.json")
    json.dump(sorted(codes), open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)


def load_webapp_json(filename):
    path = os.path.join(WEBAPP_DIR, filename)
    if not os.path.exists(path):
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            value = json.load(f)
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def save_webapp_json(filename, value):
    os.makedirs(WEBAPP_DIR, exist_ok=True)
    path = os.path.join(WEBAPP_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(value, f, ensure_ascii=False, indent=2)


def update_reference_data(etf_ids):
    """更新證交所總覽與集保級距；來源暫時失敗時保留既有 JSON。"""
    overview = load_webapp_json("etf_overview.json")
    distribution = load_webapp_json("shareholder_distribution.json")
    fresh_overview = fetch_twse_etf_overviews(etf_ids)
    fresh_distribution = fetch_tdcc_distribution(etf_ids)
    overview.update(fresh_overview)
    distribution.update(fresh_distribution)
    save_webapp_json("etf_overview.json", overview)
    save_webapp_json("shareholder_distribution.json", distribution)
    print("參考資料已保存：ETF 總覽 {} 檔、股東分佈 {} 檔".format(len(overview), len(distribution)))
    return overview, distribution


def build_data_js(overview_data=None, distribution_data=None):
    """把追蹤中且有快照的 ETF 輸出成 webapp/data.js 供網頁讀取。"""
    names = load_names()
    tracked = load_tracked()
    overview_data = overview_data if overview_data is not None else load_webapp_json("etf_overview.json")
    distribution_data = distribution_data if distribution_data is not None else load_webapp_json("shareholder_distribution.json")
    # 內建 ETFS 依原順序在前，會員新增的代號排在後面
    ordered = list(ETFS.keys()) + sorted(c for c in tracked if c not in ETFS)
    payload = {
        "generated_at": datetime.datetime.now(TZ_TAIPEI).isoformat(timespec="seconds"),
        "etfs": {},
    }
    for etf_id in ordered:
        snapshots = load_snapshots(etf_id)
        if not snapshots:
            continue  # 尚無資料（例如剛加入、還沒更新過）的代號先不輸出
        div_path = os.path.join(DATA_DIR, "{}_dividends.json".format(etf_id))
        dividends = []
        if os.path.exists(div_path):
            with open(div_path, encoding="utf-8") as f:
                dividends = json.load(f)
        payload["etfs"][etf_id] = {
            "name": names.get(etf_id, etf_id), "snapshots": snapshots, "dividends": dividends,
            "overview": overview_data.get(etf_id),
            "shareholderDistribution": distribution_data.get(etf_id),
        }

    os.makedirs(WEBAPP_DIR, exist_ok=True)
    out = os.path.join(WEBAPP_DIR, "data.js")
    with open(out, "w", encoding="utf-8") as f:
        f.write("window.DATA = ")
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write(";\n")
    return out


def _hkey(h):
    """持股識別鍵：有代號用代號，無代號（海外股）用名稱。"""
    return h.get("code") or h["name"]


def summarize_diff(prev, curr):
    """比對兩份持股，回傳加減碼摘要（只給終端機印出用，網頁端另有計算）。"""
    # 現金、期貨、債券等非股票資產沒有 shares，不能參與股票加減碼計算。
    # 也防護來源資料偶發缺欄，避免單筆異常中止整批 ETF 更新。
    def stock_map(holdings):
        return {
            _hkey(h): h for h in holdings
            if h.get("assetType", "stock") == "stock"
        }

    prev_map = stock_map(prev)
    curr_map = stock_map(curr)
    added = [h for c, h in curr_map.items() if c not in prev_map]
    removed = [h for c, h in prev_map.items() if c not in curr_map]
    increased = decreased = 0
    for code in curr_map.keys() & prev_map.keys():
        curr_shares = curr_map[code].get("shares")
        prev_shares = prev_map[code].get("shares")
        if not isinstance(curr_shares, (int, float)) or not isinstance(prev_shares, (int, float)):
            continue
        d = curr_shares - prev_shares
        if d > 0:
            increased += 1
        elif d < 0:
            decreased += 1
    return added, removed, increased, decreased


def backfill_institutional_history(etf_ids, inst_cache, limit=3):
    """回補每支 ETF 最近幾個快照的法人資料，讓近三日表格首次啟用即完整。"""
    updated = 0
    for etf_id in etf_ids:
        snapshots = load_snapshots(etf_id)
        for snapshot in snapshots[-limit:]:
            data_date = snapshot["date"]
            if data_date not in inst_cache:
                print("== 回補 {} 三大法人買賣超（上市＋上櫃）==".format(data_date))
                inst_cache[data_date] = fetch_institutional(data_date)
            inst_data = inst_cache[data_date]
            changed = False

            self_inst = inst_data.get(etf_id)
            if self_inst and any(v is not None for v in self_inst.values()):
                snapshot["selfInstitutional"] = dict(self_inst, date=data_date)
                changed = True

            for holding in snapshot.get("holdings", []):
                if holding.get("assetType", "stock") != "stock":
                    continue
                code = holding.get("code")
                ins = inst_data.get(code) if code else None
                if ins and any(v is not None for v in ins.values()):
                    holding["inst"] = dict(ins, date=data_date)
                    changed = True

            if changed:
                path = os.path.join(DATA_DIR, "{}_{}.json".format(etf_id, data_date))
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(snapshot, f, ensure_ascii=False, indent=2)
                updated += 1
    print("法人歷史資料回補完成：更新 {} 份快照".format(updated))


QUOTE_FIELDS = ("open", "high", "low", "close", "prevClose", "change", "changePct", "amplitude", "volume", "quoteDate")


def backfill_quote_history(etf_ids, quote_cache):
    """依每份快照自己的日期回補行情，禁止用其他日期行情代替。

    歷史快照的持股日期與行情日期必須一致；若指定日期查不到行情，
    清除該筆可能殘留的行情欄位，避免畫面顯示錯誤的舊／最新行情。
    """
    updated = 0
    checked = 0
    for etf_id in etf_ids:
        snapshots = load_snapshots(etf_id)
        for snapshot in snapshots:
            data_date = snapshot["date"]
            if data_date not in quote_cache:
                print("== 回補 {} 指定日期行情（上市＋上櫃）==".format(data_date))
                quote_cache[data_date] = fetch_quotes(data_date)
            quotes = quote_cache[data_date]
            changed = False

            self_quote = quotes.get(etf_id)
            if self_quote:
                if snapshot.get("self") != self_quote:
                    snapshot["self"] = self_quote
                    changed = True
            elif snapshot.get("self") is not None:
                snapshot["self"] = None
                changed = True

            for holding in snapshot.get("holdings", []):
                if holding.get("assetType", "stock") != "stock" or holding.get("market") != "TW":
                    continue
                checked += 1
                quote = quotes.get(holding.get("code"))
                if quote:
                    for field, value in quote.items():
                        if holding.get(field) != value:
                            holding[field] = value
                            changed = True
                else:
                    for field in QUOTE_FIELDS:
                        if field in holding:
                            del holding[field]
                            changed = True

            if changed:
                path = os.path.join(DATA_DIR, "{}_{}.json".format(etf_id, data_date))
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(snapshot, f, ensure_ascii=False, indent=2)
                updated += 1
    print("行情歷史回補完成：更新 {} 份快照，檢查 {} 筆台股持股行情".format(updated, checked))


def validate_quote_dates(etf_ids):
    """檢查行情欄位不可標示成不同於快照的日期。"""
    issues = []
    for etf_id in etf_ids:
        for snapshot in load_snapshots(etf_id):
            data_date = snapshot["date"]
            self_quote = snapshot.get("self") or {}
            if self_quote.get("quoteDate") not in (None, data_date):
                issues.append((etf_id, data_date, "ETF", self_quote.get("quoteDate")))
            for holding in snapshot.get("holdings", []):
                quote_date = holding.get("quoteDate")
                if quote_date not in (None, data_date):
                    issues.append((etf_id, data_date, holding.get("code") or holding.get("name"), quote_date))
    if issues:
        print("! 行情日期一致性檢查失敗：{} 筆".format(len(issues)))
        for issue in issues[:20]:
            print("  {} 快照 {} / {} 行情 {}".format(*issue))
    else:
        print("行情日期一致性檢查通過：所有已填行情都對應快照日期")
    return issues


def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    # 會員關注代號（B 方案）：把大家關注、但不在內建清單的 ETF 一起納入追蹤
    member = fetch_member_codes()
    if member:
        print("== 會員關注代號 {} 檔：{} ==".format(len(member), ", ".join(member)))
    tracked = list(dict.fromkeys(list(ETFS.keys()) + member))
    save_tracked(tracked)

    args = [a.upper() for a in sys.argv[1:]]
    etf_ids = args or tracked
    names = load_names()

    quote_cache = {}
    inst_cache = {}
    margin_cache = {}

    for etf_id in etf_ids:
        etf_id = etf_id.upper()
        print("== 抓取 {} {} ==".format(etf_id, names.get(etf_id, etf_id)))
        try:
            page = fetch_html(etf_id)
            holdings = parse_holdings(page)
            data_date = parse_data_date(page)
        except Exception as exc:  # 網路或解析錯誤時不中斷其他 ETF
            print("  ! 抓取失敗：{}".format(exc))
            continue
        if not holdings:
            print("  ! 查無持股（可能非 ETF 或代號有誤），略過")
            continue

        if data_date not in quote_cache:
            print("== 抓取 {} 指定日期全市場行情（上市＋上櫃）==".format(data_date))
            quote_cache[data_date] = fetch_quotes(data_date)
        quotes = quote_cache[data_date]

        if data_date not in inst_cache:
            print("== 抓取 {} 三大法人買賣超（上市＋上櫃）==".format(data_date))
            inst_cache[data_date] = fetch_institutional(data_date)
        inst_data = inst_cache[data_date]
        if data_date not in margin_cache:
            print("== 抓取 {} 融資融券餘額（上市＋上櫃）==".format(data_date))
            margin_cache[data_date] = fetch_margin(data_date)
        margin_data = margin_cache[data_date]

        # 取「資料日期」之前最近一天的快照來比對，也可在指定日期尚無行情時沿用行情欄位。
        prev = [s for s in load_snapshots(etf_id) if s["date"] < data_date]
        prev_snapshot = prev[-1] if prev else None
        prev_map = {_hkey(h): h for h in (prev_snapshot or {}).get("holdings", [])}

        # 非內建代號：從頁面標題自動補上 ETF 名稱
        if etf_id not in ETFS:
            nm = parse_etf_name(page)
            if nm:
                names[etf_id] = nm

        # 併入當日行情（僅台股股票；現金／期貨等非股票資產不查股票行情）
        tw = [h for h in holdings if h.get("assetType", "stock") == "stock" and h.get("market") == "TW"]
        matched = 0
        inst_matched = 0
        margin_matched = 0
        for h in tw:
            q = quotes.get(h["code"])
            if q:
                h.update(q)
                matched += 1
            else:
                # 指定日期查不到行情時不可沿用前一日，避免把舊行情誤標成今日。
                for field in QUOTE_FIELDS:
                    h.pop(field, None)
            # 三大法人買賣超：優先用當日資料，缺漏則沿用最近一次（呈現「最近一次」）
            ins = inst_data.get(h["code"])
            if ins and any(v is not None for v in ins.values()):
                h["inst"] = dict(ins, date=data_date)
                inst_matched += 1
            elif _hkey(h) in prev_map and prev_map[_hkey(h)].get("inst"):
                h["inst"] = prev_map[_hkey(h)]["inst"]
            margin = margin_data.get(h["code"])
            if margin and any(v is not None for v in margin.values()):
                h["margin"] = dict(margin, date=data_date)
                margin_matched += 1
            elif _hkey(h) in prev_map and prev_map[_hkey(h)].get("margin"):
                h["margin"] = prev_map[_hkey(h)]["margin"]
        print("  行情對應（台股）：{}/{} 檔；三大法人：{}/{} 檔".format(
            matched, len(tw), inst_matched, len(tw)))
        print("  融資融券：{}/{} 檔".format(margin_matched, len(tw)))

        # 海外行情（美股/日股/韓股…，走 Yahoo）
        oversea = [h for h in holdings
                   if h.get("assetType", "stock") == "stock"
                   and h.get("market") not in (None, "", "TW")]
        if oversea:
            ok = fetch_oversea(oversea, data_date)
            no_code = sum(1 for h in holdings if not h.get("code"))
            note = "，另 {} 檔無代號無法查".format(no_code) if no_code else ""
            print("  海外行情：{}/{} 檔（Yahoo）{}".format(ok, len(oversea), note))

        prev_holdings = prev[-1]["holdings"] if prev else []
        # ETF 自身行情只能使用與持股快照相同的指定日期，不使用最新行情 fallback。
        self_quote = quotes.get(etf_id)
        if self_quote:
            print("  ETF 自身行情：{}（行情日 {}）".format(
                self_quote.get("close"), self_quote.get("quoteDate", "未知")))
        else:
            print("  ! ETF 自身行情：指定日期 {} 查無資料，保留空值".format(data_date))
        self_inst = inst_data.get(etf_id)
        if self_inst and any(v is not None for v in self_inst.values()):
            self_inst = dict(self_inst, date=data_date)
        self_margin = margin_data.get(etf_id)
        if self_margin and any(v is not None for v in self_margin.values()):
            self_margin = dict(self_margin, date=data_date)
        snapshot = save_snapshot(etf_id, holdings, data_date, self_quote, self_inst, self_margin)
        print("  已存 {} 檔持股（資料日期 {}）".format(snapshot["count"], snapshot["date"]))

        # 配息紀錄（歷次＋已公告未來）
        dividends = fetch_dividends(etf_id)
        div_path = os.path.join(DATA_DIR, "{}_dividends.json".format(etf_id))
        with open(div_path, "w", encoding="utf-8") as f:
            json.dump(dividends, f, ensure_ascii=False, indent=2)
        upcoming = sum(1 for d in dividends if d["ex"] >= today_str())
        print("  配息紀錄 {} 筆（未來 {} 筆）".format(len(dividends), upcoming))

        if prev_holdings:
            added, removed, inc, dec = summarize_diff(prev_holdings, holdings)
            print("  加減碼：新增 {} / 加碼 {} / 減碼 {} / 剔除 {}".format(
                len(added), inc, dec, len(removed)))
        else:
            print("  （首日資料，尚無可比對的前一交易日）")

    backfill_quote_history(etf_ids, quote_cache)
    backfill_institutional_history(etf_ids, inst_cache)
    backfill_margin_history(etf_ids, margin_cache)
    validate_quote_dates(etf_ids)
    save_names(names)
    overview_data, distribution_data = update_reference_data(etf_ids)
    out = build_data_js(overview_data, distribution_data)
    print("已更新網頁資料：{}".format(out))
    print("用瀏覽器開啟 webapp/index.html 即可查詢")


if __name__ == "__main__":
    main()
