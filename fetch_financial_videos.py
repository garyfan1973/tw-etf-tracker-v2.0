#!/usr/bin/env python3
"""Fetch the latest seven days of videos from curated official YouTube feeds."""

import datetime as dt
import json
import os
import time
import urllib.request
import xml.etree.ElementTree as ET


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_FILE = os.path.join(BASE_DIR, "webapp", "financial_videos.json")
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
YOUTUBE_FEED = "https://www.youtube.com/feeds/videos.xml?channel_id={}"

CHANNELS = [
    {"id": "capitalmorning", "name": "群益早安", "channelId": "UCZsKjvJdVl1o8dhOPIdthpw", "url": "https://www.youtube.com/@capitalcare6005", "keywords": ["群益早安"], "pinned": True},
    {"id": "yutinghao", "name": "游庭皓的財經皓角", "channelId": "UC0lbAQVpenvfA2QqzsRtL_g", "url": "https://www.youtube.com/@yutinghaofinance"},
    {"id": "jenny", "name": "財女珍妮", "channelId": "UCdwPn2TO60Ec8QDIFRx50lQ", "url": "https://www.youtube.com/channel/UCdwPn2TO60Ec8QDIFRx50lQ"},
    {"id": "moneyline", "name": "錢線百分百", "channelId": "UC_ObC9O0ZQ2FhW6u9_iFlZA", "url": "https://www.youtube.com/@ustvmoney100"},
    {"id": "allaround", "name": "股市全芳位", "channelId": "UCl9uBAM-_wtfte7XHeNMhHw", "url": "https://www.youtube.com/channel/UCl9uBAM-_wtfte7XHeNMhHw"},
    {"id": "stocklive", "name": "非凡股市現場", "channelId": "UCJcPWs0gpYMx_CghPdELUhw", "url": "https://www.youtube.com/@ustvstockonline"},
]

NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "yt": "http://www.youtube.com/xml/schemas/2015",
    "media": "http://search.yahoo.com/mrss/",
}


def read_url(url, retries=3):
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/atom+xml,application/xml,*/*"})
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read()
        except Exception:
            if attempt + 1 == retries:
                raise
            time.sleep(1.5 * (attempt + 1))


def parse_youtube_feed(content, channel, now=None, days=7):
    now = now or dt.datetime.now(dt.timezone.utc)
    cutoff = now - dt.timedelta(days=days)
    root = ET.fromstring(content)
    rows = []
    for entry in root.findall("atom:entry", NS):
        video_id = (entry.findtext("yt:videoId", default="", namespaces=NS) or "").strip()
        title = (entry.findtext("atom:title", default="", namespaces=NS) or "").strip()
        published_raw = entry.findtext("atom:published", default="", namespaces=NS)
        try:
            published = dt.datetime.fromisoformat(published_raw.replace("Z", "+00:00")).astimezone(dt.timezone.utc)
        except ValueError:
            continue
        if not video_id or published < cutoff or "#shorts" in title.lower():
            continue
        keywords = channel.get("keywords") or []
        if keywords and not any(keyword.lower() in title.lower() for keyword in keywords):
            continue
        rows.append({
            "videoId": video_id,
            "title": title,
            "publishedAt": published.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "thumbnail": "https://i.ytimg.com/vi/{}/hqdefault.jpg".format(video_id),
            "watchUrl": "https://www.youtube.com/watch?v={}".format(video_id),
            "channelId": channel["id"],
            "channelName": channel["name"],
        })
    return sorted(rows, key=lambda row: row["publishedAt"], reverse=True)


def load_existing():
    try:
        with open(OUT_FILE, encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return {}


def still_current(rows, now=None, days=7):
    now = now or dt.datetime.now(dt.timezone.utc)
    cutoff = now - dt.timedelta(days=days)
    result = []
    for row in rows or []:
        try:
            published = dt.datetime.fromisoformat(row["publishedAt"].replace("Z", "+00:00"))
        except (KeyError, TypeError, ValueError):
            continue
        if published >= cutoff:
            result.append(row)
    return sorted(result, key=lambda row: row["publishedAt"], reverse=True)


def featured_video_sort_key(row):
    """Keep the pinned morning program first, then order each group newest-first."""
    return (row.get("channelId") != "capitalmorning", -dt.datetime.fromisoformat(row["publishedAt"].replace("Z", "+00:00")).timestamp())


def main():
    now = dt.datetime.now(dt.timezone.utc)
    existing = {channel.get("id"): channel for channel in load_existing().get("channels", [])}
    channel_rows = []
    failures = []
    for channel in CHANNELS:
        try:
            videos = parse_youtube_feed(read_url(YOUTUBE_FEED.format(channel["channelId"])), channel, now)
            channel_rows.append({**channel, "videos": videos})
            print("updated {} ({} videos)".format(channel["name"], len(videos)))
        except Exception as error:
            retained = still_current(existing.get(channel["id"], {}).get("videos"), now)
            channel_rows.append({**channel, "videos": retained, "error": "來源暫時無法更新，顯示上次成功取得的內容"})
            failures.append("{}: {}".format(channel["name"], error))
    all_videos = sorted(
        (video for channel in channel_rows for video in channel["videos"]),
        key=featured_video_sort_key,
    )
    payload = {
        "updatedAt": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "windowDays": 7,
        "channels": channel_rows,
        "latest": all_videos,
        "source": "YouTube 官方頻道 RSS",
        "failures": failures,
    }
    with open(OUT_FILE, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    print("wrote {}".format(OUT_FILE))
    if failures:
        print("warnings: {}".format("; ".join(failures)))


if __name__ == "__main__":
    main()
