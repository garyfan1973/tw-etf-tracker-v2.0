#!/usr/bin/env python3
"""Refresh saved river charts; other ordinary stocks load on demand via the API."""
import argparse
import json
from webapp.api._valuation import HISTORY_DIR, build_history


def update_saved(symbols=None):
    symbols = symbols or [path.stem for path in sorted(HISTORY_DIR.glob("*.json"))]
    failures = []
    for symbol in symbols:
        try:
            payload = build_history(symbol)
            HISTORY_DIR.mkdir(parents=True, exist_ok=True)
            (HISTORY_DIR / f"{symbol}.json").write_text(
                json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")
            print(f"valuation {symbol}: {len(payload['rows'])} rows; {len(payload['failedMonths'])} months need retry", flush=True)
        except Exception as error:
            failures.append(symbol)
            print(f"valuation {symbol}: retained saved history; {error}", flush=True)
    return failures


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("symbols", nargs="*")
    args = parser.parse_args()
    if update_saved(args.symbols):
        raise SystemExit(1)
