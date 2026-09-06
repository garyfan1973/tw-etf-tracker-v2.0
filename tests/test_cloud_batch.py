import importlib.util
from pathlib import Path
import tempfile
import unittest


MODULE_PATH = Path(__file__).parents[1] / "infra" / "cloud-run" / "batch_runner.py"
SPEC = importlib.util.spec_from_file_location("cloud_batch_runner", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class CloudBatchTests(unittest.TestCase):
    def test_financial_content_runs_cnbc_capture_after_macro_news(self):
        commands = [command[-1] for command in MODULE.FINANCIAL_CONTENT_COMMANDS]
        self.assertLess(commands.index("fetch_macro_news.py"), commands.index("fetch_cnbc_top_news.py"))

    def test_latest_snapshot_date_ignores_unrelated_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "0050_2026-08-27.json").write_text("{}", encoding="utf-8")
            (root / "00878_2026-08-28.json").write_text("{}", encoding="utf-8")
            (root / "notes.json").write_text("{}", encoding="utf-8")

            self.assertEqual(MODULE.latest_snapshot_date(root), "2026-08-28")

    def test_latest_snapshot_date_returns_none_for_missing_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            missing = Path(directory) / "missing"
            self.assertIsNone(MODULE.latest_snapshot_date(missing))

    def test_volatile_fetch_timestamps_do_not_count_as_content_changes(self):
        first = {
            "updatedAt": "2026-09-05T16:05:00Z",
            "items": [{
                "url": "https://example.com/story",
                "title": "Same story",
                "publishedAt": "2026-09-05T16:05:00Z",
                "capturedAt": "2026-09-05T16:05:01Z",
            }],
        }
        second = {
            "updatedAt": "2026-09-05T16:35:00Z",
            "items": [{
                "url": "https://example.com/story",
                "title": "Same story",
                "publishedAt": "2026-09-05T16:35:00Z",
                "capturedAt": "2026-09-05T16:35:01Z",
            }],
        }
        self.assertEqual(
            MODULE.without_volatile_content_metadata(first),
            MODULE.without_volatile_content_metadata(second),
        )

    def test_article_changes_still_count_as_content_changes(self):
        first = {"updatedAt": "before", "items": [{"url": "one", "title": "Old"}]}
        second = {"updatedAt": "after", "items": [{"url": "two", "title": "New"}]}
        self.assertNotEqual(
            MODULE.without_volatile_content_metadata(first),
            MODULE.without_volatile_content_metadata(second),
        )


if __name__ == "__main__":
    unittest.main()
