#!/usr/bin/env python3
"""Build the U.S. and Taiwan macro-economic dashboard data file."""

import csv
import datetime as dt
import html
import io
import json
import os
import re
import ssl
import time
import urllib.parse
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
import zipfile


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_FILE = os.path.join(BASE_DIR, "webapp", "macro_economy_data.json")
USER_AGENT = "Mozilla/5.0 (compatible; InvestmentResearchDashboard/1.0)"
FRED_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}&cosd={start}"
NDC_DATASET = "https://data.gov.tw/dataset/{}"
DATA_GOV_DIRECT = {
    6099: "https://ws.ndc.gov.tw/Download.ashx?u=LzAwMS9hZG1pbmlzdHJhdG9yLzEwL3JlbGZpbGUvNTc4MS82MzkyL2VhMjM1YmQ5LWQwNTItNGE2OS1hYmZjLWQ1Yzc4NWQzZDBlMi56aXA%3d&n=5pmv5rCj5oyH5qiZ5Y%2bK54eI6JmfLnppcA%3d%3d&icon=.zip",
    6100: "https://ws.ndc.gov.tw/Download.ashx?u=LzAwMS9hZG1pbmlzdHJhdG9yLzEwL3JlbGZpbGUvNTc4MS82MzkxL2JmOGE0ZWI3LTEwZmUtNGZhMC1iNjQ2LTMwZTg5MGQwMjE4YS5jc3Y%3d&n=6Ie654Gj5o6h6LO857aT55CG5Lq65oyH5pW4KHBtaeWPim5taSkuY3N2&icon=.csv",
}

TAIWAN_URLS = {
    "gdp": "https://ws.dgbas.gov.tw/001/Upload/461/relfile/11525/230514/na8102a3q.xml",
    "cpi": "https://ws.dgbas.gov.tw/001/Upload/461/relfile/11525/230555/pr0101a1m.xml",
    "orders": "https://service.moea.gov.tw/EE520/opendata/b.csv",
    "money": "https://www.cbc.gov.tw/public/data/OpenData/%E7%B6%93%E7%A0%94%E8%99%95/EF15M01.csv",
    "assets": "https://www.cbc.gov.tw/public/data/OpenData/%E7%B6%93%E7%A0%94%E8%99%95/EF23M01.csv",
}

