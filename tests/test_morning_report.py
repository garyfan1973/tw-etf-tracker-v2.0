import datetime as dt
import importlib.util
from pathlib import Path
import unittest


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


class FakeLocator:
    async def scroll_into_view_if_needed(self):
        pass

    async def screenshot(self, **kwargs):
        return b"jpeg"


class FakePage:
    def __init__(self):
        self.wait_kwargs = None

    async def goto(self, *args, **kwargs):
        pass

    async def wait_for_function(self, expression, *, arg=None, **kwargs):
        self.wait_kwargs = {"arg": arg, **kwargs}

    async def evaluate(self, expression):
        if expression == "window.MarketChart.getAnalysisSnapshot()":
            return {"symbol": "2330"}

    def locator(self, selector):
        return FakeLocator()


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


class MorningReportAsyncTests(unittest.IsolatedAsyncioTestCase):
    async def test_capture_passes_symbol_as_keyword_argument(self):
        page = FakePage()
        image, chart_data = await MODULE.capture_chart(
            page, "https://example.com",
            {"market":"TW", "symbol":"2330"},
        )
        self.assertEqual(page.wait_kwargs["arg"], "2330")
        self.assertEqual(page.wait_kwargs["timeout"], 90_000)
        self.assertEqual(image, b"jpeg")
        self.assertEqual(chart_data, {"symbol": "2330"})


if __name__ == "__main__":
    unittest.main()
