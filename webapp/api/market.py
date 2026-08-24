"""Unified market quote and daily history endpoint backed by Yahoo Finance."""
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, quote, urlparse
import datetime
import json
import re
import urllib.request

UA = "Mozilla/5.0 (compatible; InvestmentResearchWorkspace/1.0)"
YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/{}?interval=1d&range=2y"
TWSE_MONTH = "https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date={}&stockNo={}&response=json"


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
