"""依標的即時取得官方重大訊息與近期媒體新聞。"""
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, quote_plus, urlparse
from email.utils import parsedate_to_datetime
import datetime
import hashlib
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

UA = "Mozilla/5.0 (compatible; ETFTracker/1.0)"
TWSE_MOPS = "https://openapi.twse.com.tw/v1/opendata/t187ap04_L"
TPEX_MOPS = "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap04_O"
MOPS_URL = "https://mops.twse.com.tw/mops/#/web/t05sr01_1"
GOOGLE_NEWS = "https://news.google.com/rss/search?q={query}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant"


def fetch_bytes(url):
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.read()


def fetch_json(url):
    return json.loads(fetch_bytes(url).decode("utf-8", errors="ignore"))


def safe_json(url):
    try:
        return fetch_json(url)
    except Exception:
        return []


def roc_date(value):
    digits = re.sub(r"\D", "", str(value or ""))
    if len(digits) < 7:
        return ""
    try:
        return "{:04d}-{}-{}".format(int(digits[:3]) + 1911, digits[3:5], digits[5:7])
    except ValueError:
        return ""


def event_kind(title):
    rules = [
        ("財務／營收", ("營收", "財務報告", "財報", "損益", "盈餘", "EPS")),
        ("股利／股務", ("股利", "除息", "配息", "增資", "減資", "庫藏股")),
        ("法說／治理", ("法說", "董事會", "股東會", "董事", "經理人")),
        ("營運事件", ("取得", "處分", "投資", "合約", "訴訟", "災害", "停工")),
    ]
    return next((label for label, words in rules if any(word in title for word in words)), "公司公告")


def official_items(code):
    items = []
    sources = (("上市", TWSE_MOPS), ("上櫃", TPEX_MOPS))
    with ThreadPoolExecutor(max_workers=2) as executor:
        payloads = list(executor.map(lambda source: safe_json(source[1]), sources))
    for (market, _), rows in zip(sources, payloads):
        for row in rows if isinstance(rows, list) else []:
            row_code = str(row.get("公司代號") or row.get("SecuritiesCompanyCode") or "").strip()
            if row_code != code:
                continue
            title = str(row.get("主旨 ") or row.get("主旨") or "").strip()
            if not title:
                continue
            published = roc_date(row.get("發言日期") or row.get("Date"))
            fact_date = roc_date(row.get("事實發生日"))
            item_id = hashlib.sha1((code + published + title).encode("utf-8")).hexdigest()[:16]
            items.append({"id": item_id, "type": "official", "category": event_kind(title),
                          "title": title, "source": "公開資訊觀測站（{}）".format(market),
                          "publishedAt": published, "factDate": fact_date, "url": MOPS_URL})
    return items


def news_items(code, name):
    terms = ['"{}"'.format(code)]
    clean_name = re.sub(r"\s+", "", name or "")
    if clean_name and clean_name != code:
        terms.append('"{}"'.format(clean_name))
    query = quote_plus(" OR ".join(terms) + " when:7d")
    try:
        root = ET.fromstring(fetch_bytes(GOOGLE_NEWS.format(query=query)))
    except Exception:
        return []
    items = []
    for node in root.findall("./channel/item")[:10]:
        title = (node.findtext("title") or "").strip()
        link = (node.findtext("link") or "").strip()
        source_node = node.find("source")
        source = (source_node.text or "").strip() if source_node is not None else "Google News"
        try:
            published = parsedate_to_datetime(node.findtext("pubDate") or "").astimezone(
                datetime.timezone(datetime.timedelta(hours=8))).isoformat(timespec="minutes")
        except (TypeError, ValueError):
            published = ""
        if not title or not link:
            continue
        if source and title.endswith(" - " + source):
            title = title[:-(len(source) + 3)].strip()
        item_id = hashlib.sha1(link.encode("utf-8")).hexdigest()[:16]
        items.append({"id": item_id, "type": "news", "category": "媒體報導", "title": title,
                      "source": source or "Google News", "publishedAt": published, "url": link})
    return items


def build_payload(code, name, market):
    get_official = lambda: official_items(code) if market == "TW" and code.isdigit() and len(code) == 4 else []
    with ThreadPoolExecutor(max_workers=2) as executor:
        official_future = executor.submit(get_official)
        media_future = executor.submit(news_items, code, name)
        try:
            official = official_future.result(timeout=13)
        except Exception:
            official = []
        try:
            media = media_future.result(timeout=13)
        except Exception:
            media = []
    items = sorted(official + media, key=lambda item: item.get("publishedAt") or "", reverse=True)
    return {"ok": True, "code": code, "name": name, "market": market, "items": items[:12],
            "officialCount": len(official), "newsCount": len(media),
            "fetchedAt": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(timespec="seconds")}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        code = (query.get("code", [""])[0] or "").strip().upper()
        name = (query.get("name", [""])[0] or "").strip()[:60]
        market = (query.get("market", ["TW"])[0] or "TW").strip().upper()
        if not re.fullmatch(r"[0-9A-Z.\-]{1,12}", code):
            return self.send_json({"ok": False, "error": "標的代號格式不正確"}, 400)
        try:
            payload, status = build_payload(code, name, market), 200
        except Exception as exc:
            payload, status = {"ok": False, "error": "消息來源暫時無法連線：{}".format(exc)}, 502
        self.send_json(payload, status)

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=3600")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
