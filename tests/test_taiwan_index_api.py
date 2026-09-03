import importlib.util
from pathlib import Path
import unittest
from unittest import mock


PATH = Path(__file__).parents[1] / "webapp" / "api" / "taiwan_index.py"
SPEC = importlib.util.spec_from_file_location("taiwan_index_api", PATH)
API = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(API)


class TaiwanIndexApiTests(unittest.TestCase):
    @mock.patch.object(API.urllib.request, "urlopen")
    def test_fetch_quote_calculates_intraday_change(self, urlopen):
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = b'{"msgArray":[{"z":"46296.18","y":"46164.72","o":"46325.48","h":"46517.45","l":"45992.50","d":"20260903","t":"12:54:55"}]}'
        urlopen.return_value = response
        result = API.fetch_quote()
        self.assertEqual(result["latest"], 46296.18)
        self.assertEqual(result["date"], "2026-09-03")
        self.assertEqual(result["quoteLabel"], "盤中即時")
        self.assertAlmostEqual(result["change"], 131.46, places=2)
        self.assertAlmostEqual(result["changePct"], 0.2848, places=4)

    @mock.patch.object(API.urllib.request, "urlopen")
    def test_rejects_incomplete_quote(self, urlopen):
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = b'{"msgArray":[{"z":"-","y":"46164.72"}]}'
        urlopen.return_value = response
        with self.assertRaisesRegex(ValueError, "不完整"):
            API.fetch_quote()


if __name__ == "__main__":
    unittest.main()
