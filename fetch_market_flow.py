"""Date-validated TWSE/TPEx institutional flow, SBL and ETF NAV snapshots."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import datetime as dt
import json
import math
from pathlib import Path
import re
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'webapp/price-history/market-flow'
TAIPEI = dt.timezone(dt.timedelta(hours=8))
SOURCES = {
    'TWSE': 'https://www.twse.com.tw/zh/trading/foreign/t86.html',
    'TPEX': 'https://www.tpex.org.tw/zh-tw/mainboard/trading/major-institutional/detail/day.html',
    'sbl': 'https://www.twse.com.tw/zh/trading/margin/twt93u.html',
    'nav': 'https://www.twse.com.tw/zh/ETFortune/',
}


def number(value):
    try:
        n = float(str(value).replace(',', '').strip())
        return n if math.isfinite(n) else None
    except (ValueError, TypeError):
        return None


def read(path, fallback=None):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return fallback if fallback is not None else {}


def save(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, separators=(',', ':'), allow_nan=False, sort_keys=True) + '\n'
    if not path.exists() or path.read_text(encoding='utf-8') != text:
        temp = path.with_suffix('.tmp')
        temp.write_text(text, encoding='utf-8')
        temp.replace(path)


def fetch_json(url, form=None):
    body = urllib.parse.urlencode(form).encode() if form else None
    request = urllib.request.Request(url, data=body, headers={'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded'})
    with urllib.request.urlopen(request, timeout=12) as response:
        return json.load(response)


def tables(payload, date):
    if not isinstance(payload, dict) or str(payload.get('date')) != date.replace('-', ''):
        raise ValueError('source date mismatch')
    return payload.get('tables', [payload])


def named_rows(payload, date, required):
    for table in tables(payload, date):
        fields = [re.sub(r'<[^>]+>|\s+', '', str(f)) for f in table.get('fields', [])]
        if all(field in fields for field in required):
            return [dict(zip(fields, row)) for row in table.get('data', [])]
    raise ValueError('required source fields missing')


def universe(code):
    return bool(re.fullmatch(r'[1-9]\d{3}|00\d{2,4}[A-Z]?', code))


def parse_quotes(payload, date, market):
    fields = ('證券代號', '證券名稱', '收盤價', '成交股數', '成交金額') if market == 'TWSE' else ('代號', '名稱', '收盤', '成交股數', '成交金額')
    result = {}
    for row in named_rows(payload, date, fields[:3]):
        code = str(row[fields[0]]).strip()
        if not universe(code):
            continue
        close = number(row.get(fields[2]))
        result[code] = {'code': code, 'name': str(row[fields[1]]).strip(), 'exchange': market,
                        'kind': 'etf' if code.startswith('00') else 'stock', 'close': close,
                        'volume': number(row.get(fields[3])), 'turnover': number(row.get(fields[4], row.get('成交金額(元)'))),
                        # ETF units must use the holdings-statistics denominator,
                        # not the quote feed's potentially different issue basis.
                        'issuedUnits': number(row.get('發行股數')) if not code.startswith('00') else None,
                        'currency': 'FX' if code.startswith('00') and code[-1] in 'KMCS' else 'TWD'}
    return result


def parse_flows(payload, date, market):
    if market == 'TWSE':
        rows = named_rows(payload, date, ('證券代號', '外陸資買賣超股數(不含外資自營商)', '投信買賣超股數'))
        return {str(r['證券代號']).strip(): {
            'foreign': number(r.get('外陸資買賣超股數(不含外資自營商)')),
            'trust': number(r.get('投信買賣超股數')), 'dealer': number(r.get('自營商買賣超股數')),
            'foreignBuy': number(r.get('外陸資買進股數(不含外資自營商)')),
            'foreignSell': number(r.get('外陸資賣出股數(不含外資自營商)')),
        } for r in rows}
    # TPEx has repeated column names: validate the official grouped layout.
    for table in tables(payload, date):
        fields = table.get('fields', [])
        if len(fields) == 24 and fields[:5] == ['代號', '名稱', '買進股數', '賣出股數', '買賣超股數']:
            return {str(r[0]).strip(): {'foreign': number(r[4]), 'trust': number(r[13]), 'dealer': number(r[22]),
                                       'foreignBuy': number(r[2]), 'foreignSell': number(r[3])}
                    for r in table.get('data', []) if len(r) == 24}
    raise ValueError('TPEx institutional schema changed')


def parse_sbl(payload, date):
    for table in tables(payload, date):
        fields = table.get('fields', [])
        if len(fields) == 15 and fields[8:11] == ['前日餘額', '當日賣出', '當日還券']:
            result = {}
            for r in table.get('data', []):
                if len(r) != 15:
                    continue
                current, previous = number(r[12]), number(r[8])
                result[str(r[0]).strip()] = {'shortBalance': current, 'shortSold': number(r[9]),
                    'shortChange': current - previous if current is not None and previous is not None else None,
                    'marginShortBalance': number(r[6])}
            return result
    raise ValueError('SBL schema changed')


def parse_holdings(payload, date, market):
    names = ('發行股數', '全體外資及陸資持有股數', '全體外資及陸資持股比率') if market == 'TWSE' else ('發行單位數', '全體外資及陸資持有單位數', '全體外資及陸資持股比率')
    return {str(r['證券代號']).strip(): {'issuedUnits': number(r.get(names[0])),
            'issuedUnitsSource': 'official foreign-holdings statistics',
            'foreignHolding': number(r.get(names[1])), 'foreignHoldingPct': number(str(r.get(names[2], '')).replace('%', ''))}
            for r in named_rows(payload, date, ('證券代號', names[0], names[1]))}


def load_day(date):
    compact, slash = date.replace('-', ''), date.replace('-', '/')
    urls = {
        ('TWSE', 'quotes'): f'https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date={compact}&type=ALLBUT0999&response=json',
        ('TWSE', 'flows'): f'https://www.twse.com.tw/rwd/zh/fund/T86?date={compact}&selectType=ALLBUT0999&response=json',
        ('TWSE', 'sbl'): f'https://www.twse.com.tw/exchangeReport/TWT93U?date={compact}&response=json',
        ('TPEX', 'quotes'): f'https://www.tpex.org.tw/www/zh-tw/afterTrading/otc?date={slash}&type=EW&response=json',
        ('TPEX', 'flows'): f'https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date={slash}&type=Daily&sect=EW&response=json',
        ('TPEX', 'sbl'): f'https://www.tpex.org.tw/www/zh-tw/margin/sbl?date={slash}&response=json',
        ('TWSE', 'holdings'): f'https://www.twse.com.tw/rwd/zh/fund/MI_QFIIS?date={compact}&selectType=ALLBUT0999&response=json',
        ('TPEX', 'holdings'): f'https://www.tpex.org.tw/www/zh-tw/ETFReport/foreignETF?date={slash}&response=json',
    }
    parsed, failures = {}, []
    def load(key, url):
        market, category = key
        payload = fetch_json(url)
        if category == 'quotes': return parse_quotes(payload, date, market)
        if category == 'flows': return parse_flows(payload, date, market)
        if category == 'holdings': return parse_holdings(payload, date, market)
        return parse_sbl(payload, date)
    with ThreadPoolExecutor(max_workers=6) as pool:
        pending = {pool.submit(load, key, url): key for key, url in urls.items()}
        for future in as_completed(pending):
            key = pending[future]
            try:
                parsed[key] = future.result()
                if not parsed[key]: failures.append('/'.join(key))
            except Exception:
                failures.append('/'.join(key))
    rows = []
    for market in ('TWSE', 'TPEX'):
        for code, quote in parsed.get((market, 'quotes'), {}).items():
            rows.append({**quote, **parsed.get((market, 'flows'), {}).get(code, {}),
                         **parsed.get((market, 'sbl'), {}).get(code, {}),
                         **parsed.get((market, 'holdings'), {}).get(code, {})})
    return {'schemaVersion': 1, 'date': date, 'rows': rows, 'missingSources': sorted(failures),
            'coverage': {f'{m}/{k}': len(value) for (m, k), value in parsed.items()}}


def load_nav(code, start, end):
    p = fetch_json('https://www.twse.com.tw/zh/ETFortune/ajaxEtfInfoChart',
                   {'id': code, 'startDate': start.replace('-', '/'), 'endDate': end.replace('-', '/'), 'type': 'fundPric'})
    nav = {str(r.get('date', '')).replace('/', '-'): number(r.get('count')) for r in p.get('netPrice', [])}
    premiums = {str(r.get('date', '')).replace('/', '-'): number(r.get('count')) for r in p.get('atmps', [])}
    return {date: {'nav': value, 'premium': premiums.get(date)} for date, value in nav.items()
            if re.fullmatch(r'\d{4}-\d{2}-\d{2}', date) and start <= date <= end and value is not None and value > 0}


def load_tpex_nav(code, snapshots):
    request = urllib.request.Request(f'https://info.tpex.org.tw/api/etfProduct?lang=zh-tw&query={code}', data=b'', headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(request, timeout=12) as response:
        payload = json.load(response)
    # This official feed omits years. Resolve against saved trading dates and
    # require its matching close to agree with the dated official quote.
    prices = {r['date']: number(r.get('count')) for r in payload.get('close1', [])}
    navs = {r['date']: number(r.get('count')) for r in payload.get('netPrice', [])}
    premiums = {r['date']: number(r.get('count')) for r in payload.get('atmps', [])}
    result = {}
    for snapshot in snapshots:
        date = snapshot['date']; md = date[5:].replace('-', '/')
        row = next((r for r in snapshot['rows'] if r['code'] == code and r['exchange'] == 'TPEX'), {})
        close, reported = row.get('close'), prices.get(md)
        if close is not None and reported is not None and abs(close - reported) < .001 and navs.get(md) is not None and navs[md] > 0:
            result[date] = {'nav': navs[md], 'premium': premiums.get(md), 'source': 'TPEx ETF 訊息中心（同日收盤核對）'}
    return result


def update_market_flow(backfill=0):
    today = dt.datetime.now(TAIPEI).date()
    # Retest recent dates so late source publication/revisions can be captured.
    days = backfill or 7
    for offset in range(days - 1, -1, -1):
        date = (today - dt.timedelta(days=offset)).isoformat()
        if (today - dt.timedelta(days=offset)).weekday() > 4:
            continue
        path = OUT / (date + '.json')
        old = read(path)
        p = load_day(date)
        if not p['rows']:
            continue
        # Preserve previously successful source partitions if a refresh fails.
        if old.get('rows'):
            existing = {(r['exchange'], r['code']): r for r in old['rows']}
            for row in p['rows']:
                key = (row['exchange'], row['code'])
                if row.get('issuedUnits') is None and existing.get(key, {}).get('issuedUnits') is not None and row['exchange'] + '/holdings' in p['missingSources']:
                    row.pop('issuedUnits', None)
                existing[key] = {**existing.get(key, {}), **row}
            p['rows'] = list(existing.values())
        save(path, p)
        print(f"market flow {date}: {len(p['rows'])} securities; {len(p['missingSources'])} unavailable sources", flush=True)
    snapshots = [read(path) for path in sorted(OUT.glob('20??-??-??.json'))[-60:]]
    if not snapshots:
        return
    meta = read(OUT / 'etf-meta.json')
    try:
        basic = fetch_json('https://openapi.twse.com.tw/v1/opendata/t187ap47_L')
        for r in basic:
            code = str(r.get('基金代號', '')).strip()
            meta[code] = {'type': r.get('基金類型', ''), 'active': '主動' in str(r.get('基金類型', '')),
                          'domestic': '國內成分證券' in str(r.get('基金類型', '')) and r.get('是否包含國外成分股') == '否'}
    except Exception:
        pass
    save(OUT / 'etf-meta.json', meta)
    navs = read(OUT / 'nav.json')
    # Reuse the already updated official history from the existing ETF batch.
    for code, overview in read(ROOT / 'webapp/etf_overview.json').items():
        for row in overview.get('navHistory', []):
            if row.get('nav') is not None and row['nav'] > 0:
                navs.setdefault(code, {})[row['date']] = {'nav': row['nav'], 'premium': row.get('premiumPct')}
    codes = sorted({r['code'] for p in snapshots for r in p['rows'] if r['kind'] == 'etf'})
    start, end = snapshots[0]['date'], today.isoformat()
    otc = {r['code'] for p in snapshots for r in p['rows'] if r['exchange'] == 'TPEX' and r['kind'] == 'etf'}
    # Bound source load. Already-current histories need no repeat request.
    candidates = [c for c in codes if snapshots[-1]['date'] not in navs.get(c, {})]
    cursor = (today.toordinal() * 8 + dt.datetime.now(TAIPEI).hour // 3) * 80
    rotate = candidates[cursor % len(candidates):] + candidates[:cursor % len(candidates)] if candidates else []
    pending_codes = rotate[:80]
    failures = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        pending = {(pool.submit(load_tpex_nav, code, snapshots) if code in otc else pool.submit(load_nav, code, start, end)): code for code in pending_codes}
        for future in as_completed(pending):
            code = pending[future]
            try:
                values = future.result()
                if values: navs[code] = {**navs.get(code, {}), **values}
                else: failures.append(code)
            except Exception:
                failures.append(code)
    save(OUT / 'nav.json', navs)
    dates = [{'date': p['date'], 'missingSources': p['missingSources'], 'count': len(p['rows'])} for p in snapshots]
    complete = [p['date'] for p in snapshots if not any(x.endswith('/flows') or x.endswith('/quotes') for x in p['missingSources'])]
    available = sum(snapshots[-1]['date'] in navs.get(code, {}) for code in codes)
    known_calendar = {r.get('date') for r in read(ROOT / 'webapp/market_data.json').get('marketBreadth', {}).get('rows', [])}
    saved_dates = {p['date'] for p in snapshots}
    calendar_gaps = sorted(d for d in known_calendar if d and snapshots[0]['date'] <= d <= snapshots[-1]['date'] and d not in saved_dates)
    save(OUT / 'index.json', {'schemaVersion': 1, 'latest': (complete or [snapshots[-1]['date']])[-1],
        'dates': dates, 'sources': SOURCES, 'navUnavailable': [c for c in codes if snapshots[-1]['date'] not in navs.get(c, {})],
        'calendarGaps': calendar_gaps, 'navCheckedAt': today.isoformat()})
    print(f"ETF NAV: {available}/{len(codes)} current; dates={len(dates)}", flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--backfill', type=int, default=0, help='calendar days to backfill; default last seven days')
    update_market_flow(parser.parse_args().backfill)
