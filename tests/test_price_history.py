import datetime
import unittest

from fetch_price_history import parse_rows, yahoo_symbol


class PriceHistoryTests(unittest.TestCase):
    def test_maps_market_symbols_to_yahoo_tickers(self):
        exchanges = {"0050": "TWSE", "6488": "TPEX"}

        self.assertEqual(yahoo_symbol({"market": "TW", "symbol": "0050"}, exchanges), "0050.TW")
        self.assertEqual(yahoo_symbol({"market": "TW", "symbol": "6488"}, exchanges), "6488.TWO")
        self.assertEqual(yahoo_symbol({"market": "US", "symbol": "NVDA"}, exchanges), "NVDA")
        self.assertEqual(yahoo_symbol({"market": "JP", "symbol": "7203"}, exchanges), "7203.T")

    def test_parses_rows_and_skips_missing_close(self):
        utc = datetime.timezone.utc
        first = int(datetime.datetime(2026, 8, 14, tzinfo=utc).timestamp())
        second = int(datetime.datetime(2026, 8, 15, tzinfo=utc).timestamp())
        result = {
            "meta": {"gmtoffset": 0},
            "timestamp": [first, second],
            "indicators": {"quote": [{
                "open": [100.12345, 101],
                "high": [102, 103],
                "low": [99, 100],
                "close": [101.98765, None],
                "volume": [123456, 999],
            }]},
        }

        self.assertEqual(parse_rows(result), [{
            "date": "2026-08-14",
            "open": 100.1235,
            "high": 102.0,
            "low": 99.0,
            "close": 101.9877,
            "volume": 123456,
        }])


if __name__ == "__main__":
    unittest.main()
