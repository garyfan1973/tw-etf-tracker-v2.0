"""Current TWSE company classification for source-backed industry context."""
import datetime
import math
import re
from urllib.parse import quote

from .financials import fetch_json


TWSE_COMPANIES = "https://openapi.twse.com.tw/v1/opendata/t187ap03_L"
TWSE_MONTHLY = "https://openapi.twse.com.tw/v1/opendata/t187ap05_L"
# TWSE's published industry-code table. Keep unknown/new codes out of the
# report until the mapping is updated, rather than guessing a category.
TWSE_INDUSTRIES = {
    "01": "水泥工業", "02": "食品工業", "03": "塑膠工業", "04": "紡織纖維",
    "05": "電機機械", "06": "電器電纜", "08": "玻璃陶瓷", "09": "造紙工業",
    "10": "鋼鐵工業", "11": "橡膠工業", "12": "汽車工業", "14": "建材營造",
    "15": "航運業", "16": "觀光餐旅", "17": "金融保險", "18": "貿易百貨",
    "19": "綜合", "20": "其他", "21": "化學工業", "22": "生技醫療業",
    "23": "油電燃氣業", "24": "半導體業", "25": "電腦及週邊設備業",
    "26": "光電業", "27": "通信網路業", "28": "電子零組件業",
    "29": "電子通路業", "30": "資訊服務業", "31": "其他電子業",
    "35": "綠能環保", "36": "數位雲端", "37": "運動休閒", "38": "居家生活",
}


def _roc_date(value):
    digits = re.sub(r"\D", "", str(value or ""))
    if len(digits) != 7:
        return ""
    try:
        date = datetime.date(int(digits[:3]) + 1911, int(digits[3:5]), int(digits[5:7]))
    except ValueError:
        return ""
    return date.isoformat()


def _roc_month(value):
    digits = re.sub(r"\D", "", str(value or ""))
    if len(digits) != 5:
        return ""
    year, month = int(digits[:3]) + 1911, int(digits[3:5])
    return "{:04d}-{:02d}".format(year, month) if 1 <= month <= 12 else ""


def _number(value, *, multiplier=1):
    try:
        number = float(str(value).replace(",", "")) * multiplier
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def fetch_twse_company_profile(symbol, *, today=None):
    """Only accept an exact code match from the exchange's current listing."""
    if not re.fullmatch(r"\d{4}", str(symbol or "")):
        return None
    try:
        monthly_rows = fetch_json(TWSE_MONTHLY, timeout=8)
    except Exception:
        monthly_rows = []
    monthly = next((item for item in monthly_rows if isinstance(item, dict)
                    and str(item.get("公司代號") or "").strip() == symbol), None) if isinstance(monthly_rows, list) else None
    if monthly:
        period = _roc_month(monthly.get("資料年月"))
        industry = str(monthly.get("產業別") or "").strip()
        name = str(monthly.get("公司名稱") or "").strip()
        revenue = _number(monthly.get("營業收入-當月營收"), multiplier=1000)
        today = today or datetime.date.today()
        month_age = (today.year - int(period[:4])) * 12 + today.month - int(period[-2:]) if period else 99
        if period and 0 <= month_age <= 3 and industry and name and revenue is not None:
            return {
                "symbol": symbol, "name": name, "industry": industry,
                "asOf": _roc_date(monthly.get("出表日期")),
                "monthlyRevenue": {
                    "period": period, "revenue": revenue, "currency": "TWD",
                    "yearOnYearPercent": _number(monthly.get("營業收入-去年同月增減(%)")),
                    "cumulativeRevenue": _number(monthly.get("累計營業收入-當月累計營收"), multiplier=1000),
                    "cumulativeYearOnYearPercent": _number(monthly.get("累計營業收入-前期比較增減(%)")),
                    "note": str(monthly.get("備註") or "").strip()[:300],
                },
                "source": {"name": "臺灣證券交易所上市公司月營收",
                           "url": "https://www.twse.com.tw/zh/trading/statistics/index04.html"},
            }
    rows = fetch_json(TWSE_COMPANIES, timeout=8)
    if not isinstance(rows, list):
        return None
    row = next((item for item in rows if isinstance(item, dict)
                and str(item.get("公司代號") or "").strip() == symbol), None)
    if not row:
        return None
    code = str(row.get("產業別") or "").strip().zfill(2)
    industry = TWSE_INDUSTRIES.get(code)
    name = str(row.get("公司簡稱") or row.get("公司名稱") or "").strip()
    if not industry or not name:
        return None
    return {
        "symbol": symbol, "name": name, "industry": industry,
        "asOf": _roc_date(row.get("出表日期")),
        "source": {"name": "臺灣證券交易所個股資訊",
                   "url": "https://www.twse.com.tw/IIH2/zh/company/stock.html?code=" + quote(symbol)},
    }
