import datetime as dt
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from webapp.api import _valuation as core


class ValuationTests(unittest.TestCase):
    def test_dates_and_non_positive_missing_ratios(self):
        self.assertEqual(core.iso_date("115年10月01日"), "2026-10-01")
        self.assertEqual(core.iso_date("115/10/01"), "2026-10-01")
        self.assertIsNone(core.iso_date("115/02/30"))
        for value in [None, "--", "N/A", "0", "-12", "NaN", "Infinity"]:
            self.assertIsNone(core.positive(value))
        self.assertEqual(core.positive("1,234.5"), 1234.5)

    def test_twse_pairs_only_same_day_unadjusted_official_closes(self):
        ratios = {"fields": ["股價淨值比", "本益比", "日期", "財報年/季"], "data": [
            ["2", "10", "115年10月01日", "115/2"],
            ["3", "--", "115年10月02日", "115/2"],
            ["9", "90", "115年10月03日", "115/2"],
        ]}
        prices = {"fields": ["日期", "收盤價"], "data": [
            ["115/10/01", "100"], ["115/10/02", "120"], ["115/10/05", "150"], ["115/11/01", "160"]]}
        with patch.object(core, "fetch_json", side_effect=[ratios, prices]):
            rows = core.month_rows("2330", "TWSE", "2026-10")
        self.assertEqual([r["date"] for r in rows], ["2026-10-01", "2026-10-02", "2026-10-05"])
        self.assertEqual(rows[0]["eps"], 10)
        self.assertEqual(rows[0]["bookValue"], 50)
        self.assertIsNone(rows[1]["eps"])
        self.assertEqual(rows[1]["bookValue"], 40)
        self.assertIsNone(rows[2]["pe"], "Never reuse a ratio from another date")

    def test_tpex_field_order_whitespace_and_loss(self):
        ratios = {"tables": [{"fields": ["日期", "本益比", "殖利率(%)", "股利年度", "股價淨值比"],
                               "data": [["115/10/01", "-", "3", 114, "2"]]}]}
        prices = {"tables": [{"fields": ["日 期", "開盤", "收盤"], "data": [["115/10/01", "90", "100"]]}]}
        with patch.object(core, "fetch_json", side_effect=[ratios, prices]) as fetch:
            row = core.month_rows("6488", "TPEX", "2026-10")[0]
        self.assertIn("peQryStock", fetch.call_args_list[0].args[0])
        self.assertEqual(row["close"], 100)
        self.assertIsNone(row["eps"])
        self.assertEqual(row["bookValue"], 50)

    def test_schema_failure_is_not_cached_as_empty_history(self):
        with self.assertRaises(ValueError):
            core.parse_table({"stat": "OK", "fields": ["changed"], "data": []}, ("日期", "本益比"))
        self.assertEqual(core.parse_table({"stat": "很抱歉，沒有符合條件的資料!"}, ("日期",)), {})

    def test_exchange_catalog_normalizes_tpex_and_rejects_non_stocks(self):
        with tempfile.TemporaryDirectory() as directory:
            web = Path(directory)
            (web / "trade_assets.json").write_text(json.dumps({"assets": [
                {"market": "tw", "symbol": "6488", "asset_type": "stock", "exchange": "TPEx"},
                {"market": "tw", "symbol": "1234", "asset_type": "etf", "exchange": "TWSE"},
                {"market": "tw", "symbol": "2345", "asset_type": "stock", "exchange": "ESB"},
            ]}))
            with patch.object(core, "WEB", web):
                self.assertEqual(core.exchange_for("6488"), "TPEX")
                for symbol in ["1234", "2345", "9999"]:
                    with self.assertRaises(ValueError):
                        core.exchange_for(symbol)

    def test_invalid_codes_never_reach_network(self):
        with patch.object(core, "fetch_json") as fetch:
            for code in ["../2330", "0050", "AAPL", "23300", "2330&date=2020"]:
                with self.assertRaises(ValueError):
                    core.build_history(code)
            fetch.assert_not_called()

    def test_five_year_window_including_leap_day(self):
        months = core.requested_months(dt.date(2024, 2, 29))
        self.assertEqual(len(months), 61)
        self.assertEqual((months[0], months[-1]), ("2019-02", "2024-02"))

    def test_incremental_refresh_retries_missing_month_and_preserves_failed_month(self):
        today = dt.date(2026, 11, 18)
        months = core.requested_months(today)
        row = lambda date, close: {"date": date, "close": close, "pe": 10, "pb": 2}
        saved = {"completedMonths": [m for m in months if m != "2024-05"], "rows": [
            row("2021-10-01", 50), row("2024-04-01", 70), row("2026-10-01", 80), row("2026-11-01", 90)]}
        def fetch(code, exchange, month):
            if month == "2026-10":
                raise OSError("unavailable")
            if month == "2024-05":
                return [row("2024-05-01", 75)]
            return [row("2026-11-18", 100), row("2026-11-19", 110)]
        with patch.object(core, "exchange_for", return_value="TWSE"), patch.object(core, "month_rows", side_effect=fetch) as load:
            result = core.build_history("2330", saved=saved, today=today)
        self.assertEqual({call.args[2] for call in load.call_args_list}, {"2024-05", "2026-10", "2026-11"})
        self.assertEqual(result["failedMonths"], ["2026-10"])
        self.assertNotIn("2026-10", result["completedMonths"])
        self.assertEqual(result["asOf"], "2026-11-18")
        self.assertEqual([r["close"] for r in result["rows"]], [70, 75, 80, 100])
        self.assertTrue(result["rows"][-1]["gapBefore"])

    def test_total_failure_is_an_error(self):
        with patch.object(core, "exchange_for", return_value="TWSE"), patch.object(core, "month_rows", side_effect=OSError):
            with self.assertRaises(RuntimeError):
                core.build_history("2330", saved={}, today=dt.date(2026, 11, 18))

    def test_deadline_preserves_saved_history_and_marks_pending_months(self):
        today = dt.date(2026, 11, 18)
        saved = {"completedMonths": core.requested_months(today), "rows": [
            {"date": "2026-10-01", "close": 100, "pe": 10, "pb": 2}]}
        with patch.object(core, "exchange_for", return_value="TWSE"), \
                patch.object(core, "month_rows", return_value=[]), \
                patch.object(core, "as_completed", side_effect=TimeoutError):
            result = core.build_history("2330", saved=saved, today=today)
        self.assertEqual(result["rows"][0]["close"], 100)
        self.assertEqual(result["failedMonths"], ["2026-10", "2026-11"])
        self.assertNotIn("2026-10", result["completedMonths"])


class ValuationApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("valuation_api", Path(__file__).parents[1] / "webapp/api/valuation.py")
        cls.api = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.api)

    def request(self, path, result=None, error=None):
        handler = self.api.handler.__new__(self.api.handler)
        handler.path = path
        handler.wfile = io.BytesIO()
        headers, statuses = {}, []
        handler.send_response = statuses.append
        handler.send_header = lambda key, value: headers.update({key: value})
        handler.end_headers = lambda: None
        with patch.object(self.api, "build_history", return_value=result, side_effect=error) as build:
            handler.do_GET()
        return statuses[0], headers, json.loads(handler.wfile.getvalue()), build

    def test_success_is_cacheable_but_partial_response_is_not(self):
        status, headers, _, _ = self.request("/api/valuation?code=2330&market=TW", {"ok": True, "rows": []})
        self.assertEqual(status, 200)
        self.assertIn("s-maxage=21600", headers["Cache-Control"])
        _, headers, _, _ = self.request("/api/valuation?code=2330", {"ok": True, "failedMonths": ["2025-01"]})
        self.assertEqual(headers["Cache-Control"], "no-store")

    def test_unsupported_market_and_invalid_symbol(self):
        status, _, _, build = self.request("/api/valuation?code=AAPL&market=US")
        self.assertEqual(status, 400)
        build.assert_not_called()
        status, headers, _, _ = self.request("/api/valuation?code=invalid", error=ValueError("invalid"))
        self.assertEqual(status, 400)
        self.assertEqual(headers["Cache-Control"], "no-store")

    def test_upstream_error_does_not_expose_internals(self):
        status, _, body, _ = self.request("/api/valuation?code=2330", error=RuntimeError("internal detail"))
        self.assertEqual(status, 502)
        self.assertNotIn("internal", body["error"])


if __name__ == "__main__":
    unittest.main()
