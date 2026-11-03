import unittest
from unittest.mock import patch

from fetch import fetch_json_retry, fetch_quotes, fetch_twse_etf_nav, summarize_diff, validate_quote_dates


class SummarizeDiffTests(unittest.TestCase):
    @patch("fetch.fetch_json")
    def test_fetch_quotes_uses_requested_tpex_history(self, fetch_json_mock):
        fetch_json_mock.side_effect = [
            {"tables": []},
            {
                "date": "20260803",
                "tables": [{
                    "fields": ["代號", "名稱", "收盤 ", "漲跌", "開盤 ", "最高 ", "最低", "成交股數  "],
                    "data": [["3105", "穩懋", "311.00", "+16.50", "298.50", "320.50", "298.50", "18,250,000"]],
                }],
            },
        ]

        quotes = fetch_quotes("2026-08-03")

        self.assertEqual(quotes["3105"], {
            "open": 298.5, "high": 320.5, "low": 298.5, "close": 311.0,
            "prevClose": 294.5, "change": 16.5, "changePct": 5.6,
            "amplitude": 7.47, "volume": 18250000.0, "quoteDate": "2026-08-03",
        })
        self.assertIn("date=2026/08/03", fetch_json_mock.call_args_list[1].args[0])

    @patch("fetch.fetch_json")
    def test_fetch_quotes_rejects_tpex_response_for_another_date(self, fetch_json_mock):
        fetch_json_mock.side_effect = [
            {"tables": []},
            {
                "date": "20261103",
                "tables": [{
                    "fields": ["代號", "收盤 ", "漲跌", "開盤 ", "最高 ", "最低", "成交股數  "],
                    "data": [["3105", "530.00", "-58.00", "555.00", "564.00", "530.00", "24,059,926"]],
                }],
            },
        ]

        self.assertNotIn("3105", fetch_quotes("2026-08-03"))

    def test_ignores_non_stock_assets_without_shares(self):
        previous = [
            {"code": "2330", "name": "台積電", "assetType": "stock", "shares": 100},
            {"code": "", "name": "台指期貨(B)", "assetType": "future", "quantity": 1},
        ]
        current = [
            {"code": "2330", "name": "台積電", "assetType": "stock", "shares": 120},
            {"code": "", "name": "台指期貨(B)", "assetType": "future", "quantity": 1},
        ]

        added, removed, increased, decreased = summarize_diff(previous, current)

        self.assertEqual(added, [])
        self.assertEqual(removed, [])
        self.assertEqual(increased, 1)
        self.assertEqual(decreased, 0)

    def test_ignores_malformed_stock_without_shares(self):
        previous = [{"code": "2330", "name": "台積電", "assetType": "stock"}]
        current = [{"code": "2330", "name": "台積電", "assetType": "stock", "shares": 120}]

        added, removed, increased, decreased = summarize_diff(previous, current)

        self.assertEqual((added, removed, increased, decreased), ([], [], 0, 0))

    @patch("fetch.time.sleep")
    @patch("fetch.fetch_json", side_effect=[ValueError("empty response"), [{"Code": "1234"}]])
    def test_retries_transient_json_failure(self, fetch_json_mock, sleep_mock):
        result = fetch_json_retry("https://example.test", attempts=2, delay=1)

        self.assertEqual(result, [{"Code": "1234"}])
        self.assertEqual(fetch_json_mock.call_count, 2)
        sleep_mock.assert_called_once_with(1)

    @patch("fetch.fetch_form_json")
    def test_builds_nav_history_by_matching_dates(self, form_json_mock):
        form_json_mock.return_value = {
            "netPrice": [{"date": "2026/08/12", "count": 105.58}, {"date": "2026/08/13", "count": 107.04}],
            "atmps": [{"date": "2026/08/12", "count": -0.36}, {"date": "2026/08/13", "count": -0.32}],
        }

        result = fetch_twse_etf_nav("0050", days=20)

        self.assertEqual(result, [
            {"date": "2026-08-12", "nav": 105.58, "premiumPct": -0.36},
            {"date": "2026-08-13", "nav": 107.04, "premiumPct": -0.32},
        ])
        self.assertEqual(form_json_mock.call_args.args[1]["id"], "0050")

    @patch("fetch.load_snapshots")
    def test_quote_date_validation_ignores_overseas_market_lag(self, load_snapshots_mock):
        load_snapshots_mock.return_value = [{
            "date": "2026-08-27",
            "self": {"quoteDate": "2026-08-27"},
            "holdings": [
                {"code": "2330", "market": "TW", "assetType": "stock", "quoteDate": "2026-08-27"},
                {"code": "NVDA", "market": "US", "assetType": "stock", "quoteDate": "2026-08-26"},
            ],
        }]

        self.assertEqual(validate_quote_dates(["0050"]), [])

    @patch("fetch.load_snapshots")
    def test_quote_date_validation_rejects_stale_taiwan_quote(self, load_snapshots_mock):
        load_snapshots_mock.return_value = [{
            "date": "2026-08-27",
            "self": {"quoteDate": "2026-08-27"},
            "holdings": [
                {"code": "2330", "market": "TW", "assetType": "stock", "quoteDate": "2026-08-26"},
            ],
        }]

        self.assertEqual(validate_quote_dates(["0050"]), [
            ("0050", "2026-08-27", "2330", "2026-08-26"),
        ])


if __name__ == "__main__":
    unittest.main()
