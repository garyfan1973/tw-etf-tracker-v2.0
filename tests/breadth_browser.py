"""Run against python3 -m http.server 8016 --directory webapp.
Uses saved public prices; blocks external services and private account access.
"""
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
BASE = 'http://127.0.0.1:8016'
breadth = json.loads((ROOT / 'webapp/market_data.json').read_text())['marketBreadth']
latest = breadth['rows'][-1]

with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 1100})
    def route_request(route):
        url = urlparse(route.request.url)
        if url.hostname != '127.0.0.1':
            return route.abort()
        if url.path in ['/auth.js', '/member-gate.js']:
            return route.fulfill(content_type='text/javascript', body='window.ETFAuth={isConfigured:()=>false,user:()=>null,canUseChartAnalysis:()=>false};')
        if url.path.startswith('/api/'):
            return route.fulfill(status=503, content_type='application/json', body='{"ok":false}')
        route.continue_()
    context.route('**/*', route_request)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE + '/tracker.html?view=kline&symbol=2330&market=TW')
    page.wait_for_function('window.MarketChart?.currentRows?.length > 0')
    button = page.locator('[data-indicator="adl"]')
    button.click()
    expect(button).to_have_attribute('aria-pressed', 'true')
    expect(page.locator('[data-series="adl"]')).to_be_visible()
    expect(page.locator('#chartBox')).to_contain_text('台灣上市大盤')
    before = page.evaluate('window.MarketChart.getAnalysisSnapshot().indicatorRows.at(-1).twseAdl')
    assert before == latest['adl'], (before, latest)
    page.locator('[data-range-days="5"]').click()
    assert page.evaluate('window.MarketChart.getAnalysisSnapshot().indicatorRows.at(-1).twseAdl') == before
    page.locator('[data-range-days="1"]').click()
    expect(page.locator('[data-adl-point]')).to_be_visible()
    assert not page.locator('path[d*="NaN"],path[d*="Infinity"]').count()
    page.locator('[data-range-days="60"]').click()
    # Hover the last ADL point; inspect date-aligned official counts.
    dot = page.locator('[data-adl-point]').last.bounding_box()
    page.mouse.move(dot['x'] + dot['width']/2, dot['y'] + dot['height']/2)
    expect(page.locator('#tip')).to_contain_text('台灣上市大盤 ADL')
    expect(page.locator('#tip')).to_contain_text(f"上漲 {latest['advances']}")
    page.screenshot(path='/tmp/adl-desktop.png', full_page=True)
    page.reload()
    expect(button).to_have_attribute('aria-pressed', 'true')
    expect(page.locator('[data-series="adl"]')).to_be_visible()
    page.evaluate('window.MarketChart.selectAsset({symbol:"AAPL",market:"US",assetType:"stock"})')
    expect(page.locator('#chartBox')).to_contain_text('此市場尚無騰落家數資料')
    assert page.evaluate('window.MarketChart.getAnalysisSnapshot().indicatorRows.every(r=>r.twseAdl===null)')
    page.evaluate('window.MarketChart.selectAsset({symbol:"2330",market:"TW",assetType:"stock"})')
    expect(page.locator('[data-series="adl"]')).to_be_visible()
    # The analysis preset selects all seven indicators without throwing.
    preset = page.evaluate('window.MarketChart.withAnalysisPreset(snapshot=>snapshot)')
    assert len(preset['chart']['visibleIndicators']) == 7
    assert preset['indicatorRows'][-1]['twseAdl'] == latest['adl']
    page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path='/tmp/adl-mobile.png', full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile overflow'
    button.click()
    expect(page.locator('[data-series="adl"]')).to_have_count(0)
    assert not errors, errors
    # Isolated unavailable-data state must render as text, not a zero line.
    context2 = browser.new_context()
    context2.route('**/*', route_request)
    context2.route('**/market_data.json', lambda route: route.fulfill(status=503, body='unavailable'))
    empty = context2.new_page()
    empty.goto(BASE + '/tracker.html?view=kline&symbol=2330&market=TW')
    empty.locator('[data-indicator="adl"]').click()
    expect(empty.locator('#chartBox')).to_contain_text('騰落資料暫時無法取得')
    expect(empty.locator('[data-series="adl"]')).to_have_count(0)
    print('PASS: ADL real data, tooltip, fixed zoom origin, single day, persistence, market switch, seven-indicator snapshot, mobile, unavailable data')
    browser.close()
