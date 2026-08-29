import unittest

from scripts import morning_context as MODULE


class MorningContextTests(unittest.TestCase):
    def test_cash_dividend_back_adjustment_separates_mechanical_gap(self):
        chart = {
            "priceRows": [
                {"date":"2026-08-17", "open":55.0, "high":55.35, "low":54.75, "close":55.15},
                {"date":"2026-08-18", "open":50.5, "high":50.5, "low":49.35, "close":49.48},
                {"date":"2026-08-19", "open":48.24, "high":48.98, "low":48.2, "close":48.54},
            ]
        }
        dividends = [{"exDate":"2026-08-18", "payDate":"2026-09-11", "amount":4.6,
                      "currency":"TWD", "source":"MoneyDJ"}]
        technical, actions = MODULE.dividend_adjusted_technical(chart, dividends)
        self.assertEqual(actions[0]["rawGapPct"], -10.28)
        self.assertEqual(actions[0]["dividendAdjustedReturnPct"], -1.94)
        self.assertAlmostEqual(technical["recentAdjustedRows"][0]["close"], 50.55, places=2)
        self.assertEqual(technical["latestClose"], 48.54)

    def test_normalizes_legacy_and_api_dividend_fields(self):
        rows = MODULE.normalize_dividends([
            {"ex":"2026-08-18", "pay":"2026-09-11", "amount":4.6},
            {"exDate":"2026-08-18", "payDate":None, "amount":4.6, "source":"Yahoo Finance"},
            {"ex":"invalid", "amount":"n/a"},
        ])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["exDate"], "2026-08-18")


if __name__ == "__main__":
    unittest.main()
