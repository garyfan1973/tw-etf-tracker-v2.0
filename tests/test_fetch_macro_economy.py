import unittest

from fetch_macro_economy import column_series, parse_dgbas_xml, parse_fed_industrial_production, parse_fred_csv, period_date, transform_rows


class MacroEconomyDataTests(unittest.TestCase):
    def test_period_date_supports_iso_roc_month_and_quarter(self):
        self.assertEqual(period_date("2026M07"), "2026-07-01")
        self.assertEqual(period_date("11507"), "2026-07-01")
        self.assertEqual(period_date("2026Q2"), "2026-04-01")

    def test_fred_yoy_transform(self):
        content = "observation_date,CPI\n2024-01-01,100\n2025-01-01,103\n".encode()
        rows = parse_fred_csv(content, "CPI")
        self.assertEqual(transform_rows(rows, {"transform": "yoy", "periods": 1}), [{"date": "2025-01-01", "value": 3.0}])

    def test_dgbas_xml_selects_item_and_type(self):
        content = b"""<DataSet><Obs><Item>total GDP chain</Item><TIME_PERIOD>2026Q1</TIME_PERIOD><TYPE>year growth</TYPE><Item_VALUE>2.5</Item_VALUE></Obs><Obs><Item>other</Item><TIME_PERIOD>2026Q1</TIME_PERIOD><TYPE>year growth</TYPE><Item_VALUE>9</Item_VALUE></Obs></DataSet>"""
        rows = parse_dgbas_xml(content, ["GDP", "chain"], "growth")
        self.assertEqual(rows, [{"date": "2026-01-01", "value": 2.5}])

    def test_column_series_skips_missing_values(self):
        rows = [{"Date": "202601", "PMI": "51.2"}, {"Date": "202602", "PMI": "-"}]
        self.assertEqual(column_series(rows, "PMI"), [{"date": "2026-01-01", "value": 51.2}])

    def test_parse_fed_industrial_production_total_index(self):
        content = b'"B50001: Total index"\n"B50001" 2026 100.1 101.2 . 103.4\n'
        self.assertEqual(parse_fed_industrial_production(content), [
            {"date": "2026-01-01", "value": 100.1},
            {"date": "2026-02-01", "value": 101.2},
            {"date": "2026-04-01", "value": 103.4},
        ])


if __name__ == "__main__":
    unittest.main()
