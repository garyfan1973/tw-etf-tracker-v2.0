#!/usr/bin/env python3
"""Fetch source-backed Federal Reserve policy data for the dashboard."""

import csv
import datetime as dt
import email.utils
import html
import io
import json
import os
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_FILE = os.path.join(BASE_DIR, "webapp", "fed_policy_data.json")
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
FRED_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}&cosd={start}"
FED_RSS = "https://www.federalreserve.gov/feeds/press_monetary.xml"

RATE_SERIES = {
    "DFEDTARL": {"key": "targetLower", "label": "目標區間下限", "sourceUrl": "https://fred.stlouisfed.org/series/DFEDTARL"},
    "DFEDTARU": {"key": "targetUpper", "label": "目標區間上限", "sourceUrl": "https://fred.stlouisfed.org/series/DFEDTARU"},
    "DFF": {"key": "effectiveRate", "label": "有效聯邦基金利率", "sourceUrl": "https://fred.stlouisfed.org/series/DFF"},
}

BALANCE_SERIES = {
    "WALCL": {"key": "totalAssets", "label": "聯準會總資產", "scale": 0.001, "sourceUrl": "https://fred.stlouisfed.org/series/WALCL"},
    "TREAST": {"key": "treasuries", "label": "美國公債持有量", "scale": 0.001, "sourceUrl": "https://fred.stlouisfed.org/series/TREAST"},
    "WSHOMCB": {"key": "mbs", "label": "MBS 持有量", "scale": 0.001, "sourceUrl": "https://fred.stlouisfed.org/series/WSHOMCB"},
    "WRESBAL": {"key": "reserves", "label": "準備金餘額", "scale": 0.001, "sourceUrl": "https://fred.stlouisfed.org/series/WRESBAL"},
    "RRPONTSYD": {"key": "onRrp", "label": "隔夜逆回購 ON RRP", "scale": 1.0, "sourceUrl": "https://fred.stlouisfed.org/series/RRPONTSYD"},
}

FOMC_MEETINGS = [
    {"start": "2026-01-27", "end": "2026-01-28", "projections": False},
    {"start": "2026-03-17", "end": "2026-03-18", "projections": True},
    {"start": "2026-04-28", "end": "2026-04-29", "projections": False},
    {"start": "2026-06-16", "end": "2026-06-17", "projections": True},
    {"start": "2026-07-28", "end": "2026-07-29", "projections": False},
    {"start": "2026-09-15", "end": "2026-09-16", "projections": True},
    {"start": "2026-10-27", "end": "2026-10-28", "projections": False},
    {"start": "2026-12-08", "end": "2026-12-09", "projections": True},
    {"start": "2027-01-26", "end": "2027-01-27", "projections": False},
    {"start": "2027-03-16", "end": "2027-03-17", "projections": True},
    {"start": "2027-04-27", "end": "2027-04-28", "projections": False},
    {"start": "2027-06-08", "end": "2027-06-09", "projections": True},
    {"start": "2027-07-27", "end": "2027-07-28", "projections": False},
    {"start": "2027-09-14", "end": "2027-09-15", "projections": True},
    {"start": "2027-10-26", "end": "2027-10-27", "projections": False},
    {"start": "2027-12-07", "end": "2027-12-08", "projections": True},
]


