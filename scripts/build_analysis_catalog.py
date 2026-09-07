"""Build a compact analysis/search catalog from saved OHLCV, without network calls."""
import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_json(path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return fallback


def valid_number(value):
    return isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value)


def build_catalog(root=ROOT):
    root = Path(root)
    web = root / "webapp"
    profiles = read_json(web / "company_profiles.json", {})
    etfs = read_json(root / "data" / "etf_names.json", {})
    assets = []
    for path in sorted((web / "price-history").glob("*/*.json")):
        data = read_json(path, {})
        market, symbol = path.parent.name, path.stem
        if market not in {"TW", "US", "JP", "KS"}:
            continue
        by_date = {row["date"]: row for row in data.get("rows", [])
                   if isinstance(row.get("date"), str) and valid_number(row.get("close")) and row["close"] > 0}
        rows = [by_date[d] for d in sorted(by_date)]
        if not rows:
            continue
        last = rows[-1]
        profile = profiles.get(symbol, {})
        if profile.get("market") != market:
            profile = {}
        assets.append({
            "market": market, "symbol": symbol,
            "name": (etfs.get(symbol) if market == "TW" else None) or profile.get("name") or symbol,
            "industry": profile.get("industry", ""), "currency": data.get("currency") or "",
            "asOf": last["date"], "close": last["close"],
            "changePct": (last["close"] / rows[-2]["close"] - 1) * 100 if len(rows) > 1 else None,
            "return20": (last["close"] / rows[-21]["close"] - 1) * 100 if len(rows) >= 21 else None,
            "spark": [r["close"] for r in rows[-21:]], "count": len(rows),
        })
    result = {"schemaVersion": 1, "source": "Saved Yahoo Finance daily OHLCV", "assets": assets}
    target = web / "price-history" / "catalog.json"
    target.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return result


if __name__ == "__main__":
    print("Analysis catalog: {} assets".format(len(build_catalog()["assets"])))
