import datetime as dt
import unittest

from fetch_financial_videos import CHANNELS, featured_video_sort_key, parse_youtube_feed, still_current


class FinancialVideoDataTests(unittest.TestCase):
    def test_capital_morning_is_first_and_keyword_filtered(self):
        self.assertEqual(CHANNELS[0]["id"], "capitalmorning")
        self.assertTrue(CHANNELS[0]["pinned"])
        self.assertEqual(CHANNELS[0]["keywords"], ["群益早安"])

    def test_capital_morning_is_pinned_ahead_of_newer_other_video(self):
        rows = [
            {"channelId": "other", "publishedAt": "2026-08-24T09:00:00Z"},
            {"channelId": "capitalmorning", "publishedAt": "2026-08-24T08:00:00Z"},
        ]
        self.assertEqual(sorted(rows, key=featured_video_sort_key)[0]["channelId"], "capitalmorning")
    def test_feed_filters_by_week_keyword_and_shorts(self):
        xml = """<feed xmlns=\"http://www.w3.org/2005/Atom\" xmlns:yt=\"http://www.youtube.com/xml/schemas/2015\">
          <entry><yt:videoId>new123</yt:videoId><title>錢線百分百 8月21日</title><published>2026-08-21T12:00:00+00:00</published></entry>
          <entry><yt:videoId>other123</yt:videoId><title>其他新聞</title><published>2026-08-21T12:00:00+00:00</published></entry>
          <entry><yt:videoId>short123</yt:videoId><title>錢線百分百 #shorts</title><published>2026-08-21T12:00:00+00:00</published></entry>
          <entry><yt:videoId>old123</yt:videoId><title>錢線百分百 舊片</title><published>2026-08-01T12:00:00+00:00</published></entry>
        </feed>"""
        channel = {"id": "moneyline", "name": "錢線百分百", "keywords": ["錢線百分百"]}
        rows = parse_youtube_feed(xml, channel, dt.datetime(2026, 8, 23, tzinfo=dt.timezone.utc))
        self.assertEqual([row["videoId"] for row in rows], ["new123"])
        self.assertEqual(rows[0]["thumbnail"], "https://i.ytimg.com/vi/new123/hqdefault.jpg")

    def test_still_current_keeps_only_unexpired_cached_videos(self):
        rows = still_current([
            {"videoId": "new", "publishedAt": "2026-08-21T12:00:00Z"},
            {"videoId": "old", "publishedAt": "2026-08-01T12:00:00Z"},
        ], dt.datetime(2026, 8, 23, tzinfo=dt.timezone.utc))
        self.assertEqual([row["videoId"] for row in rows], ["new"])


if __name__ == "__main__":
    unittest.main()
