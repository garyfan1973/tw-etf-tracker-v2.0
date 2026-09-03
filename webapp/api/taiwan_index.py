"""Intraday TAIEX quote backed by the Taiwan Stock Exchange MIS feed."""
from http.server import BaseHTTPRequestHandler
import json
import urllib.request


URL = "https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_t00.tw&json=1&delay=0"
UA = "Mozilla/5.0 (compatible; InvestmentResearchWorkspace/1.0)"


def number(value):
    try:
        return float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None


def fetch_quote():
    request = urllib.request.Request(URL, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=15) as response:
        payload = json.loads(response.read().decode("utf-8", errors="ignore"))
    row = (payload.get("msgArray") or [None])[0]
    if not row:
        raise ValueError("查無加權指數行情")
    latest, previous = number(row.get("z")), number(row.get("y"))
    if latest is None or previous is None or previous <= 0:
        raise ValueError("加權指數盤中行情不完整")
    raw_date = str(row.get("d") or "")
    date = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:8]}" if len(raw_date) == 8 else ""
    change = latest - previous
    return {"ok": True, "symbol": "^TWII", "latest": latest, "previousClose": previous,
            "change": round(change, 4), "changePct": round(change / previous * 100, 4),
            "open": number(row.get("o")), "high": number(row.get("h")), "low": number(row.get("l")),
            "date": date, "time": str(row.get("t") or ""), "quoteLabel": "盤中即時", "source": "臺灣證券交易所"}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            self.send_json(fetch_quote())
        except Exception:
            self.send_json({"ok": False, "error": "加權指數即時行情暫時無法取得"}, 502)

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "public, max-age=5, s-maxage=10, stale-while-revalidate=20")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
