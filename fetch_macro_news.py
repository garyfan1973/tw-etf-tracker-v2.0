#!/usr/bin/env python3
"""Fetch a five-day, headline-only macro news digest."""

import datetime as dt
import html
import json
import os
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_FILE = os.path.join(BASE_DIR, "webapp", "macro_news.json")
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
WINDOW_DAYS = 5

# 一般產經與國際新聞並不等於總經新聞；在有可靠的官方發布來源前，不建立這兩個分類。
RSS_SOURCES = []

FRONTPAGE_SOURCES = [
    {"id": "udn-front", "name": "經濟日報頭版", "category": "經濟日報頭版", "url": "https://money.udn.com/money/index", "host": "money.udn.com"},
    {"id": "ctee-front", "name": "工商時報頭版", "category": "工商時報頭版", "url": "https://www.ctee.com.tw/", "host": "www.ctee.com.tw"},
]


def read_url(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/rss+xml,application/atom+xml,text/html,*/*"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def clean_text(value):
    return re.sub(r"\s+", " ", html.unescape(value or "")).strip()


def parse_feed(content, source, now):
    root = ET.fromstring(content)
    rows = []
    for entry in root.findall(".//item") + root.findall(".//{http://www.w3.org/2005/Atom}entry"):
        title = clean_text(entry.findtext("title") or entry.findtext("{http://www.w3.org/2005/Atom}title"))
        link = entry.findtext("link") or ""
        if not link:
            atom_link = entry.find("{http://www.w3.org/2005/Atom}link")
            link = atom_link.get("href", "") if atom_link is not None else ""
        published = entry.findtext("pubDate") or entry.findtext("published") or entry.findtext("{http://www.w3.org/2005/Atom}published") or entry.findtext("updated")
        try:
            stamp = dt.datetime.strptime(published[:25], "%a, %d %b %Y %H:%M:%S").replace(tzinfo=dt.timezone.utc) if published and "," in published else dt.datetime.fromisoformat((published or "").replace("Z", "+00:00"))
        except (TypeError, ValueError):
            stamp = now
        if title and link:
            rows.append({"id": source["id"] + ":" + link, "title": title, "url": link, "source": source["name"], "category": source["category"], "publishedAt": stamp.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")})
    return rows


class LinkParser(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.source = source
        self.href = ""
        self.parts = []
        self.rows = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.href = dict(attrs).get("href", "")
            self.parts = []

    def handle_data(self, data):
        if self.href:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag != "a" or not self.href:
            return
        title = clean_text(" ".join(self.parts))
        url = urllib.parse.urljoin(self.source["url"], self.href)
        parsed = urllib.parse.urlparse(url)
        if len(title) >= 8 and parsed.netloc == self.source["host"] and not any(word in title for word in ("登入", "註冊", "首頁", "會員", "搜尋", "更多")):
            self.rows.append({"id": self.source["id"] + ":" + url, "title": title, "url": url, "source": self.source["name"], "category": self.source["category"], "publishedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")})
        self.href = ""
        self.parts = []


def main():
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    cutoff = now - dt.timedelta(days=WINDOW_DAYS)
    sections = {}
    failures = []
    for source in RSS_SOURCES:
        try:
            rows = parse_feed(read_url(source["url"]), source, now)
            sections.setdefault(source["category"], []).extend(rows)
        except Exception as error:
            failures.append(f"{source['name']}: {error}")
    for source in FRONTPAGE_SOURCES:
        try:
            parser = LinkParser(source)
            parser.feed(read_url(source["url"]).decode("utf-8", errors="ignore"))
            sections.setdefault(source["category"], []).extend(parser.rows[:12])
        except Exception as error:
            failures.append(f"{source['name']}: {error}")
    output = []
    seen = set()
    for category, rows in sections.items():
        clean = []
        for row in sorted(rows, key=lambda item: item["publishedAt"], reverse=True):
            if row["id"] in seen or dt.datetime.fromisoformat(row["publishedAt"].replace("Z", "+00:00")) < cutoff:
                continue
            seen.add(row["id"])
            clean.append(row)
        if clean:
            output.append({"id": re.sub(r"[^a-z0-9]+", "-", category.lower()).strip("-"), "name": category, "items": clean[:20]})
    # Preserve the dedicated 21:35 CNBC capture while refreshing other sources.
    try:
        with open(OUT_FILE, encoding="utf-8") as handle:
            previous = json.load(handle)
        cnbc = next((section for section in previous.get("sections") or [] if section.get("id") == "cnbc-top"), None)
        if cnbc:
            output.insert(0, cnbc)
    except (OSError, ValueError):
        pass
    payload = {"updatedAt": now.isoformat().replace("+00:00", "Z"), "windowDays": WINDOW_DAYS, "sections": output, "failures": failures}
    with open(OUT_FILE, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    print(f"wrote {OUT_FILE} ({sum(len(section['items']) for section in output)} headlines)")
    if failures:
        print("warnings: " + "; ".join(failures))


if __name__ == "__main__":
    main()
