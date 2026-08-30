import unittest

from fetch_macro_news import RSS_SOURCES


class MacroNewsSourceTests(unittest.TestCase):
    def test_no_generic_news_feed_is_labeled_as_macro_news(self):
        self.assertEqual(RSS_SOURCES, [])


if __name__ == "__main__":
    unittest.main()
