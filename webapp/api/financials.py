"""取得個股核心財務趨勢；台股優先使用公開資訊觀測站。"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, quote, urlparse
import datetime
import json
import re
import urllib.request

UA = "Mozilla/5.0 (compatible; ETFTracker/1.0)"
MOPS_API = "https://mops.twse.com.tw/mops/api/"
MOPS_SOURCE_URL = "https://mops.twse.com.tw/mops/#/web/t163sb04"
MOPS_FIRST_IFRS_YEAR = 2013
YAHOO_TIMESERIES = (
    "https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/{}"
    "?symbol={}&type={}&period1={}&period2={}"
)
YAHOO_METRICS = {
    "annualTotalRevenue": ("annual", "revenue"),
    "annualGrossProfit": ("annual", "grossProfit"),
    "annualOperatingIncome": ("annual", "operatingIncome"),
    "annualNetIncome": ("annual", "netIncome"),
    "annualBasicEPS": ("annual", "eps"),
    "quarterlyTotalRevenue": ("quarterly", "revenue"),
    "quarterlyGrossProfit": ("quarterly", "grossProfit"),
    "quarterlyOperatingIncome": ("quarterly", "operatingIncome"),
    "quarterlyNetIncome": ("quarterly", "netIncome"),
    "quarterlyBasicEPS": ("quarterly", "eps"),
    "annualOperatingCashFlow": ("annual", "operatingCashFlow"),
    "annualInvestingCashFlow": ("annual", "investingCashFlow"),
    "annualFinancingCashFlow": ("annual", "financingCashFlow"),
    "annualFreeCashFlow": ("annual", "freeCashFlow"),
    "annualEndCashPosition": ("annual", "endingCash"),
    "quarterlyOperatingCashFlow": ("quarterly", "operatingCashFlow"),
    "quarterlyInvestingCashFlow": ("quarterly", "investingCashFlow"),
    "quarterlyFinancingCashFlow": ("quarterly", "financingCashFlow"),
    "quarterlyFreeCashFlow": ("quarterly", "freeCashFlow"),
    "quarterlyEndCashPosition": ("quarterly", "endingCash"),
}
MOPS_LABELS = {
    "revenue": ("營業收入合計", "營業收入", "收益合計", "淨收益", "收益"),
    "grossProfit": ("營業毛利（毛損）", "營業毛利(毛損)", "營業毛利", "營業毛損"),
    "operatingIncome": ("營業利益（損失）", "營業利益(損失)", "營業利益"),
    "netIncome": ("本期淨利（淨損）", "本期淨利(淨損)", "本期稅後淨利（淨損）"),
    "eps": ("基本每股盈餘（元）", "基本每股盈餘(元)", "基本每股盈餘"),
}
CASH_FLOW_LABELS = {
    "operatingCashFlow": ("營業活動之淨現金流入（流出）", "營業活動之淨現金流入(流出)"),
    "investingCashFlow": ("投資活動之淨現金流入（流出）", "投資活動之淨現金流入(流出)"),
    "financingCashFlow": ("籌資活動之淨現金流入（流出）", "籌資活動之淨現金流入(流出)"),
    "cashChange": ("本期現金及約當現金增加（減少）數", "本期現金及約當現金增加(減少)數"),
    "endingCash": ("期末現金及約當現金餘額",),
}
ALL_LABELS = {**MOPS_LABELS, **CASH_FLOW_LABELS}


def symbol_candidates(code, market):
    code, market = code.upper(), market.upper()
    if market == "TW":
        return [code]
    suffix = {"JP": ".T", "KS": ".KS", "HK": ".HK"}.get(market, "")
    return [(code.replace(".", "-") if market == "US" else code) + suffix]


def fetch_json(url, data=None, timeout=12):
    headers = {"User-Agent": UA}
    body = None
    if data is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(data).encode("utf-8")
    request = urllib.request.Request(url, data=body, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8", errors="ignore"))


def fetch_text(url, timeout=12):
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="ignore")


def number(value, multiplier=1):
    text = str(value or "").replace(",", "").strip()
    if not text or text in {"-", "--"}:
        return None
    try:
        return float(text) * multiplier
    except ValueError:
        return None


def normalize_label(value):
    return re.sub(r"\s+", "", str(value or ""))


def matching_report_row(report_list, key, labels=MOPS_LABELS):
    aliases = tuple(normalize_label(label) for label in labels[key])
    matches = []
    for row in report_list or []:
        if not row:
            continue
        label = normalize_label(row[0])
        if label in aliases or any(label.endswith(alias) for alias in aliases):
            matches.append(row)
    # EPS 常有一列空白標題列，優先取真正包含數值的最後一列。
    return next((row for row in reversed(matches) if any(number(value) is not None for value in row[1:])), None)


def mops_title_columns(titles):
    columns = []
    offset = 1
    for title in (titles or [])[1:]:
        sub_count = max(1, len(title.get("sub") or []))
        columns.append((str(title.get("main") or ""), offset))
        offset += sub_count
    return columns


def parse_mops_annual(result):
    rows = {}
    columns = mops_title_columns(result.get("titles"))
    reports = result.get("reportList") or []
    for title, index in columns:
        match = re.search(r"(\d{3})年度", title)
        if not match:
            continue
        year = int(match.group(1)) + 1911
        row = {"year": str(year), "date": f"{year}-12-31", "currency": "TWD"}
        for key in MOPS_LABELS:
            report_row = matching_report_row(reports, key)
            if report_row and index < len(report_row):
                value = number(report_row[index], 1 if key == "eps" else 1000)
                if value is not None:
                    row[key] = value
        if sum(row.get(key) is not None for key in MOPS_LABELS) >= 2:
            rows[row["year"]] = row
    return rows


def parse_mops_cash_annual(result):
    rows = {}
    columns = mops_title_columns(result.get("titles"))
    reports = result.get("reportList") or []
    for title, index in columns:
        match = re.search(r"(\d{3})年度", title)
        if not match:
            continue
        year = int(match.group(1)) + 1911
        row = {"year": str(year), "date": f"{year}-12-31", "currency": "TWD"}
        for key in CASH_FLOW_LABELS:
            report_row = matching_report_row(reports, key, CASH_FLOW_LABELS)
            if report_row and index < len(report_row):
                value = number(report_row[index], 1000)
                if value is not None:
                    row[key] = value
        if sum(row.get(key) is not None for key in CASH_FLOW_LABELS) >= 2:
            rows[row["year"]] = row
    return rows


def parse_mops_direct_quarter(result, requested_year, quarter):
    target_title = f"{requested_year - 1911}年第{quarter}季"
    column = next(
        (index for title, index in mops_title_columns(result.get("titles")) if title == target_title),
        None,
    )
    if column is None:
        return None
    reports = result.get("reportList") or []
    row = {
        "year": f"{requested_year}Q{quarter}",
        "date": f"{requested_year}-{quarter * 3:02d}-{31 if quarter in {1, 4} else 30:02d}",
        "currency": "TWD",
    }
    for key in MOPS_LABELS:
        report_row = matching_report_row(reports, key)
        if report_row and column < len(report_row):
            value = number(report_row[column], 1 if key == "eps" else 1000)
            if value is not None:
                row[key] = value
    return row if sum(row.get(key) is not None for key in MOPS_LABELS) >= 2 else None


def parse_mops_cash_direct_quarter(result, requested_year, quarter):
    titles = result.get("titles") or []
    columns = mops_title_columns(titles)
    column = columns[0][1] if columns else None
    if column is None:
        return None
    reports = result.get("reportList") or []
    row = {"year": f"{requested_year}Q{quarter}", "date": f"{requested_year}-{quarter * 3:02d}-01", "currency": "TWD"}
    for key in CASH_FLOW_LABELS:
        report_row = matching_report_row(reports, key, CASH_FLOW_LABELS)
        if report_row and column < len(report_row):
            value = number(report_row[column], 1000)
            if value is not None:
                row[key] = value
    if row.get("operatingCashFlow") is not None and row.get("investingCashFlow") is not None:
        row["freeCashFlow"] = row["operatingCashFlow"] + row["investingCashFlow"]
    return row if sum(row.get(key) is not None for key in CASH_FLOW_LABELS) >= 2 else None


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
        if tag in {"td", "th"} and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None


def parse_mops_quarters(html, requested_year):
    parser = TableParser()
    parser.feed(html)
    cumulative = {}
    for key in MOPS_LABELS:
        aliases = tuple(normalize_label(label) for label in MOPS_LABELS[key])
        candidates = [
            row for row in parser.rows
            if len(row) >= 5 and (
                normalize_label(row[0]) in aliases
                or any(normalize_label(row[0]).endswith(alias) for alias in aliases)
            )
        ]
        if candidates:
            values = [number(value, 1 if key == "eps" else 1000) for value in candidates[-1][1:5]]
            cumulative[key] = values

    rows = []
    for quarter in range(1, 5):
        row = {
            "year": f"{requested_year}Q{quarter}",
            "date": f"{requested_year}-{quarter * 3:02d}-01",
            "currency": "TWD",
        }
        for key, values in cumulative.items():
            current = values[quarter - 1]
            previous = values[quarter - 2] if quarter > 1 else 0
            if current is not None and previous is not None:
                row[key] = round(current - previous, 6)
        if sum(row.get(key) is not None for key in MOPS_LABELS) >= 2:
            rows.append(row)
    return rows


def mops_annual_request(code, year):
    payload = {
        "companyId": code,
        "dataType": "2",
        "year": str(year - 1911),
        "season": "4",
        "subsidiaryCompanyId": "",
    }
    response = fetch_json(MOPS_API + "t164sb04", payload)
    if response.get("code") != 200 or not isinstance(response.get("result"), dict):
        return {}
    return parse_mops_annual(response["result"])


def mops_direct_quarter_request(code, year, quarter):
    payload = {
        "companyId": code,
        "dataType": "2",
        "year": str(year - 1911),
        "season": str(quarter),
        "subsidiaryCompanyId": "",
    }
    response = fetch_json(MOPS_API + "t164sb04", payload)
    if response.get("code") != 200 or not isinstance(response.get("result"), dict):
        return []
    return [
        row for row in (
            parse_mops_direct_quarter(response["result"], target_year, quarter)
            for target_year in (year, year - 1)
        ) if row
    ]


def mops_cash_annual_request(code, year):
    payload = {
        "companyId": code,
        "dataType": "2",
        "year": str(year - 1911),
        "season": "4",
        "subsidiaryCompanyId": "",
    }
    response = fetch_json(MOPS_API + "t164sb05", payload)
    if response.get("code") != 200 or not isinstance(response.get("result"), dict):
        return {}
    return parse_mops_cash_annual(response["result"])


def mops_cash_direct_quarter_request(code, year, quarter):
    payload = {
        "companyId": code,
        "dataType": "2",
        "year": str(year - 1911),
        "season": str(quarter),
        "subsidiaryCompanyId": "",
    }
    response = fetch_json(MOPS_API + "t164sb05", payload)
    if response.get("code") != 200 or not isinstance(response.get("result"), dict):
        return None
    return parse_mops_cash_direct_quarter(response["result"], year, quarter)


def mops_quarter_request(code, year):
    parameters = {
        "co_id": code,
        "TYPEK": "all",
        "year": str(year - 1911),
        "encodeURIComponent": 1,
        "step": 2,
        "firstin": 1,
        "off": 1,
        "t163sb15_c_ifrs": "N",
        "t05st30_c_c_ifrs": "N",
    }
    response = fetch_json(MOPS_API + "redirectToOld", {
        "apiName": "ajax_t163sb15",
        "parameters": parameters,
    })
    url = ((response.get("result") or {}).get("url") or "")
    parsed_url = urlparse(url)
    if parsed_url.scheme != "https" or parsed_url.hostname != "mopsov.twse.com.tw":
        return []
    return parse_mops_quarters(fetch_text(url), year)


def latest_reported_quarter(today):
    month_day = (today.month, today.day)
    if month_day >= (11, 15):
        return today.year, 3
    if month_day >= (8, 15):
        return today.year, 2
    if month_day >= (5, 15):
        return today.year, 1
    if month_day >= (4, 1):
        return today.year - 1, 4
    return today.year - 1, 3


def fetch_mops_financials(code):
    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).date()
    latest_annual = today.year - 1
    annual_targets = list(range(latest_annual, MOPS_FIRST_IFRS_YEAR - 1, -2))
    # 2013 首年查詢沒有前期比較欄，另查 2014 才能取得 2013 數字。
    if 2014 <= latest_annual and 2014 not in annual_targets:
        annual_targets.append(2014)
    latest_quarter_year, latest_quarter = latest_reported_quarter(today)
    quarter_targets = [latest_quarter_year, latest_quarter_year - 1, latest_quarter_year - 2]
    direct_targets = [
        (latest_quarter_year if quarter <= latest_quarter else latest_quarter_year - 1, quarter)
        for quarter in range(1, 4)
    ]
    years_by_label = {}
    quarters_by_label = {}
    cash_years_by_label = {}
    cash_quarters_cumulative = {}

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {
            executor.submit(mops_annual_request, code, year): ("annual", year)
            for year in annual_targets
        }
        futures.update({
            executor.submit(mops_cash_annual_request, code, year): ("cash_annual", year)
            for year in annual_targets
        })
        futures.update({
            executor.submit(mops_quarter_request, code, year): ("quarterly", year)
            for year in quarter_targets
        })
        futures.update({
            executor.submit(mops_direct_quarter_request, code, year, quarter): ("direct_quarterly", year)
            for year, quarter in direct_targets
        })
        cash_direct_targets = [(year, quarter) for year in quarter_targets for quarter in range(1, 4)]
        futures.update({
            executor.submit(mops_cash_direct_quarter_request, code, year, quarter): ("cash_direct_quarterly", year)
            for year, quarter in cash_direct_targets
        })
        for future in as_completed(futures):
            period_type, _ = futures[future]
            try:
                result = future.result()
            except Exception:
                continue
            if period_type == "annual":
                years_by_label.update(result)
            elif period_type == "cash_annual":
                cash_years_by_label.update(result)
            elif period_type == "cash_direct_quarterly":
                if result:
                    cash_quarters_cumulative[result["year"]] = result
            elif period_type == "direct_quarterly":
                quarters_by_label.update({row["year"]: row for row in result})
            else:
                for row in result:
                    quarters_by_label.setdefault(row["year"], row)

    for key, row in cash_years_by_label.items():
        years_by_label.setdefault(key, {}).update(row)
    cash_quarters_by_label = {}
    for year in quarter_targets:
        previous = None
        for quarter in range(1, 4):
            key = f"{year}Q{quarter}"
            cumulative = cash_quarters_cumulative.get(key)
            if not cumulative:
                continue
            row = {"year": key, "date": cumulative["date"], "currency": cumulative.get("currency", "TWD")}
            for metric in CASH_FLOW_LABELS:
                value = cumulative.get(metric)
                prior_value = previous.get(metric) if previous else 0
                if metric == "endingCash" and value is not None:
                    row[metric] = value
                elif value is not None and prior_value is not None:
                    row[metric] = value - prior_value
            if row.get("operatingCashFlow") is not None and row.get("investingCashFlow") is not None:
                row["freeCashFlow"] = row["operatingCashFlow"] + row["investingCashFlow"]
            cash_quarters_by_label[key] = row
            previous = cumulative
        annual = cash_years_by_label.get(str(year))
        q3 = cash_quarters_cumulative.get(f"{year}Q3")
        if annual and q3:
            row = {"year": f"{year}Q4", "date": f"{year}-12-31", "currency": "TWD"}
            for metric in CASH_FLOW_LABELS:
                value = annual.get(metric)
                prior_value = q3.get(metric)
                if metric == "endingCash" and value is not None:
                    row[metric] = value
                elif value is not None and prior_value is not None:
                    row[metric] = value - prior_value
            if row.get("operatingCashFlow") is not None and row.get("investingCashFlow") is not None:
                row["freeCashFlow"] = row["operatingCashFlow"] + row["investingCashFlow"]
            cash_quarters_by_label[row["year"]] = row
    for key, row in cash_quarters_by_label.items():
        quarters_by_label.setdefault(key, {}).update(row)
    for rows in (years_by_label, quarters_by_label):
        for row in rows.values():
            if row.get("operatingCashFlow") is not None and row.get("investingCashFlow") is not None:
                row["freeCashFlow"] = row["operatingCashFlow"] + row["investingCashFlow"]
    years = [years_by_label[key] for key in sorted(years_by_label) if int(key) >= MOPS_FIRST_IFRS_YEAR]
    quarters = [quarters_by_label[key] for key in sorted(quarters_by_label)][-8:]
    if not years and not quarters:
        raise ValueError("公開資訊觀測站沒有這家公司的財務資料")
    return {
        "symbol": code,
        "years": years,
        "quarters": quarters,
        "source": {"name": "公開資訊觀測站", "url": MOPS_SOURCE_URL},
        "quarterlyMethod": "Q1～Q3 採觀測站單季值，Q4 由年度累計換算",
    }


def parse_timeseries(payload, symbol):
    periods = {"annual": {}, "quarterly": {}}
    results = ((payload or {}).get("timeseries") or {}).get("result") or []
    for series in results:
        for metric_type, (period_type, key) in YAHOO_METRICS.items():
            for item in series.get(metric_type) or []:
                date = str(item.get("asOfDate") or "")
                raw = ((item.get("reportedValue") or {}).get("raw"))
                if len(date) < 4 or not isinstance(raw, (int, float)):
                    continue
                if period_type == "annual":
                    label = date[:4]
                else:
                    month = int(date[5:7]) if len(date) >= 7 and date[5:7].isdigit() else 1
                    label = f"{date[:4]}Q{(month - 1) // 3 + 1}"
                row = periods[period_type].setdefault(label, {"year": label, "date": date})
                row[key] = raw
                row["currency"] = item.get("currencyCode") or row.get("currency")
    output = {}
    for period_type, rows_by_label in periods.items():
        rows = sorted(rows_by_label.values(), key=lambda row: row["date"])
        rows = [row for row in rows if sum(row.get(key) is not None for key in ALL_LABELS) >= 2]
        output["years" if period_type == "annual" else "quarters"] = rows[-5 if period_type == "annual" else -8:]
    return {
        "symbol": symbol,
        **output,
        "source": {"name": "Yahoo Finance", "url": f"https://finance.yahoo.com/quote/{quote(symbol)}/financials/"},
    }


def fetch_yahoo_financials(code, market):
    now = datetime.datetime.now(datetime.timezone.utc)
    period2 = int((now + datetime.timedelta(days=2)).timestamp())
    period1 = int((now - datetime.timedelta(days=365 * 5)).timestamp())
    types = ",".join(YAHOO_METRICS)
    symbol = symbol_candidates(code, market)[0]
    url = YAHOO_TIMESERIES.format(
        quote(symbol), quote(symbol), quote(types, safe=","), period1, period2)
    parsed = parse_timeseries(fetch_json(url), symbol)
    if not parsed["years"] and not parsed["quarters"]:
        raise ValueError("Yahoo Finance 沒有這家公司的財務資料")
    return parsed


def fetch_financials(code, market):
    if market.upper() == "TW":
        return fetch_mops_financials(code)
    return fetch_yahoo_financials(code, market)


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        code = (query.get("code", [""])[0] or "").strip().upper()
        market = (query.get("market", ["TW"])[0] or "TW").strip().upper()
        if not re.fullmatch(r"[0-9A-Z.\-]{1,12}", code):
            return self.send_json({"ok": False, "error": "標的代號格式不正確"}, 400)
        try:
            result = fetch_financials(code, market)
            payload, status = {"ok": True, "code": code, "market": market, **result}, 200
        except Exception:
            payload, status = {"ok": False, "error": "財務資料來源暫時無法連線"}, 502
        self.send_json(payload, status)

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
