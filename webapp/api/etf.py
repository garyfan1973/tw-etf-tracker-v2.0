# Vercel Serverless Function：即時查詢單一 ETF 資料（供「新增代號」當下驗證＋顯示）
# GET /api/etf?code=00980A
#   回傳 { ok, code, name, snapshots:[{date,count,holdings:[...]}], dividends:[...] }
#   查無此 ETF 時回 { ok:false, error }
# 註：解析邏輯與根目錄 fetch.py 相同（此檔為部署在 Vercel 的獨立版本，僅取單一 ETF）。
# 為求即時，海外報價不在此補（等每日雲端更新），台股報價即時併入。
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import re
import html
import subprocess
import urllib.request

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
MDJ_HOLD = "https://www.moneydj.com/ETF/X/Basic/Basic0007B.xdjhtm?etfid={c}.tw"
MDJ_DIV = "https://www.moneydj.com/ETF/X/Basic/Basic0005.xdjhtm?etfid={c}.tw"
TWSE_QUOTE_URL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
TPEX_QUOTE_URL = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes"


def curl_text(url):
    """抓網頁：先試 curl（本機 macOS 憑證相容），失敗退回 urllib（Vercel Linux 可用）。"""
    try:
        out = subprocess.run(["curl", "-s", "-m", "20", "-A", UA, url],
                             capture_output=True, timeout=25)
        if out.returncode == 0 and out.stdout:
            return out.stdout.decode("utf-8", errors="ignore")
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def fetch_json(url):
    try:
        out = subprocess.run(["curl", "-s", "-m", "20", "-A", UA, url],
                             capture_output=True, timeout=25)
        if out.returncode == 0 and out.stdout:
            return json.loads(out.stdout.decode("utf-8", errors="ignore"))
    except (FileNotFoundError, subprocess.TimeoutExpired, json.JSONDecodeError):
        pass
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8", errors="ignore"))


def _num(v):
    if v is None:
        return None
    s = str(v).replace(",", "").strip()
    if s in ("", "--", "---", "N/A"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_holdings(page):
    holdings = []
    in_section = False
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S):
        cells = [html.unescape(re.sub(r"<[^>]+>", "", c)).strip()
                 for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)]
        cells = [c for c in cells if c]
        if not cells:
            continue
        joined = " ".join(cells)
        if "個股名稱" in joined:
            in_section = True
            continue
        if "ETF代碼" in joined:
            break
        if not in_section or len(cells) < 3:
            continue
        weight = _num(cells[1])
        if weight is None:
            continue
        try:
            shares = int(cells[2].replace(",", ""))
        except ValueError:
            continue
        m = re.match(r"^(.*?)\(([0-9A-Za-z]+)\.([A-Za-z]{2,3})\)\s*$", cells[0])
        if m:
            name, code, market = m.group(1).strip(), m.group(2), m.group(3).upper()
        else:
            name, code, market = cells[0].strip(), "", ""
        holdings.append({"code": code, "name": name, "market": market,
                         "weight": weight, "shares": shares})
    return holdings


