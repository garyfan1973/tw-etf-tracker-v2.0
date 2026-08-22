"""Unified market quote and daily history endpoint backed by Yahoo Finance."""
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, quote, urlparse
import datetime
import json
import re
import urllib.request

UA = "Mozilla/5.0 (compatible; ETFTracker/1.0)"
YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/{}?interval=1d&range=1y"


def fetch_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.loads(response.read().decode("utf-8", errors="ignore"))


def yahoo_symbol(code, market):
    if market == "TW":
        return code + ".TW"
    return code


def load_chart(code, market):
    symbols = [yahoo_symbol(code, market)]
    if market == "TW":
        symbols.append(code + ".TWO")
    for symbol in symbols:
        payload = fetch_json(YAHOO_CHART.format(quote(symbol, safe=".-=")))
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
            meta = result.get("meta") or {}
            return {"symbol": symbol, "meta": meta, "rows": rows[-260:]}
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
