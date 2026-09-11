import unittest

from fetch_macro_economy import US_SERIES, column_series, make_series, parse_dgbas_xml, parse_fed_industrial_production, parse_fred_csv, period_date, transform_rows


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

    def test_ppi_uses_same_month_last_year_despite_missing_observations(self):
        rows = parse_fred_csv(b"observation_date,PPIFID\n2024-01-01,100\n2024-02-01,.\n2024-03-01,0\n2025-01-01,103\n2025-02-01,110\n2025-03-01,115\n2025-12-01,120\n", "PPIFID")
        config = next(item for item in US_SERIES if item["id"] == "us-ppi")
        self.assertEqual(transform_rows(rows, config), [{"date": "2025-01-01", "value": 3.0}])

    def test_ppi_series_metadata_and_percentage_point_change(self):
        for indicator, fred_id in [("us-ppi", "PPIFID"), ("us-core-ppi", "PPICOR")]:
            with self.subTest(indicator=indicator):
                config = next(item for item in US_SERIES if item["id"] == indicator)
                self.assertEqual(config["series"], fred_id)
                self.assertEqual(config["calendarMonths"], 12)
                self.assertIn("未季調", config["note"])
                rows = [{"date": "2024-01-01", "value": 100}, {"date": "2024-02-01", "value": 100}, {"date": "2025-01-01", "value": 103}, {"date": "2025-02-01", "value": 104}]
                result = make_series(config, transform_rows(rows, config))
                self.assertEqual(result["latest"], 4)
                self.assertEqual(result["change"], 1)
                self.assertEqual(result["unit"], "%")
                self.assertEqual(result["changeUnit"], "百分點")
                self.assertEqual(result["asOf"], "2025-02-01")
                self.assertNotIn("calendarMonths", result)

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
