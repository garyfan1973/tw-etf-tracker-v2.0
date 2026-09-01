"""Taiwan stock-market heatmap backed by TWSE/TPEx official public data."""
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, quote, urlparse
import datetime as dt
import json
import re
import urllib.request


UA = "Mozilla/5.0 (compatible; InvestmentResearchWorkspace/1.0)"
TWSE_ALL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
TPEX_ALL = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes"
MIS = "https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch={}&json=1&delay=0"


def fetch_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=18) as response:
        return json.loads(response.read().decode("utf-8", errors="ignore"))


def number(value):
    try:
        text = str(value or "").replace(",", "").replace("+", "").strip()
        return float(text) if text not in {"", "-", "--", "---"} else None
    except (TypeError, ValueError):
        return None


def iso_roc_date(value):
    text = str(value or "")
    if len(text) == 7 and text.isdigit():
        return f"{int(text[:3]) + 1911:04d}-{text[3:5]}-{text[5:7]}"
    return None


def daily_items(rows, market):
    fields = {
        "TWSE": ("Code", "Name", "ClosingPrice", "Change", "TradeValue", "Date"),
        "TPEX": ("SecuritiesCompanyCode", "CompanyName", "Close", "Change", "TransactionAmount", "Date"),
    }[market]
    items = []
    for row in rows or []:
        code, name = str(row.get(fields[0]) or "").strip(), str(row.get(fields[1]) or "").strip()
        # Ordinary Taiwan stock codes are four digits and do not start with 0;
        # this keeps ETFs/ETNs such as 0050 out of the equity heatmap.
        if not re.fullmatch(r"[1-9]\d{3}", code):
            continue
        close, change, turnover = number(row.get(fields[2])), number(row.get(fields[3])), number(row.get(fields[4]))
        if close is None or turnover is None or turnover <= 0:
            continue
        previous = close - (change or 0)
        change_pct = (close / previous - 1) * 100 if previous else 0
        items.append({
            "symbol": code, "name": name or code, "market": market, "price": close,
            "changePct": round(change_pct, 4), "turnover": round(turnover),
            "asOf": iso_roc_date(row.get(fields[5])), "live": False,
        })
    return sorted(items, key=lambda item: item["turnover"], reverse=True)


def merge_realtime(items, payload):
    quotes = {str(row.get("c") or ""): row for row in (payload or {}).get("msgArray") or []}
    for item in items:
        row = quotes.get(item["symbol"])
        if not row:
            continue
        price, previous, volume = number(row.get("z")), number(row.get("y")), number(row.get("v"))
        if price is None or previous is None or previous <= 0:
            continue
        item["price"] = price
        item["changePct"] = round((price / previous - 1) * 100, 4)
        if volume is not None and volume > 0:
            item["turnover"] = round(volume * 1000 * price)
        item["quoteTime"] = str(row.get("t") or "")
        item["live"] = True
    return sorted(items, key=lambda item: item["turnover"], reverse=True)


def build_heatmap(market, limit=36):
    source_url = TWSE_ALL if market == "TWSE" else TPEX_ALL
    items = daily_items(fetch_json(source_url), market)[:max(limit * 2, 60)]
    channels = "|".join(("tse_" if market == "TWSE" else "otc_") + item["symbol"] + ".tw" for item in items)
    try:
        items = merge_realtime(items, fetch_json(MIS.format(quote(channels, safe=""))))
    except Exception:
        pass
    items = items[:limit]
    dates = sorted({item.get("asOf") for item in items if item.get("asOf")})
    return {
        "ok": True, "market": market, "items": items,
        "asOf": dates[-1] if dates else None,
        "updatedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "liveCount": sum(1 for item in items if item.get("live")),
        "sizeBasis": "成交金額", "sources": ["臺灣證券交易所", "證券櫃檯買賣中心"],
    }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        market = str((query.get("market") or ["TWSE"])[0]).upper()
        if market not in {"TWSE", "TPEX"}:
            return self.send_json({"ok": False, "error": "market 必須是 TWSE 或 TPEX"}, 400)
        try:
            limit = max(12, min(50, int((query.get("limit") or ["36"])[0])))
            self.send_json(build_heatmap(market, limit))
        except Exception:
            self.send_json({"ok": False, "error": "市場熱力圖資料暫時無法取得"}, 502)

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "public, max-age=20, s-maxage=45, stale-while-revalidate=120")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