US_SERIES = [
    dict(id="us-gdp", series="A191RL1Q225SBEA", name="實質 GDP 成長率", category="growth", unit="%", frequency="季", source="美國商務部經濟分析局 BEA", sourceUrl="https://www.bea.gov/data/gdp/gross-domestic-product", digits=1),
    dict(id="us-industrial", series="INDPRO", name="工業生產年增率", category="growth", unit="%", frequency="月", source="Federal Reserve G.17", sourceUrl="https://www.federalreserve.gov/releases/g17/", transform="yoy", periods=12, digits=1),
    dict(id="us-retail", series="RSAFS", name="零售銷售年增率", category="growth", unit="%", frequency="月", source="U.S. Census Bureau", sourceUrl="https://www.census.gov/retail/sales.html", transform="yoy", periods=12, digits=1),
    dict(id="us-cpi", series="CPIAUCSL", name="CPI 年增率", category="inflation", unit="%", frequency="月", source="美國勞工統計局 BLS", sourceUrl="https://www.bls.gov/cpi/", transform="yoy", periods=12, digits=1),
    dict(id="us-core-cpi", series="CPILFESL", name="核心 CPI 年增率", category="inflation", unit="%", frequency="月", source="美國勞工統計局 BLS", sourceUrl="https://www.bls.gov/cpi/", transform="yoy", periods=12, digits=1),
    dict(id="us-pce", series="PCEPI", name="PCE 年增率", category="inflation", unit="%", frequency="月", source="美國商務部經濟分析局 BEA", sourceUrl="https://www.bea.gov/data/personal-consumption-expenditures-price-index", transform="yoy", periods=12, digits=1),
    dict(id="us-core-pce", series="PCEPILFE", name="核心 PCE 年增率", category="inflation", unit="%", frequency="月", source="美國商務部經濟分析局 BEA", sourceUrl="https://www.bea.gov/data/personal-consumption-expenditures-price-index", transform="yoy", periods=12, digits=1),
    dict(id="us-payrolls", series="PAYEMS", name="非農就業月增", category="labor", unit="千人", frequency="月", source="美國勞工統計局 BLS", sourceUrl="https://www.bls.gov/ces/", transform="difference", digits=0),
    dict(id="us-unemployment", series="UNRATE", name="失業率", category="labor", unit="%", frequency="月", source="美國勞工統計局 BLS", sourceUrl="https://www.bls.gov/cps/", digits=1),
    dict(id="us-claims", series="ICSA", name="初領失業救濟金", category="labor", unit="千件", frequency="週", source="美國勞工部", sourceUrl="https://www.dol.gov/ui/data.pdf", scale=.001, digits=0),
    dict(id="us-effr", series="DFF", name="有效聯邦基金利率", category="money", unit="%", frequency="日", source="Federal Reserve", sourceUrl="https://www.federalreserve.gov/monetarypolicy/openmarket.htm", digits=2),
    dict(id="us-fed-assets", series="WALCL", name="聯準會總資產", category="money", unit="兆美元", frequency="週", source="Federal Reserve H.4.1", sourceUrl="https://www.federalreserve.gov/releases/h41/", scale=.000001, digits=2),
    dict(id="us-m2", series="M2SL", name="M2 貨幣供給", category="money", unit="兆美元", frequency="月", source="Federal Reserve H.6", sourceUrl="https://www.federalreserve.gov/releases/h6/current/", scale=.001, digits=2),
    dict(id="us-3m", series="DGS3MO", name="美債 3 個月殖利率", category="rates", unit="%", frequency="日", source="U.S. Department of the Treasury", sourceUrl="https://home.treasury.gov/resource-center/data-chart-center/interest-rates", digits=2),
    dict(id="us-2y", series="DGS2", name="美債 2 年殖利率", category="rates", unit="%", frequency="日", source="U.S. Department of the Treasury", sourceUrl="https://home.treasury.gov/resource-center/data-chart-center/interest-rates", digits=2),
    dict(id="us-10y", series="DGS10", name="美債 10 年殖利率", category="rates", unit="%", frequency="日", source="U.S. Department of the Treasury", sourceUrl="https://home.treasury.gov/resource-center/data-chart-center/interest-rates", digits=2),
    dict(id="us-30y", series="DGS30", name="美債 30 年殖利率", category="rates", unit="%", frequency="日", source="U.S. Department of the Treasury", sourceUrl="https://home.treasury.gov/resource-center/data-chart-center/interest-rates", digits=2),
    dict(id="us-10y2y", series="T10Y2Y", name="10Y－2Y 利差", category="rates", unit="百分點", frequency="日", source="Federal Reserve Bank of St. Louis", sourceUrl="https://fred.stlouisfed.org/series/T10Y2Y", digits=2),
    dict(id="us-10y3m", series="T10Y3M", name="10Y－3M 利差", category="rates", unit="百分點", frequency="日", source="Federal Reserve Bank of St. Louis", sourceUrl="https://fred.stlouisfed.org/series/T10Y3M", digits=2),
    dict(id="us-wti", series="DCOILWTICO", name="WTI 原油", category="commodity", unit="美元／桶", frequency="日", source="U.S. Energy Information Administration", sourceUrl="https://www.eia.gov/dnav/pet/pet_pri_spt_s1_d.htm", digits=2),
    dict(id="us-copper", series="PCOPPUSDM", name="國際銅價", category="commodity", unit="美元／公噸", frequency="月", source="International Monetary Fund", sourceUrl="https://www.imf.org/en/Research/commodity-prices", digits=0),
]

CATEGORY_LABELS = {
    "growth": "成長與需求", "inflation": "通膨", "labor": "就業",
    "activity": "景氣動能", "money": "貨幣與流動性", "rates": "利率結構",
    "trade": "外貿", "commodity": "原物料",
}


def number(value):
    try:
        cleaned = str(value).strip().replace(",", "")
        if cleaned in ("", "-", "—", "."):
            return None
        return float(cleaned)
    except (TypeError, ValueError):
        return None


