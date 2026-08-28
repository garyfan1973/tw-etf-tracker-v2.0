#!/usr/bin/env python3
"""Cloud Run batch entrypoint.

The container intentionally does not bake repository data or credentials into the
image.  Every execution clones the current default branch, runs the selected
batch, and pushes generated data back only when files changed.
"""

from __future__ import annotations

import datetime as dt
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from zoneinfo import ZoneInfo


TAIPEI = ZoneInfo("Asia/Taipei")
SNAPSHOT_RE = re.compile(r"_(\d{4}-\d{2}-\d{2})\.json$")
DATA_PATHS = [
    "data",
    "webapp/data.js",
    "webapp/price-history",
    "webapp/etf_overview.json",
    "webapp/shareholder_distribution.json",
    "webapp/etf_directory.json",
    "webapp/company_profiles.json",
    "webapp/market_data.json",
    "fetch_company_profiles.py",
    "fetch_price_history.py",
    "fetch_macro_markets.py",
]
DATA_COMMANDS = [
    [sys.executable, "fetch_etf_list.py"],
    [sys.executable, "fetch.py"],
    [sys.executable, "fetch_price_history.py"],
    [sys.executable, "fetch_macro_markets.py"],
    [sys.executable, "fetch_company_profiles.py"],
]


def run(command: list[str], cwd: Path, *, env: dict[str, str] | None = None) -> None:
    print(f"+ {' '.join(command)}", flush=True)
    subprocess.run(command, cwd=cwd, env=env, check=True)


def output(command: list[str], cwd: Path) -> str:
    return subprocess.check_output(command, cwd=cwd, text=True).strip()


def latest_snapshot_date(data_dir: Path) -> str | None:
    dates = []
    if not data_dir.exists():
        return None
    for path in data_dir.glob("*_20??-??-??.json"):
        match = SNAPSHOT_RE.search(path.name)
        if match:
            dates.append(match.group(1))
    return max(dates, default=None)


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"缺少必要環境變數：{name}")
    return value


def git_environment(token: str, temp_dir: Path) -> dict[str, str]:
    askpass = temp_dir / "git-askpass.sh"
    askpass.write_text(
        "#!/bin/sh\n"
        "case \"$1\" in\n"
        "  *Username*) printf '%s\\n' 'x-access-token' ;;\n"
        "  *) printf '%s\\n' \"$GITHUB_TOKEN\" ;;\n"
        "esac\n",
        encoding="utf-8",
    )
    askpass.chmod(0o700)
    env = os.environ.copy()
    env.update(
        {
            "GIT_ASKPASS": str(askpass),
            "GIT_TERMINAL_PROMPT": "0",
            "GITHUB_TOKEN": token,
        }
    )
    return env


def clone_repository(temp_dir: Path) -> tuple[Path, dict[str, str]]:
    token = require_env("GITHUB_TOKEN")
    repository = os.environ.get("GITHUB_REPOSITORY", "garyfan1973/tw-etf-tracker-v2.0")
    branch = os.environ.get("GITHUB_BRANCH", "main")
    env = git_environment(token, temp_dir)
    repo_dir = temp_dir / "repo"
    run(
        [
            "git",
            "clone",
            "--depth",
            "1",
            "--branch",
            branch,
            f"https://github.com/{repository}.git",
            str(repo_dir),
        ],
        temp_dir,
        env=env,
    )
    return repo_dir, env


def run_data_batch(repo_dir: Path, git_env: dict[str, str], mode: str) -> None:
    today = dt.datetime.now(TAIPEI).date().isoformat()
    latest = latest_snapshot_date(repo_dir / "data")
    if mode == "data-tw" and latest == today:
        print(f"台股資料已是 {today}，略過重複更新。")
        return

    for command in DATA_COMMANDS:
        run(command, repo_dir)

    if os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip():
        run([sys.executable, "record_daily_snapshots.py"], repo_dir)
    else:
        print("未設定 SUPABASE_SERVICE_ROLE_KEY，略過每日績效快照。")

    run(["git", "config", "user.name", "cloud-run-batch[bot]"], repo_dir)
    run(
        ["git", "config", "user.email", "cloud-run-batch[bot]@users.noreply.github.com"],
        repo_dir,
    )
    run(["git", "add", *DATA_PATHS], repo_dir)
    if subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=repo_dir).returncode == 0:
        print("資料無變更，不建立 commit。")
        return

    run(
        ["git", "commit", "-m", f"chore(data)：Cloud Run 自動更新 {today}"],
        repo_dir,
    )
    branch = os.environ.get("GITHUB_BRANCH", "main")
    run(["git", "fetch", "origin", branch], repo_dir, env=git_env)
    run(["git", "rebase", f"origin/{branch}"], repo_dir, env=git_env)
    run(["git", "push", "origin", f"HEAD:{branch}"], repo_dir, env=git_env)


def run_morning_report(repo_dir: Path) -> None:
    require_env("SUPABASE_URL")
    require_env("SUPABASE_SERVICE_ROLE_KEY")
    run([sys.executable, "scripts/morning_report.py"], repo_dir)


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in {"data-tw", "data-us", "morning-report"}:
        print("用法：batch_runner.py data-tw|data-us|morning-report", file=sys.stderr)
        return 2

    mode = sys.argv[1]
    work_root = Path(tempfile.mkdtemp(prefix="market-batch-"))
    try:
        repo_dir, git_env = clone_repository(work_root)
        if mode == "morning-report":
            run_morning_report(repo_dir)
        else:
            run_data_batch(repo_dir, git_env, mode)
        print(f"批次完成：{mode}")
        return 0
    finally:
        shutil.rmtree(work_root, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
