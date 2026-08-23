import datetime as dt
import unittest

from fetch_fed_policy import merge_rate_series, parse_fred_csv, parse_policy_feed, previous_distinct


class FedPolicyDataTests(unittest.TestCase):
    def test_parse_fred_csv_skips_missing_values_and_scales(self):
        content = "observation_date,WALCL\n2026-08-12,6600000\n2026-08-19,.\n2026-08-20,6650000\n"
        self.assertEqual(parse_fred_csv(content, "WALCL", 0.001), [
            {"date": "2026-08-12", "value": 6600.0},
            {"date": "2026-08-20", "value": 6650.0},
        ])

    def test_merge_rate_series_keeps_shared_date_grain(self):
        result = merge_rate_series({
            "targetUpper": [{"date": "2026-08-20", "value": 3.75}],
            "targetLower": [{"date": "2026-08-20", "value": 3.5}],
            "effectiveRate": [{"date": "2026-08-20", "value": 3.64}],
        })
        self.assertEqual(result, [{"date": "2026-08-20", "targetUpper": 3.75, "targetLower": 3.5, "effectiveRate": 3.64}])

    def test_previous_distinct_ignores_repeated_target(self):
        rows = [{"targetUpper": 4.0}, {"targetUpper": 4.0}, {"targetUpper": 3.75}, {"targetUpper": 3.75}]
        self.assertEqual(previous_distinct(rows, "targetUpper"), 4.0)

    def test_policy_feed_respects_recency(self):
        xml = """<rss><channel>
          <item><title>Federal Reserve issues FOMC statement</title><link>https://example.com/a</link><description>Policy update</description><pubDate>Wed, 19 Aug 2026 18:00:00 GMT</pubDate></item>
          <item><title>Old item</title><link>https://example.com/b</link><description>Old</description><pubDate>Wed, 01 Jan 2025 18:00:00 GMT</pubDate></item>
        </channel></rss>"""
        rows = parse_policy_feed(xml, dt.datetime(2026, 8, 23, tzinfo=dt.timezone.utc), days=120)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["title"], "Federal Reserve issues FOMC statement")


if __name__ == "__main__":
    unittest.main()
