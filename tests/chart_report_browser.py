"""Local-only browser QA; auth and model responses are fixtures, never live requests.

Run with: uv run --with playwright python tests/chart_report_browser.py
"""
import functools
import http.server
import json
from pathlib import Path
import threading
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from playwright.sync_api import sync_playwright
from test_chart_analysis_api import ChartAnalysisApiTests
from scripts.morning_report import analysis_html

ROOT = Path(__file__).resolve().parents[1]
fixture = ChartAnalysisApiTests().report_result()
fixture.update(reportMeta={"schemaVersion":3, "averageCost":394, "costCurrency":"USD"})
fixture["chart"].update(symbol="AVGO", name="Broadcom", market="US", date="2026-09-11", timeframe="日 K", lastPrice="378", currency="USD")
fixture["verdict"].update(state="弱勢反彈", entryNow="等待確認", thesis="尚未確認反轉。", biggestRisk="跌破近期低點", overall="等待確認")
fixture["technical"].update(patternAndMA="價格仍在 MA20 下方。", volume="反彈量能偏弱。", indicators="KD 上彎，MACD 尚未交叉。",
                            levels=[{"kind":"支撐","price":"365–368","basis":"近期整理區"},{"kind":"壓力","price":"390–395","basis":"MA20 附近"}])
fixture["fundamentals"].update(status="已查證", industry="產品需求參考官方資料 [1]。", earningsCatalysts="最新季報待核對。",
                               valuationDownside="評價尚未核對。", judgment="中性", asOf="2026Q2",
                               sources=[{"title":"官方財報","url":"https://example.com/filing","period":"2026Q2"}])
fixture["fastTrade"].update(style="逆勢小量試單", entry="365–368", trigger="守住支撐", target1="390–395", stop="跌破 365", rewardRisk="需確認")

