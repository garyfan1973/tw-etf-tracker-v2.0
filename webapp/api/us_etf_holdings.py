"""US ETF holdings from official SEC N-PORT filings."""
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, quote, urlparse
from xml.etree import ElementTree
import json
import re
import urllib.request

FUND_TICKERS = "https://www.sec.gov/files/company_tickers_mf.json"
EFTS_SEARCH = "https://efts.sec.gov/LATEST/search-index?q={}&forms=NPORT-P&from=0&size=100"
ARCHIVES = "https://www.sec.gov/Archives/edgar/data/{}/{}/primary_doc.xml"
UA = "tw-etf-tracker/2.0 garyfan1973@gmail.com"


def fetch_bytes(url):
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
    with urllib.request.urlopen(request, timeout=25) as response:
        return response.read()


def fetch_json(url):
    return json.loads(fetch_bytes(url).decode("utf-8", errors="ignore"))


def fund_record(payload, symbol):
    fields = payload.get("fields") or []
    data = payload.get("data") or []
    for values in (data.values() if isinstance(data, dict) else data):
        row = dict(zip(fields, values))
        if str(row.get("symbol") or "").upper() == symbol.upper():
            return row
    raise ValueError("SEC 基金代號表找不到此 ETF")


def latest_filing(payload, cik):
    candidates = []
    for hit in (payload.get("hits") or {}).get("hits") or []:
        source = hit.get("_source") or {}
        forms = [source.get("form")] + list(source.get("root_forms") or [])
        ciks = [str(value).lstrip("0") for value in source.get("ciks") or []]
        if "NPORT-P" in forms and str(cik).lstrip("0") in ciks and source.get("adsh"):
            candidates.append(source)
    if not candidates:
        raise ValueError("SEC 尚無可用的 N-PORT 持股申報")
    return max(candidates, key=lambda row: (row.get("period_ending") or "", row.get("file_date") or ""))


def _float(text):
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def parse_nport(xml_bytes, expected_series_id=""):
    root = ElementTree.fromstring(xml_bytes)
    namespace = root.tag.partition("}")[0].lstrip("{")
    ns = {"n": namespace} if namespace else {}
    prefix = "n:" if namespace else ""
    value = lambda parent, path: (parent.findtext(prefix + path, default="", namespaces=ns) or "").strip()
    general = root.find(".//" + prefix + "genInfo", ns)
    fund = root.find(".//" + prefix + "fundInfo", ns)
    if general is None or fund is None:
        raise ValueError("SEC N-PORT 格式不完整")
    series_id = value(general, "seriesId")
    if expected_series_id and series_id != expected_series_id:
        raise ValueError("SEC N-PORT 系列代號不符")
    holdings = []
    for item in root.findall(".//" + prefix + "invstOrSec", ns):
        name = value(item, "name")
        pct = _float(value(item, "pctVal"))
        if not name or pct is None:
            continue
        identifiers = item.find(prefix + "identifiers", ns)
        isin = ""
        if identifiers is not None:
            isin_node = identifiers.find(prefix + "isin", ns)
            isin = (isin_node.get("value", "") if isin_node is not None else "").strip()
        cusip = value(item, "cusip")
        units = value(item, "units").upper()
        holdings.append({
            "code": cusip or isin or re.sub(r"[^A-Z0-9]", "", name.upper()),
            "cusip": cusip, "isin": isin, "name": name, "title": value(item, "title"),
            "weight": pct, "shares": _float(value(item, "balance")) if units in {"NS", "SH"} else None,
            "valueUSD": _float(value(item, "valUSD")), "currency": value(item, "curCd"),
            "assetCategory": value(item, "assetCat"), "issuerCategory": value(item, "issuerCat"),
            "country": value(item, "invCountry"),
        })
    return {
        "name": value(general, "seriesName"), "registrantName": value(general, "regName"), "seriesId": series_id,
        "date": value(general, "repPdDate"), "fundSize": _float(value(fund, "netAssets")),
        "totalAssets": _float(value(fund, "totAssets")), "totalLiabilities": _float(value(fund, "totLiabs")),
        "holdings": sorted(holdings, key=lambda row: row["weight"], reverse=True),
    }


def load_us_etf(code):
    record = fund_record(fetch_json(FUND_TICKERS), code)
    cik, series_id = str(record["cik"]), record["seriesId"]
    filing = latest_filing(fetch_json(EFTS_SEARCH.format(quote(series_id, safe=""))), cik)
    accession = filing["adsh"].replace("-", "")
    source_url = ARCHIVES.format(int(cik), accession)
    result = parse_nport(fetch_bytes(source_url), series_id)
    return {"ok": True, "code": code, **result, "filedAt": filing.get("file_date", ""),
            "holdingsCount": len(result["holdings"]),
            "source": {"name": "SEC Form N-PORT", "url": source_url}}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        code = (query.get("code", [""])[0] or "").strip().upper()
        if not re.fullmatch(r"[A-Z0-9.\-]{1,12}", code):
            return self.send_json({"ok": False, "error": "ETF 代號格式不正確"}, 400)
        try:
            payload, status = load_us_etf(code), 200
        except ValueError as error:
            payload, status = {"ok": False, "error": str(error)}, 404
        except Exception:
            payload, status = {"ok": False, "error": "SEC 持股資料暫時無法連線，請稍後再試"}, 502
        self.send_json(payload, status)

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "public, max-age=900, s-maxage=21600, stale-while-revalidate=86400")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
