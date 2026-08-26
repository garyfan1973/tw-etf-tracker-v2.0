#!/usr/bin/env python3
"""Create weekday member morning reports and email each completed symbol immediately."""
from __future__ import annotations

import argparse
import asyncio
import base64
import datetime as dt
import html
import importlib.util
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
TAIPEI = ZoneInfo("Asia/Taipei")
DEFAULT_BASE_URL = "https://tw-etf-tracker-v2-0.vercel.app"
MAX_PDF_BYTES = 3_500_000


class MorningReportError(RuntimeError):
    pass


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise MorningReportError(f"缺少環境變數 {name}")
    return value


def service_post(base_url: str, endpoint: str, service_key: str, payload: dict, timeout: int = 140):
    body = json.dumps(payload, ensure_ascii=False).encode()
    request = urllib.request.Request(
        base_url.rstrip("/") + endpoint, data=body, method="POST",
        headers={"Accept":"application/json", "Content-Type":"application/json", "Authorization":f"Bearer {service_key}", "X-Morning-Report":"1"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            result = json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace")
        raise MorningReportError(f"{endpoint} 失敗：HTTP {error.code} {detail[:300]}") from error
    if not result.get("ok"):
        raise MorningReportError(result.get("error") or f"{endpoint} 未完成")
    return result


class SupabaseAdmin:
    def __init__(self, url: str, service_key: str):
        self.url = url.rstrip("/")
        self.headers = {"apikey": service_key}
        if not service_key.startswith("sb_secret_"):
            self.headers["Authorization"] = f"Bearer {service_key}"

    def request(self, path: str, method: str = "GET", payload=None, prefer: str = ""):
        body = json.dumps(payload, ensure_ascii=False).encode() if payload is not None else None
        headers = {"Accept": "application/json", **self.headers}
        if body is not None:
            headers["Content-Type"] = "application/json"
        if prefer:
            headers["Prefer"] = prefer
        request = urllib.request.Request(self.url + path, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read().decode()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors="replace")
            raise MorningReportError(f"Supabase {method} {path} 失敗：HTTP {error.code} {detail[:300]}") from error

    def select(self, table: str, query: str):
        return self.request(f"/rest/v1/{table}?{query}") or []

    def insert(self, table: str, row: dict):
        data = self.request(f"/rest/v1/{table}", "POST", row, "return=representation") or []
        return data[0] if data else row

    def update(self, table: str, filters: str, values: dict):
        return self.request(f"/rest/v1/{table}?{filters}", "PATCH", values, "return=minimal")

    def account_emails(self) -> dict[str, str]:
        result, page = {}, 1
        while True:
            payload = self.request(f"/auth/v1/admin/users?page={page}&per_page=100") or {}
            users = payload.get("users") or []
            for user in users:
                if user.get("id") and user.get("email"):
                    result[user["id"]] = user["email"]
            if len(users) < 100:
                break
            page += 1
        return result


def eligible_subscriptions(db: SupabaseAdmin):
    settings = db.select("morning_report_settings", "select=user_id&enabled=eq.true")
    if not settings:
        return {}, {}
    user_ids = [row["user_id"] for row in settings]
    in_filter = urllib.parse.quote(",".join(user_ids), safe="-,")
    symbols = db.select("morning_report_symbols", f"select=user_id,market,asset_type,symbol,asset_name,sort_order&user_id=in.({in_filter})&order=sort_order.asc")
    access = db.select("ai_feature_access", f"select=user_id,enabled,expires_at&user_id=in.({in_filter})")
    now = dt.datetime.now(dt.timezone.utc)
    allowed = set()
    for row in access:
        expires = row.get("expires_at")
        expiry = dt.datetime.fromisoformat(expires.replace("Z", "+00:00")) if expires else None
        if row.get("enabled") and (expiry is None or expiry > now):
            allowed.add(row["user_id"])
    emails = db.account_emails()
    by_asset, by_user = {}, {}
    for row in symbols:
        user_id = row["user_id"]
        if user_id not in allowed or user_id not in emails:
            continue
        key = (row["market"], row["symbol"])
        asset = {"market": row["market"], "assetType": row["asset_type"], "symbol": row["symbol"], "assetName": row["asset_name"]}
        by_asset.setdefault(key, {"asset": asset, "users": []})["users"].append({"userId": user_id, "email": emails[user_id]})
        by_user.setdefault(user_id, []).append(asset)
    return by_asset, by_user


def get_or_create_run(db: SupabaseAdmin, report_date: str, symbol_count: int):
    rows = db.select("morning_report_runs", f"select=*&report_date=eq.{report_date}&limit=1")
    if rows:
        run = rows[0]
        db.update("morning_report_runs", f"id=eq.{run['id']}", {"status": "running", "completed_at": None, "symbol_count": symbol_count, "error_message": None})
        return run
    return db.insert("morning_report_runs", {"report_date": report_date, "status": "running", "symbol_count": symbol_count})


def existing_result(db: SupabaseAdmin, report_date: str, market: str, symbol: str):
    query = f"select=*&report_date=eq.{report_date}&market=eq.{market}&symbol=eq.{urllib.parse.quote(symbol, safe='-.^')}&limit=1"
    rows = db.select("morning_report_results", query)
    return rows[0] if rows else None


def existing_delivery(db: SupabaseAdmin, report_date: str, user_id: str, market: str, symbol: str):
    query = f"select=*&report_date=eq.{report_date}&user_id=eq.{user_id}&market=eq.{market}&symbol=eq.{urllib.parse.quote(symbol, safe='-.^')}&limit=1"
    rows = db.select("morning_report_deliveries", query)
    return rows[0] if rows else None


async def capture_chart(page, base_url: str, asset: dict):
    query = urllib.parse.urlencode({"view": "kline", "market": asset["market"], "symbol": asset["symbol"]})
    await page.goto(f"{base_url.rstrip('/')}/tracker.html?{query}", wait_until="domcontentloaded", timeout=90_000)
    await page.wait_for_function(
        """expected => window.MarketChart?.currentAsset?.symbol === expected
        && window.MarketChart?.currentRows?.length > 0
        && document.querySelector('#chartBox svg')""",
        asset["symbol"], timeout=90_000)
    await page.evaluate("document.querySelector('#tip').style.visibility='hidden'")
    await page.locator("#aiChartCapture").scroll_into_view_if_needed()
    image = await page.locator("#aiChartCapture").screenshot(type="jpeg", quality=82)
    chart_data = await page.evaluate("window.MarketChart.getAnalysisSnapshot()")
    if not chart_data:
        raise MorningReportError("無法建立行情快照")
    return image, chart_data


def analysis_html(asset: dict, report_date: str, analysis: dict, image_bytes: bytes) -> str:
    esc = lambda value: html.escape(str(value or "—"))
    points = "".join(f"<article><b>{esc(item.get('label'))}</b><p>{esc(item.get('analysis'))}</p></article>" for item in analysis.get("technicalPoints") or [])
    listing = lambda values: "<ul>" + "".join(f"<li>{esc(value)}</li>" for value in (values or ["資訊不足，無法判斷"])) + "</ul>"
    plan = analysis.get("tradePlan") or {}
    plan_rows = "".join(f"<div><span>{label}</span><strong>{esc(plan.get(key))}</strong></div>" for label, key in (("進場條件","entry"),("防守／停損","defense"),("第一目標","firstTarget"),("第二目標","secondTarget"),("強壓位置","strongResistance"),("部位建議","positionSizing")))
    image = base64.b64encode(image_bytes).decode()
    return f"""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><style>
    @page{{size:A4;margin:24px}}*{{box-sizing:border-box}}body{{margin:0;color:#1c2430;font-family:-apple-system,'PingFang TC','Microsoft JhengHei',sans-serif;font-size:14px;line-height:1.6}}header{{display:flex;justify-content:space-between;gap:20px;padding-bottom:14px;border-bottom:3px solid #3b5bdb}}h1{{margin:3px 0 0;font-size:27px}}header em{{color:#3b5bdb;font-size:11px;font-style:normal;font-weight:800;letter-spacing:.12em}}header small{{color:#6b7684}}.chart{{display:block;width:100%;max-height:520px;margin:18px 0;object-fit:contain;border-radius:12px}}.hero,.card{{padding:15px;border:1px solid #e3e7ec;border-radius:11px;background:#f8fafc}}.hero{{border-color:#c7d2fe;background:#eef2ff}}.hero label{{color:#3b5bdb;font-weight:800}}.hero h2{{margin:3px 0;font-size:21px}}.hero p,.points p{{margin:3px 0;color:#596579}}.card{{margin-top:11px}}.card h3{{margin:0 0 8px}}.points,.zones,.plan{{display:grid;grid-template-columns:1fr 1fr;gap:9px}}.points article,.plan div{{padding:10px;border-radius:8px;background:#fff}}.points article{{border-left:4px solid #3b5bdb}}.plan span,.plan strong{{display:block}}.plan span{{color:#6b7684;font-size:11px}}ul{{margin:0;padding-left:20px;color:#596579}}.invalid{{margin-top:11px;padding:11px;background:#fff0f0;border-radius:8px}}.invalid b{{color:#d64545;margin-right:10px}}footer{{margin-top:16px;padding-top:11px;border-top:1px solid #e3e7ec;color:#6b7684;font-size:11px}}
    </style></head><body><header><div><em>AI MORNING TECHNICAL ANALYSIS</em><h1>{esc(asset['symbol'])} {esc(asset['assetName'])}</h1></div><small>{esc(report_date)} · 盤後 · 一般分析</small></header><img class="chart" src="data:image/jpeg;base64,{image}" alt="技術線圖"><section class="hero"><label>{esc(analysis.get('marketState'))}</label><h2>{esc(analysis.get('conclusion'))}</h2><p>{esc(analysis.get('thesis'))}</p></section><section class="card"><h3>技術判讀</h3><div class="points">{points}</div></section><div class="zones"><section class="card"><h3>支撐區</h3>{listing(analysis.get('supportZones'))}</section><section class="card"><h3>壓力區</h3>{listing(analysis.get('resistanceZones'))}</section></div><section class="card"><h3>交易計畫</h3><div class="plan">{plan_rows}</div></section><section class="card"><h3>風險提醒</h3>{listing(analysis.get('riskNotes'))}</section><div class="invalid"><b>判斷失效條件</b>{esc(analysis.get('invalidation'))}</div><footer>AI 分析僅供技術研究與交易計畫整理，不構成投資建議或獲利保證。</footer></body></html>"""


async def make_pdf(page, markup: str) -> bytes:
    await page.set_content(markup, wait_until="load")
    await page.emulate_media(media="screen")
    return await page.pdf(format="A4", print_background=True, margin={"top":"0", "right":"0", "bottom":"0", "left":"0"})


async def process_asset(db, browser, service_key, run, report_date, base_url, item, dry_run=False):
    asset, subscribers = item["asset"], item["users"]
    result_row = existing_result(db, report_date, asset["market"], asset["symbol"])
    image_bytes = None
    try:
        page = await browser.new_page(viewport={"width": 1440, "height": 1280}, device_scale_factor=1)
        try:
            image_bytes, chart_data = await capture_chart(page, base_url, asset)
            if result_row and result_row.get("status") == "completed" and result_row.get("analysis"):
                analysis, model = result_row["analysis"], result_row.get("model")
            else:
                response = service_post(base_url, "/api/chart-analysis", service_key, {"imageData":"data:image/jpeg;base64," + base64.b64encode(image_bytes).decode(), "mode":"general", "symbol":asset["symbol"], "screenshotTiming":"盤後", "chartData":chart_data})
                analysis, model = response["analysis"], response.get("model")
                values = {"run_id":run["id"], "report_date":report_date, "market":asset["market"], "symbol":asset["symbol"], "asset_name":asset["assetName"], "status":"completed", "model":model, "analysis":analysis, "error_message":None, "completed_at":dt.datetime.now(dt.timezone.utc).isoformat()}
                if result_row:
                    db.update("morning_report_results", f"id=eq.{result_row['id']}", values)
                else:
                    result_row = db.insert("morning_report_results", values)
            pdf = await make_pdf(page, analysis_html(asset, report_date, analysis, image_bytes))
        finally:
            await page.close()
        if len(pdf) > MAX_PDF_BYTES:
            raise MorningReportError("PDF 超過 3.5 MB")
        sent = 0
        for subscriber in subscribers:
            delivery = existing_delivery(db, report_date, subscriber["userId"], asset["market"], asset["symbol"])
            if delivery and delivery.get("status") == "sent":
                continue
            if not delivery:
                delivery = db.insert("morning_report_deliveries", {"run_id":run["id"], "report_date":report_date, "user_id":subscriber["userId"], "market":asset["market"], "symbol":asset["symbol"], "status":"pending"})
            try:
                mail = {"email":subscriber["email"], "symbol":asset["symbol"], "assetName":asset["assetName"], "date":report_date, "timing":"盤後", "pdfBase64":base64.b64encode(pdf).decode()}
                subject = f"{asset['symbol']} {asset['assetName']} {report_date} 盤後 技術分析指引"
                if dry_run:
                    print(f"DRY_RUN {asset['market']} {asset['symbol']} -> {subscriber['email']}", flush=True)
                    continue
                service_post(base_url, "/api/chart-analysis-email", service_key, mail, timeout=45)
                db.update("morning_report_deliveries", f"id=eq.{delivery['id']}", {"subject":subject, "status":"sent", "error_message":None, "completed_at":dt.datetime.now(dt.timezone.utc).isoformat()})
                sent += 1
                print(f"SENT {asset['market']} {asset['symbol']} -> {subscriber['email']}", flush=True)
            except Exception as error:
                db.update("morning_report_deliveries", f"id=eq.{delivery['id']}", {"status":"error", "error_message":str(error)[:300], "completed_at":dt.datetime.now(dt.timezone.utc).isoformat()})
                print(f"EMAIL_ERROR {asset['market']} {asset['symbol']}: {error}", file=sys.stderr, flush=True)
        return sent, 0
    except Exception as error:
        values = {"run_id":run["id"], "report_date":report_date, "market":asset["market"], "symbol":asset["symbol"], "asset_name":asset["assetName"], "status":"error", "model":os.getenv("OPENAI_MODEL", "gpt-5.2"), "analysis":None, "error_message":str(error)[:300], "completed_at":dt.datetime.now(dt.timezone.utc).isoformat()}
        if result_row:
            db.update("morning_report_results", f"id=eq.{result_row['id']}", values)
        else:
            db.insert("morning_report_results", values)
        print(f"ANALYSIS_ERROR {asset['market']} {asset['symbol']}: {error}", file=sys.stderr, flush=True)
        return 0, 1


async def run(args):
    from playwright.async_api import async_playwright

    db = SupabaseAdmin(required_env("SUPABASE_URL"), required_env("SUPABASE_SERVICE_ROLE_KEY"))
    service_key = required_env("SUPABASE_SERVICE_ROLE_KEY")
    subscriptions, _ = eligible_subscriptions(db)
    report_date = args.date or dt.datetime.now(TAIPEI).date().isoformat()
    run_row = get_or_create_run(db, report_date, len(subscriptions))
    if not subscriptions:
        db.update("morning_report_runs", f"id=eq.{run_row['id']}", {"status":"completed", "completed_at":dt.datetime.now(dt.timezone.utc).isoformat(), "sent_count":0, "error_count":0})
        print("沒有已啟用且具權限的晨報標的。")
        return 0
    sent = errors = 0
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        try:
            for key in sorted(subscriptions):
                added, failed = await process_asset(db, browser, service_key, run_row, report_date, args.base_url, subscriptions[key], args.dry_run)
                sent += added; errors += failed
        finally:
            await browser.close()
    status = "completed" if not errors else "partial" if sent else "error"
    db.update("morning_report_runs", f"id=eq.{run_row['id']}", {"status":status, "completed_at":dt.datetime.now(dt.timezone.utc).isoformat(), "sent_count":sent, "error_count":errors, "error_message":None if not errors else f"{errors} 檔分析失敗"})
    print(f"晨報完成：寄送 {sent} 封，失敗 {errors} 檔。")
    return 1 if errors else 0


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.getenv("MORNING_REPORT_BASE_URL", DEFAULT_BASE_URL))
    parser.add_argument("--date", help="報告日期 YYYY-MM-DD；預設台北當日")
    parser.add_argument("--dry-run", action="store_true", help="完成分析與 PDF，但不連線 Gmail")
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run(parse_args())))
