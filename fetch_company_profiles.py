#!/usr/bin/env python3
"""更新 ETF 成分股的產業別與主要產品／業務摘要。

資料來源：
* 台股：臺灣證券交易所公開公司基本資料（產業別、公司名稱、網址）。
* 海外：Stock Analysis 公開公司介紹頁（產業、部門與業務摘要）。

產出的 JSON 是前端的補充資料；單一來源查不到時仍保留該成分股，避免網頁缺列。
"""

import html
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DATA_JS = ROOT / "webapp" / "data.js"
OUT = ROOT / "webapp" / "company_profiles.json"
UA = "tw-etf-tracker/2.0 (public data updater)"

TWSE_INDUSTRIES = {
    "01": "水泥工業", "02": "食品工業", "03": "塑膠工業", "04": "紡織纖維",
    "05": "電機機械", "06": "電器電纜", "08": "玻璃陶瓷", "09": "造紙工業",
    "10": "鋼鐵工業", "11": "橡膠工業", "12": "汽車工業", "14": "建材營造業",
    "15": "航運業", "16": "觀光餐旅業", "17": "金融保險業", "18": "貿易百貨業",
    "19": "綜合業", "20": "其他業", "21": "化學工業", "22": "生技醫療業",
    "23": "油電燃氣業", "24": "半導體業", "25": "電腦及週邊設備業", "26": "光電業",
    "27": "通信網路業", "28": "電子零組件業", "29": "電子通路業", "30": "資訊服務業",
    "31": "其他電子業", "35": "綠能環保業", "36": "數位雲端業", "37": "運動休閒業",
    "38": "居家生活業",
}


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode("utf-8"))


def get_text(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode("utf-8", "replace")


def load_holdings():
    text = DATA_JS.read_text(encoding="utf-8")
    data = json.loads(re.sub(r"^window\.DATA\s*=\s*", "", text).rstrip(" ;\n"))
    result = {}
    for etf in data.get("etfs", {}).values():
        for snap in etf.get("snapshots", []):
            for h in snap.get("holdings", []):
                key = h.get("code") or h.get("name")
                if key:
                    result[key] = {"code": h.get("code", ""), "name": h.get("name", ""), "market": h.get("market", "")}
    return result


def fetch_twse_profiles():
    rows = get_json("https://openapi.twse.com.tw/v1/opendata/t187ap03_L")
    return {str(r.get("公司代號", "")).strip(): r for r in rows if r.get("公司代號")}


def stockanalysis_profile(symbol):
    page = get_text("https://stockanalysis.com/stocks/" + urllib.parse.quote(symbol.lower()) + "/company/")
    industry = re.search(r'industry:\{value:"([^"]+)', page)
    sector = re.search(r'sector:\{value:"([^"]+)', page)
    desc = re.search(r'description:"(.*?)",contact:', page, re.S)
    business = ""
    if desc:
        raw = desc.group(1).replace(r"\u003C", "<").replace(r"\u003E", ">")
        business = re.sub(r"<[^>]+>", " ", html.unescape(raw))
        business = re.sub(r"\s+", " ", business).strip()
    return {
        "sector": sector.group(1) if sector else "",
        "industry": industry.group(1) if industry else "",
        "business": business,
        "source": "Stock Analysis",
    }


def main():
    holdings = load_holdings()
    twse = fetch_twse_profiles()
    profiles = {}
    for key, h in sorted(holdings.items()):
        code, market = h["code"], h["market"]
        profile = {"name": h["name"], "market": market, "industry": "", "business": "", "source": ""}
        try:
            if market == "TW" and code in twse:
                row = twse[code]
                profile["industry"] = TWSE_INDUSTRIES.get(str(row.get("產業別", "")).strip(), "其他業")
                profile["business"] = "臺灣上市公司；主要業務請參考公司網站。"
                profile["source"] = "臺灣證券交易所"
            elif market == "US" and code:
                profile.update(stockanalysis_profile(code))
            elif code == "8035" and market == "JP":
                profile.update({"industry": "半導體設備", "business": "生產半導體製造設備與相關電子設備。", "source": "公司公開資料整理"})
            elif code == "009150" and market == "KS":
                profile.update({"industry": "電子零組件", "business": "生產相機模組、封裝基板與高頻元件等電子零組件。", "source": "公司公開資料整理"})
            else:
                profile["business"] = "無代號海外成分股，暫無可用公開摘要。"
        except Exception as exc:
            print("! {} {}: {}".format(code or key, h["name"], exc))
        profiles[key] = profile
        if market == "US":
            time.sleep(0.2)
    OUT.write_text(json.dumps(profiles, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("已更新 {} 筆公司資料：{}".format(len(profiles), OUT))


if __name__ == "__main__":
    main()
