import tempfile
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from webapp.api import _market_rankings as rankings
import fetch_market_rankings as batch


def quote(code='2330', **extra):
    return {'Date': '1151120', 'Code': code, 'Name': '測試股票', 'ClosingPrice': '105',
            'HighestPrice': '110', 'LowestPrice': '101', 'TradeVolume': '1,234,567',
            'TradeValue': '128000000', 'Change': '+5', **extra}


def otc_quote(**extra):
    return {'Date': '1151120', 'SecuritiesCompanyCode': '00679B', 'CompanyName': '測試 ETF',
            'Close': '26.15', 'High': '26.26', 'Low': '26.09', 'TradingShares': '56248000',
            'TransactionAmount': '1470790310', 'Change': '除息 ', **extra}


class MarketRankingsTests(unittest.TestCase):
    def test_handler_imports_from_the_vercel_project_root(self):
        result = subprocess.run([
            sys.executable, '-c',
            'from api.market_rankings import handler; from api._market_rankings import saved_snapshot; '
            'assert callable(handler.do_GET); assert saved_snapshot() is not None',
        ], cwd=Path(__file__).parents[1] / 'webapp', capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_numeric_quotes_have_actual_turnover_high_low_and_reference_based_change(self):
        block = rankings.parse_quotes([quote()], 'TWSE')
        row = block['rows'][0]
        self.assertEqual(block['asOf'], '2026-11-20')
        self.assertEqual(row['changePct'], 5)
        self.assertEqual(row['spread'], 9)
        self.assertEqual(row['volume'], 1234567)
        self.assertEqual(row['turnover'], 128000000)
        self.assertEqual(row['kind'], 'stock')

    def test_etfs_are_included_but_derivatives_fx_and_untraded_rows_are_excluded(self):
        rows = [quote(code) for code in ('2330', '00981A', '00631L', '00679B', '00636K', '00644M', '02001L', '030001', '2881A')]
        rows += [quote('2454', ClosingPrice='--'), quote('2317', TradeVolume='0'), quote('2303', TradeValue='NaN')]
        result = rankings.parse_quotes(rows, 'TWSE')['rows']
        self.assertEqual([row['code'] for row in result], ['2330', '00981A', '00631L', '00679B'])
        self.assertEqual(result[1]['kind'], 'etf')

    def test_ex_dividend_marker_is_not_invented_as_zero_change_or_percentage(self):
        row = rankings.parse_quotes([otc_quote()], 'TPEX')['rows'][0]
        self.assertIsNone(row['change'])
        self.assertIsNone(row['changePct'])
        self.assertEqual(row['changeNote'], '除息')
        self.assertAlmostEqual(row['spread'], .17)
        flat = rankings.parse_quotes([quote(Change='0')], 'TWSE')['rows'][0]
        self.assertEqual(flat['changePct'], 0)
        self.assertIsNone(rankings.parse_quotes([quote(Change='105')], 'TWSE')['rows'][0]['changePct'])

    def test_bad_dates_duplicates_or_changed_schema_cannot_publish_a_ranking(self):
        cases = [[], [quote(Date='20261120')], [quote(Date='1150230')],
                 [quote(), quote('2454', Date='1151119')], [quote(), quote()],
                 [{key: value for key, value in quote().items() if key != 'TradeValue'}]]
        for payload in cases:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                rankings.parse_quotes(payload, 'TWSE')

    def test_two_markets_must_share_the_same_session(self):
        blocks = {'TWSE': rankings.parse_quotes([quote()], 'TWSE'), 'TPEX': rankings.parse_quotes([otc_quote()], 'TPEX')}
        with patch.object(rankings, 'fetch_quotes', side_effect=lambda market: blocks[market]):
            payload = rankings.load_latest()
        self.assertEqual(payload['asOf'], '2026-11-20')
        self.assertEqual(len(payload['rows']), 2)
        self.assertEqual(payload['quoteType'], 'officialClose')
        blocks['TPEX']['asOf'] = '2026-11-19'
        with patch.object(rankings, 'fetch_quotes', side_effect=lambda market: blocks[market]), self.assertRaises(ValueError):
            rankings.load_latest()

    def test_fetch_failure_or_older_feed_uses_the_saved_complete_session(self):
        saved = {'schemaVersion': 1, 'asOf': '2026-11-20', 'quoteType': 'officialClose', 'rows': []}
        with patch.object(rankings, 'saved_snapshot', return_value=saved):
            with patch.object(rankings, 'load_latest', side_effect=OSError('offline')):
                result = rankings.build_payload()
            self.assertTrue(result['fallback'])
            self.assertEqual(result['asOf'], saved['asOf'])
            with patch.object(rankings, 'load_latest', return_value={**saved, 'asOf': '2026-11-19'}):
                self.assertTrue(rankings.build_payload()['fallback'])
        with patch.object(rankings, 'saved_snapshot', return_value=None), patch.object(rankings, 'load_latest', side_effect=OSError('offline')):
            with self.assertRaises(OSError):
                rankings.build_payload()

    def test_batch_failure_keeps_existing_snapshot_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'latest.json'
            path.write_text('existing snapshot')
            with patch.object(batch, 'SAVED', path), patch.object(batch, 'load_latest', side_effect=OSError('offline')):
                self.assertFalse(batch.update_saved())
            self.assertEqual(path.read_text(), 'existing snapshot')


if __name__ == '__main__':
    unittest.main()
