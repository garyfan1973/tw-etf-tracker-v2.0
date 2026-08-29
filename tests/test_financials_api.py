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
        self.assertEqual(result["years"][-1]["grossProfit"], 4)
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
                ["營業毛利（毛損）", "132,992,332", "56.0", "125,443,395", "54.0"],
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
        self.assertEqual(rows["2025"]["grossProfit"], 132_992_332_000)

    def test_parses_direct_mops_quarter_instead_of_subtracting_eps(self):
        result = {
            "titles": [
                {"main": "會計項目", "sub": []},
                {"main": "115年第2季", "sub": [{"main": "金額"}, {"main": "%"}]},
                {"main": "114年第2季", "sub": [{"main": "金額"}, {"main": "%"}]},
                {"main": "115年01月01日至115年06月30日", "sub": [{"main": "金額"}, {"main": "%"}]},
            ],
            "reportList": [
                ["營業收入合計", "42,889,818", "100", "32,466,045", "100", "80,336,273", "100"],
                ["營業毛利（毛損）", "24,017,915", "56.0", "16,882,343", "52.0", "44,184,841", "55.0"],
                ["營業利益（損失）", "6,651,152", "15.5", "1,509,357", "4.6", "9,407,786", "11.7"],
                ["本期淨利（淨損）", "13,342,387", "31.1", "260,125", "0.8", "18,723,125", "23.3"],
                ["　基本每股盈餘", "8.45", "", "0.02", "", "11.70", ""],
            ],
        }

        row = financials_api.parse_mops_direct_quarter(result, 2026, 2)

        self.assertEqual(row["year"], "2026Q2")
        self.assertEqual(row["eps"], 8.45)
        self.assertEqual(row["revenue"], 42_889_818_000)
        self.assertEqual(row["grossProfit"], 24_017_915_000)

    def test_converts_mops_cumulative_values_to_quarters(self):
        html = """
        <table>
          <tr><td></td><td>第一季</td><td>前二季</td><td>前三季</td><td>前四季</td></tr>
          <tr><td>營業收入</td><td>100</td><td>230</td><td>390</td><td>600</td></tr>
          <tr><td>營業毛利（毛損）</td><td>60</td><td>135</td><td>230</td><td>350</td></tr>
          <tr><td>營業利益（損失）</td><td>20</td><td>45</td><td>75</td><td>110</td></tr>
          <tr><td>本期淨利（淨損）</td><td>10</td><td>24</td><td>42</td><td>64</td></tr>
          <tr><td>基本每股盈餘（元）</td><td>1.0</td><td>2.4</td><td>4.2</td><td>6.4</td></tr>
        </table>
        """

        rows = financials_api.parse_mops_quarters(html, 2025)

        self.assertEqual([row["year"] for row in rows], ["2025Q1", "2025Q2", "2025Q3", "2025Q4"])
        self.assertEqual(rows[1]["revenue"], 130_000)
        self.assertEqual(rows[1]["grossProfit"], 75_000)
        self.assertAlmostEqual(rows[3]["eps"], 2.2)

    def test_parses_mops_cash_flow_totals(self):
        result = {
            "titles": [
                {"main": "會計項目", "sub": []},
                {"main": "114年度", "sub": [{"main": "金額"}]},
            ],
            "reportList": [
                ["營業活動之淨現金流入（流出）", "2,000"],
                ["投資活動之淨現金流入（流出）", "-800"],
                ["籌資活動之淨現金流入（流出）", "-300"],
                ["本期現金及約當現金增加（減少）數", "900"],
                ["期末現金及約當現金餘額", "5,000"],
            ],
        }

        rows = financials_api.parse_mops_cash_annual(result)

        self.assertEqual(rows["2025"]["operatingCashFlow"], 2_000_000)
        self.assertEqual(rows["2025"]["investingCashFlow"], -800_000)
        self.assertEqual(rows["2025"]["endingCash"], 5_000_000)

    def test_converts_mops_cash_flow_cumulative_quarter(self):
        result = {
            "titles": [
                {"main": "會計項目", "sub": []},
                {"main": "115年01月01日至115年06月30日", "sub": [{"main": "金額"}]},
            ],
            "reportList": [
                ["營業活動之淨現金流入（流出）", "2,300"],
                ["投資活動之淨現金流入（流出）", "-900"],
                ["籌資活動之淨現金流入（流出）", "-200"],
                ["本期現金及約當現金增加（減少）數", "1,200"],
                ["期末現金及約當現金餘額", "6,000"],
            ],
        }

        row = financials_api.parse_mops_cash_direct_quarter(result, 2026, 2)

        self.assertEqual(row["year"], "2026Q2")
        self.assertEqual(row["operatingCashFlow"], 2_300_000)
        self.assertEqual(row["freeCashFlow"], 1_400_000)


if __name__ == "__main__":
    unittest.main()
