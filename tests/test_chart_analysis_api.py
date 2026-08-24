import base64
import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).resolve().parents[1] / "webapp" / "api" / "chart-analysis.py"
SPEC = importlib.util.spec_from_file_location("chart_analysis_api", MODULE_PATH)
API = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(API)


class ChartAnalysisApiTests(unittest.TestCase):
    def image_data(self, size=32, mime="image/png"):
        return "data:{};base64,{}".format(mime, base64.b64encode(b"x" * size).decode())

    def test_validates_supported_image_and_normalizes_inputs(self):
        result = API.validate_payload({
            "imageData": self.image_data(),
            "mode": "low-entry",
            "symbol": " 2330 ",
            "screenshotTiming": "盤中",
            "proposedPrice": "128.5",
        })
        self.assertEqual(result["mode"], "low-entry")
        self.assertEqual(result["symbol"], "2330")
        self.assertEqual(result["proposedPrice"], 128.5)
        self.assertEqual(result["imageBytes"], 32)

    def test_rejects_unsupported_image_type(self):
        with self.assertRaisesRegex(ValueError, "只接受"):
            API.validate_payload({"imageData": self.image_data(mime="image/gif")})

    def test_rejects_invalid_mode_and_price(self):
        with self.assertRaisesRegex(ValueError, "模式"):
            API.validate_payload({"imageData": self.image_data(), "mode": "scalp"})
        with self.assertRaisesRegex(ValueError, "買進價"):
            API.validate_payload({"imageData": self.image_data(), "proposedPrice": -1})

    def test_prompt_keeps_symbol_as_label_not_market_data(self):
        prompt = API.build_user_prompt({
            "mode": "fast", "symbol": "SOXX", "screenshotTiming": "盤後", "proposedPrice": 300,
        })
        self.assertIn("快閃", prompt)
        self.assertIn("SOXX", prompt)
        self.assertIn("不可用它補造即時行情", prompt)
        self.assertIn("300", prompt)

    def test_extracts_structured_output_text(self):
        response = {"output": [{"type": "message", "content": [{"type": "output_text", "text": '{"readable":true}'}]}]}
        self.assertEqual(API.extract_output_text(response), '{"readable":true}')

    def test_bearer_token_requires_exact_scheme(self):
        self.assertEqual(API.bearer_token("Bearer abc.def"), "abc.def")
        self.assertEqual(API.bearer_token("abc.def"), "")
        self.assertEqual(API.bearer_token("Bearer a b"), "")


if __name__ == "__main__":
    unittest.main()
