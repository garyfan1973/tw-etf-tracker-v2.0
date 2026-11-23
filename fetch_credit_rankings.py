#!/usr/bin/env python3
"""Save same-session official credit balances and explicitly estimated market values."""
from concurrent.futures import ThreadPoolExecutor
import datetime as dt
import json
from pathlib import Path
import re

from fetch_market_flow import fetch_json, parse_quotes
from webapp.api._market_rankings import market_date, saved_snapshot

SAVED = Path(__file__).resolve().parent / 'webapp/price-history/credit-rankings/latest.json'
TPEX = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_margin_balance'
SOURCES = {
    'TWSE': 'https://www.twse.com.tw/zh/trading/margin/mi-margn.html',
    'TPEX': 'https://www.tpex.org.tw/zh-tw/mainboard/trading/margin-trading/transactions.html',
}


def lots(value):
    text = str(value).strip().replace(',', '')
    if value is None or text in {'', '--', '---', '—'}:
        return None
    if not re.fullmatch(r'\d+', text):
        raise ValueError('invalid nonnegative official credit lots')
    return int(text)


def security(code, name, market, balances):
    code = str(code).strip()
    if not re.fullmatch(r'[1-9]\d{3}|00\d{2,4}[A-Z]?', code) or code[-1] in 'KMCS':
        return None
    result = {'code': code, 'name': str(name).strip(), 'exchange': market,
              'kind': 'etf' if code.startswith('00') else 'stock'}
    for side, (previous, current) in zip(('margin', 'short'), balances):
        previous, current = lots(previous), lots(current)
        result[side + 'BalanceLots'] = current
        result[side + 'DeltaLots'] = current - previous if current is not None and previous is not None else None
    return result


def parse_tpex(payload):
    if not isinstance(payload, list) or not payload:
        raise ValueError('TPEx credit report unavailable')
    dates, rows, seen = set(), [], set()
    fields = ('Date', 'SecuritiesCompanyCode', 'CompanyName', 'MarginPurchaseBalancePreviousDay',
              'MarginPurchaseBalance', 'ShortSaleBalancePreviousDay', 'ShortSaleBalance')
    for raw in payload:
        if any(field not in raw for field in fields):
            raise ValueError('TPEx credit schema changed')
        dates.add(market_date(raw['Date']))
        row = security(raw[fields[1]], raw[fields[2]], 'TPEX', [(raw[fields[3]], raw[fields[4]]), (raw[fields[5]], raw[fields[6]])])
        if row:
            if row['code'] in seen:
                raise ValueError('duplicate TPEx security')
            seen.add(row['code']); rows.append(row)
    if len(dates) != 1 or not rows:
        raise ValueError('TPEx credit session incomplete')
    return {'asOf': dates.pop(), 'rows': rows}


def parse_twse(payload, date):
    if not isinstance(payload, dict) or payload.get('stat') != 'OK' or str(payload.get('date')) != date.replace('-', ''):
        raise ValueError('TWSE credit session mismatch')
    table = next((t for t in payload.get('tables', []) if '代號' in t.get('fields', []) and '今日餘額' in t.get('fields', [])), None)
    if not table:
        raise ValueError('TWSE credit table missing')
    fields, rows, seen = table['fields'], [], set()
    previous = [i for i, f in enumerate(fields) if f == '前日餘額']
    current = [i for i, f in enumerate(fields) if f == '今日餘額']
    if len(previous) != 2 or len(current) != 2 or '名稱' not in fields:
        raise ValueError('TWSE credit schema changed')
    for raw in table.get('data', []):
        if len(raw) != len(fields):
            raise ValueError('truncated TWSE credit row')
        row = security(raw[fields.index('代號')], raw[fields.index('名稱')], 'TWSE', [(raw[p], raw[c]) for p, c in zip(previous, current)])
        if row:
            if row['code'] in seen:
                raise ValueError('duplicate TWSE security')
            seen.add(row['code']); rows.append(row)
    if not rows:
        raise ValueError('empty TWSE credit session')
    return {'asOf': date, 'rows': rows}


def quotes_for_date(date):
    saved = saved_snapshot()
    if saved and saved['asOf'] == date:
        return {(row['exchange'], row['code']): row for row in saved['rows']}
    compact, slash = date.replace('-', ''), date.replace('-', '/')
    urls = {
        'TWSE': f'https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date={compact}&type=ALLBUT0999&response=json',
        'TPEX': f'https://www.tpex.org.tw/www/zh-tw/afterTrading/otc?date={slash}&type=EW&response=json',
    }
    def load(market):
        return market, parse_quotes(fetch_json(urls[market]), date, market)
    with ThreadPoolExecutor(max_workers=2) as pool:
        blocks = list(pool.map(load, urls))
    if any(not rows for _, rows in blocks):
        raise ValueError('same-session closing quotes incomplete')
    return {(market, code): row for market, rows in blocks for code, row in rows.items()}


def combine(blocks, quotes):
    if len({block['asOf'] for block in blocks}) != 1 or {r['exchange'] for b in blocks for r in b['rows']} != {'TWSE', 'TPEX'}:
        raise ValueError('both credit markets must share a session')
    rows = []
    for block in blocks:
        for original in block['rows']:
            row = dict(original)
            price = quotes.get((row['exchange'], row['code']), {}).get('close')
            row['close'] = price if isinstance(price, (int, float)) and price > 0 else None
            for side in ('margin', 'short'):
                for measure in ('Balance', 'Delta'):
                    count = row[side + measure + 'Lots']
                    # Value of the share position, never actual financing debt,
                    # short-sale proceeds, or the change in marked-to-market value.
                    row[side + measure + 'Value'] = round(count * 1000 * row['close'], 2) if count is not None and row['close'] is not None else None
            rows.append(row)
    return {'schemaVersion': 1, 'quoteType': 'officialCredit', 'asOf': blocks[0]['asOf'],
            'priceAsOf': blocks[0]['asOf'], 'valueMethod': 'lots-times-1000-times-same-session-close',
            'checkedAt': dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
            'sources': SOURCES, 'rows': sorted(rows, key=lambda r: (r['exchange'], r['code']))}


def load_latest():
    otc = parse_tpex(fetch_json(TPEX))
    date = otc['asOf']
    listed = parse_twse(fetch_json(f'https://www.twse.com.tw/exchangeReport/MI_MARGN?date={date.replace("-", "")}&selectType=ALL&response=json'), date)
    return combine([listed, otc], quotes_for_date(date))


def update_saved():
    try:
        payload = load_latest()
        previous = json.loads(SAVED.read_text()) if SAVED.exists() else None
        if previous and previous['asOf'] > payload['asOf']:
            raise ValueError('source returned an older credit session')
        SAVED.parent.mkdir(parents=True, exist_ok=True)
        temporary = SAVED.with_suffix('.tmp')
        temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n', encoding='utf-8')
        temporary.replace(SAVED)
        print(f"credit rankings {payload['asOf']}: {len(payload['rows'])} securities", flush=True)
        return True
    except Exception as error:
        print(f'credit rankings: retained saved session; {error}', flush=True)
        return False


if __name__ == '__main__':
    raise SystemExit(0 if update_saved() else 1)
