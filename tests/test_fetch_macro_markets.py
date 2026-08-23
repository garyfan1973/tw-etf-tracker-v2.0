import datetime as dt
import unittest

from fetch_macro_markets import INDICES, build_currency, build_index, normalize_currency_rows, parse_treasury_csv, parse_yahoo_rows


class MacroMarketDataTests(unittest.TestCase):
    def test_parse_yahoo_rows_ignores_missing_closes(self):
        result = {
            "meta": {"gmtoffset": 0},
            "timestamp": [0, 86400, 172800],
            "indicators": {"quote": [{"open": [9.0, None, 12.0], "high": [11.0, None, 13.0], "low": [8.0, None, 11.5], "close": [10.0, None, 12.5], "volume": [100, None, 250]}]},
        }
        self.assertEqual(parse_yahoo_rows(result), [
            {"date": "1970-01-01", "open": 9.0, "high": 11.0, "low": 8.0, "close": 10.0, "volume": 100.0},
            {"date": "1970-01-03", "open": 12.0, "high": 13.0, "low": 11.5, "close": 12.5, "volume": 250.0},
        ])

    def test_currency_inversion_produces_usd_per_unit(self):
        rows = normalize_currency_rows([{"date": "2026-08-21", "close": 31.25}], "invert")
        self.assertEqual(rows, [{"date": "2026-08-21", "usdPerUnit": 0.032}])

    def test_identity_currency_is_one_us_dollar(self):
        item = build_currency({"code": "USD", "name": "美元", "symbol": None, "mode": "identity"}, today="2026-08-21")
        self.assertEqual(item["usdPerUnit"], 1.0)
        self.assertEqual(item["asOf"], "2026-08-21")

    def test_requested_market_symbols_are_included(self):
        symbols = {item["symbol"] for item in INDICES}
        self.assertIn("^NDX", symbols)
        self.assertIn("BZ=F", symbols)

    def test_index_summary_includes_volume_and_52_week_range(self):
        result = {
            "meta": {"gmtoffset": 0}, "timestamp": [0, 86400],
            "indicators": {"quote": [{"open": [9, 11], "high": [11, 13], "low": [8, 10], "close": [10, 12], "volume": [100, 250]}]},
        }
        item = build_index({"id":"demo","name":"Demo","region":"Test","symbol":"^TEST","currency":"USD"}, result)
        self.assertEqual(item["volume"], 250.0)
        self.assertEqual(item["week52Low"], 8.0)
        self.assertEqual(item["week52High"], 13.0)

    def test_parse_treasury_csv_maps_tenors_and_sorts(self):
        content = "Date,1 Mo,3 Mo,2 Yr,10 Yr,30 Yr\n08/21/2026,4.1,4.2,3.9,4.3,4.8\n08/20/2026,4.0,4.1,3.8,4.2,4.7\n"
        rows = parse_treasury_csv(content)
        self.assertEqual(rows[0]["date"], "2026-08-20")
        self.assertEqual(rows[-1]["rates"]["10Y"], 4.3)


if __name__ == "__main__":
    unittest.main()
