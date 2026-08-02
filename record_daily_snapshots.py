#!/usr/bin/env python3
"""把每日投資組合績效快照寫入 Supabase。

此腳本只在 GitHub Actions 的受信任環境執行，使用 SUPABASE_SERVICE_ROLE_KEY；
絕不把 service key 放入前端或提交到 repository。
"""

import datetime as dt
import json
import os
import re
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DATA_JS = ROOT / "webapp" / "data.js"
CONFIG = ROOT / "webapp" / "portfolio_config.json"


def http_json(url, method="GET", payload=None, headers=None):
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode()
    req = urllib.request.Request(url, data=body, method=method, headers={
        "Content-Type": "application/json",
        "User-Agent": "tw-etf-tracker-daily-snapshot/2.0",
        **(headers or {}),
    })
    with urllib.request.urlopen(req, timeout=60) as res:
        raw = res.read()
        return json.loads(raw.decode("utf-8")) if raw else None


def load_data():
    text = DATA_JS.read_text(encoding="utf-8")
    return json.loads(re.sub(r"^window\.DATA\s*=\s*", "", text).rstrip(" ;\n"))


def load_config():
    data = json.loads(CONFIG.read_text(encoding="utf-8"))
    brokerage = data.get("brokerage", {})
    tax = data.get("securities_transaction_tax", {})
    return {
        "buy_rate": float(brokerage.get("fee_rate", 0.000399)),
        "sell_rate": float(brokerage.get("sell_fee_rate", brokerage.get("fee_rate", 0.000399))),
        "minimum_fee": float(brokerage.get("minimum_fee", 1)),
        "tax_rate": float(tax.get("rate", 0.001)),
        "tax_enabled": tax.get("enabled", True),
    }


def date_of(t):
    if t.get("trade_date"):
        return str(t["trade_date"])
    return str(t.get("created_at", ""))[:10]


def fee_for(shares, price, rate, cfg):
    if price is None:
        return 0.0
    return max(cfg["minimum_fee"], round(shares * price * rate))


def ordered(txs):
    return sorted(txs, key=lambda t: (date_of(t), str(t.get("created_at", ""))))


def state_for(txs, as_of, cfg):
    """回傳截至交易日的各 ETF 狀態，含 FIFO 已實現損益。"""
    by_code = {}
    for t in txs:
        if date_of(t) <= as_of:
            by_code.setdefault(t["etf_code"], []).append(t)
    states = {}
    for code, rows in by_code.items():
        lots, realized = [], 0.0
        invested = 0.0
        for t in ordered(rows):
            qty = float(t.get("shares") or 0)
            px = None if t.get("price") is None else float(t["price"])
            fee = float(t.get("fee") or 0)
            if t.get("side") == "buy":
                lots.append({"shares": qty, "price": px, "fee": fee, "original": qty})
                invested += (qty * px if px is not None else 0) + fee
                continue
            left, basis = qty, 0.0
            while left > 0:
                lot = next((x for x in lots if x["shares"] > 0), None)
                if lot is None:
                    break
                take = min(left, lot["shares"])
                basis += (take * lot["price"] if lot["price"] is not None else 0) + lot["fee"] * take / lot["shares"]
                lot["fee"] *= (lot["shares"] - take) / lot["shares"]
                lot["shares"] -= take
                left -= take
            proceeds = (qty * px if px is not None else 0) - fee - float(t.get("tax") or 0)
            realized += proceeds - basis
        states[code] = {"lots": lots, "realized": realized, "invested": invested}
    return states


def eligible_shares(txs, code, ex_date):
    rows = [t for t in txs if t["etf_code"] == code and date_of(t) <= ex_date]
    lots = []
    for t in ordered(rows):
        qty = float(t.get("shares") or 0)
        if t.get("side") == "buy":
            lots.append(qty)
            continue
        left = qty
        for i, available in enumerate(lots):
            if left <= 0:
                break
            take = min(left, available)
            lots[i] -= take
            left -= take
    return sum(max(0, x) for x in lots)


