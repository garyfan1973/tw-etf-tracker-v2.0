import datetime as dt
import unittest

from fetch_cnbc_top_news import TAIPEI, capture_status, fetch_first, update_payload


FEED = b'''<?xml version="1.0"?><rss><channel><item>
<title>Markets rise on jobs report</title>
<link>https://www.cnbc.com/2026/09/04/jobs.html</link>
<description>Stocks rose after the latest labor data.</description>
<pubDate>Fri, 04 Sep 2026 13:52:53 GMT</pubDate>
</item></channel></rss>'''


class CnbcTopNewsTests(unittest.TestCase):
    def test_reads_first_official_feed_item(self):
        row = fetch_first(lambda _url: FEED)
        self.assertEqual(row["titleEn"], "Markets rise on jobs report")
        self.assertEqual(row["publishedAt"], "2026-09-04T13:52:53Z")

    def test_daily_capture_is_bilingual_and_deduplicated(self):
        article = fetch_first(lambda _url: FEED)
        now = dt.datetime(2026, 9, 4, 21, 35, tzinfo=TAIPEI)
        translator = lambda values: ["就業報告推動市場上漲", "最新勞動數據公布後，股市上漲。"]
        payload = update_payload({"windowDays": 5, "sections": []}, article, now, translator)
        payload = update_payload(payload, article, now, translator)
        section = payload["sections"][0]
        self.assertEqual(section["id"], "cnbc-top")
        self.assertEqual(len(section["items"]), 1)
        self.assertEqual(section["items"][0]["summaryEn"], "Stocks rose after the latest labor data.")
        self.assertEqual(section["items"][0]["summaryZh"], "最新勞動數據公布後，股市上漲。")

    def test_capture_runs_at_any_scheduled_hour_and_skips_old_headline(self):
        article = fetch_first(lambda _url: FEED)
        same_day = dt.datetime(2026, 9, 5, 6, 5, tzinfo=TAIPEI)
        self.assertEqual(capture_status({"sections": []}, article, same_day), "capture")
        self.assertEqual(capture_status({"sections": []}, article, same_day.replace(hour=22)), "capture")
        payload = {"sections": [{"id": "cnbc-top", "items": [{"captureDate": "2026-09-05", "url": article["url"]}]}]}
        self.assertEqual(capture_status(payload, article, same_day), "unchanged")
        self.assertEqual(capture_status({"sections": []}, article, same_day + dt.timedelta(days=3)), "stale")


if __name__ == "__main__":
    unittest.main()
