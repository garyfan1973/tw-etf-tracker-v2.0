"""Read timestamped top-100 snapshots from Yahoo Taiwan's public ranking pages.

The page's TableStore is JSON data; no page JavaScript is executed. A snapshot
belongs to one market/metric and must never be used as a full-market quote set.
"""
import datetime as dt
import json
import re
import urllib.request

from ._market_rankings import numeric

TAIPEI = dt.timezone(dt.timedelta(hours=8))
METRICS = {
    'volume': ('volume', '-volume'), 'gain': ('change-up', '-changePercent'),
    'loss': ('change-down', 'changePercent'), 'spread': ('day-range', '-dayHighLowDiff'),
    'price': ('price', '-price'), 'turnover': ('turnover', '-turnoverK'),
}
MARKETS = {'all': 'ALL', 'TWSE': 'TAI', 'TPEX': 'TWO'}


def market_open(now):
    return now.weekday() < 5 and dt.time(9) <= now.time().replace(tzinfo=None) < dt.time(13, 30)


def parse_snapshot(html, metric, market, now=None):
    now = (now or dt.datetime.now(TAIPEI)).astimezone(TAIPEI)
    marker = re.search(r'"TableStore"\s*:\s*', html)
    if not marker:
        raise ValueError('ranking data not present in public page')
    store = json.JSONDecoder().raw_decode(html[marker.end():])[0]['main-0-StockRanking']
    params = store['params']
    if params.get('exchange') != MARKETS[market] or params.get('sortBy') != METRICS[metric][1] or params.get('period') != '1D' or params.get('offset') != 0 or params.get('limit') != 100:
        raise ValueError('ranking market or metric mismatch')
    source_time = dt.datetime.fromisoformat(store['listMeta']['rankTime'])
    if source_time.tzinfo is None:
        raise ValueError('ranking timezone missing')
    source_time = source_time.astimezone(TAIPEI)
    age = (now - source_time).total_seconds()
    if source_time.date() != now.date() or age < -60 or (market_open(now) and age > 300):
        raise ValueError('ranking snapshot is not a current session or is stale')
    raw_rows = store['list']
    total = int(store['pagination']['resultsTotal'])
    if not isinstance(raw_rows, list) or len(raw_rows) > 100 or total < len(raw_rows) or (total > 0 and not raw_rows):
        raise ValueError('ranking scope is incomplete')
    rows, seen = [], set()
    for raw in raw_rows:
        symbol = re.fullmatch(r'([1-9]\d{3}|00\d{2,4}[A-Z]?)\.(TW|TWO)', str(raw.get('symbol', '')))
        if not symbol:
            continue
        code, suffix = symbol.groups()
        if code[-1] in 'KMCS':
            continue
        exchange = 'TWSE' if suffix == 'TW' else 'TPEX'
        if market != 'all' and market != exchange:
            raise ValueError('ranking includes a different exchange')
        if (exchange, code) in seen:
            raise ValueError('duplicate ranking security')
        seen.add((exchange, code))
        price, high, low, volume, amount_k = (numeric(raw[key]) for key in ('price', 'dayHigh', 'dayLow', 'volume', 'turnoverK'))
        if price is None or price <= 0 or volume is None or volume <= 0 or amount_k is None or amount_k <= 0:
            raise ValueError('ranking trade price, volume or actual turnover missing')
        source_rank = int(raw['rank'])
        if not 1 <= source_rank <= 100:
            raise ValueError('ranking position outside top 100')
        change = numeric(raw.get('change'))
        pct = numeric(str(raw.get('changePercent', '')).replace('%', ''))
        limit_up, limit_down = raw.get('limitUp') is True, raw.get('limitDown') is True
        if limit_up and limit_down:
            raise ValueError('conflicting current price limit flags')
        rows.append({
            'code': code, 'name': str(raw['name']), 'exchange': exchange,
            'kind': 'etf' if code.startswith('00') else 'stock', 'close': price,
            'change': change, 'changePct': pct, 'changeNote': '' if change is not None else str(raw.get('change') or '—'),
            'high': high, 'low': low, 'spread': round(high - low, 6) if high is not None and low is not None and high >= low > 0 else None,
            'volume': volume, 'turnover': amount_k * 1000, 'sourceRank': source_rank,
            'limitUp': limit_up, 'limitDown': limit_down,
        })
    return {
        'schemaVersion': 1, 'quoteType': 'intradaySnapshot', 'asOf': source_time.date().isoformat(),
        'sourceTime': source_time.isoformat(), 'checkedAt': now.isoformat(),
        'metric': metric, 'market': market, 'rankingScope': 'providerTop100',
        'sourceRows': len(raw_rows), 'sourceTotal': total, 'rows': rows,
        'sourceName': 'Yahoo 股市', 'sourceUrl': 'https://tw.stock.yahoo.com/rank/' + METRICS[metric][0] + '?exchange=' + MARKETS[market],
        'sessionState': 'open' if market_open(now) else 'closed', 'fallback': False,
    }


def load_snapshot(metric, market):
    url = 'https://tw.stock.yahoo.com/rank/' + METRICS[metric][0] + '?exchange=' + MARKETS[market]
    request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html'})
    with urllib.request.urlopen(request, timeout=8) as response:
        content = response.read(2 * 1024 * 1024 + 1)
    if len(content) > 2 * 1024 * 1024:
        raise ValueError('ranking page exceeds expected size')
    return parse_snapshot(content.decode('utf-8'), metric, market)
