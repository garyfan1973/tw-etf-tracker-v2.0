"""Proxy issuer-disclosed ETF estimates; never combine with historical closes."""
from http.server import BaseHTTPRequestHandler
import datetime as dt
import json
import math
import re
import urllib.request

SOURCE = 'https://mis.twse.com.tw/stock/data/all_etf.txt'


def number(value):
    try:
        n = float(str(value).replace(',', ''))
        return n if math.isfinite(n) else None
    except (ValueError, TypeError):
        return None


def parse_estimates(payload):
    rows = {}
    for group in payload.get('a1', []):
        for row in group.get('msgArray', []):
            code, date, time = str(row.get('a', '')), str(row.get('i', '')), str(row.get('j', ''))
            if not re.fullmatch(r'00\d{2,4}[A-Z]?', code) or not re.fullmatch(r'\d{8}', date) or not re.fullmatch(r'\d{2}:\d{2}:\d{2}', time):
                continue
            price, nav = number(row.get('e')), number(row.get('f'))
            if price is None or nav is None or price <= 0 or nav <= 0:
                continue
            rows[code] = {'code': code, 'name': str(row.get('b', code)), 'price': price, 'estimatedNav': nav,
                'estimatedPremium': (price/nav-1)*100, 'disclosedPremium': number(row.get('g')),
                'issuedUnits': number(row.get('c')), 'unitsChange': number(row.get('d')),
                'previousNav': number(row.get('h')), 'date': f'{date[:4]}-{date[4:6]}-{date[6:]}', 'time': time}
    return sorted(rows.values(), key=lambda r: r['code'])


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            request = urllib.request.Request(SOURCE, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(request, timeout=15) as response:
                rows = parse_estimates(json.load(response))
            if not rows:
                raise ValueError('no estimates')
            payload, status = {'ok': True, 'rows': rows, 'source': SOURCE,
                'fetchedAt': dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(timespec='seconds')}, 200
        except Exception:
            payload, status = {'ok': False, 'error': '投信揭露的 ETF 預估淨值暫時無法取得，請稍後重試。'}, 502
        body = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=60' if status == 200 else 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
