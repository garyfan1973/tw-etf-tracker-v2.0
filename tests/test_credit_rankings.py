import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import fetch_credit_rankings as credit

DATE = '2026-11-20'


def otc(**extra):
    return {'Date': '1151120', 'SecuritiesCompanyCode': '6488', 'CompanyName': '測試上櫃',
            'MarginPurchaseBalancePreviousDay': '100', 'MarginPurchaseBalance': '120',
            'ShortSaleBalancePreviousDay': '30', 'ShortSaleBalance': '25', **extra}


def listed(**extra):
    return {'stat': 'OK', 'date': '20261120', 'tables': [{'fields': [
        '代號', '名稱', '買進', '賣出', '現金償還', '前日餘額', '今日餘額',
        '買進', '賣出', '現券償還', '前日餘額', '今日餘額'], 'data': [
        ['2330', '測試上市', '30', '5', '5', '100', '120', '1', '2', '6', '30', '25']]}], **extra}


class CreditRankingsTests(unittest.TestCase):
    def test_repeated_twse_fields_separate_sides_and_delta_includes_redemption(self):
        row = credit.parse_twse(listed(), DATE)['rows'][0]
        self.assertEqual((row['marginBalanceLots'], row['marginDeltaLots']), (120, 20))
        self.assertEqual((row['shortBalanceLots'], row['shortDeltaLots']), (25, -5))
        self.assertNotEqual(row['marginDeltaLots'], 30 - 5)

    def test_otc_balances_are_lots_not_shares_and_missing_is_not_zero(self):
        row = credit.parse_tpex([otc(MarginPurchaseBalancePreviousDay='', ShortSaleBalance='0')])['rows'][0]
        self.assertEqual(row['marginBalanceLots'], 120)
        self.assertIsNone(row['marginDeltaLots'])
        self.assertEqual(row['shortBalanceLots'], 0)
        self.assertEqual(row['shortDeltaLots'], -30)
        for value in ['NaN', '-1', '1.5']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                credit.parse_tpex([otc(MarginPurchaseBalance=value)])

    def test_bad_dates_schemas_and_duplicates_are_not_published(self):
        for rows in [[], [otc(Date='1151119'), otc()], [otc(), otc()], [{'Date': '1151120'}]]:
            with self.subTest(rows=rows), self.assertRaises(ValueError):
                credit.parse_tpex(rows)
        for payload in [listed(date='20261119'), listed(stat='no data'), listed(tables=[])]:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                credit.parse_twse(payload, DATE)
        with self.assertRaises(ValueError):
            credit.combine([credit.parse_tpex([otc()]), credit.parse_twse(listed(date='20261119'), '2026-11-19')], {})

    def test_twd_stocks_and_etfs_exclude_derivatives_and_fx_counters(self):
        codes = ['6488', '00981A', '00631L', '00636K', '00644M', '030001', '02001L', '2881A']
        result = credit.parse_tpex([otc(SecuritiesCompanyCode=c) for c in codes])['rows']
        self.assertEqual([r['code'] for r in result], codes[:3])
        self.assertEqual(result[1]['kind'], 'etf')

    def test_values_use_same_date_close_times_one_thousand_and_unpriced_lots_remain(self):
        blocks = [credit.parse_twse(listed(), DATE), credit.parse_tpex([otc()])]
        p = credit.combine(blocks, {('TWSE', '2330'): {'close': 50}})
        rows = {r['code']: r for r in p['rows']}
        self.assertEqual((p['asOf'], p['priceAsOf']), (DATE, DATE))
        self.assertEqual(rows['2330']['marginBalanceValue'], 6000000)
        self.assertEqual(rows['2330']['shortDeltaValue'], -250000)
        self.assertEqual(rows['6488']['marginBalanceLots'], 120)
        self.assertIsNone(rows['6488']['marginBalanceValue'])

    def test_wrong_date_saved_prices_are_never_used(self):
        with patch.object(credit, 'saved_snapshot', return_value={'asOf': '2026-11-23', 'rows': [{'close': 999}]}), patch.object(credit, 'fetch_json', return_value={}) as fetch, patch.object(credit, 'parse_quotes', side_effect=ValueError('date mismatch')):
            with self.assertRaises(ValueError):
                credit.quotes_for_date(DATE)
            self.assertTrue(all('20261120' in c.args[0] or '2026/11/20' in c.args[0] for c in fetch.call_args_list))

    def test_failed_or_regressed_update_preserves_saved_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'latest.json'
            original = json.dumps({'asOf': DATE, 'rows': []})
            path.write_text(original)
            with patch.object(credit, 'SAVED', path):
                with patch.object(credit, 'load_latest', side_effect=OSError('offline')):
                    self.assertFalse(credit.update_saved())
                with patch.object(credit, 'load_latest', return_value={'asOf': '2026-11-19'}):
                    self.assertFalse(credit.update_saved())
                self.assertEqual(path.read_text(), original)
                self.assertFalse(path.with_suffix('.tmp').exists())


if __name__ == '__main__':
    unittest.main()
