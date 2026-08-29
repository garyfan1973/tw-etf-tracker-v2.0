"""Build source-backed non-technical context for member morning reports."""
from __future__ import annotations

import datetime as dt
import json
import math
from pathlib import Path


def read_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def normalize_dividends(rows: list[dict]) -> list[dict]:
    normalized = {}
    for row in rows or []:
        ex_date = str(row.get("exDate") or row.get("ex") or "")[:10]
        try:
            dt.date.fromisoformat(ex_date)
            amount = float(row.get("amount"))
        except (TypeError, ValueError):
            continue
        item = {
            "exDate": ex_date,
            "payDate": str(row.get("payDate") or row.get("pay") or "")[:10] or None,
            "amount": round(amount, 6),
            "currency": str(row.get("currency") or "TWD")[:8],
            "source": str(row.get("source") or "MoneyDJ")[:80],
        }
        key = (ex_date, amount)
        current = normalized.get(key)
        if current:
            current["payDate"] = current.get("payDate") or item.get("payDate")
            current["currency"] = current.get("currency") or item.get("currency")
        else:
            normalized[key] = item
    return sorted(normalized.values(), key=lambda item: item["exDate"])


def _round(value, digits=4):
    return round(float(value), digits) if value is not None and math.isfinite(float(value)) else None


def _ema(values: list[float], period: int) -> list[float]:
    alpha, result = 2 / (period + 1), []
    for value in values:
        result.append(value if not result else value * alpha + result[-1] * (1 - alpha))
    return result


def _rsi(values: list[float], period: int) -> float | None:
    if len(values) <= period:
        return None
    gains = [max(values[index] - values[index - 1], 0) for index in range(1, period + 1)]
    losses = [max(values[index - 1] - values[index], 0) for index in range(1, period + 1)]
    average_gain, average_loss = sum(gains) / period, sum(losses) / period
    for index in range(period + 1, len(values)):
        change = values[index] - values[index - 1]
        average_gain = (average_gain * (period - 1) + max(change, 0)) / period
        average_loss = (average_loss * (period - 1) + max(-change, 0)) / period
    if not average_gain and not average_loss:
        return 50.0
    if not average_loss:
        return 100.0
    return 100 - 100 / (1 + average_gain / average_loss)


def _kd(rows: list[dict]) -> tuple[float | None, float | None]:
    if not rows:
        return None, None
    k = d = 50.0
    for index, row in enumerate(rows):
        window = rows[max(0, index - 8):index + 1]
        high = max(item["high"] for item in window)
        low = min(item["low"] for item in window)
        rsv = 50.0 if high == low else (row["close"] - low) / (high - low) * 100
        k = k * 2 / 3 + rsv / 3
        d = d * 2 / 3 + k / 3
    return k, d


def dividend_adjusted_technical(chart_data: dict, dividends: list[dict]) -> tuple[dict, list[dict]]:
    rows = [
        {"date": row["date"], **{key: float(row[key]) for key in ("open", "high", "low", "close")}}
        for row in chart_data.get("priceRows") or []
        if all(row.get(key) is not None for key in ("date", "open", "high", "low", "close"))
    ]
    actions = []
    by_date = {row["date"]: index for index, row in enumerate(rows)}
    factors = [1.0] * len(rows)
    for dividend in dividends:
        index = by_date.get(dividend["exDate"])
        if index is None or index == 0 or dividend["amount"] <= 0:
            continue
        previous, current = rows[index - 1], rows[index]
        factor = (previous["close"] - dividend["amount"]) / previous["close"]
        if not 0 < factor <= 1:
            continue
        for prior in range(index):
            factors[prior] *= factor
        actions.append({
            **dividend,
            "priorClose": _round(previous["close"]),
            "exDateClose": _round(current["close"]),
            "rawGapPct": _round((current["close"] / previous["close"] - 1) * 100, 2),
            "dividendAdjustedReturnPct": _round(((current["close"] + dividend["amount"]) / previous["close"] - 1) * 100, 2),
            "backAdjustmentFactor": _round(factor, 8),
        })
    adjusted = []
    for row, factor in zip(rows, factors):
        adjusted.append({"date": row["date"], **{key: _round(row[key] * factor) for key in ("open", "high", "low", "close")}})
    closes = [row["close"] for row in adjusted]
    fast, slow = _ema(closes, 12), _ema(closes, 26)
    dif = [a - b for a, b in zip(fast, slow)]
    signal = _ema(dif, 9)
    k, d = _kd(adjusted)
    latest_mas = {
        f"ma{period}": _round(sum(closes[-period:]) / period) if len(closes) >= period else None
        for period in (5, 10, 20, 60, 120)
    }
    window = closes[-20:]
    mean = sum(window) / len(window) if window else None
    deviation = math.sqrt(sum((value - mean) ** 2 for value in window) / len(window)) if window else None
    technical = {
        "basis": "cash-dividend-back-adjusted",
        "latestDate": adjusted[-1]["date"] if adjusted else None,
        "latestClose": _round(closes[-1]) if closes else None,
        **latest_mas,
        "bollinger": {"upper": _round(mean + 2 * deviation), "mid": _round(mean), "lower": _round(mean - 2 * deviation)} if mean is not None else None,
        "kd": {"k": _round(k, 2), "d": _round(d, 2)},
        "macd": {"dif": _round(dif[-1]), "signal": _round(signal[-1]), "histogram": _round(dif[-1] - signal[-1])} if dif else None,
        "rsi5": _round(_rsi(closes, 5), 2),
        "rsi10": _round(_rsi(closes, 10), 2),
        "recentAdjustedRows": adjusted[-30:],
    }
    return technical, actions


from webapp.api._analysis_context import (  # noqa: E402
    build_market_context as _build_market_context,
    dividend_adjusted_technical as _shared_dividend_adjusted_technical,
    normalize_dividends as _shared_normalize_dividends,
)

# Morning reports and interactive analysis intentionally share the same
# normalization and cash-dividend adjustment implementation.
normalize_dividends = _shared_normalize_dividends
dividend_adjusted_technical = _shared_dividend_adjusted_technical


def build_context(chart_data: dict, dividends: list[dict]) -> dict:
    as_of = str((chart_data.get("visibleRange") or {}).get("endDate") or "")[:10]
    return _build_market_context(chart_data, dividends, [], None, [], as_of)
