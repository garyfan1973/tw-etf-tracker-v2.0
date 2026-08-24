import base64
import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).parents[1] / "webapp" / "api" / "chart-analysis-email.py"
SPEC = importlib.util.spec_from_file_location("chart_analysis_email_api", MODULE_PATH)
API = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(API)


class ChartAnalysisEmailValidationTests(unittest.TestCase):
    def payload(self, **overrides):
        value = {
            "email": "member@example.com",
            "symbol": "2330",
            "assetName": "台積電",
            "date": "2026-08-24",
            "timing": "盤後",
            "pdfBase64": base64.b64encode(b"%PDF-1.4\n%%EOF").decode("ascii"),
        }
        value.update(overrides)
        return value

    def test_builds_subject_on_server(self):
        result = API.validate_payload(self.payload())
        self.assertEqual(result["subject"], "2330 台積電 2026-08-24 盤後 技術分析指引")

    def test_rejects_invalid_recipient(self):
        with self.assertRaisesRegex(ValueError, "Email"):
            API.validate_payload(self.payload(email="not-an-email"))

    def test_rejects_non_pdf_attachment(self):
        encoded = base64.b64encode(b"not a pdf").decode("ascii")
        with self.assertRaisesRegex(ValueError, "PDF"):
            API.validate_payload(self.payload(pdfBase64=encoded))

    def test_rejects_unrecognized_timing(self):
        with self.assertRaisesRegex(ValueError, "時點"):
            API.validate_payload(self.payload(timing="未知"))


if __name__ == "__main__":
    unittest.main()
