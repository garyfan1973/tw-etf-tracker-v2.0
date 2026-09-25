"""取得台股每週集保戶股權分散資料。"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlencode, urlparse
import datetime
import json
import re
import urllib.request


UA = "Mozilla/5.0 (compatible; ETFTracker/1.0)"
TDCC_URL = "https://www.tdcc.com.tw/portal/zh/smWeb/qryStock"
TDCC_SOURCE = "https://www.tdcc.com.tw/portal/zh/smWeb/qryStock"


def fetch_page(url, data=None, cookie="", timeout=12):
    headers = {"User-Agent": UA}
    if data is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    if cookie:
        headers["Cookie"] = cookie
    request = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="ignore"), response.headers


class TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.row = []
        elif tag in {"td", "th"} and self.row is not None:
            self.cell = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag in {"td", "th"} and self.row is not None and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row:
            self.rows.append(self.row)
            self.row = None


def number(value):
    text = re.sub(r"[^0-9.\-]", "", str(value or ""))
    try:
        return float(text) if text else None
    except ValueError:
        return None


def iso_date(value):
    digits = re.sub(r"\D", "", str(value or ""))
    if len(digits) == 8:
        return f"{digits[:4]}-{digits[4:6]}-{digits[6:]}"
    return ""


def available_dates(page):
    values = re.findall(r'<option value="(\d{8})"', page)
    return list(dict.fromkeys(values))


def parse_rows(page, code, date):
    parser = TableParser()
    parser.feed(page)
    target = []
    for row in parser.rows:
        if len(row) < 5 or not row[0].isdigit() or "合計" in row[1].replace(" ", ""):
            continue
        holders, shares, holding_pct = number(row[2]), number(row[3]), number(row[4])
        if holders is None or shares is None or holding_pct is None:
            continue
        target.append({
            "level": int(row[0]),
            "label": row[1],
            "holders": int(holders),
            "shares": int(shares),
            "holdingPct": holding_pct,
        })
    if not target:
        return None
    total_holders = sum(item["holders"] for item in target)
    total_shares = sum(item["shares"] for item in target)
    for item in target:
        item["peoplePct"] = round(item["holders"] / total_holders * 100, 4) if total_holders else 0
    return {
        "date": iso_date(date),
        "code": code,
        "totalHolders": total_holders,
        "totalShares": total_shares,
        "buckets": target,
    }


def fetch_distribution(code, date):
    page, headers = fetch_page(TDCC_URL)
    token_match = re.search(r'name="SYNCHRONIZER_TOKEN" value="([^"]+)', page)
    cookie = headers.get("Set-Cookie", "").split(";", 1)[0]
    if not token_match or not cookie:
        return None
    body = urlencode({
        "SYNCHRONIZER_TOKEN": token_match.group(1),
        "SYNCHRONIZER_URI": "/portal/zh/smWeb/qryStock",
        "method": "submit",
        "firDate": date,
        "scaDate": date,
        "sqlMethod": "StockNo",
        "stockNo": code,
        "stockName": "",
    }).encode("utf-8")
    page, _ = fetch_page(TDCC_URL, data=body, cookie=cookie)
    return parse_rows(page, code, date)


def build_payload(code, requested_weeks):
    page, headers = fetch_page(TDCC_URL)
    dates = available_dates(page)
    if not dates:
        raise RuntimeError("TDCC 查詢頁面暫時無法使用")
    selected_dates = dates[:requested_weeks]
    results = []
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(fetch_distribution, code, date): date for date in selected_dates}
        for future in as_completed(futures):
            try:
                result = future.result()
            except Exception:
                result = None
            if result:
                results.append(result)
    results.sort(key=lambda item: item["date"])
    return {
        "ok": True,
        "code": code,
        "weeks": results,
        "source": {"name": "TDCC 集保戶股權分散表", "url": TDCC_SOURCE},
        "fetchedAt": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(timespec="seconds"),
    }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        code = (query.get("code", [""])[0] or "").strip().upper()
        market = (query.get("market", ["TW"])[0] or "TW").strip().upper()
        try:
            weeks = max(4, min(20, int(query.get("weeks", ["10"])[0])))
        except ValueError:
            weeks = 10
        if market != "TW" or not re.fullmatch(r"\d{4,6}", code):
            return self.send_json({"ok": False, "error": "股權分散資料目前僅支援台股代號"}, 400)
        try:
            payload, status = build_payload(code, weeks), 200
        except Exception as exc:
            payload, status = {"ok": False, "error": "TDCC 股權分散資料暫時無法取得：{}".format(exc)}, 502
        self.send_json(payload, status)

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=3600")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
