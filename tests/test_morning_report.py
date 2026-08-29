import datetime as dt
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest import mock


MODULE_PATH = Path(__file__).parents[1] / "scripts" / "morning_report.py"
SPEC = importlib.util.spec_from_file_location("morning_report", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FakeDb:
    def select(self, table, query):
        if table == "morning_report_settings":
            return [{"user_id": "member-1"}]
        if table == "morning_report_symbols":
            return [{"user_id":"member-1", "market":"TW", "asset_type":"stock", "symbol":"2330", "asset_name":"台積電", "sort_order":0}]
        if table == "ai_feature_access":
            return [{"user_id":"member-1", "enabled":True, "expires_at":(dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=2)).isoformat()}]
        return []

    def account_emails(self):
        return {"member-1": "member@example.com"}


class DeliveryDb:
    def __init__(self, subjects):
        self.subjects = subjects
        self.query = None

    def select(self, table, query):
        self.query = query
        return [{"subject": subject} for subject in self.subjects]


class FakeLocator:
    async def scroll_into_view_if_needed(self):
        pass

    async def screenshot(self, **kwargs):
        return b"jpeg"


class FakePage:
    def __init__(self):
        self.init_scripts = []
        self.wait_kwargs = None
        self.closed = False

    async def add_init_script(self, script):
        self.init_scripts.append(script)

    async def goto(self, *args, **kwargs):
        pass

    async def wait_for_function(self, expression, *, arg=None, **kwargs):
        self.wait_kwargs = {"arg": arg, **kwargs}

    async def evaluate(self, expression):
        if expression == "window.MarketChart.getAnalysisSnapshot()":
            return {"symbol": "2330"}

    def locator(self, selector):
        return FakeLocator()

    async def close(self):
        self.closed = True


class FakeBrowser:
    def __init__(self, page):
        self.page = page

    async def new_page(self, **kwargs):
        return self.page


class MorningReportTests(unittest.TestCase):
    def test_groups_eligible_subscriptions_by_asset(self):
        by_asset, by_user = MODULE.eligible_subscriptions(FakeDb())
        self.assertEqual(by_asset[("TW", "2330")]["asset"]["assetName"], "台積電")
        self.assertEqual(by_asset[("TW", "2330")]["users"][0]["email"], "member@example.com")
        self.assertEqual(by_user["member-1"][0]["symbol"], "2330")

    def test_pdf_markup_escapes_untrusted_text(self):
        markup = MODULE.analysis_html(
            {"symbol":"TEST", "assetName":"<script>alert(1)</script>"}, "2026-08-27",
            {"marketState":"中性", "conclusion":"<b>test</b>", "technicalPoints":[], "supportZones":[], "resistanceZones":[], "tradePlan":{}, "riskNotes":[]}, b"jpeg"
        )
        self.assertNotIn("<script>alert(1)</script>", markup)
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", markup)
        self.assertIn("&lt;b&gt;test&lt;/b&gt;", markup)
        self.assertIn("盤後", markup)

    def test_uses_latest_market_date_from_chart(self):
        self.assertEqual(
            MODULE.latest_market_date({"visibleRange":{"endDate":"2026-08-28"}}, "2026-08-29"),
            "2026-08-28",
        )
        self.assertEqual(MODULE.latest_market_date({}, "2026-08-29"), "2026-08-29")

    def test_force_rerun_flag_is_opt_in(self):
        with mock.patch.object(sys, "argv", ["morning_report.py"]):
            self.assertFalse(MODULE.parse_args().force)
        with mock.patch.object(sys, "argv", ["morning_report.py", "--force"]):
            self.assertTrue(MODULE.parse_args().force)

    def test_latest_sent_market_date_uses_subject_not_legacy_report_date(self):
        db = DeliveryDb([
            "00881 國泰台灣5G+ 2026-08-27 盤後 技術分析指引",
            "00881 國泰台灣5G+ 2026-08-28 盤後 綜合分析指引",
            "舊格式無日期",
        ])
        self.assertEqual(
            MODULE.latest_sent_market_date(db, "member-1", "TW", "00881"),
            "2026-08-28",
        )
        self.assertIn("status=eq.sent", db.query)

    def test_latest_sent_market_date_returns_none_without_parseable_subject(self):
        self.assertIsNone(
            MODULE.latest_sent_market_date(DeliveryDb([None, "舊格式"]), "u", "US", "QQQ")
        )


class MorningReportAsyncTests(unittest.IsolatedAsyncioTestCase):
    async def test_process_asset_skips_already_delivered_market_session(self):
        page = FakePage()
        db = DeliveryDb(["00881 國泰台灣5G+ 2026-08-28 盤後 綜合分析指引"])
        item = {
            "asset":{"market":"TW", "assetType":"etf", "symbol":"00881", "assetName":"國泰台灣5G+"},
            "users":[{"userId":"member-1", "email":"member@example.com"}],
        }
        with mock.patch.object(
            MODULE,
            "capture_chart",
            new=mock.AsyncMock(return_value=(b"jpeg", {"visibleRange":{"endDate":"2026-08-28"}})),
        ), mock.patch.object(MODULE, "service_post") as service_post:
            result = await MODULE.process_asset(
                db, FakeBrowser(page), "secret", {"id":"run-1"}, "2026-08-29",
                "https://example.com", item,
            )
        self.assertEqual(result, (0, 0))
        self.assertTrue(page.closed)
        service_post.assert_not_called()

    async def test_capture_applies_complete_six_month_chart_settings(self):
        page = FakePage()
        image, chart_data = await MODULE.capture_chart(
            page, "https://example.com",
            {"market":"TW", "symbol":"2330"},
        )
        self.assertEqual(page.wait_kwargs["arg"], {
            "symbol":"2330", "settings":MODULE.CHART_SETTINGS,
        })
        self.assertEqual(page.wait_kwargs["timeout"], 90_000)
        self.assertEqual(MODULE.CHART_SETTINGS, {
            "rangeDays":120,
            "mas":[5, 10, 20, 60, 120, 240],
            "volumeMas":[5, 10],
            "indicators":["bollinger", "kd", "macd", "rsi"],
        })
        init_script = page.init_scripts[0]
        self.assertTrue(init_script.strip().endswith("})();"))
        self.assertIn('localStorage.setItem("etf-chart-range"', init_script)
        self.assertIn('localStorage.setItem("etf-visible-indicators-v2"', init_script)
        self.assertEqual(image, b"jpeg")
        self.assertEqual(chart_data, {"symbol": "2330"})


if __name__ == "__main__":
    unittest.main()
