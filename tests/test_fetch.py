import unittest
from unittest.mock import patch

from fetch import fetch_json_retry, summarize_diff


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


if __name__ == "__main__":
    unittest.main()
