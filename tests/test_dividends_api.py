import importlib.util
from pathlib import Path
import unittest
from unittest import mock


MODULE_PATH = Path(__file__).parents[1] / "webapp" / "api" / "dividends.py"
SPEC = importlib.util.spec_from_file_location("dividends_api", MODULE_PATH)
API = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(API)


class DividendApiTests(unittest.TestCase):
    def test_parses_roc_and_us_dates(self):
        self.assertEqual(API.iso_date("115/08/21"), "2026-08-21")
        self.assertEqual(API.iso_date("08/13/2026"), "2026-08-13")

    def test_tw_yahoo_falls_back_to_otc_after_request_error(self):
        otc = {"chart": {"result": [{
            "meta": {"currency": "TWD"},
            "events": {"dividends": {"one": {"date": 1_700_000_000, "amount": 1.5}}},
        }]}}
        with mock.patch.object(API, "fetch_json", side_effect=[OSError("listed missing"), otc]) as fetch:
            rows = API.yahoo_events("6488", "TW")
        self.assertEqual(fetch.call_count, 2)
        self.assertEqual(rows[0]["amount"], 1.5)

    def test_nasdaq_adds_payment_date(self):
        payload = {"data": {"dividends": {"rows": [{
            "exOrEffDate": "08/10/2026", "paymentDate": "08/13/2026",
            "amount": "$0.27", "currency": "USD",
        }]}}}
        with mock.patch.object(API, "fetch_json", return_value=payload):
            rows = API.nasdaq_events("AAPL", "stock")
        self.assertEqual(rows[0]["exDate"], "2026-08-10")
        self.assertEqual(rows[0]["payDate"], "2026-08-13")
        self.assertEqual(rows[0]["amount"], 0.27)

    def test_official_source_replaces_same_day_yahoo_rounding(self):
        yahoo = [{"exDate": "2026-08-10", "payDate": None, "amount": 0.27001,
                  "currency": "USD", "source": "Yahoo Finance"}]
        nasdaq = [{"exDate": "2026-08-10", "payDate": "2026-08-13", "amount": 0.27,
                   "currency": "USD", "source": "Nasdaq"}]
        with mock.patch.object(API, "yahoo_events", return_value=yahoo), \
             mock.patch.object(API, "nasdaq_events", return_value=nasdaq):
            rows = API.load("AAPL", "US", "stock")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["source"], "Nasdaq")
        self.assertEqual(rows[0]["payDate"], "2026-08-13")


if __name__ == "__main__":
    unittest.main()