def read_url(url, retries=3):
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/csv,application/xml,text/xml,*/*"})
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read()
        except Exception:
            if attempt + 1 == retries:
                raise
            time.sleep(1.5 * (attempt + 1))


def parse_fred_csv(content, series_id, scale=1.0):
    text = content.decode("utf-8-sig") if isinstance(content, bytes) else content
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for source_row in reader:
        date = source_row.get("observation_date") or source_row.get("DATE")
        raw = source_row.get(series_id)
        if raw is None and reader.fieldnames and len(reader.fieldnames) > 1:
            raw = source_row.get(reader.fieldnames[1])
        try:
            value = round(float(raw) * scale, 6)
        except (TypeError, ValueError):
            continue
        if date:
            rows.append({"date": date, "value": value})
    return rows


def fetch_fred_series(series_id, start, scale=1.0):
    url = FRED_CSV.format(series=urllib.parse.quote(series_id), start=start)
    return parse_fred_csv(read_url(url), series_id, scale)


def merge_rate_series(series_rows):
    by_date = {}
    for key, rows in series_rows.items():
        for row in rows:
            by_date.setdefault(row["date"], {"date": row["date"]})[key] = row["value"]
    return [by_date[date] for date in sorted(by_date) if any(key in by_date[date] for key in ("targetLower", "targetUpper", "effectiveRate"))]


def strip_markup(value):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", value or ""))).strip()


def parse_policy_feed(content, now=None, days=120):
    now = now or dt.datetime.now(dt.timezone.utc)
    root = ET.fromstring(content)
    cutoff = now - dt.timedelta(days=days)
    rows = []
    for item in root.findall(".//item"):
        title = strip_markup(item.findtext("title"))
        link = (item.findtext("link") or "").strip()
        description = strip_markup(item.findtext("description"))
        try:
            published = email.utils.parsedate_to_datetime(item.findtext("pubDate") or "").astimezone(dt.timezone.utc)
        except (TypeError, ValueError):
            continue
        if published < cutoff:
            continue
        rows.append({
            "title": title,
            "url": link,
            "publishedAt": published.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "summary": description[:320],
        })
    return sorted(rows, key=lambda row: row["publishedAt"], reverse=True)


def latest_value(rows):
    return rows[-1] if rows else None


def previous_distinct(rows, key):
    values = [row.get(key) for row in rows if row.get(key) is not None]
    if not values:
        return None
    latest = values[-1]
    return next((value for value in reversed(values[:-1]) if value != latest), latest)


def main():
    now = dt.datetime.now(dt.timezone.utc)
    start = (now.date() - dt.timedelta(days=365 * 5 + 5)).isoformat()
    rate_parts = {}
    for series_id, config in RATE_SERIES.items():
        rate_parts[config["key"]] = fetch_fred_series(series_id, start)
        print("updated FRED {}".format(series_id))
    rate_rows = merge_rate_series(rate_parts)[-1600:]

    balance = []
    for series_id, config in BALANCE_SERIES.items():
        rows = fetch_fred_series(series_id, start, config["scale"])[-1600:]
        balance.append({
            "id": config["key"], "seriesId": series_id, "label": config["label"],
            "unit": "十億美元", "sourceUrl": config["sourceUrl"], "rows": rows,
        })
        print("updated FRED {}".format(series_id))

    events = parse_policy_feed(read_url(FED_RSS), now)
    today = now.date().isoformat()
    next_meeting = next((meeting for meeting in FOMC_MEETINGS if meeting["end"] >= today), None)
    latest_decision = next((item for item in events if "FOMC" in item["title"] and "statement" in item["title"].lower()), events[0] if events else None)
    lower = latest_value(rate_parts["targetLower"])
    upper = latest_value(rate_parts["targetUpper"])
    effective = latest_value(rate_parts["effectiveRate"])
    total_assets = latest_value(next(item["rows"] for item in balance if item["id"] == "totalAssets"))
    payload = {
        "updatedAt": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "summary": {
            "targetLower": lower,
            "targetUpper": upper,
            "effectiveRate": effective,
            "previousTargetUpper": previous_distinct(rate_rows, "targetUpper"),
            "totalAssets": total_assets,
            "nextMeeting": next_meeting,
            "latestDecision": latest_decision,
        },
        "rateHistory": rate_rows,
        "balanceSheet": balance,
        "meetings": FOMC_MEETINGS,
        "policyEvents": events,
        "sources": {
            "rates": "Federal Reserve Bank of St. Louis (FRED)",
            "ratesUrl": "https://fred.stlouisfed.org/",
            "events": "Board of Governors of the Federal Reserve System",
            "eventsUrl": "https://www.federalreserve.gov/monetarypolicy.htm",
            "calendarUrl": "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
        },
    }
    with open(OUT_FILE, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    print("wrote {}".format(OUT_FILE))


if __name__ == "__main__":
    main()
