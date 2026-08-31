import datetime as dt
import unittest

from fetch_macro_markets import DOLLAR_INDEX, INDICES, apply_twse_market_turnover, build_currency, build_index, normalize_currency_rows, parse_tpex_index_snapshot, parse_treasury_csv, parse_twse_index_snapshot, parse_twse_market_closes, parse_twse_market_turnovers, parse_yahoo_rows


class MacroMarketDataTests(unittest.TestCase):
    def test_parse_yahoo_rows_ignores_missing_closes(self):
        result = {
            "meta": {"gmtoffset": 0},
            "timestamp": [0, 86400, 172800],
            "indicators": {"quote": [{"open": [9.0, None, 12.0], "high": [11.0, None, 13.0], "low": [8.0, None, 11.5], "close": [10.0, None, 12.5], "volume": [100, None, 250]}]},
        }
        self.assertEqual(parse_yahoo_rows(result), [
            {"date": "1970-01-01", "open": 9.0, "high": 11.0, "low": 8.0, "close": 10.0, "volume": 100.0},
            {"date": "1970-01-03", "open": 12.0, "high": 13.0, "low": 11.5, "close": 12.5, "volume": 250.0},
        ])

    def test_currency_inversion_produces_usd_per_unit(self):
        rows = normalize_currency_rows([{"date": "2026-08-21", "close": 31.25}], "invert")
        self.assertEqual(rows, [{"date": "2026-08-21", "usdPerUnit": 0.032}])

    def test_identity_currency_is_one_us_dollar(self):
        item = build_currency({"code": "USD", "name": "美元", "symbol": None, "mode": "identity"}, today="2026-08-21")
        self.assertEqual(item["usdPerUnit"], 1.0)
        self.assertEqual(item["asOf"], "2026-08-21")

    def test_requested_market_symbols_are_included(self):
        symbols = {item["symbol"] for item in INDICES}
        self.assertIn("^NDX", symbols)
        self.assertIn("BZ=F", symbols)
        self.assertIn("^RUT", symbols)
        self.assertIn("^VIX", symbols)

    def test_dollar_index_uses_cash_index_symbol(self):
        self.assertEqual(DOLLAR_INDEX["symbol"], "DX-Y.NYB")
        self.assertEqual(DOLLAR_INDEX["historyDays"], 520)

    def test_index_summary_includes_volume_and_52_week_range(self):
        result = {
            "meta": {"gmtoffset": 0}, "timestamp": [0, 86400],
            "indicators": {"quote": [{"open": [9, 11], "high": [11, 13], "low": [8, 10], "close": [10, 12], "volume": [100, 250]}]},
        }
        item = build_index({"id":"demo","name":"Demo","region":"Test","symbol":"^TEST","currency":"USD"}, result)
        self.assertEqual(item["volume"], 250.0)
        self.assertEqual(item["week52Low"], 8.0)
        self.assertEqual(item["week52High"], 13.0)

    def test_index_can_retain_a_custom_history_window(self):
        result = {
            "meta": {"gmtoffset": 0}, "timestamp": [0, 86400, 172800, 259200],
            "indicators": {"quote": [{"open": [1, 2, 3, 4], "high": [1, 2, 3, 4], "low": [1, 2, 3, 4], "close": [1, 2, 3, 4], "volume": [0, 0, 0, 0]}]},
        }
        item = build_index({"id":"demo","name":"Demo","region":"Test","symbol":"X","currency":"POINTS","historyDays":3}, result)
        self.assertEqual([row["close"] for row in item["rows"]], [2.0, 3.0, 4.0])

    def test_zero_index_volume_is_treated_as_unavailable(self):
        result = {
            "meta": {"gmtoffset": 0}, "timestamp": [0],
            "indicators": {"quote": [{"open": [10], "high": [11], "low": [9], "close": [10], "volume": [0]}]},
        }
        item = build_index({"id":"sox","name":"SOX","region":"US","symbol":"^SOX","currency":"USD"}, result)
        self.assertIsNone(item["volume"])
        self.assertIsNone(item["rows"][-1]["volume"])

    def test_us_index_ignores_an_incomplete_regular_session_candle(self):
        result = {
            "meta": {"gmtoffset": -14400},
            "timestamp": [1787319000, 1787578200],
            "indicators": {"quote": [{"open": [100, 110], "high": [105, 115], "low": [98, 108], "close": [103, 112], "volume": [1000, 300]}]},
        }
        now = dt.datetime(2026, 8, 24, 14, 17, tzinfo=dt.timezone.utc)
        item = build_index({"id":"dow","name":"Dow","region":"美國","symbol":"^DJI","currency":"USD"}, result, now=now)
        self.assertEqual(item["asOf"], "2026-08-21")
        self.assertEqual(item["latest"], 103.0)
        self.assertEqual(item["quoteLabel"], "正常盤收盤")

    def test_us_index_keeps_the_candle_after_regular_session_settlement(self):
        result = {
            "meta": {"gmtoffset": -14400},
            "timestamp": [1787319000, 1787578200],
            "indicators": {"quote": [{"open": [100, 110], "high": [105, 115], "low": [98, 108], "close": [103, 112], "volume": [1000, 1300]}]},
        }
        now = dt.datetime(2026, 8, 24, 21, 0, tzinfo=dt.timezone.utc)
        item = build_index({"id":"dow","name":"Dow","region":"美國","symbol":"^DJI","currency":"USD"}, result, now=now)
        self.assertEqual(item["asOf"], "2026-08-24")
        self.assertEqual(item["latest"], 112.0)

    def test_us_index_uses_quote_previous_close_when_daily_prior_candle_is_missing(self):
        result = {
            "meta": {"gmtoffset": -14400},
            "timestamp": [1787837400, 1787923800, 1788183000],
            "indicators": {"quote": [{
                "open": [110, None, 106], "high": [115, None, 108], "low": [108, None, 103],
                "close": [112, None, 105], "volume": [1000, None, 1300],
            }]},
        }
        quote_result = {"meta": {
            "gmtoffset": -14400, "regularMarketTime": 1788210575, "previousClose": 111,
        }}
        now = dt.datetime(2026, 8, 31, 22, 0, tzinfo=dt.timezone.utc)
        item = build_index(
            {"id":"dow","name":"Dow","region":"美國","symbol":"^DJI","currency":"USD"},
            result, now=now, quote_result=quote_result,
        )
        self.assertEqual(item["asOf"], "2026-08-31")
        self.assertEqual(item["change"], -6.0)
        self.assertEqual(item["changePct"], -5.4054)

    def test_us_index_ignores_quote_from_a_newer_incomplete_session(self):
        result = {
            "meta": {"gmtoffset": -14400},
            "timestamp": [1787837400, 1788183000],
            "indicators": {"quote": [{
                "open": [110, 106], "high": [115, 108], "low": [108, 103],
                "close": [112, 105], "volume": [1000, 300],
            }]},
        }
        quote_result = {"meta": {
            "gmtoffset": -14400, "regularMarketTime": 1788186600, "previousClose": 111,
        }}
        now = dt.datetime(2026, 8, 31, 14, 30, tzinfo=dt.timezone.utc)
        item = build_index(
            {"id":"dow","name":"Dow","region":"美國","symbol":"^DJI","currency":"USD"},
            result, now=now, quote_result=quote_result,
        )
        self.assertEqual(item["asOf"], "2026-08-27")
        self.assertEqual(item["change"], 0.0)

    def test_twse_market_turnover_replaces_yahoo_index_volume(self):
        payload = {
            "fields": ["日期", "成交股數", "成交金額", "成交筆數", "發行量加權股價指數"],
            "data": [["115/08/21", "8,208,832,354", "754,905,335,886", "3,751,488", "45,224.29"]],
        }
        item = {"source":"Yahoo Finance", "rows":[{"date":"2026-08-20","volume":4170000},{"date":"2026-08-21","volume":3779900}], "volume":3779900}
        self.assertEqual(parse_twse_market_turnovers(payload), {"2026-08-21": 754905335886})
        result = apply_twse_market_turnover(item, payload)
        self.assertIsNone(result["rows"][0]["turnover"])
        self.assertEqual(result["rows"][1]["turnover"], 754905335886)
        self.assertTrue(result["rows"][1]["turnoverOfficial"])
        self.assertNotIn("volume", result["rows"][1])
        self.assertEqual(result["turnoverLabel"], "成交金額")
        self.assertEqual(result["source"], "Yahoo Finance／臺灣證券交易所")

    def test_twse_market_turnover_preserves_official_history(self):
        payload = {
            "fields": ["日期", "成交股數", "成交金額"],
            "data": [["115/08/21", "8,208,832,354", "754,905,335,886"]],
        }
        previous = {"rows": [{"date":"2026-08-20","turnover":784512346516,"turnoverOfficial":True}]}
        item = {"rows":[{"date":"2026-08-20","volume":1},{"date":"2026-08-21","volume":2}],"volume":2}
        result = apply_twse_market_turnover(item, payload, previous)
        self.assertEqual(result["rows"][0]["turnover"], 784512346516)
        self.assertTrue(result["rows"][0]["turnoverOfficial"])

    def test_twse_market_snapshot_can_append_a_newer_official_close(self):
        payload = {
            "fields": ["日期", "成交金額", "發行量加權股價指數"],
            "data": [["115/08/27", "926,202,000,000", "45,975.22"]],
        }
        self.assertEqual(parse_twse_market_closes(payload), {"2026-08-27": 45975.22})
        item = {"rows":[{"date":"2026-08-26","close":45832.62,"volume":1}],"volume":1}
        result = apply_twse_market_turnover(item, payload)
        self.assertEqual(result["asOf"], "2026-08-27")
        self.assertEqual(result["latest"], 45975.22)
        self.assertEqual(result["turnover"], 926202000000)
        self.assertEqual(result["change"], 142.6)

    def test_parse_twse_index_snapshot_extracts_homepage_highlights(self):
        payload = [
            {"日期":"1150827","指數":"發行量加權股價指數","收盤指數":"45,975.22","漲跌":"+","漲跌點數":"142.60","漲跌百分比":"0.31"},
            {"日期":"1150827","指數":"電子工業類指數","收盤指數":"2,920.91","漲跌":"-","漲跌點數":"4.65","漲跌百分比":"0.16"},
            {"日期":"1150827","指數":"金融保險類指數","收盤指數":"3,229.67","漲跌":"+","漲跌點數":"6.60","漲跌百分比":"0.20"},
        ]
        result = {item["id"]: item for item in parse_twse_index_snapshot(payload)}
        self.assertEqual(result["twii"]["asOf"], "2026-08-27")
        self.assertEqual(result["electronics"]["change"], -4.65)
        self.assertEqual(result["finance"]["latest"], 3229.67)

    def test_parse_tpex_index_snapshot_extracts_otc_index(self):
        payload = {"date":"20260827","tables":[{"fields":["指數","收市指數","漲跌","漲跌幅度(%)"],"data":[["櫃買指數","400.38","4.72","1.19"]]}]}
        self.assertEqual(parse_tpex_index_snapshot(payload), [{
            "id":"otc", "name":"上櫃", "asOf":"2026-08-27", "latest":400.38,
            "change":4.72, "changePct":1.19, "source":"證券櫃檯買賣中心",
        }])

    def test_parse_treasury_csv_maps_tenors_and_sorts(self):
        content = "Date,1 Mo,3 Mo,2 Yr,10 Yr,30 Yr\n08/21/2026,4.1,4.2,3.9,4.3,4.8\n08/20/2026,4.0,4.1,3.8,4.2,4.7\n"
        rows = parse_treasury_csv(content)
        self.assertEqual(rows[0]["date"], "2026-08-20")
        self.assertEqual(rows[-1]["rates"]["10Y"], 4.3)


if __name__ == "__main__":
    unittest.main()
