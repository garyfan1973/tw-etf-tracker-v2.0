import importlib.util
import pathlib
import unittest


MODULE_PATH = pathlib.Path(__file__).parents[1] / "webapp" / "api" / "financials.py"
SPEC = importlib.util.spec_from_file_location("financials_api", MODULE_PATH)
financials_api = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(financials_api)


class FinancialsApiTests(unittest.TestCase):
    def test_tw_symbols_try_listed_then_otc(self):
        self.assertEqual(financials_api.symbol_candidates("2330", "TW"), ["2330.TW", "2330.TWO"])

    def test_parses_and_keeps_latest_three_complete_years(self):
        payload = {"timeseries": {"result": []}}
        for source, key in financials_api.METRICS.items():
            payload["timeseries"]["result"].append({source: [
                {"asOfDate": f"{year}-12-31", "currencyCode": "TWD", "reportedValue": {"raw": value}}
                for year, value in [(2022, 1), (2023, 2), (2024, 3), (2025, 4)]
            ]})

        result = financials_api.parse_timeseries(payload, "2330.TW")

        self.assertEqual([row["year"] for row in result["years"]], ["2023", "2024", "2025"])
        self.assertEqual(result["years"][-1]["revenue"], 4)
        self.assertEqual(result["years"][-1]["eps"], 4)


if __name__ == "__main__":
    unittest.main()
