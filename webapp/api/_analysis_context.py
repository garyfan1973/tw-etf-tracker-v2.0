"""Shared, source-backed context builder for interactive and morning analysis."""
from __future__ import annotations

import datetime as dt
import json
import math
from pathlib import Path


def normalize_dividends(rows):
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


def _ema(values, period):
    alpha, result = 2 / (period + 1), []
    for value in values:
        result.append(value if not result else value * alpha + result[-1] * (1 - alpha))
    return result


def _rsi(values, period):
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


def _kd(rows):
    if not rows:
        return None, None
    k = d = 50.0
    for index, row in enumerate(rows):
        window = rows[max(0, index - 8):index + 1]
        high, low = max(item["high"] for item in window), min(item["low"] for item in window)
        rsv = 50.0 if high == low else (row["close"] - low) / (high - low) * 100
        k = k * 2 / 3 + rsv / 3
        d = d * 2 / 3 + k / 3
    return k, d


def dividend_adjusted_technical(chart_data, dividends):
    rows = [
        {"date": row["date"], **{key: float(row[key]) for key in ("open", "high", "low", "close")}}
        for row in (chart_data or {}).get("priceRows") or []
        if all(row.get(key) is not None for key in ("date", "open", "high", "low", "close"))
    ]
    actions, by_date, factors = [], {row["date"]: i for i, row in enumerate(rows)}, [1.0] * len(rows)
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
            "priorClose": _round(previous["close"]), "exDateClose": _round(current["close"]),
            "rawGapPct": _round((current["close"] / previous["close"] - 1) * 100, 2),
            "dividendAdjustedReturnPct": _round(((current["close"] + dividend["amount"]) / previous["close"] - 1) * 100, 2),
            "backAdjustmentFactor": _round(factor, 8),
        })
    adjusted = [
        {"date": row["date"], **{key: _round(row[key] * factor) for key in ("open", "high", "low", "close")}}
        for row, factor in zip(rows, factors)
    ]
    closes = [row["close"] for row in adjusted]
    fast, slow = _ema(closes, 12), _ema(closes, 26)
    dif = [a - b for a, b in zip(fast, slow)]
    signal = _ema(dif, 9)
    k, d = _kd(adjusted)
    window = closes[-20:]
    mean = sum(window) / len(window) if window else None
    deviation = math.sqrt(sum((value - mean) ** 2 for value in window) / len(window)) if window else None
    technical = {
        "basis": "cash-dividend-back-adjusted",
        "latestDate": adjusted[-1]["date"] if adjusted else None,
        "latestClose": _round(closes[-1]) if closes else None,
        **{f"ma{period}": _round(sum(closes[-period:]) / period) if len(closes) >= period else None for period in (5, 10, 20, 60, 120)},
        "bollinger": {"upper": _round(mean + 2 * deviation), "mid": _round(mean), "lower": _round(mean - 2 * deviation)} if mean is not None else None,
        "kd": {"k": _round(k, 2), "d": _round(d, 2)},
        "macd": {"dif": _round(dif[-1]), "signal": _round(signal[-1]), "histogram": _round(dif[-1] - signal[-1])} if dif else None,
        "rsi5": _round(_rsi(closes, 5), 2), "rsi10": _round(_rsi(closes, 10), 2),
        "recentAdjustedRows": adjusted[-30:],
    }
    return technical, actions


def build_market_context(chart_data, dividends, news, positioning=None, availability_notes=None, as_of=None):
    as_of = str(as_of or ((chart_data or {}).get("visibleRange") or {}).get("endDate") or dt.date.today().isoformat())[:10]
    try:
        as_of_date = dt.date.fromisoformat(as_of)
    except ValueError:
        as_of_date, as_of = dt.date.today(), dt.date.today().isoformat()
    normalized = normalize_dividends(dividends)
    start, end = as_of_date - dt.timedelta(days=180), as_of_date + dt.timedelta(days=90)
    relevant = [row for row in normalized if start.isoformat() <= row["exDate"] <= end.isoformat()]
    adjusted, actions = dividend_adjusted_technical(chart_data or {}, relevant)
    notes = list(availability_notes or [])
    clean_news = [{
        "title": str(item.get("title") or "")[:240], "source": str(item.get("source") or "")[:100],
        "publishedAt": str(item.get("publishedAt") or "")[:32], "category": str(item.get("category") or "")[:60],
        "type": str(item.get("type") or "news")[:20],
    } for item in (news or [])[:8] if item.get("title")]
    if not clean_news:
        notes.append("近 7 日沒有取得可驗證的公司公告或媒體標題。")
    if not relevant:
        notes.append("分析區間附近沒有取得配息／除息事件。")
    return {
        "version": 1, "asOfDate": as_of, "corporateActions": actions or relevant,
        "adjustedTechnical": adjusted, "news": clean_news, "positioning": positioning,
        "availabilityNotes": notes,
    }


_DATA_CACHE = None


def load_webapp_market_data(path=None):
    global _DATA_CACHE
    if _DATA_CACHE is not None and path is None:
        return _DATA_CACHE
    target = Path(path) if path else Path(__file__).resolve().parents[1] / "data.js"
    text = target.read_text(encoding="utf-8").strip()
    prefix = "window.DATA = "
    if not text.startswith(prefix):
        return {}
    payload = json.loads(text[len(prefix):].rstrip(";\n "))
    if path is None:
        _DATA_CACHE = payload
    return payload


def webapp_positioning(symbol, market, as_of, data=None):
    if market != "TW":
        return None, ["非台股標的，未提供台灣三大法人、融資券與集保資料。"]
    try:
        data = data or load_webapp_market_data()
    except (OSError, ValueError):
        return None, ["籌碼資料檔暫時無法讀取。"]
    etfs, by_date, distribution = data.get("etfs") or {}, {}, None
    direct = etfs.get(symbol) or {}
    if direct:
        distribution = direct.get("shareholderDistribution")
        for snapshot in direct.get("snapshots") or []:
            date = str(snapshot.get("date") or "")[:10]
            if date and date <= as_of:
                by_date[date] = (snapshot.get("selfInstitutional"), snapshot.get("selfMargin"))
    else:
        for etf in etfs.values():
            for snapshot in etf.get("snapshots") or []:
                date = str(snapshot.get("date") or "")[:10]
                if not date or date > as_of or date in by_date:
                    continue
                holding = next((row for row in snapshot.get("holdings") or [] if str(row.get("code") or "").upper() == symbol), None)
                if holding:
                    by_date[date] = (holding.get("inst"), holding.get("margin"))
    dates = sorted(by_date)[-5:]
    institutional = [by_date[date][0] for date in dates if by_date[date][0]]
    margin = [by_date[date][1] for date in dates if by_date[date][1]]
    if not institutional and not margin and not distribution:
        return None, ["目前沒有此台股標的的法人／融資券或集保資料。"]
    return {
        "institutionalDaily": institutional, "marginDaily": margin,
        "shareholderDistribution": distribution,
        "sources": ["TWSE／TPEx 三大法人與融資券", "TDCC 集保戶股權分散表"],
    }, []
