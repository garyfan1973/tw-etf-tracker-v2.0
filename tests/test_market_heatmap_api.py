import importlib.util
from pathlib import Path
import unittest


PATH = Path(__file__).parents[1] / "webapp" / "api" / "market_heatmap.py"
SPEC = importlib.util.spec_from_file_location("market_heatmap_api", PATH)
API = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(API)


class MarketHeatmapTests(unittest.TestCase):
    def test_daily_items_filters_non_stock_codes_and_calculates_change(self):
        rows = [
            {"Date":"1150901","Code":"2330","Name":"台積電","ClosingPrice":"100","Change":"+2","TradeValue":"3000000"},
            {"Date":"1150901","Code":"0050","Name":"ETF","ClosingPrice":"50","Change":"+1","TradeValue":"9000000"},
            {"Date":"1150901","Code":"02001L","Name":"ETN","ClosingPrice":"10","Change":"0","TradeValue":"100"},
        ]
        items = API.daily_items(rows, "TWSE")
        self.assertEqual([item["symbol"] for item in items], ["2330"])
        self.assertAlmostEqual(items[0]["changePct"], 2.0408, places=4)
        self.assertEqual(items[0]["asOf"], "2026-09-01")

    def test_realtime_quote_overrides_price_change_and_turnover(self):
        items = [{"symbol":"2330","name":"台積電","market":"TWSE","price":100,"changePct":0,"turnover":1,"live":False}]
        result = API.merge_realtime(items, {"msgArray":[{"c":"2330","z":"105","y":"100","v":"20","t":"09:01:02"}]})
        self.assertEqual(result[0]["price"], 105)
        self.assertEqual(result[0]["changePct"], 5)
        self.assertEqual(result[0]["turnover"], 2_100_000)
        self.assertTrue(result[0]["live"])


if __name__ == "__main__":
    unittest.main()
