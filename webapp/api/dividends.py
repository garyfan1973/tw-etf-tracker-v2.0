"""Normalized dividend events for Taiwan and US stocks/ETFs."""
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, quote, urlparse
import datetime
import json
import re
import urllib.request

UA = "Mozilla/5.0 (compatible; InvestmentResearchWorkspace/1.0)"
YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/{}?interval=1d&range=5y&events=dividends"
TWSE = "https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL"
NASDAQ = "https://api.nasdaq.com/api/quote/{}/dividends?assetclass={}"


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=18) as response:
        return json.loads(response.read().decode("utf-8-sig", errors="ignore"))


def iso_date(value):
    text = str(value or "").strip().replace("年", "/").replace("月", "/").replace("日", "")
    parts = re.findall(r"\d+", text)
    if len(parts) < 3:
        return None
    first, second, third = map(int, parts[:3])
    if third >= 1911:
        year, month, day = third, first, second
    else:
        year, month, day = first, second, third
    if year < 1911:
        year += 1911
    try:
        return datetime.date(year, month, day).isoformat()
    except ValueError:
        return None


def number(value):
    text = str(value or "").replace(",", "").strip()
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    return float(match.group()) if match else None


def yahoo_events(code, market):
    suffixes = [".TW", ".TWO"] if market == "TW" else [""]
    for suffix in suffixes:
        try:
            result = (fetch_json(YAHOO.format(quote(code + suffix, safe=".-="))).get("chart", {}).get("result") or [None])[0]
        except Exception:
            continue
        if not result:
            continue
        currency = (result.get("meta") or {}).get("currency") or ("TWD" if market == "TW" else "USD")
        rows = []
        for item in ((result.get("events") or {}).get("dividends") or {}).values():
            stamp = item.get("date")
            amount = item.get("amount")
            if stamp is None or amount is None:
                continue
            date = datetime.datetime.fromtimestamp(stamp, datetime.timezone.utc).date().isoformat()
            rows.append({"exDate": date, "payDate": None, "amount": float(amount), "currency": currency, "source": "Yahoo Finance"})
        return rows
    return []


def nasdaq_events(code, asset_type=None):
    classes = ["etf", "stocks"] if asset_type == "etf" else ["stocks", "etf"]
    for asset_class in classes:
        try:
            payload = fetch_json(NASDAQ.format(quote(code, safe=".-"), asset_class))
        except Exception:
            continue
        rows = (((payload.get("data") or {}).get("dividends") or {}).get("rows") or [])
        events = []
        for item in rows:
            ex_date = iso_date(item.get("exOrEffDate"))
            amount = number(item.get("amount"))
            if not ex_date or amount is None:
                continue
            events.append({"exDate": ex_date, "payDate": iso_date(item.get("paymentDate")),
                           "amount": amount, "currency": item.get("currency") or "USD",
                           "source": "Nasdaq"})
        if events:
            return events
    return []


def twse_events(code):
    rows = []
    try:
        payload = fetch_json(TWSE)
    except Exception:
        return rows
    for item in payload if isinstance(payload, list) else []:
        symbol = str(item.get("股票代號") or item.get("Code") or "").strip().upper()
        if symbol != code:
            continue
        date = iso_date(item.get("除權息日期") or item.get("Date"))
        amount = number(item.get("現金股利") or item.get("CashDividend"))
        label = str(item.get("除權息") or item.get("Type") or "")
        if date and amount is not None and (amount > 0 or "息" in label):
            rows.append({"exDate": date, "payDate": None, "amount": amount, "currency": "TWD", "source": "臺灣證券交易所"})
    return rows


def load(code, market, asset_type=None):
    historical = yahoo_events(code, market)
    official = twse_events(code) if market == "TW" else nasdaq_events(code, asset_type)
    merged = {}
    for item in historical + official:
        key = item["exDate"]
        current = merged.get(key)
        if current and not item.get("payDate"):
            item = {**item, "payDate": current.get("payDate")}
        if current is None or item["source"] in {"臺灣證券交易所", "Nasdaq"}:
            merged[key] = item
    return sorted(merged.values(), key=lambda row: row["exDate"])


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        code = (query.get("code", [""])[0] or "").strip().upper()
        market = (query.get("market", ["US"])[0] or "US").strip().upper()
        asset_type = (query.get("type", [""])[0] or "").strip().lower() or None
        if not re.fullmatch(r"[0-9A-Z.\-]{1,12}", code) or market not in {"TW", "US"} or asset_type not in {None, "stock", "etf"}:
            return self.send_json({"ok": False, "error": "標的代號或市場格式不正確"}, 400)
        try:
            events = load(code, market, asset_type)
            return self.send_json({"ok": True, "symbol": code, "market": market, "events": events})
        except Exception:
            return self.send_json({"ok": False, "error": "配息來源暫時無法連線"}, 502)

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "public, max-age=900, s-maxage=21600, stale-while-revalidate=86400")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
