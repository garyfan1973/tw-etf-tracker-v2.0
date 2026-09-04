#!/usr/bin/env python3
"""Capture CNBC Top News #1 at 21:35 Asia/Taipei and add a bilingual digest."""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import os
import re
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
OUT_FILE = ROOT / "webapp" / "macro_news.json"
FEED_URL = "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114"
TAIPEI = ZoneInfo("Asia/Taipei")
UA = "Mozilla/5.0 (compatible; InvestmentResearchWorkspace/1.0)"


def clean_text(value, limit=520):
    text = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", html.unescape(text)).strip()[:limit]


def read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"updatedAt": "", "windowDays": 5, "sections": [], "failures": []}


def fetch_first(read_url=None):
    if read_url is None:
        def read_url(url):
            request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml"})
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read()
    item = ET.fromstring(read_url(FEED_URL)).find(".//item")
    if item is None:
        raise RuntimeError("CNBC Top News RSS 沒有新聞")
    title, url = clean_text(item.findtext("title"), 240), clean_text(item.findtext("link"), 500)
    if not title or not url.startswith("https://www.cnbc.com/"):
        raise RuntimeError("CNBC Top News 第一則欄位不完整")
    try:
        published = parsedate_to_datetime(item.findtext("pubDate") or "").astimezone(dt.timezone.utc)
    except (TypeError, ValueError):
        published = dt.datetime.now(dt.timezone.utc)
    return {"titleEn": title, "summaryEn": clean_text(item.findtext("description")), "url": url,
            "publishedAt": published.replace(microsecond=0).isoformat().replace("+00:00", "Z")}


def metadata_token():
    preset = os.environ.get("GOOGLE_TRANSLATE_ACCESS_TOKEN", "").strip()
    if preset:
        return preset
    request = urllib.request.Request(
        "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
        headers={"Metadata-Flavor": "Google"})
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))["access_token"]


def translate(values, request_json=None):
    project = os.environ.get("GOOGLE_CLOUD_PROJECT", "").strip()
    if not project:
        raise RuntimeError("缺少 GOOGLE_CLOUD_PROJECT")
    endpoint = f"https://translation.googleapis.com/v3/projects/{project}/locations/global:translateText"
    payload = json.dumps({"contents": values, "mimeType": "text/plain", "sourceLanguageCode": "en", "targetLanguageCode": "zh-TW"}).encode()
    if request_json is None:
        def request_json(url, body):
            request = urllib.request.Request(url, data=body, method="POST", headers={
                "Authorization": f"Bearer {metadata_token()}", "Content-Type": "application/json; charset=utf-8",
                "x-goog-user-project": project})
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
    result = request_json(endpoint, payload)
    rows = result.get("translations") or []
    if len(rows) != len(values):
        raise RuntimeError("Google Cloud Translation 回傳筆數不完整")
    return [clean_text(row.get("translatedText"), 520) for row in rows]


def update_payload(payload, article, captured_at, translator=translate):
    title_zh, summary_zh = translator([article["titleEn"], article["summaryEn"]])
    local_day = captured_at.astimezone(TAIPEI).date().isoformat()
    row = {"id": "cnbc-top:" + local_day, "captureDate": local_day, "title": title_zh,
           "titleEn": article["titleEn"], "titleZh": title_zh,
           "summaryEn": article["summaryEn"], "summaryZh": summary_zh,
           "url": article["url"], "source": "CNBC Top News", "category": "CNBC Top News",
           "publishedAt": article["publishedAt"],
           "capturedAt": captured_at.astimezone(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")}
    sections = [section for section in payload.get("sections") or [] if section.get("id") != "cnbc-top"]
    old = next((section for section in payload.get("sections") or [] if section.get("id") == "cnbc-top"), {"items": []})
    items = [row] + [item for item in old.get("items") or [] if item.get("captureDate") != local_day]
    cutoff = captured_at.astimezone(TAIPEI).date() - dt.timedelta(days=int(payload.get("windowDays") or 5))
    items = [item for item in items if item.get("captureDate", "") >= cutoff.isoformat()][:7]
    payload["sections"] = [{"id": "cnbc-top", "name": "CNBC 每日晚間頭條", "items": items}] + sections
    payload["updatedAt"] = captured_at.astimezone(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return payload


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="忽略 21:35 執行時段，供人工驗證")
    args = parser.parse_args()
    now = dt.datetime.now(TAIPEI)
    if not args.force and not (now.hour == 21 and 35 <= now.minute < 55):
        print("尚未到台北時間 21:35 擷取時段，保留既有 CNBC 頭條。")
        return 0
    payload = update_payload(read_json(OUT_FILE), fetch_first(), now)
    OUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote CNBC Top News: {payload['sections'][0]['items'][0]['titleEn']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
