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
    def test_official_credit_risk_uses_dashboard_call_count_not_new_calls(self):
        payload = {"stat": "OK", "date": "20261120", "data": [
            {"date": "20261120", "keepRate": 151.78, "belowAccNum": 6462, "callAccNum": 6186},
            {"date": "20261119", "keepRate": 156.18, "belowAccNum": 2947, "callAccNum": 2500},
        ]}
        rows = markets.parse_twse_credit_risk(payload)
        self.assertEqual(rows[-1], {"date": "2026-11-20", "maintenanceRatio": 151.78, "marginCallAccounts": 6462})
        self.assertEqual(rows[0]["date"], "2026-11-19")

    def test_official_credit_risk_preserves_zero_and_rejects_missing_or_invalid_values(self):
        raw = {"date": "20261120", "keepRate": 151.78, "belowAccNum": 0}
        payload = {"stat": "OK", "date": "20261120", "data": [raw]}
        self.assertEqual(markets.parse_twse_credit_risk(payload)[0]["marginCallAccounts"], 0)
        for key, value in [("keepRate", None), ("keepRate", float("nan")), ("keepRate", 0),
                           ("belowAccNum", None), ("belowAccNum", -1), ("belowAccNum", 2.5),
                           ("belowAccNum", True), ("date", "20261121")]:
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                markets.parse_twse_credit_risk({**payload, "data": [{**raw, key: value}]})
        with self.assertRaises(ValueError):
            markets.parse_twse_credit_risk({**payload, "date": "20261123"})
        with self.assertRaises(ValueError):
            markets.parse_twse_credit_risk({**payload, "data": [raw, raw]})

    def test_credit_risk_refreshes_revisions_and_retains_previous_data_on_failure(self):
        old = {"date": "2026-11-20", "maintenanceRatio": 152.0, "marginCallAccounts": 6400}
        previous = {"rows": [old]}
        for error in [OSError("offline"), ValueError("invalid JSON")]:
            with patch.object(markets, "read_url", side_effect=error):
                self.assertEqual(markets.update_twse_credit_risk(previous)["rows"], [old])
        with patch.object(markets, "read_url", return_value=json.dumps({"stat": "OK", "date": "20261120", "data": [
            {"date": "20261120", "keepRate": 151.78, "belowAccNum": 6462},
        ]})):
            result = markets.update_twse_credit_risk(previous)
        self.assertEqual(result["asOf"], "2026-11-20")
        self.assertEqual(result["rows"][0]["marginCallAccounts"], 6462)

    def test_parses_market_summary_and_uses_reported_previous_balance(self):
        row = markets.parse_twse_market_margin(report(), "2026-11-04")
        self.assertEqual(row["marginBalanceThousandTwd"], 596945870)
        self.assertEqual(row["marginDeltaThousandTwd"], -2828596)
        self.assertEqual(row["marginBalanceLots"], 9514915)
        self.assertEqual(row["marginDeltaLots"], 32079)
        self.assertEqual(row["shortBalanceLots"], 246812)
        self.assertEqual(row["shortDeltaLots"], -11149)

    def test_estimates_listed_market_maintenance_ratio_from_balances_and_closes(self):
        margin_payload = report(amount_now="1,000,000")
        margin_payload["tables"].append({
            "fields": ["代號", "今日餘額"],
            "data": [["2330", "1,000"], ["0050", "2,000"]],
        })
        quote_payload = {
            "stat": "OK", "date": "20261104",
            "tables": [{"fields": ["證券代號", "收盤價"], "data": [["2330", "10"], ["0050", "20"]]}],
        }
        estimate = markets.parse_twse_market_maintenance_ratio(margin_payload, quote_payload, "2026-11-04")
        self.assertEqual(estimate["maintenanceRatioEstimate"], 5.0)
        self.assertEqual(estimate["maintenanceCoveragePct"], 100.0)

    def test_does_not_estimate_when_price_coverage_is_too_low(self):
        margin_payload = report(amount_now="1,000,000")
        margin_payload["tables"].append({
            "fields": ["代號", "今日餘額"],
            "data": [["2330", "100"], ["0050", "9,900"]],
        })
        quote_payload = {
            "stat": "OK", "date": "20261104",
            "tables": [{"fields": ["證券代號", "收盤價"], "data": [["2330", "10"]]}],
        }
        with self.assertRaises(ValueError):
            markets.parse_twse_market_maintenance_ratio(margin_payload, quote_payload, "2026-11-04")

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
        refreshed_payload = report()
        refreshed_payload["tables"].append({"fields": ["代號", "今日餘額"], "data": [["0050", "1,000"]]})
        quote_payload = {"stat": "OK", "date": "20261104", "tables": [{
            "fields": ["證券代號", "收盤價"], "data": [["0050", "50"]],
        }]}
        with patch.object(markets, "read_url", side_effect=[json.dumps(refreshed_payload), json.dumps(quote_payload)]):
            refreshed = markets.update_twse_market_margin({"rows": [old]}, ["2026-11-04"])
        self.assertEqual(refreshed["rows"][0]["marginBalanceThousandTwd"], 596945870)

    def test_parses_market_wide_institutional_buy_sell_amounts(self):
        payload = {
            "stat": "OK", "date": "20261104",
            "fields": ["單位名稱", "買進金額", "賣出金額", "買賣差額"],
            "data": [
                ["自營商(自行買賣)", "100", "80", "20"],
                ["自營商(避險)", "30", "40", "-10"],
                ["投信", "200", "150", "50"],
                ["外資及陸資(不含外資自營商)", "1,000", "1,200", "-200"],
                ["外資自營商", "0", "0", "0"],
                ["合計", "1,330", "1,470", "-140"],
            ],
        }
        row = markets.parse_twse_institutional_amounts(payload, "2026-11-04")
        self.assertEqual(row["foreignNetTwd"], -200)
        self.assertEqual(row["trustNetTwd"], 50)
        self.assertEqual(row["dealerBuyTwd"], 130)
        self.assertEqual(row["dealerSellTwd"], 120)
        self.assertEqual(row["dealerNetTwd"], 10)
        self.assertEqual(row["totalNetTwd"], -140)

    def test_institutional_amount_update_keeps_seven_sessions_and_old_rows_on_errors(self):
        dates = [f"2026-11-{day:02}" for day in range(1, 11)]
        old = {"date": dates[-1], "foreignNetTwd": 5}
        with patch.object(markets, "read_url", side_effect=OSError("offline")):
            result = markets.update_twse_institutional_amounts({"rows": [old]}, dates)
        self.assertEqual(len(result["rows"]), 1)
        self.assertEqual(result["rows"][0], old)
        self.assertEqual(result["asOf"], dates[-1])


if __name__ == "__main__":
    unittest.main()
