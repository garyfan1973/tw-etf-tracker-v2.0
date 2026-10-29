import importlib.util
import json
from pathlib import Path
import re
import sys
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
MODULE_PATH = ROOT / "webapp" / "api" / "financial-report.py"
SPEC = importlib.util.spec_from_file_location("financial_report_api", MODULE_PATH)
API = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(API)


class FinancialReportApiTests(unittest.TestCase):
    def report(self):
        return {
            "companyName": "測試公司", "period": "2026Q2", "headline": "測試摘要",
            "takeaway": "營收增加 [1]。", "growthAndProfit": "毛利率改善 [1]。",
            "cashFlowAndBalance": "現金流尚可核對。", "managementOutlook": "公司未提供正式財測。",
            "risks": ["原物料價格波動 [2]。"], "watchlist": ["營收", "自由現金流"],
            "missingData": ["未取得分析師共識"], "sources": [
                {"title": "官方財報", "url": "https://example.com/filing", "period": "2026Q2"},
                {"title": "虛構來源", "url": "https://fake.example/report", "period": "2026Q2"},
            ]
        }

    def test_validate_market_and_symbol(self):
        self.assertEqual(API.validate_request({"symbol": "2330", "market": "TW"}), ("2330", "TW"))
        self.assertEqual(API.validate_request({"symbol": "AAPL", "market": "US"}), ("AAPL", "US"))
        for payload in ({"symbol": "AAPL", "market": "TW"}, {"symbol": "../AAPL", "market": "US"}, {}):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                API.validate_request(payload)

    def test_sources_are_limited_to_actual_or_supplied_sources_and_citations_remapped(self):
        context = {
            "symbol": "AAPL", "market": "US", "todayTaipei": "2026-10-30",
            "financials": {"source": {"name": "市場資料", "url": "https://finance.example/data"}},
            "companyProfile": {},
        }
        response = {"output": [{"type": "web_search_call", "action": {"sources": [
            {"url": "https://example.com/filing"}, {"url": "http://insecure.example/filing"}
        ]}}]}
        cleaned = API.clean_report(self.report(), response, context)
        self.assertEqual([source["url"] for source in cleaned["sources"]], [
            "https://example.com/filing", "https://finance.example/data"])
        self.assertIn("[1]", cleaned["takeaway"])
        self.assertNotIn("[2]", cleaned["risks"])
        self.assertEqual(cleaned["dataAsOf"], "2026-10-30")
        self.assertEqual(cleaned["symbol"], "AAPL")

    @mock.patch.object(API, "request_json")
    def test_responses_request_uses_web_search_and_private_storage(self, request):
        response_report = self.report()
        response_report["sources"] = [{"title": "官方財報", "url": "https://example.com/filing", "period": "2026Q2"}]
        request.return_value = {"model": "test-model", "output": [
            {"type": "web_search_call", "action": {"sources": [{"url": "https://example.com/filing"}]}},
            {"type": "message", "content": [{"type": "output_text", "text": json.dumps(response_report, ensure_ascii=False)}]}
        ]}
        context = {"symbol": "2330", "market": "TW", "todayTaipei": "2026-10-30", "financials": {}, "companyProfile": {}}
        result, model = API.generate_report(context, "secret-test-key")
        sent = request.call_args.kwargs["payload"]
        self.assertEqual(sent["tools"][0]["type"], "web_search")
        self.assertEqual(sent["include"], ["web_search_call.action.sources"])
        self.assertFalse(sent["store"])
        self.assertEqual(model, "test-model")
        self.assertNotIn("secret-test-key", json.dumps(result))

    def test_database_completion_contract_includes_financial_report(self):
        migration = (ROOT / "supabase_financial_report_result.sql").read_text(encoding="utf-8")
        original = (ROOT / "supabase_chart_analysis.sql").read_text(encoding="utf-8")
        expected = {"symbol", "market", "period", "headline", "takeaway", "growthAndProfit",
                    "cashFlowAndBalance", "managementOutlook", "risks", "watchlist", "missingData", "sources", "dataAsOf"}
        for sql in (migration, original):
            match = re.search(r"jsonb_typeof\(p_result -> 'financialReport'\).*?array\[(.*?)\]", sql, re.S)
            self.assertIsNotNone(match)
            self.assertEqual(set(re.findall(r"'([^']+)'", match.group(1))), expected)
        self.assertIn("status = 'error'", migration)


if __name__ == "__main__":
    unittest.main()
