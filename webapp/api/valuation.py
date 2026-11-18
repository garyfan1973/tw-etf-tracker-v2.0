"""Public, cacheable five-year P/E and P/B river-chart history."""
from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import parse_qs, urlparse

try:
    from api._valuation import build_history
except ModuleNotFoundError:
    from webapp.api._valuation import build_history


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        code = query.get("code", [""])[0].strip()
        if query.get("market", ["TW"])[0].upper() != "TW":
            return self.send_json({"ok": False, "error": "估值河流圖目前僅支援台灣上市、上櫃普通股"}, 400)
        try:
            payload = build_history(code)
        except ValueError as error:
            return self.send_json({"ok": False, "error": str(error)}, 400)
        except Exception:
            return self.send_json({"ok": False, "error": "官方歷史估值暫時無法取得，請稍後重試"}, 502)
        return self.send_json(payload, 200)

    def send_json(self, payload, status):
        body = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400"
                         if status == 200 and not payload.get("failedMonths") else "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
