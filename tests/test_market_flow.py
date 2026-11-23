import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import fetch_market_flow as flow

SPEC = importlib.util.spec_from_file_location('etf_estimates', Path(__file__).parents[1] / 'webapp/api/etf-estimates.py')
estimates = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(estimates)


class MarketFlowTests(unittest.TestCase):
    date = '2026-11-20'

    def table(self, fields, values):
        return {'date': '20261120', 'tables': [{'fields': fields, 'data': [values]}]}

    def test_source_date_must_match_requested_date(self):
        with self.assertRaises(ValueError):
            flow.tables({'date': '20261119', 'data': []}, self.date)
        with self.assertRaises(ValueError):
            flow.tables([{'Date': '20261120'}], self.date)

    def test_all_stock_and_etf_codes_but_not_warrants_etns_reits(self):
        for code in ['2330', '6488', '0050', '006208', '00981A', '00679B', '00636K', '00715L']:
            self.assertTrue(flow.universe(code), code)
        for code in ['020000', '01001T', '2330A', '731234', 'abc', '../0050']:
            self.assertFalse(flow.universe(code), code)

    def test_zero_is_not_missing_and_nonfinite_values_are_rejected(self):
        self.assertEqual(flow.number('0'), 0)
        self.assertEqual(flow.number('-1,000'), -1000)
        for value in [None, '', '--', 'nan', 'inf']:
            self.assertIsNone(flow.number(value))

    def test_twse_foreign_excludes_foreign_dealer_and_keeps_zero(self):
        payload = self.table(['證券代號', '外陸資買賣超股數(不含外資自營商)', '外資自營商買賣超股數', '投信買賣超股數', '自營商買賣超股數'], ['00981A', '-1000', '500', '0', '500'])
        result = flow.parse_flows(payload, self.date, 'TWSE')['00981A']
        self.assertEqual(result['foreign'], -1000)
        self.assertEqual(result['trust'], 0)
        self.assertEqual(result['dealer'], 500)

    def test_tpex_repeated_headers_use_correct_group(self):
        fields = ['代號', '名稱'] + ['買進股數', '賣出股數', '買賣超股數'] * 7 + ['三大法人買賣超股數合計']
        values = ['00411A', 'ETF'] + list(range(22))
        result = flow.parse_flows(self.table(fields, values), self.date, 'TPEX')['00411A']
        self.assertEqual(result['foreign'], values[4])
        self.assertEqual(result['trust'], values[13])
        self.assertEqual(result['dealer'], values[22])
        with self.assertRaises(ValueError):
            flow.parse_flows(self.table(fields[:-1], values[:-1]), self.date, 'TPEX')

    def test_sbl_does_not_confuse_margin_short_with_borrowed_short(self):
        fields = ['代號', '名稱', '前日餘額', '賣出', '買進', '現券', '今日餘額', '次一營業日限額', '前日餘額', '當日賣出', '當日還券', '當日調整', '當日餘額', '次一營業日可限額', '備註']
        row = ['00400A', 'ETF', '2,000', '2,000', '1,000', '0', '3,000', '600,000', '43,658,000', '447,000', '500,000', '0', '43,605,000', '600,000', '']
        result = flow.parse_sbl(self.table(fields, row), self.date)['00400A']
        self.assertEqual(result['shortChange'], -53000)
        self.assertEqual(result['shortBalance'], 43605000)
        self.assertEqual(result['marginShortBalance'], 3000)

    def test_tpex_volume_and_turnover_units_are_raw_shares_and_dollars(self):
        p = self.table(['代號', '名稱', '收盤 ', '成交股數  ', ' 成交金額(元)', '發行股數 '], ['00411A', 'ETF', '8.19', '12,493,000', '103,026,460', '481,076,000'])
        row = flow.parse_quotes(p, self.date, 'TPEX')['00411A']
        self.assertEqual(row['volume'], 12493000)
        self.assertEqual(row['turnover'], 103026460)
        self.assertIsNone(row['issuedUnits'], 'ETF issue bases must not be mixed with holdings statistics')

    def test_foreign_inventory_comes_from_official_holdings_not_flow_sums(self):
        p = self.table(['證券代號', '發行單位數', '全體外資及陸資持有單位數', '全體外資及陸資持股比率'], ['00411A', '469,576,000', '7,329,250', '1.56%'])
        row = flow.parse_holdings(p, self.date, 'TPEX')['00411A']
        self.assertEqual(row['foreignHolding'], 7329250)
        self.assertEqual(row['foreignHoldingPct'], 1.56)

    def test_nav_date_bounds_and_zero_premium(self):
        p = {'netPrice': [{'date': '2026/11/20', 'count': 10}, {'date': '2026/11/21', 'count': 11}], 'atmps': [{'date': '2026/11/20', 'count': 0}]}
        with patch.object(flow, 'fetch_json', return_value=p):
            result = flow.load_nav('0050', '2026-11-01', '2026-11-20')
        self.assertEqual(result, {'2026-11-20': {'nav': 10, 'premium': 0}})

    def test_estimates_pair_price_nav_from_same_issuer_disclosure(self):
        p = {'a1': [{'msgArray': [
            {'a': '00981A', 'b': 'ETF', 'c': '1000000', 'd': '-1000', 'e': '9.9', 'f': '10', 'g': '-1', 'h': '9', 'i': '20261123', 'j': '10:38:06'},
            {'a': '0050', 'e': '100', 'f': '0', 'i': '20261123', 'j': '10:00:00'},
        ]}]}
        rows = estimates.parse_estimates(p)
        self.assertEqual(len(rows), 1)
        self.assertAlmostEqual(rows[0]['estimatedPremium'], -1)
        self.assertEqual(rows[0]['previousNav'], 9)
        self.assertEqual(rows[0]['date'], '2026-11-23')
        self.assertEqual(rows[0]['unitsChange'], -1000)

    def test_tpex_yearless_nav_requires_matching_dated_close(self):
        import io
        import json
        payload = {'close1': [{'date': '11/20', 'count': 10}, {'date': '11/19', 'count': 11}],
                   'netPrice': [{'date': '11/20', 'count': 12}, {'date': '11/19', 'count': 13}],
                   'atmps': [{'date': '11/20', 'count': -1}]}
        snapshots = [{'date': '2026-11-20', 'rows': [{'code': '00411A', 'exchange': 'TPEX', 'close': 10}]},
                     {'date': '2026-11-19', 'rows': [{'code': '00411A', 'exchange': 'TPEX', 'close': 99}]}]
        response = io.BytesIO(json.dumps(payload).encode())
        with patch.object(flow.urllib.request, 'urlopen', return_value=response):
            result = flow.load_tpex_nav('00411A', snapshots)
        self.assertIn('2026-11-20', result)
        self.assertNotIn('2026-11-19', result)


if __name__ == '__main__':
    unittest.main()
