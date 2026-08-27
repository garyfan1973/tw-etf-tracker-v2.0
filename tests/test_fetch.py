import unittest
from unittest.mock import patch

from fetch import fetch_json_retry, fetch_twse_etf_nav, summarize_diff, validate_quote_dates


class SummarizeDiffTests(unittest.TestCase):
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
