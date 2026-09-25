"""Unified market quote and daily history endpoint backed by Yahoo Finance."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, quote, urlencode, urlparse
import datetime
import json
import re
import urllib.request

UA = "Mozilla/5.0 (compatible; InvestmentResearchWorkspace/1.0)"
YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/{}?interval=1d&range=2y"
TWSE_MONTH = "https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date={}&stockNo={}&response=json"
TDCC_URL = "https://www.tdcc.com.tw/portal/zh/smWeb/qryStock"
TDCC_SOURCE = "https://www.tdcc.com.tw/portal/zh/smWeb/qryStock"


class ShareholderTableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self.row, self.cell = [], None, None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.row = []
        elif tag in {"td", "th"} and self.row is not None:
            self.cell = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag in {"td", "th"} and self.row is not None and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row:
            self.rows.append(self.row)
            self.row = None


def shareholder_fetch_page(url, data=None, cookie="", timeout=12):
    headers = {"User-Agent": "Mozilla/5.0 (compatible; ETFTracker/1.0)"}
    if data is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    if cookie:
        headers["Cookie"] = cookie
    request = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="ignore"), response.headers


def shareholder_number(value):
    text = re.sub(r"[^0-9.\-]", "", str(value or ""))
    try:
        return float(text) if text else None
    except ValueError:
        return None


def shareholder_iso_date(value):
    digits = re.sub(r"\D", "", str(value or ""))
    return f"{digits[:4]}-{digits[4:6]}-{digits[6:]}" if len(digits) == 8 else ""


def shareholder_parse_rows(page, code, date):
    parser = ShareholderTableParser()
    parser.feed(page)
    buckets = []
    for row in parser.rows:
        if len(row) < 5 or not row[0].isdigit() or "合計" in row[1].replace(" ", ""):
            continue
        holders, shares, holding_pct = shareholder_number(row[2]), shareholder_number(row[3]), shareholder_number(row[4])
        if holders is None or shares is None or holding_pct is None:
            continue
        buckets.append({"level": int(row[0]), "label": row[1], "holders": int(holders), "shares": int(shares), "holdingPct": holding_pct})
    if not buckets:
        return None
    total_holders, total_shares = sum(row["holders"] for row in buckets), sum(row["shares"] for row in buckets)
    for row in buckets:
        row["peoplePct"] = round(row["holders"] / total_holders * 100, 4) if total_holders else 0
    return {"date": shareholder_iso_date(date), "code": code, "totalHolders": total_holders, "totalShares": total_shares, "buckets": buckets}


def shareholder_fetch_distribution(code, date):
    page, headers = shareholder_fetch_page(TDCC_URL)
    token = re.search(r'name="SYNCHRONIZER_TOKEN" value="([^"]+)', page)
    cookie = headers.get("Set-Cookie", "").split(";", 1)[0]
    if not token or not cookie:
        return None
    body = urlencode({"SYNCHRONIZER_TOKEN": token.group(1), "SYNCHRONIZER_URI": "/portal/zh/smWeb/qryStock", "method": "submit", "firDate": date, "scaDate": date, "sqlMethod": "StockNo", "stockNo": code, "stockName": ""}).encode("utf-8")
    page, _ = shareholder_fetch_page(TDCC_URL, data=body, cookie=cookie)
    return shareholder_parse_rows(page, code, date)


def build_shareholder_payload(code, requested_weeks):
    page, _ = shareholder_fetch_page(TDCC_URL)
    dates = list(dict.fromkeys(re.findall(r'<option value="(\d{8})"', page)))[:requested_weeks]
    if not dates:
        raise RuntimeError("TDCC 查詢頁面暫時無法使用")
    results = []
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(shareholder_fetch_distribution, code, date): date for date in dates}
        for future in as_completed(futures):
            try:
                result = future.result()
            except Exception:
                result = None
            if result:
                results.append(result)
    results.sort(key=lambda item: item["date"])
    return {"ok": True, "code": code, "weeks": results, "source": {"name": "TDCC 集保戶股權分散表", "url": TDCC_SOURCE}, "fetchedAt": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(timespec="seconds")}


def fetch_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.loads(response.read().decode("utf-8", errors="ignore"))


def yahoo_symbol(code, market):
    if market == "TW":
        return code + ".TW"
    return code


def parse_twse_number(value):
    text = str(value or "").replace(",", "").strip()
    if not text or text in {"--", "---"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def load_twse_month(code, latest_date):
    date_key = str(latest_date or "").replace("-", "")
    payload = fetch_json(TWSE_MONTH.format(date_key, quote(code, safe="")))
    fields = payload.get("fields") or []
    required = ("日期", "成交股數", "開盤價", "最高價", "最低價", "收盤價")
    indexes = {name: fields.index(name) for name in required if name in fields}
    if len(indexes) < len(required):
        return []
    rows = []
    for values in payload.get("data") or []:
        try:
            roc_year, month, day = str(values[indexes["日期"]]).split("/")
            row = {
                "date": f"{int(roc_year) + 1911:04d}-{int(month):02d}-{int(day):02d}",
                "open": parse_twse_number(values[indexes["開盤價"]]),
                "high": parse_twse_number(values[indexes["最高價"]]),
                "low": parse_twse_number(values[indexes["最低價"]]),
                "close": parse_twse_number(values[indexes["收盤價"]]),
                "volume": parse_twse_number(values[indexes["成交股數"]]),
            }
            if row["close"] is not None:
                rows.append(row)
        except (ValueError, IndexError):
            continue
    return rows


def load_chart(code, market):
    symbols = [yahoo_symbol(code, market)]
    if market == "TW":
        symbols.append(code + ".TWO")
    for symbol in symbols:
        try:
            payload = fetch_json(YAHOO_CHART.format(quote(symbol, safe=".-=")))
        except Exception:
            continue
        result = (payload.get("chart", {}).get("result") or [None])[0]
        if not result:
            continue
        timestamps = result.get("timestamp") or []
        quote_data = ((result.get("indicators") or {}).get("quote") or [{}])[0]
        rows = []
        for index, timestamp in enumerate(timestamps):
            values = {key: (quote_data.get(key) or [None] * len(timestamps))[index] for key in ("open", "high", "low", "close", "volume")}
            if values["close"] is None:
                continue
            date = datetime.datetime.fromtimestamp(timestamp, datetime.timezone.utc).strftime("%Y-%m-%d")
            rows.append({"date": date, **values})
        if rows:
            source = "Yahoo Finance"
            if market == "TW" and symbol.endswith(".TW"):
                try:
                    official_rows = load_twse_month(code, rows[-1]["date"])
                    if official_rows:
                        merged = {row["date"]: row for row in rows}
                        merged.update({row["date"]: row for row in official_rows})
                        rows = [merged[key] for key in sorted(merged)][-520:]
                        source = "Yahoo Finance／臺灣證券交易所"
                except Exception:
                    pass
            meta = result.get("meta") or {}
            return {"symbol": symbol, "meta": meta, "source": source, "rows": rows[-520:]}
    raise ValueError("找不到行情資料")


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        code = (query.get("code", [""])[0] or "").strip().upper()
        market = (query.get("market", ["US"])[0] or "US").strip().upper()
        if (query.get("view", [""])[0] or "").strip().lower() == "shareholder":
            try:
                weeks = max(4, min(20, int(query.get("weeks", ["10"])[0])))
            except ValueError:
                weeks = 10
            if market != "TW" or not re.fullmatch(r"\d{4,6}", code):
                return self.send_json({"ok": False, "error": "股權分散資料目前僅支援台股代號"}, 400)
            try:
                return self.send_json(build_shareholder_payload(code, weeks), 200)
            except Exception as exc:
                return self.send_json({"ok": False, "error": "TDCC 股權分散資料暫時無法取得：{}".format(exc)}, 502)
        if not re.fullmatch(r"[0-9A-Z.\-]{1,12}", code) or market not in {"TW", "US"}:
            return self.send_json({"ok": False, "error": "標的代號或市場格式不正確"}, 400)
        try:
            result = load_chart(code, market)
            payload, status = {"ok": True, "code": code, "market": market, **result}, 200
        except Exception:
            payload, status = {"ok": False, "error": "行情來源暫時無法連線，請稍後再試"}, 502
        self.send_json(payload, status)

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=3600")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