def read_url(url, retries=3):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/csv,application/xml,text/xml,application/zip,*/*"})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read()
        except urllib.error.URLError as error:
            # Some Taiwan government servers still serve an incomplete legacy
            # certificate chain. Keep verification by default and limit this
            # compatibility retry to the known official hosts.
            official = urllib.parse.urlparse(url).hostname in {"www.cbc.gov.tw", "ws.dgbas.gov.tw", "nstatdb.dgbas.gov.tw"}
            if official and isinstance(error.reason, ssl.SSLCertVerificationError):
                context = ssl.create_default_context()
                context.check_hostname = False
                context.verify_mode = ssl.CERT_NONE
                with urllib.request.urlopen(request, timeout=60, context=context) as response:
                    return response.read()
            if attempt + 1 == retries:
                raise
            time.sleep(1.5 * (attempt + 1))


def parse_fred_csv(content, series_id):
    reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
    rows = []
    for row in reader:
        value = number(row.get(series_id))
        date = row.get("observation_date") or row.get("DATE")
        if date and value is not None:
            rows.append({"date": date, "value": value})
    return rows


def fetch_fred_batch(configs, start):
    """FRED returns a zip archive when several series are requested."""
    ids = [config["series"] for config in configs]
    url = FRED_CSV.format(series=urllib.parse.quote(",".join(ids), safe=","), start=start)
    content = read_url(url)
    if not content.startswith(b"PK"):
        return {ids[0]: parse_fred_csv(content, ids[0])}
    result = {}
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        names = archive.namelist()
        for series_id in ids:
            filename = next((name for name in names if name.upper() == "{}.CSV".format(series_id).upper()), None)
            if filename:
                result[series_id] = parse_fred_csv(archive.read(filename), series_id)
    return result


def transform_rows(rows, config):
    transform = config.get("transform")
    scale = config.get("scale", 1)
    output = []
    for index, row in enumerate(rows):
        value = row["value"]
        if transform == "yoy":
            periods = config.get("periods", 12)
            if index < periods or not rows[index - periods]["value"]:
                continue
            value = (value / rows[index - periods]["value"] - 1) * 100
        elif transform == "difference":
            if index == 0:
                continue
            value -= rows[index - 1]["value"]
        output.append({"date": row["date"], "value": round(value * scale, 6)})
    return output[-2600:]


def make_series(config, rows, country="US", extra=None):
    if not rows:
        raise ValueError("{} has no observations".format(config["id"]))
    latest = rows[-1]
    previous = rows[-2] if len(rows) > 1 else latest
    result = {key: value for key, value in config.items() if key not in {"transform", "periods", "scale"}}
    result.update({
        "country": country,
        "categoryLabel": CATEGORY_LABELS[config["category"]],
        "latest": latest["value"], "asOf": latest["date"],
        "previous": previous["value"], "change": round(latest["value"] - previous["value"], 6),
        "rows": rows,
    })
    if extra:
        result.update(extra)
    return result


def period_date(value):
    raw = str(value).strip()
    month = re.fullmatch(r"(\d{4})M?(\d{2})", raw)
    quarter = re.fullmatch(r"(\d{4})Q([1-4])", raw)
    roc_month = re.fullmatch(r"(\d{3})(\d{2})", raw)
    if month:
        return "{}-{}-01".format(month.group(1), month.group(2))
    if quarter:
        return "{}-{:02d}-01".format(quarter.group(1), (int(quarter.group(2)) - 1) * 3 + 1)
    if roc_month:
        return "{}-{}-01".format(int(roc_month.group(1)) + 1911, roc_month.group(2))
    return raw[:10]


def parse_dgbas_xml(content, item_contains, type_contains="年增率"):
    rows = []
    for obs in ET.fromstring(content).iter("Obs"):
        item = obs.findtext("Item") or ""
        kind = obs.findtext("TYPE") or ""
        if all(token in item for token in item_contains) and type_contains in kind:
            value = number(obs.findtext("Item_VALUE"))
            if value is not None:
                rows.append({"date": period_date(obs.findtext("TIME_PERIOD")), "value": value})
    return sorted(rows, key=lambda row: row["date"])


def data_gov_download(dataset_id, extension=None):
    if dataset_id in DATA_GOV_DIRECT:
        try:
            return read_url(DATA_GOV_DIRECT[dataset_id])
        except Exception:
            pass
    page = read_url(NDC_DATASET.format(dataset_id)).decode("utf-8", "ignore")
    urls = []
    for match in re.findall(r'https?[^"<> ]+', page):
        url = html.unescape(match).replace("\\u002F", "/")
        if "Download.ashx" not in url:
            continue
        if extension and "icon=.{}".format(extension) not in url.lower():
            continue
        if url not in urls:
            urls.append(url)
    if not urls:
        raise RuntimeError("No downloadable resource for data.gov.tw dataset {}".format(dataset_id))
    return read_url(urls[0])


def parse_ndc_zip(content):
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        def table(name):
            return list(csv.DictReader(io.StringIO(archive.read(name).decode("utf-8-sig"))))
        cycle = table("景氣指標與燈號.csv")
        coincident = table("同時指標構成項目.csv")
        leading = table("領先指標構成項目.csv")
        lagging = table("落後指標構成項目.csv")
    return cycle, coincident, leading, lagging


def csv_rows(content):
    return list(csv.DictReader(io.StringIO(content.decode("utf-8-sig"))))


def column_series(rows, column, date_column="Date", scale=1):
    result = []
    for row in rows:
        value = number(row.get(column))
        if value is not None:
            result.append({"date": period_date(row.get(date_column)), "value": round(value * scale, 6)})
    return sorted(result, key=lambda row: row["date"])


def find_column(rows, *tokens):
    if not rows:
        return None
    return next((key for key in rows[0] if all(token in key for token in tokens)), None)


def taiwan_series():
    output = []
    configs = []

    gdp_rows = parse_dgbas_xml(read_url(TAIWAN_URLS["gdp"]), ["國內生產毛額", "連鎖"], "年增率")
    if not gdp_rows:
        # The table label can change after a benchmark revision; total GDP is
        # still the first aggregate containing 國內生產毛額.
        gdp_rows = parse_dgbas_xml(read_url(TAIWAN_URLS["gdp"]), ["國內生產毛額"], "年增率")
    configs.append((dict(id="tw-gdp", name="實質 GDP 年增率", category="growth", unit="%", frequency="季", source="行政院主計總處", sourceUrl="https://data.gov.tw/dataset/6689", digits=1), gdp_rows))

    cpi_content = read_url(TAIWAN_URLS["cpi"])
    configs.append((dict(id="tw-cpi", name="CPI 年增率", category="inflation", unit="%", frequency="月", source="行政院主計總處", sourceUrl="https://data.gov.tw/dataset/6019", digits=1), parse_dgbas_xml(cpi_content, ["總指數"], "年增率")))
    core_rows = parse_dgbas_xml(cpi_content, ["不含蔬菜水果及能源"], "年增率")
    if core_rows:
        configs.append((dict(id="tw-core-cpi", name="核心 CPI 年增率", category="inflation", unit="%", frequency="月", source="行政院主計總處", sourceUrl="https://data.gov.tw/dataset/6019", digits=1), core_rows))

    pmi_rows = csv_rows(data_gov_download(6100, "csv"))
    configs.extend([
        (dict(id="tw-pmi", name="製造業 PMI", category="activity", unit="", frequency="月", source="國家發展委員會／中華經濟研究院", sourceUrl="https://data.gov.tw/dataset/6100", digits=1, reference=50), column_series(pmi_rows, "PMI")),
        (dict(id="tw-nmi", name="非製造業 NMI", category="activity", unit="", frequency="月", source="國家發展委員會／中華經濟研究院", sourceUrl="https://data.gov.tw/dataset/6100", digits=1, reference=50), column_series(pmi_rows, "NMI")),
    ])

    cycle, coincident, leading, lagging = parse_ndc_zip(data_gov_download(6099, "zip"))
    cycle_score = find_column(cycle, "景氣對策信號", "分數")
    lead_index = find_column(cycle, "領先指標不含趨勢")
    coincide_index = find_column(cycle, "同時指標不含趨勢")
    industrial = find_column(coincident, "工業生產指數")
    exports = find_column(coincident, "海關出口值")
    unemployment = find_column(lagging, "失業率")
    order_direction = find_column(leading, "外銷訂單動向指數")
    ndc_source = "https://data.gov.tw/dataset/6099"
    configs.extend([
        (dict(id="tw-cycle-score", name="景氣對策信號分數", category="activity", unit="分", frequency="月", source="國家發展委員會", sourceUrl=ndc_source, digits=0), column_series(cycle, cycle_score)),
        (dict(id="tw-leading", name="景氣領先指標", category="activity", unit="", frequency="月", source="國家發展委員會", sourceUrl=ndc_source, digits=2), column_series(cycle, lead_index)),
        (dict(id="tw-coincident", name="景氣同時指標", category="activity", unit="", frequency="月", source="國家發展委員會", sourceUrl=ndc_source, digits=2), column_series(cycle, coincide_index)),
        (dict(id="tw-industrial", name="工業生產指數", category="growth", unit="", frequency="月", source="經濟部統計處／國家發展委員會", sourceUrl=ndc_source, digits=1), column_series(coincident, industrial)),
        (dict(id="tw-exports", name="海關出口值", category="trade", unit="十億元", frequency="月", source="財政部／國家發展委員會", sourceUrl=ndc_source, digits=1), column_series(coincident, exports)),
        (dict(id="tw-unemployment", name="失業率", category="labor", unit="%", frequency="月", source="行政院主計總處／國家發展委員會", sourceUrl=ndc_source, digits=2), column_series(lagging, unemployment)),
        (dict(id="tw-order-direction", name="外銷訂單動向指數", category="trade", unit="", frequency="月", source="經濟部統計處／國家發展委員會", sourceUrl=ndc_source, digits=2), column_series(leading, order_direction)),
    ])

    orders = csv_rows(read_url(TAIWAN_URLS["orders"]))
    order_rows = []
    for row in orders:
        if row.get("統計項目") != "外銷訂單金額":
            continue
        value = number(row.get("統計值(美元)"))
        if value is not None:
            order_rows.append({"date": period_date(row.get("資料期(民國年)")), "value": value})
    configs.append((dict(id="tw-orders", name="外銷訂單金額", category="trade", unit="百萬美元", frequency="月", source="經濟部統計處", sourceUrl="https://data.gov.tw/dataset/6845", digits=0), sorted(order_rows, key=lambda row: row["date"])))

    money = csv_rows(read_url(TAIWAN_URLS["money"]))
    for series_id, label in (("tw-m1b", "Ｍ１Ｂ"), ("tw-m2", "Ｍ２")):
        column = find_column(money, label, "年增率")
        configs.append((dict(id=series_id, name="{} 年增率".format(label.replace("Ｍ", "M")), category="money", unit="%", frequency="月", source="中央銀行", sourceUrl="https://data.gov.tw/dataset/6024", digits=2), column_series(money, column, "期間")))

    assets = csv_rows(read_url(TAIWAN_URLS["assets"]))
    asset_column = find_column(assets, "資產合計", "原始值")
    configs.append((dict(id="tw-cb-assets", name="央行資產總額", category="money", unit="兆元", frequency="月", source="中央銀行", sourceUrl="https://data.gov.tw/dataset/6536", digits=2), column_series(assets, asset_column, "期間", .000001)))

    for config, rows in configs:
        if rows:
            output.append(make_series(config, rows[-1000:], "TW"))
    return output


def load_existing():
    try:
        with open(OUT_FILE, encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return {}


def local_us_fallback():
    """Reuse already verified market/Fed snapshots if FRED is unavailable."""
    result = {}
    try:
        with open(os.path.join(BASE_DIR, "webapp", "fed_policy_data.json"), encoding="utf-8") as handle:
            fed = json.load(handle)
        rate_rows = fed.get("rateHistory", [])
        mapping = [
            ("us-effr", "有效聯邦基金利率", "effectiveRate"),
            ("us-target-upper", "聯邦基金目標上限", "targetUpper"),
            ("us-target-lower", "聯邦基金目標下限", "targetLower"),
        ]
        for series_id, name, key in mapping:
            rows = [{"date": row["date"], "value": row[key]} for row in rate_rows if row.get(key) is not None]
            config = dict(id=series_id, name=name, category="money", unit="%", frequency="日", source="Federal Reserve", sourceUrl="https://www.federalreserve.gov/monetarypolicy/openmarket.htm", digits=2)
            result[series_id] = make_series(config, rows)
        for item in fed.get("balanceSheet", []):
            if item.get("id") not in {"totalAssets", "reserves", "onRrp"}:
                continue
            meta = {
                "totalAssets": ("us-fed-assets", "聯準會總資產", "兆美元", .001),
                "reserves": ("us-reserves", "銀行準備金餘額", "兆美元", .001),
                "onRrp": ("us-onrrp", "隔夜逆回購 ON RRP", "十億美元", 1),
            }[item["id"]]
            rows = [{"date": row["date"], "value": round(row["value"] * meta[3], 6)} for row in item.get("rows", [])]
            config = dict(id=meta[0], name=meta[1], category="money", unit=meta[2], frequency="週" if item["id"] != "onRrp" else "日", source="Federal Reserve H.4.1／FRED", sourceUrl=item.get("sourceUrl", "https://fred.stlouisfed.org/"), digits=2)
            result[meta[0]] = make_series(config, rows)
    except (OSError, ValueError, KeyError):
        pass
    try:
        with open(os.path.join(BASE_DIR, "webapp", "market_data.json"), encoding="utf-8") as handle:
            market = json.load(handle)
        treasury_rows = market.get("treasuries", [])
        for key, name in (("3M", "美債 3 個月殖利率"), ("2Y", "美債 2 年殖利率"), ("10Y", "美債 10 年殖利率"), ("30Y", "美債 30 年殖利率")):
            rows = [{"date": row["date"], "value": row["rates"][key]} for row in treasury_rows if row.get("rates", {}).get(key) is not None]
            config = dict(id="us-{}".format(key.lower()), name=name, category="rates", unit="%", frequency="日", source="U.S. Department of the Treasury", sourceUrl="https://home.treasury.gov/resource-center/data-chart-center/interest-rates", digits=2)
            result[config["id"]] = make_series(config, rows)
        for short, series_id, name in (("2Y", "us-10y2y", "10Y－2Y 利差"), ("3M", "us-10y3m", "10Y－3M 利差")):
            rows = [{"date": row["date"], "value": round(row["rates"]["10Y"] - row["rates"][short], 4)} for row in treasury_rows if row.get("rates", {}).get("10Y") is not None and row.get("rates", {}).get(short) is not None]
            config = dict(id=series_id, name=name, category="rates", unit="百分點", frequency="日", source="U.S. Department of the Treasury（本站計算）", sourceUrl="https://home.treasury.gov/resource-center/data-chart-center/interest-rates", digits=2)
            result[series_id] = make_series(config, rows)
    except (OSError, ValueError, KeyError):
        pass
    return result


def main():
    now = dt.datetime.now(dt.timezone.utc)
    start = (now.date() - dt.timedelta(days=365 * 10 + 10)).isoformat()
    existing = load_existing()
    old = {item.get("id"): item for item in existing.get("series", [])}
    fallback = local_us_fallback()
    series, failures = [], []
    try:
        fred_rows = fetch_fred_batch(US_SERIES, start)
    except Exception as error:
        fred_rows = {}
        failures.append("FRED batch: {}".format(error))
    for config in US_SERIES:
        try:
            rows = transform_rows(fred_rows[config["series"]], config)
            series.append(make_series(config, rows))
            print("updated {}".format(config["id"]))
        except Exception as error:
            replacement = old.get(config["id"]) or fallback.get(config["id"])
            if replacement:
                series.append(replacement)
            failures.append("{}: {}".format(config["id"], error))
    known = {item["id"] for item in series}
    series.extend(item for key, item in fallback.items() if key not in known)
    try:
        series.extend(taiwan_series())
        print("updated Taiwan official series")
    except Exception as error:
        series.extend(item for item in old.values() if item.get("country") == "TW")
        failures.append("Taiwan: {}".format(error))

    countries = {item.get("country") for item in series}
    if not {"US", "TW"}.issubset(countries) or len(series) < 20:
        raise SystemExit("macro economy data is incomplete: {}".format("; ".join(failures)))
    series.sort(key=lambda item: (item["country"], list(CATEGORY_LABELS).index(item["category"]), item["name"]))
    payload = {
        "updatedAt": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "series": series,
        "categories": [{"id": key, "label": value} for key, value in CATEGORY_LABELS.items()],
        "sources": {
            "US": "官方發布機構，透過 FRED 統一介接",
            "TW": "主計總處、國發會、經濟部、財政部與中央銀行開放資料",
        },
        "warnings": failures,
    }
    with open(OUT_FILE, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    print("wrote {} ({} series)".format(OUT_FILE, len(series)))
    if failures:
        print("warnings: {}".format("; ".join(failures)))


if __name__ == "__main__":
    main()
