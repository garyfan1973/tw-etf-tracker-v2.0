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

ROOT = Path(__file__).resolve().parents[1]
fixture = ChartAnalysisApiTests().report_result()
fixture.update(marketState="弱勢反彈", conclusion="AVGO 空頭趨勢中的弱勢反彈，尚未確認反轉。", currency="USD",
               costAnalysis="成本接近 390–395 壓力區。", rating="⭐⭐⭐☆☆",
               ratingReason="有反彈條件，但量能及中期趨勢仍待確認。",
               keyLevels=[{"price":"365–368", "meaning":"第一支撐，近期整理區"}, {"price":"390–395", "meaning":"強壓力，MA20 附近"}],
               reportMeta={"schemaVersion":2, "averageCost":394, "costCurrency":"USD"})

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
        page.wait_for_selector('#resultContent .cr-rating')
        assert sent[0]['averageCost']=='394' and sent[0]['costCurrency']=='USD'
        assert page.locator('#resultContent .cr-section h3').all_text_contents()==['結論','技術面','關鍵價位','操作策略']
        page.wait_for_function('!document.querySelector("#resultExportTools").hidden')
        page.screenshot(path='/private/tmp/chart-report-desktop.png',full_page=True)
        assert page.evaluate("""async()=>{const f=await qaReport.frame();const same=f.node.querySelector('.cr-report').innerHTML===document.querySelector('#resultContent .cr-report').innerHTML;f.frame.remove();return same;}""")
        pdf = page.evaluate("""async()=>{const b=await qaReport.pdf();return {size:b.size,header:await b.slice(0,4).text()};}""")
        assert pdf['size']>1000 and pdf['header']=='%PDF'
        for width in (390, 1440):
            page.set_viewport_size({"width":width,"height":1000})
            for theme in ('light','dark'):
                page.evaluate('(theme)=>document.documentElement.dataset.theme=theme', theme)
                assert page.locator('#resultContent .cr-report').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
        page.set_viewport_size({"width":390,"height":1000})
        page.screenshot(path='/private/tmp/chart-report-mobile.png',full_page=True)
        page.select_option('#positionStatus','watching')
        assert not page.locator('#averageCost').is_visible()
        assert page.input_value('#averageCost')==''
        page.evaluate('async()=>{qaAccess.enabled=false;await qaReport.sync();}')
        assert not page.locator('#aiWorkspace').is_visible()
        assert '尚未開通' in page.locator('#aiGate').inner_text()
        assert not errors, errors
        print(json.dumps({"browser":"passed", "pdfBytes":pdf['size'], "checks":["upload","cost","fixed report","shared PDF","mobile","dark","member gate"]}))
        browser.close()
finally:
    server.shutdown()
