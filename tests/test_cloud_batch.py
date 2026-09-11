import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


MODULE_PATH = Path(__file__).parents[1] / "infra" / "cloud-run" / "batch_runner.py"
SPEC = importlib.util.spec_from_file_location("cloud_batch_runner", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class CloudBatchTests(unittest.TestCase):
    def test_macro_batch_only_commits_substantive_macro_changes(self):
        for latest, should_commit in [(3.0, False), (3.2, True)]:
            with self.subTest(latest=latest), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                target = root / "webapp/macro_economy_data.json"
                target.parent.mkdir()
                original = {"updatedAt": "before", "series": [{"id": "us-ppi", "latest": 3.0}]}
                target.write_text(json.dumps(original))
                for command in [["git", "init", "-q"], ["git", "config", "user.name", "Test"], ["git", "config", "user.email", "test@example.com"], ["git", "add", "."], ["git", "commit", "-qm", "initial"]]:
                    subprocess.run(command, cwd=root, check=True)
                initial_head = MODULE.output(["git", "rev-parse", "HEAD"], root)
                original_run = MODULE.run
                remote_actions = []

                def fake_run(command, cwd, **kwargs):
                    if command[-1] == "fetch_macro_economy.py":
                        target.write_text(json.dumps({"updatedAt": "after", "series": [{"id": "us-ppi", "latest": latest}]}))
                        (root / "unrelated.json").write_text("{}")
                    elif command[:2] in [["git", "fetch"], ["git", "rebase"], ["git", "push"]]:
                        remote_actions.append(command[1])
                    else:
                        original_run(command, cwd, **kwargs)

                with patch.object(MODULE, "run", side_effect=fake_run):
                    MODULE.run_macro_economy(root, {})
                head_changed = initial_head != MODULE.output(["git", "rev-parse", "HEAD"], root)
                self.assertEqual(head_changed, should_commit)
                self.assertEqual(remote_actions, ["fetch", "rebase", "push"] if should_commit else [])
                self.assertEqual(MODULE.output(["git", "status", "--porcelain", "--untracked-files=no"], root), "")
                self.assertEqual(MODULE.output(["git", "ls-files"], root), "webapp/macro_economy_data.json")

    def test_macro_fetch_failure_does_not_publish(self):
        with patch.object(MODULE, "run", side_effect=subprocess.CalledProcessError(1, "fetch_macro_economy.py")) as run:
            with self.assertRaises(subprocess.CalledProcessError):
                MODULE.run_macro_economy(Path("unused"), {})
        self.assertEqual(run.call_count, 1)
        self.assertEqual(run.call_args.args[0][-1], "fetch_macro_economy.py")

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

    def test_financial_content_changed_ignores_only_timestamp_updates(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            subprocess.run(["git", "config", "user.name", "Test"], cwd=root, check=True)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=root, check=True)
            target = root / "content.json"
            target.write_text(json.dumps({"updatedAt": "before", "items": [{"url": "one"}]}), encoding="utf-8")
            subprocess.run(["git", "add", "content.json"], cwd=root, check=True)
            subprocess.run(["git", "commit", "-qm", "initial"], cwd=root, check=True)

            target.write_text(json.dumps({"updatedAt": "after", "items": [{"url": "one"}]}), encoding="utf-8")
            self.assertFalse(MODULE.financial_content_changed(root, "content.json"))

            target.write_text(json.dumps({"updatedAt": "later", "items": [{"url": "two"}]}), encoding="utf-8")
            self.assertTrue(MODULE.financial_content_changed(root, "content.json"))


if __name__ == "__main__":
    unittest.main()
