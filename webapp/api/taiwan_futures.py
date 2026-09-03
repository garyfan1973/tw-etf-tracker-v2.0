"""Taiwan index futures dashboard API."""
from http.server import BaseHTTPRequestHandler
import json

try:
    from api._taifex import build_snapshot
except ModuleNotFoundError:
    from webapp.api._taifex import build_snapshot


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            self.send_json(build_snapshot())
        except Exception:
            self.send_json({"ok": False, "error": "台指期官方資料暫時無法取得"}, 502)

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