def dividend_income(data, txs, code, as_of):
    etf = data["etfs"].get(code, {})
    total = 0.0
    for d in etf.get("dividends", []):
        if d.get("pay") and d["pay"] <= as_of and d.get("ex") and d.get("amount") is not None:
            total += eligible_shares(txs, code, d["ex"]) * float(d["amount"])
    return total


def price_at(data, code, as_of):
    snaps = data["etfs"].get(code, {}).get("snapshots", [])
    candidates = [s for s in snaps if s.get("date", "") <= as_of and s.get("self", {}).get("close") is not None]
    if not candidates:
        return None, None
    snap = candidates[-1]
    return float(snap["self"]["close"]), snap["date"]


def build_rows(data, txs, users, dates, cfg):
    result = []
    names = {code: etf.get("name", code) for code, etf in data["etfs"].items()}
    for user_id in users:
        user_txs = [t for t in txs if t["user_id"] == user_id]
        for snapshot_date in dates:
            states = state_for(user_txs, snapshot_date, cfg)
            for code, state in states.items():
                shares = sum(x["shares"] for x in state["lots"])
                close, source_date = price_at(data, code, snapshot_date)
                cost_basis = sum((x["shares"] * x["price"] if x["price"] is not None else 0) + x["fee"] for x in state["lots"] if x["shares"] > 0)
                gross = shares * close if close is not None else None
                sell_fee = fee_for(shares, close, cfg["sell_rate"], cfg) if close is not None and shares else 0
                sell_tax = round(gross * cfg["tax_rate"]) if gross is not None and cfg["tax_enabled"] else 0
                market_value = gross - sell_fee - sell_tax if gross is not None else None
                unrealized = market_value - cost_basis if market_value is not None else None
                dividends = dividend_income(data, user_txs, code, snapshot_date)
                pnl_ex = (unrealized or 0) + state["realized"]
                pnl_inc = pnl_ex + dividends
                invested = state["invested"]
                result.append({
                    "user_id": user_id, "snapshot_date": snapshot_date, "etf_code": code,
                    "etf_name": names.get(code, code), "shares": round(shares, 6),
                    "price": close, "invested_cost": round(invested, 6), "cost_basis": round(cost_basis, 6),
                    "market_value": None if market_value is None else round(market_value, 6),
                    "unrealized_pnl": None if unrealized is None else round(unrealized, 6),
                    "realized_pnl": round(state["realized"], 6), "dividend_income": round(dividends, 6),
                    "pnl_ex_dividend": round(pnl_ex, 6), "pnl_with_dividend": round(pnl_inc, 6),
                    "return_ex_dividend": round(pnl_ex / invested * 100, 6) if invested else None,
                    "return_with_dividend": round(pnl_inc / invested * 100, 6) if invested else None,
                    "source_date": source_date,
                })
    return result


def main():
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not key:
        raise SystemExit("缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY，略過每日快照。")
    headers = {"apikey": key, "Authorization": "Bearer " + key}
    tx_url = base + "/rest/v1/portfolio_transactions?select=*"
    txs = http_json(tx_url, headers=headers) or []
    users = sorted({t["user_id"] for t in txs if t.get("user_id")})
    data = load_data()
    dates = sorted({s["date"] for e in data["etfs"].values() for s in e.get("snapshots", []) if s.get("date")})
    if not users or not dates:
        print("沒有可記錄的使用者交易或行情日期。")
        return
    rows = build_rows(data, txs, users, dates, load_config())
    url = base + "/rest/v1/portfolio_daily_snapshots?on_conflict=user_id,snapshot_date,etf_code"
    for i in range(0, len(rows), 500):
        http_json(url, method="POST", payload=rows[i:i + 500],
                 headers={**headers, "Prefer": "resolution=merge-duplicates,return=minimal"})
    print("已寫入 {} 筆每日績效快照（{} 位使用者、{} 個日期）。".format(len(rows), len(users), len(dates)))


if __name__ == "__main__":
    main()
