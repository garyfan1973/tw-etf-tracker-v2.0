import importlib.util
import pathlib
import unittest
from unittest import mock


MODULE_PATH = pathlib.Path(__file__).parents[1] / "webapp" / "api" / "financials.py"
SPEC = importlib.util.spec_from_file_location("financials_api", MODULE_PATH)
financials_api = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(financials_api)


class FinancialsApiTests(unittest.TestCase):
    def test_tw_symbol_uses_mops_company_code(self):
        self.assertEqual(financials_api.symbol_candidates("2330", "TW"), ["2330"])

    def test_tw_financials_do_not_fall_back_to_yahoo(self):
        expected = {"symbol": "2330", "years": [], "quarters": []}
        with mock.patch.object(financials_api, "fetch_mops_financials", return_value=expected) as mops, \
                mock.patch.object(financials_api, "fetch_yahoo_financials") as yahoo:
            result = financials_api.fetch_financials("2330", "TW")

        self.assertEqual(result, expected)
        mops.assert_called_once_with("2330")
        yahoo.assert_not_called()

    def test_parses_available_yahoo_years(self):
        payload = {"timeseries": {"result": []}}
        for source, key in financials_api.YAHOO_METRICS.items():
            payload["timeseries"]["result"].append({source: [
                {"asOfDate": f"{year}-12-31", "currencyCode": "TWD", "reportedValue": {"raw": value}}
                for year, value in [(2022, 1), (2023, 2), (2024, 3), (2025, 4)]
            ]})

        result = financials_api.parse_timeseries(payload, "2330.TW")

        self.assertEqual([row["year"] for row in result["years"]], ["2022", "2023", "2024", "2025"])
        self.assertEqual(result["years"][-1]["revenue"], 4)
        self.assertEqual(result["years"][-1]["eps"], 4)

    def test_parses_mops_annual_basic_eps_and_twd_thousands(self):
        result = {
            "titles": [
                {"main": "會計項目", "sub": []},
                {"main": "114年度", "sub": [{"main": "金額"}, {"main": "%"}]},
                {"main": "113年度", "sub": [{"main": "金額"}, {"main": "%"}]},
            ],
            "reportList": [
                ["營業收入合計", "237,553,199", "100", "232,302,584", "100"],
                ["營業利益（損失）", "43,948,688", "18.5", "51,612,570", "22.2"],
                ["本期淨利（淨損）", "41,534,748", "17.5", "47,106,256", "20.3"],
                ["基本每股盈餘", "", "", "", ""],
                ["　基本每股盈餘", "3.34", "", "3.80", ""],
                ["　稀釋每股盈餘", "3.31", "", "3.74", ""],
            ],
        }

        rows = financials_api.parse_mops_annual(result)

        self.assertEqual(rows["2025"]["eps"], 3.34)
        self.assertEqual(rows["2024"]["eps"], 3.80)
        self.assertEqual(rows["2025"]["revenue"], 237_553_199_000)

    def test_converts_mops_cumulative_values_to_quarters(self):
        html = """
        <table>
          <tr><td></td><td>第一季</td><td>前二季</td><td>前三季</td><td>前四季</td></tr>
          <tr><td>營業收入</td><td>100</td><td>230</td><td>390</td><td>600</td></tr>
          <tr><td>營業利益（損失）</td><td>20</td><td>45</td><td>75</td><td>110</td></tr>
          <tr><td>本期淨利（淨損）</td><td>10</td><td>24</td><td>42</td><td>64</td></tr>
          <tr><td>基本每股盈餘（元）</td><td>1.0</td><td>2.4</td><td>4.2</td><td>6.4</td></tr>
        </table>
        """

        rows = financials_api.parse_mops_quarters(html, 2025)

        self.assertEqual([row["year"] for row in rows], ["2025Q1", "2025Q2", "2025Q3", "2025Q4"])
        self.assertEqual(rows[1]["revenue"], 130_000)
        self.assertAlmostEqual(rows[3]["eps"], 2.2)


if __name__ == "__main__":
    unittest.main()
