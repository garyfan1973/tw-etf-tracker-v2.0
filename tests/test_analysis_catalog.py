import json
from pathlib import Path
import tempfile
import unittest
from scripts.build_analysis_catalog import build_catalog


class AnalysisCatalogTests(unittest.TestCase):
    def test_catalog_uses_last_valid_close_and_requires_21_rows_for_return(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / 'webapp' / 'price-history' / 'TW'
            path.mkdir(parents=True)
            (root / 'webapp' / 'company_profiles.json').write_text(json.dumps({'2330': {'market': 'TW', 'name': '台積電'}}))
            rows = [{'date': f'2026-01-{i:02}', 'close': 100 + i} for i in range(1, 22)]
            rows.extend([{'date': '2026-01-22', 'close': None}, {'date': '2026-01-23', 'close': 0}])
            (path / '2330.json').write_text(json.dumps({'currency':'TWD','rows':rows}))
            (path / '0050.json').write_text(json.dumps({'rows': rows[:2]}))
            result = build_catalog(root)
            stock = next(a for a in result['assets'] if a['symbol']=='2330')
            self.assertEqual(stock['name'], '台積電')
            self.assertEqual(stock['asOf'], '2026-01-21')
            self.assertEqual(stock['count'], 21)
            self.assertAlmostEqual(stock['return20'], (121 / 101 - 1) * 100)
            self.assertIsNone(next(a for a in result['assets'] if a['symbol']=='0050')['return20'])
            before = (root / 'webapp' / 'price-history' / 'catalog.json').read_bytes()
            build_catalog(root)
            self.assertEqual(before, (root / 'webapp' / 'price-history' / 'catalog.json').read_bytes())

    def test_market_names_do_not_cross_contaminate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / 'webapp' / 'price-history' / 'JP'
            path.mkdir(parents=True)
            (root / 'webapp' / 'company_profiles.json').write_text(json.dumps({'1234': {'market':'TW', 'name':'wrong market'}}))
            (path / '1234.json').write_text(json.dumps({'rows':[{'date':'2026-01-01','close':100}]}))
            self.assertEqual(build_catalog(root)['assets'][0]['name'], '1234')


if __name__ == '__main__':
    unittest.main()
