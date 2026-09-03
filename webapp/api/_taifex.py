"""Official TAIFEX market context used by the futures page and AI analysis."""
from __future__ import annotations

import datetime as dt
import json
import urllib.request


BASE = "https://openapi.taifex.com.tw/v1"
UA = "Mozilla/5.0 (compatible; InvestmentResearchWorkspace/1.0)"
PRODUCTS = {"TX": "臺股期貨", "MTX": "小型臺指", "TMF": "微型臺指"}


def _get(path, timeout=18):
    request = urllib.request.Request(f"{BASE}/{path}", headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _number(value):
    try:
        text = str(value).replace(",", "").replace("%", "").strip()
        return None if text in {"", "-", "NULL"} else float(text)
    except (TypeError, ValueError):
        return None


def _date(value):
    text = str(value or "")
    return f"{text[:4]}-{text[4:6]}-{text[6:8]}" if len(text) == 8 else text


def _contract(row):
    return {
        "month": str(row.get("ContractMonth(Week)") or ""),
        "session": "night" if row.get("TradingSession") == "盤後" else "day",
        "sessionLabel": "盤後交易" if row.get("TradingSession") == "盤後" else "一般交易",
        "open": _number(row.get("Open")), "high": _number(row.get("High")),
        "low": _number(row.get("Low")), "last": _number(row.get("Last")),
        "change": _number(row.get("Change")), "changePct": _number(row.get("%")),
        "volume": _number(row.get("Volume")), "settlement": _number(row.get("SettlementPrice")),
        "openInterest": _number(row.get("OpenInterest")), "bid": _number(row.get("BestBid")),
        "ask": _number(row.get("BestAsk")),
    }


def build_snapshot(daily=None, institutional=None, put_call=None):
    daily = daily if daily is not None else _get("DailyMarketReportFut")
    institutional = institutional if institutional is not None else _get("MarketDataOfMajorInstitutionalTradersDetailsOfFuturesContractsBytheDate")
    put_call = put_call if put_call is not None else _get("PutCallRatio")
    dates = sorted({str(row.get("Date") or "") for row in daily if row.get("Contract") in PRODUCTS})
    if not dates:
        raise ValueError("期交所目前沒有台指期資料")
    latest_raw = dates[-1]
    products = {}
    for code, name in PRODUCTS.items():
        rows = [row for row in daily if row.get("Contract") == code and str(row.get("Date")) == latest_raw]
        # Calendar-spread rows use values such as 202609/202610; those prices are
        # spreads, not outright futures quotes, and must never enter the curve.
        outright = lambda row: "/" not in str(row.get("ContractMonth(Week)") or "")
        day_rows = sorted((row for row in rows if outright(row) and row.get("TradingSession") == "一般" and _number(row.get("Last")) is not None), key=lambda row: str(row.get("ContractMonth(Week)")))
        night_rows = sorted((row for row in rows if outright(row) and row.get("TradingSession") == "盤後" and _number(row.get("Last")) is not None), key=lambda row: str(row.get("ContractMonth(Week)")))
        if not day_rows and not night_rows:
            continue
        front_month = (day_rows or night_rows)[0].get("ContractMonth(Week)")
        day = next((row for row in day_rows if row.get("ContractMonth(Week)") == front_month), None)
        night = next((row for row in night_rows if row.get("ContractMonth(Week)") == front_month), None)
        products[code] = {
            "code": code, "name": name, "frontMonth": front_month,
            "day": _contract(day) if day else None, "night": _contract(night) if night else None,
            "termStructure": [_contract(row) for row in day_rows[:6]],
        }
    inst_date = max((str(row.get("Date") or "") for row in institutional), default="")
    institutions = []
    for row in institutional:
        if str(row.get("Date") or "") != inst_date or row.get("ContractCode") != "臺股期貨":
            continue
        institutions.append({
            "name": str(row.get("Item") or ""),
            "tradingNet": _number(row.get("TradingVolume(Net)")),
            "openInterestLong": _number(row.get("OpenInterest(Long)")),
            "openInterestShort": _number(row.get("OpenInterest(Short)")),
            "openInterestNet": _number(row.get("OpenInterest(Net)")),
        })
    ratios = [{
        "date": _date(row.get("Date")), "volumeRatio": _number(row.get("PutCallVolumeRatio%")),
        "openInterestRatio": _number(row.get("PutCallOIRatio%")),
        "putVolume": _number(row.get("PutVolume")), "callVolume": _number(row.get("CallVolume")),
    } for row in put_call[:30]]
    return {
        "ok": True, "dataType": "official-end-of-session", "asOfDate": _date(latest_raw),
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "products": products,
        "institutional": {"asOfDate": _date(inst_date), "rows": institutions},
        "putCall": ratios, "realtimeUrl": "https://mis.taifex.com.tw/futures/",
        "source": "臺灣期貨交易所 OpenAPI",
    }


def compact_context():
    snapshot = build_snapshot()
    tx = snapshot.get("products", {}).get("TX", {})
    return {
        "source": snapshot["source"], "asOfDate": snapshot["asOfDate"],
        "dataType": snapshot["dataType"], "txFrontMonth": tx.get("frontMonth"),
        "day": tx.get("day"), "night": tx.get("night"),
        "institutional": snapshot.get("institutional"),
        "putCall": (snapshot.get("putCall") or [None])[0],
    }
