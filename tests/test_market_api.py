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

    def test_tw_market_falls_back_when_listed_request_errors(self):
        otc = {"chart": {"result": [{
            "timestamp": [1_700_000_000],
            "indicators": {"quote": [{"open": [10], "high": [11], "low": [9], "close": [10.5], "volume": [1000]}]},
            "meta": {"currency": "TWD"},
        }]}}
        with mock.patch.object(market_api, "fetch_json", side_effect=[OSError("listed missing"), otc]) as fetch:
            result = market_api.load_chart("6488", "TW")
        self.assertEqual(result["symbol"], "6488.TWO")
        self.assertEqual(fetch.call_count, 2)

    def test_twse_month_rows_use_official_share_volume(self):
        payload = {
            "fields": ["日期", "成交股數", "成交金額", "開盤價", "最高價", "最低價", "收盤價"],
            "data": [["115/08/21", "134,555,990", "3,880,623,529", "29.11", "29.12", "28.62", "28.72"]],
        }
        with mock.patch.object(market_api, "fetch_json", return_value=payload):
            rows = market_api.load_twse_month("00981A", "2026-08-21")

        self.assertEqual(rows, [{
            "date": "2026-08-21", "open": 29.11, "high": 29.12,
            "low": 28.62, "close": 28.72, "volume": 134555990.0,
        }])

    def test_tw_market_drops_non_trading_dates_from_latest_month(self):
        def timestamp(date):
            return int(market_api.datetime.datetime.fromisoformat(
                f"{date}T00:00:00+00:00"
            ).timestamp())

        yahoo_payload = {
            "chart": {"result": [{
                "timestamp": [timestamp("2026-09-20"), timestamp("2026-09-21")],
                "indicators": {"quote": [{
                    "open": [2460, 2445], "high": [2705, 2485],
                    "low": [2435, 2445], "close": [2460, 2480],
                    "volume": [5242511, 16086510],
                }]},
                "meta": {"currency": "TWD"},
            }]}}
        twse_payload = {
            "fields": ["日期", "成交股數", "成交金額", "開盤價", "最高價", "最低價", "收盤價"],
            "data": [["115/09/18", "35,352,856", "", "2460", "2460", "2435", "2460"],
                     ["115/09/21", "16,086,510", "", "2445", "2485", "2445", "2480"]],
        }
        with mock.patch.object(market_api, "fetch_json", side_effect=[yahoo_payload, twse_payload]):
            result = market_api.load_chart("2330", "TW")

        self.assertEqual([row["date"] for row in result["rows"]], ["2026-09-18", "2026-09-21"])


if __name__ == "__main__":
    unittest.main()
