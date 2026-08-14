"""取得個股近三個完整年度的核心財務趨勢。"""
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, quote, urlparse
import datetime
import json
import re
import urllib.request

UA = "Mozilla/5.0 (compatible; ETFTracker/1.0)"
YAHOO_TIMESERIES = (
    "https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/{}"
    "?symbol={}&type={}&period1={}&period2={}"
)
METRICS = {
    "annualTotalRevenue": "revenue",
    "annualOperatingIncome": "operatingIncome",
    "annualNetIncome": "netIncome",
    "annualDilutedEPS": "eps",
}


def symbol_candidates(code, market):
    code, market = code.upper(), market.upper()
    if market == "TW":
        return [code + ".TW", code + ".TWO"]
    suffix = {"JP": ".T", "KS": ".KS", "HK": ".HK"}.get(market, "")
    return [(code.replace(".", "-") if market == "US" else code) + suffix]


def fetch_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=12) as response:
        return json.loads(response.read().decode("utf-8", errors="ignore"))


def parse_timeseries(payload, symbol):
    by_year = {}
    results = ((payload or {}).get("timeseries") or {}).get("result") or []
    for series in results:
        metric_type = next((kind for kind in METRICS if kind in series), None)
        if not metric_type:
            continue
        key = METRICS[metric_type]
        for item in series.get(metric_type) or []:
            date = str(item.get("asOfDate") or "")
            raw = ((item.get("reportedValue") or {}).get("raw"))
            if len(date) < 4 or not isinstance(raw, (int, float)):
                continue
            year = date[:4]
            row = by_year.setdefault(year, {"year": year, "date": date})
            row[key] = raw
            row["currency"] = item.get("currencyCode") or row.get("currency")
    rows = sorted(by_year.values(), key=lambda row: row["year"])
    # 只有四個核心欄位中至少三個存在才視為可比較的完整年度。
    rows = [row for row in rows if sum(row.get(key) is not None for key in METRICS.values()) >= 3]
    return {"symbol": symbol, "years": rows[-3:]}


def fetch_financials(code, market):
    now = datetime.datetime.now(datetime.timezone.utc)
    period2 = int((now + datetime.timedelta(days=2)).timestamp())
    period1 = int((now - datetime.timedelta(days=365 * 5)).timestamp())
    types = ",".join(METRICS)
    last_error = None
    for symbol in symbol_candidates(code, market):
        url = YAHOO_TIMESERIES.format(
            quote(symbol), quote(symbol), quote(types, safe=","), period1, period2)
        try:
            parsed = parse_timeseries(fetch_json(url), symbol)
            if parsed["years"]:
                return parsed
        except Exception as exc:  # 嘗試台股上市／上櫃兩種 Yahoo 後綴
            last_error = exc
    if last_error:
        raise last_error
    return {"symbol": symbol_candidates(code, market)[0], "years": []}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        code = (query.get("code", [""])[0] or "").strip().upper()
        market = (query.get("market", ["TW"])[0] or "TW").strip().upper()
        if not re.fullmatch(r"[0-9A-Z.\-]{1,12}", code):
            return self.send_json({"ok": False, "error": "標的代號格式不正確"}, 400)
        try:
            result = fetch_financials(code, market)
            payload, status = {"ok": True, "code": code, "market": market, **result}, 200
        except Exception:
            payload, status = {"ok": False, "error": "財務資料來源暫時無法連線"}, 502
        self.send_json(payload, status)

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
