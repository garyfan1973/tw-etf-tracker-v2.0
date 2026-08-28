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


if __name__ == "__main__":
    unittest.main()
