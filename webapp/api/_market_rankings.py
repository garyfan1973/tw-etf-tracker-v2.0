"""Complete, same-session TWSE/TPEx official closing quotes for rankings."""
from concurrent.futures import ThreadPoolExecutor
import datetime as dt
import json
import math
from pathlib import Path
import re
import urllib.request


SAVED = Path(__file__).resolve().parents[1] / 'price-history/market-rankings/latest.json'
FEEDS = {
    'TWSE': 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',
    'TPEX': 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes',
}
SOURCES = {
    'TWSE': 'https://www.twse.com.tw/zh/trading/historical/mi-index.html',
    'TPEX': 'https://www.tpex.org.tw/zh-tw/mainboard/trading/info/mi-pricing/historical.html',
}


def numeric(value):
    try:
        result = float(str(value).strip().replace(',', ''))
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def market_date(value):
    text = str(value)
    if not re.fullmatch(r'\d{7}', text):
        raise ValueError('official ROC date missing')
    date = dt.date(int(text[:3]) + 1911, int(text[3:5]), int(text[5:]))
    if date > dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date():
        raise ValueError('official date is in the future')
    return date.isoformat()


def parse_quotes(payload, market):
    fields = ('Code', 'Name', 'ClosingPrice', 'HighestPrice', 'LowestPrice', 'TradeVolume', 'TradeValue') if market == 'TWSE' else (
        'SecuritiesCompanyCode', 'CompanyName', 'Close', 'High', 'Low', 'TradingShares', 'TransactionAmount')
    if not isinstance(payload, list) or not payload:
        raise ValueError('official quote feed unavailable')
    rows, dates, seen = [], set(), set()
    for raw in payload:
        code = str(raw.get(fields[0], '')).strip()
        # Ordinary shares and ETFs; exclude warrants, ETNs, preferred shares and
        # foreign-currency ETF counters (K/M/C/S) from TWD price/value rankings.
        if not re.fullmatch(r'[1-9]\d{3}|00\d{2,4}[A-Z]?', code) or code[-1] in 'KMCS':
            continue
        if any(field not in raw for field in (*fields, 'Change', 'Date')):
            raise ValueError('official quote schema changed')
        dates.add(market_date(raw['Date']))
        close, high, low, volume, amount = (numeric(raw[field]) for field in fields[2:])
        if close is None or close <= 0 or volume is None or volume <= 0 or amount is None or amount <= 0:
            continue
        if code in seen:
            raise ValueError('duplicate security in quote feed')
        seen.add(code)
        change = numeric(raw['Change'])
        reference = close - change if change is not None else None
        # Never infer a percentage from yesterday's unadjusted close on ex-dates.
        pct = change / reference * 100 if reference is not None and reference > 0 else None
        spread = round(high - low, 6) if high is not None and low is not None and high >= low > 0 else None
        rows.append({
            'code': code, 'name': str(raw[fields[1]]).strip(), 'exchange': market,
            'kind': 'etf' if code.startswith('00') else 'stock', 'close': close,
            'change': change, 'changePct': round(pct, 6) if pct is not None else None,
            'changeNote': str(raw['Change']).strip() if change is None else '',
            'high': high, 'low': low, 'spread': spread, 'volume': volume, 'turnover': amount,
        })
    if len(dates) != 1 or not rows:
        raise ValueError('official quote dates differ or no traded securities')
    return {'asOf': dates.pop(), 'rows': rows}


def fetch_quotes(market):
    request = urllib.request.Request(FEEDS[market], headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'})
    with urllib.request.urlopen(request, timeout=12) as response:
        return parse_quotes(json.load(response), market)


def load_latest():
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(fetch_quotes, FEEDS))
    if results[0]['asOf'] != results[1]['asOf']:
        raise ValueError('TWSE and TPEx closing dates differ')
    return {
        'schemaVersion': 1, 'asOf': results[0]['asOf'], 'quoteType': 'officialClose',
        'checkedAt': dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z'),
        'rows': sorted(results[0]['rows'] + results[1]['rows'], key=lambda row: (row['exchange'], row['code'])),
        'sources': SOURCES, 'fallback': False,
    }


def saved_snapshot():
    try:
        payload = json.loads(SAVED.read_text(encoding='utf-8'))
        if payload.get('schemaVersion') == 1 and payload.get('quoteType') == 'officialClose' and payload.get('asOf') and {
            row.get('exchange') for row in payload.get('rows', [])
        } == {'TWSE', 'TPEX'}:
            return payload
    except (OSError, ValueError, TypeError, AttributeError):
        pass
    return None


def build_payload():
    saved = saved_snapshot()
    try:
        payload = load_latest()
        if saved and saved['asOf'] > payload['asOf']:
            raise ValueError('official source returned an older session')
        return payload
    except Exception:
        if not saved:
            raise
        return {**saved, 'fallback': True}
