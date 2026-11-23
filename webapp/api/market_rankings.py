"""Latest official closing rankings, with a saved complete-session fallback."""
from http.server import BaseHTTPRequestHandler
import json
import time

try:
    from _market_rankings import build_payload
except ImportError:
    from webapp.api._market_rankings import build_payload

_cache = None
_expires = 0


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        global _cache, _expires
        try:
            if _cache is None or time.monotonic() >= _expires:
                _cache = build_payload()
                _expires = time.monotonic() + (30 if _cache.get('fallback') else 120)
            self.send_json(_cache, 200)
        except Exception:
            self.send_json({'error': '官方收盤排行暫時無法取得，請稍後重試。'}, 502)

    def send_json(self, payload, status):
        body = json.dumps(payload, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'public, max-age=30, s-maxage=120, stale-while-revalidate=300' if status == 200 else 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
