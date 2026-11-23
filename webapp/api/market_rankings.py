"""Timestamped intraday rankings with a complete official-close fallback."""
from http.server import BaseHTTPRequestHandler
import json
import time
from urllib.parse import parse_qs, urlparse

try:
    from api._market_rankings import build_payload, saved_snapshot
    from api._intraday_rankings import load_snapshot, METRICS, MARKETS
except ModuleNotFoundError:
    from webapp.api._market_rankings import build_payload, saved_snapshot
    from webapp.api._intraday_rankings import load_snapshot, METRICS, MARKETS

_cache = {}


def closing_payload():
    # The daily batch maintains this official same-session snapshot. Use it
    # immediately so an unavailable live feed cannot cause a second long wait.
    saved = saved_snapshot()
    return {**saved, 'fallback': True} if saved else build_payload()


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        mode, metric, market = (query.get(key, [default])[0] for key, default in [('mode', 'close'), ('metric', 'volume'), ('market', 'all')])
        if mode not in {'live', 'close'} or metric not in METRICS or market not in MARKETS:
            return self.send_json({'error': '不支援的行情模式、排行指標或市場。'}, 400)
        key = (mode, metric, market) if mode == 'live' else ('close',)
        try:
            cached = _cache.get(key)
            if cached and time.monotonic() < cached[0]:
                return self.send_json(cached[1], 200)
            if mode == 'live':
                try:
                    payload = load_snapshot(metric, market)
                except Exception:
                    payload = {**closing_payload(), 'intradayUnavailable': True}
            else:
                payload = closing_payload()
            ttl = 15 if mode == 'live' else 30 if payload.get('fallback') else 120
            _cache[key] = (time.monotonic() + ttl, payload)
            self.send_json(payload, 200)
        except Exception:
            self.send_json({'error': '排行資料暫時無法取得，請稍後重試。'}, 502)

    def send_json(self, payload, status):
        body = json.dumps(payload, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        cache = 'public, max-age=0, s-maxage=15' if payload.get('quoteType') == 'intradaySnapshot' or payload.get('intradayUnavailable') else 'public, max-age=30, s-maxage=120, stale-while-revalidate=300'
        self.send_header('Cache-Control', cache if status == 200 else 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
