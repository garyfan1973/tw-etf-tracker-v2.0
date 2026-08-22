import importlib.util
import pathlib
import unittest
from unittest import mock


MODULE_PATH = pathlib.Path(__file__).parents[1] / "webapp" / "api" / "market.py"
SPEC = importlib.util.spec_from_file_location("market_api", MODULE_PATH)
market_api = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(market_api)


class MarketApiTests(unittest.TestCase):
    def test_uses_two_year_daily_history(self):
        self.assertIn("interval=1d", market_api.YAHOO_CHART)
        self.assertIn("range=2y", market_api.YAHOO_CHART)

    def test_tw_market_falls_back_from_listed_to_otc_symbol(self):
        payloads = [
            {"chart": {"result": [None]}},
            {"chart": {"result": [{
                "timestamp": [1_700_000_000],
                "indicators": {"quote": [{"open": [10], "high": [11], "low": [9], "close": [10.5], "volume": [1000]}]},
                "meta": {"currency": "TWD"},
            }]}},
        ]
        with mock.patch.object(market_api, "fetch_json", side_effect=payloads) as fetch:
            result = market_api.load_chart("6488", "TW")

        self.assertEqual(result["symbol"], "6488.TWO")
        self.assertEqual(result["rows"][0]["close"], 10.5)
        self.assertEqual(fetch.call_count, 2)


if __name__ == "__main__":
    unittest.main()
