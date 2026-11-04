import json
import unittest
from unittest.mock import patch

import fetch_macro_markets as markets


def report(date="20261104", amount_now="596,945,870", amount_prev="599,774,466"):
    return {
        "stat": "OK", "date": date,
        "tables": [{
            "fields": ["項目", "買進", "賣出", "現金(券)償還", "前日餘額", "今日餘額"],
            "data": [
                ["融資(交易單位)", "446,302", "404,510", "9,713", "9,482,836", "9,514,915"],
                ["融券(交易單位)", "48,514", "38,144", "779", "257,961", "246,812"],
                ["融資金額(仟元)", "30,947,037", "31,862,354", "1,913,279", amount_prev, amount_now],
            ],
        }],
    }


class MarketMarginTests(unittest.TestCase):
    def test_parses_market_summary_and_uses_reported_previous_balance(self):
        row = markets.parse_twse_market_margin(report(), "2026-11-04")
        self.assertEqual(row["marginBalanceThousandTwd"], 596945870)
        self.assertEqual(row["marginDeltaThousandTwd"], -2828596)
        self.assertEqual(row["marginBalanceLots"], 9514915)
        self.assertEqual(row["marginDeltaLots"], 32079)
        self.assertEqual(row["shortBalanceLots"], 246812)
        self.assertEqual(row["shortDeltaLots"], -11149)

    def test_rejects_wrong_date_and_incomplete_summary(self):
        with self.assertRaises(ValueError):
            markets.parse_twse_market_margin(report("20261103"), "2026-11-04")
        incomplete = report()
        incomplete["tables"][0]["data"].pop()
        with self.assertRaises(ValueError):
            markets.parse_twse_market_margin(incomplete, "2026-11-04")

    def test_refreshes_latest_date_and_keeps_old_row_on_source_error(self):
        old = markets.parse_twse_market_margin(report(amount_now="596,000,000"), "2026-11-04")
        with patch.object(markets, "read_url", side_effect=OSError("offline")):
            result = markets.update_twse_market_margin({"rows": [old]}, ["2026-11-04"])
        self.assertEqual(result["rows"], [old])
        with patch.object(markets, "read_url", return_value=json.dumps(report())):
            refreshed = markets.update_twse_market_margin({"rows": [old]}, ["2026-11-04"])
        self.assertEqual(refreshed["rows"][0]["marginBalanceThousandTwd"], 596945870)


if __name__ == "__main__":
    unittest.main()