AUTH = """
window.qaAccess={enabled:true, remaining:5, dailyLimit:5};
const query=new Proxy({}, {get:(_,key)=>key==='then'?resolve=>resolve({data:[],error:null}):()=>query});
const client={auth:{getSession:async()=>({data:{session:{user:{id:'qa-user'},access_token:'qa-fixture'}}})},from:()=>query,
storage:{from:()=>({upload:async()=>({error:null}),remove:async()=>({error:null})})},rpc:async()=>({data:null,error:null})};
window.ETFAuth={isConfigured:()=>true,user:()=>({id:'qa-user'}),client:()=>client,
chartAnalysisAccess:()=>window.qaAccess,refreshChartAnalysisAccess:async()=>window.qaAccess,canUseChartAnalysis:()=>window.qaAccess.enabled};
"""

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT/'webapp')))
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(viewport={"width":1440,"height":1100})
        errors = []
        sent = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.route('**/auth.js', lambda route: route.fulfill(content_type='text/javascript', body=AUTH))
        page.route('**/chart-analysis.js?*', lambda route: route.fulfill(content_type='text/javascript', body=(ROOT/'webapp/chart-analysis.js').read_text()+
                   '\nwindow.qaReport={frame:buildPdfExportFrame,pdf:createAnalysisPdf,sync:syncAccess};'))
        def response(route):
            sent.append(route.request.post_data_json)
            route.fulfill(json={"ok":True,"requestId":"qa-result","analysis":fixture,
                                "quota":{"remaining":4,"dailyLimit":5}})
        page.route('**/api/chart-analysis', response)
        page.route('**/api/news?*', lambda route: route.fulfill(json={"ok":True,"items":[]}))
        page.route('**/api/financials?*', lambda route: route.fulfill(json={"ok":False,"error":"QA fixture"}))
        dialogs = []
        page.on('dialog', lambda dialog: (dialogs.append(dialog.message), dialog.dismiss()))
        # Exercise the real K-line entrypoint, including preset restoration on errors.
        page.goto(f'http://127.0.0.1:{server.server_port}/tracker.html?view=kline&market=US&symbol=AVGO', wait_until='networkidle')
        page.wait_for_function('window.MarketChart?.getAnalysisSnapshot()?.priceRows?.length > 0')
        page.locator('[data-ma-period="5"]').click()
        restored = page.evaluate("""async()=>{
          const controls=()=>Array.from(document.querySelectorAll('[data-ma-period],[data-volume-ma-period],[data-indicator],[data-trade-overlay]')).map(e=>e.getAttribute('aria-pressed'));
          const before=JSON.stringify({chart:MarketChart.getAnalysisSnapshot().chart,controls:controls()});
          const captured=await MarketChart.withAnalysisPreset(async snapshot=>snapshot);
          const after=JSON.stringify({chart:MarketChart.getAnalysisSnapshot().chart,controls:controls()});
          const clean=s=>JSON.stringify({...JSON.parse(s),chart:{...JSON.parse(s).chart,capturedAt:null}});
          let caught=false;
          try{await MarketChart.withAnalysisPreset(async()=>{throw new Error('capture-fixture-failure')});}catch(e){caught=e.message==='capture-fixture-failure';}
          const failed=JSON.stringify({chart:MarketChart.getAnalysisSnapshot().chart,controls:controls()});
          return {restored:clean(before)===clean(after)&&clean(before)===clean(failed),caught,mas:captured.chart.visibleMas,indicators:captured.chart.visibleIndicators};
        }""")
        assert restored['restored'] and restored['caught'], restored
        assert restored['mas']==[5,10,20,60,120,240]
        assert len(restored['indicators'])==5
        page.click('[data-ai-chart-capture]')
        page.wait_for_url('**/chart-analysis.html?source=kline')
        page.wait_for_function('!document.querySelector("#chartPreview").hidden')
        assert page.input_value('#analysisSymbol')=='AVGO'
        assert not dialogs, dialogs
        assert not errors, errors
        page.goto(f'http://127.0.0.1:{server.server_port}/chart-analysis.html', wait_until='networkidle')
        page.wait_for_function('window.qaReport && !document.querySelector("#aiWorkspace").hidden')
        page.select_option('#positionStatus','holding')
        assert page.locator('#averageCost').is_visible()
        page.fill('#averageCost','394')
        page.select_option('#costCurrency','USD')
        page.fill('#analysisSymbol','AVGO')
        # Browser creates a real PNG to exercise the image preparation flow.
        png = page.evaluate("""()=>{const c=document.createElement('canvas');c.width=800;c.height=400;
            const x=c.getContext('2d');x.fillStyle='#eff3fa';x.fillRect(0,0,800,400);x.fillStyle='#234';x.font='32px sans-serif';x.fillText('AVGO — TEST CHART',40,100);return c.toDataURL('image/png').split(',')[1];}""")
        import base64
        page.set_input_files('#chartImage', {"name":"qa-chart.png","mimeType":"image/png","buffer":base64.b64decode(png)})
        page.wait_for_function('!document.querySelector("#chartPreview").hidden')
        page.click('#analyzeChart')
        page.wait_for_selector('#resultContent .sr-report')
        assert sent[0]['averageCost']=='394' and sent[0]['costCurrency']=='USD'
        assert page.locator('#resultContent .sr-hero').count()==1
        assert page.locator('#resultContent .ai-fixed-report').count()==0
        assert page.locator('#resultContent .sr-section h3').all_text_contents()==['技術面現況診斷','基本面與產業重點','快閃／短中長操作策略']
        assert page.locator('#resultContent .sr-cite[href="https://example.com/filing"]').count()==1
        assert page.locator('#resultContent .sr-strategy-table tbody tr').count()==3
        page.wait_for_function('!document.querySelector("#resultExportTools").hidden')
        page.screenshot(path='/private/tmp/chart-report-desktop.png',full_page=True)
        assert page.evaluate("""async()=>{const f=await qaReport.frame();const same=f.node.querySelector('.sr-report').innerHTML===document.querySelector('#resultContent .sr-report').innerHTML;f.frame.remove();return same;}""")
        pdf = page.evaluate("""async()=>{const b=await qaReport.pdf();return {size:b.size,header:await b.slice(0,4).text()};}""")
        assert pdf['size']>1000 and pdf['header']=='%PDF'
        for width in (390, 1440):
            page.set_viewport_size({"width":width,"height":1000})
            for theme in ('light','dark'):
                page.evaluate('(theme)=>document.documentElement.dataset.theme=theme', theme)
                assert page.locator('#resultContent .sr-report').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
        page.set_viewport_size({"width":390,"height":1000})
        page.screenshot(path='/private/tmp/chart-report-mobile.png',full_page=True)
        page.select_option('#positionStatus','watching')
        assert not page.locator('#averageCost').is_visible()
        assert page.input_value('#averageCost')==''
        page.evaluate('async()=>{qaAccess.enabled=false;await qaReport.sync();}')
        assert not page.locator('#aiWorkspace').is_visible()
        assert '尚未開通' in page.locator('#aiGate').inner_text()
        assert not errors, errors
        page.set_content(analysis_html({"symbol":"AVGO", "assetName":"Broadcom"}, "2026-09-11", fixture, base64.b64decode(png)), wait_until='load')
        assert page.locator('#report .sr-section').count()==3
        assert page.locator('#report .sr-cite[href="https://example.com/filing"]').count()==1
        morning_pdf = page.pdf(format='A4', print_background=True)
        assert morning_pdf[:4]==b'%PDF' and len(morning_pdf)>1000
        print(json.dumps({"browser":"passed", "pdfBytes":pdf['size'], "morningPdfBytes":len(morning_pdf), "checks":["K-line capture and transfer","preset restoration after success and failure","upload","cost","standard report","source links","shared PDF","morning PDF","mobile","dark","member gate"]}))
        browser.close()
finally:
    server.shutdown()