def parse_data_date(page):
    m = re.search(r"資料日期[：:]\s*(20\d{2})[/-](\d{1,2})[/-](\d{1,2})", page)
    if m:
        return "{}-{:02d}-{:02d}".format(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return ""


def parse_etf_name(page):
    m = re.search(r"<title>(.*?)</title>", page, re.S)
    if not m:
        return ""
    return re.split(r"[-|｜]", html.unescape(m.group(1)).strip())[0].strip()


def _quote_fields(o, hi, lo, cl, ch):
    prev = round(cl - ch, 4) if (cl is not None and ch is not None) else None
    pct = round(ch / prev * 100, 2) if (ch is not None and prev) else None
    amp = round((hi - lo) / prev * 100, 2) if (hi is not None and lo is not None and prev) else None
    return {"open": o, "high": hi, "low": lo, "close": cl,
            "prevClose": prev, "change": ch, "changePct": pct, "amplitude": amp}


def fetch_twse_quotes():
    quotes = {}
    try:
        for r in fetch_json(TWSE_QUOTE_URL):
            code = r.get("Code")
            if not code:
                continue
            q = _quote_fields(_num(r.get("OpeningPrice")), _num(r.get("HighestPrice")),
                              _num(r.get("LowestPrice")), _num(r.get("ClosingPrice")),
                              _num(r.get("Change")))
            q["volume"] = _num(r.get("TradeVolume"))
            quotes[code] = q
    except Exception:
        pass
    return quotes


def fetch_tpex_quotes():
    quotes = {}
    try:
        for r in fetch_json(TPEX_QUOTE_URL):
            code = r.get("SecuritiesCompanyCode")
            if not code:
                continue
            q = _quote_fields(_num(r.get("Open")), _num(r.get("High")),
                              _num(r.get("Low")), _num(r.get("Close")), _num(r.get("Change")))
            q["volume"] = _num(r.get("TradingShares"))
            quotes[code] = q
    except Exception:
        pass
    return quotes


def _iso(s):
    m = re.match(r"(20\d{2})/(\d{1,2})/(\d{1,2})", s or "")
    return "{}-{:02d}-{:02d}".format(int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else ""


def parse_dividends(page):
    grid = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S):
        cells = [html.unescape(re.sub(r"<[^>]+>", "", c)).strip()
                 for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)]
        grid.append(cells)
    header = hi = None
    for i, cells in enumerate(grid):
        if "除息日" in cells:
            header, hi = cells, i
            break
    if hi is None:
        return []
    col = {n: j for j, n in enumerate(header)}

    def g(cells, n):
        j = col.get(n)
        return cells[j] if (j is not None and j < len(cells)) else ""

    out = []
    for cells in grid[hi + 1:]:
        if len(cells) < len(header):
            continue
        ex = _iso(g(cells, "除息日"))
        if not ex:
            continue
        out.append({"ex": ex, "pay": _iso(g(cells, "發放日")), "base": _iso(g(cells, "配息基準日")),
                    "amount": _num(g(cells, "配息總額")),
                    "yield": _num(g(cells, "年化配息率(%)") or g(cells, "年化配息率"))})
    return out


def fetch_etf(code):
    """即時抓單一 ETF：持股（含台股報價）＋名稱＋配息。查無回 ok:false。"""
    code = code.upper()
    page = curl_text(MDJ_HOLD.format(c=code))
    holdings = parse_holdings(page)
    if not holdings:
        return {"ok": False, "error": "查無此 ETF 代號（可能非 ETF 或代號有誤）"}
    name = parse_etf_name(page) or code
    data_date = parse_data_date(page)
    # 台股報價：先抓上市，未命中的（上櫃）才再抓 TPEx，降低延遲
    tw = [h for h in holdings if h.get("market") == "TW"]
    twse = fetch_twse_quotes()
    tpex = None
    missing = []
    for h in tw:
        q = twse.get(h["code"])
        if q:
            h.update(q)
        else:
            missing.append(h)
    if missing:
        tpex = fetch_tpex_quotes()
        for h in missing:
            q = tpex.get(h["code"])
            if q:
                h.update(q)
    # ETF 自身當日行情（個人持股算市值/損益用）
    self_quote = twse.get(code)
    if self_quote is None:
        if tpex is None:
            tpex = fetch_tpex_quotes()
        self_quote = tpex.get(code)
    try:
        dividends = parse_dividends(curl_text(MDJ_DIV.format(c=code)))
    except Exception:
        dividends = []
    snapshot = {"date": data_date, "count": len(holdings), "self": self_quote, "holdings": holdings}
    return {"ok": True, "code": code, "name": name,
            "snapshots": [snapshot], "dividends": dividends}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        qs = parse_qs(urlparse(self.path).query)
        code = (qs.get("code", [""])[0] or "").strip().upper()
        if not re.match(r"^[0-9A-Z]{4,6}$", code):
            return self._send({"ok": False, "error": "代號格式不正確（4–6 碼英數）"})
        try:
            result = fetch_etf(code)
        except Exception as exc:
            result = {"ok": False, "error": "查詢失敗：{}".format(exc)}
        self._send(result)

    def _send(self, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "public, max-age=300")
        self.end_headers()
        self.wfile.write(body)
