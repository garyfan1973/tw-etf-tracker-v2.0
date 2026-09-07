"""Local browser regression: real saved daily data, no auth or remote writes.
Start python3 -m http.server 8012 --directory webapp, then:
uv run --with playwright python tests/analysis_browser.py
"""
import csv
import io
import json
import os
from pathlib import Path
import tempfile
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('ANALYSIS_TEST_URL', 'http://127.0.0.1:8012')
OUT = Path(tempfile.mkdtemp(prefix='analysis-qa-'))

with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    context = browser.new_context(viewport={'width':1440,'height':1100}, permissions=['clipboard-read','clipboard-write'])
    page = context.new_page()
    errors=[]
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE+'/analysis.html?market=TW&symbol=2330&range=63&mode=candle&sub=rsi&overlays=ma20,ma60')
    expect(page.locator('#dashboard')).to_have_attribute('aria-busy','false')
    expect(page.locator('#assetName')).to_have_text('台積電')
    expect(page.locator('#mainChart svg')).to_be_visible()
    expect(page.locator('#visibleDates')).to_contain_text('63 筆')
    initial = page.locator('#metrics').inner_text()
    page.get_by_role('button',name='1M',exact=True).click()
    expect(page.locator('#visibleDates')).to_contain_text('21 筆')
    assert initial != page.locator('#metrics').inner_text()
    page.get_by_role('button',name='布林通道',exact=True).click()
    expect(page.get_by_role('button',name='布林通道',exact=True)).to_have_attribute('aria-pressed','true')
    page.get_by_role('button',name='MACD',exact=True).click()
    expect(page.locator('#mainChart svg')).to_have_attribute('aria-label','日線價格、成交量及 MACD 指標')
    page.get_by_role('button',name='KD',exact=True).click()
    expect(page.locator('#mainChart svg')).to_have_attribute('aria-label','日線價格、成交量及 KD 指標')
    # Every price mode renders real data, with a keyboard-linked crosshair.
    page.get_by_role('button',name='走勢',exact=True).click()
    chart=page.locator('#mainChart')
    chart.focus();page.keyboard.press('ArrowLeft')
    expect(page.locator('#crosshair')).to_have_attribute('visibility','visible')
    old = page.locator('#hoverReadout').inner_text();page.keyboard.press('ArrowLeft')
    assert page.locator('#hoverReadout').inner_text()!=old
    page.get_by_role('button',name='相對報酬',exact=True).click()
    expect(page.locator('#chartLegend')).to_contain_text('共同日')
    expect(page.get_by_role('button',name='MA20',exact=True)).to_be_disabled()
    assert not page.locator('path[d*="NaN"],path[d*="Infinity"]').count()
    page.locator('#benchmark').select_option('2330')
    expect(page.locator('#dashboard')).to_have_attribute('aria-busy','false')
    paths=page.locator('#mainChart path.line').evaluate_all('(els)=>els.slice(0,2).map(el=>el.getAttribute("d"))')
    assert paths[0]==paths[1], 'Self comparison must overlap exactly'
    page.locator('#benchmark').select_option('0050')
    expect(page.locator('#dashboard')).to_have_attribute('aria-busy','false')
    page.get_by_role('button',name='K 線',exact=True).click()
    page.get_by_role('button',name='放大時間軸',exact=True).click()
    assert '21 筆' not in page.locator('#visibleDates').inner_text()
    page.get_by_role('button',name='重設 ↺',exact=True).click()
    # Wheel and drag change the synchronized time window.
    box=chart.bounding_box();page.mouse.move(box['x']+box['width']*.5,box['y']+100)
    old=page.locator('#visibleDates').inner_text();page.mouse.wheel(0,-100)
    page.wait_for_function('(old)=>document.querySelector("#visibleDates").textContent!==old',arg=old)
    old=page.locator('#visibleDates').inner_text();page.mouse.down();page.mouse.move(box['x']+box['width']*.75,box['y']+100,steps=8);page.mouse.up()
    assert page.locator('#visibleDates').inner_text()!=old
    # Calendar drilldown.
    page.locator('[data-month="2026-07"]').click()
    expect(page.locator('#visibleDates')).to_contain_text('2026-07')
    # Search and switch assets.
    page.locator('#search').fill('00981A');page.locator('#search').press('Enter')
    expect(page.locator('#assetSymbol')).to_have_text('00981A')
    expect(page.locator('#dashboard')).to_have_attribute('aria-busy','false')
    with page.expect_download() as event: page.locator('#export').click()
    download=event.value;download.save_as(OUT/download.suggested_filename)
    csv_rows=list(csv.DictReader(io.StringIO((OUT/download.suggested_filename).read_text(encoding='utf-8-sig'))))
    assert csv_rows and csv_rows[0]['symbol']=='00981A' and 'RSI14' in csv_rows[0]
    assert len(csv_rows)==int(page.locator('#visibleDates').inner_text().split('·')[-1].split()[0])
    # Share link restores full state in a fresh context, without local storage.
    page.locator('#share').click()
    shared=page.url;before=page.locator('#visibleDates').inner_text()
    fresh=browser.new_context(viewport={'width':1440,'height':1100}); shared_page=fresh.new_page();shared_page.goto(shared)
    expect(shared_page.locator('#dashboard')).to_have_attribute('aria-busy','false')
    expect(shared_page.locator('#assetSymbol')).to_have_text('00981A')
    expect(shared_page.locator('#visibleDates')).to_have_text(before)
    fresh.close()
    # Pin persists across reloads; repeated toggling only touches local storage.
    was=page.locator('#pin').get_attribute('aria-pressed');page.locator('#pin').click();page.reload()
    expect(page.locator('#dashboard')).to_have_attribute('aria-busy','false')
    expect(page.locator('#pin')).to_have_attribute('aria-pressed','false' if was=='true' else 'true')
    page.locator('#pin').click()
    page.locator('#focus').click();expect(page.locator('.sidebar')).not_to_be_visible()
    page.locator('#focus').click();expect(page.locator('.sidebar')).to_be_visible()
    page.locator('#help').click();expect(page.locator('#helpDialog')).to_be_visible();page.keyboard.press('Escape');expect(page.locator('#helpDialog')).not_to_be_visible()
    # Scanner filter, pagination, and actual navigation.
    page.locator('#scanFilter').select_option('negative')
    assert page.locator('#scanner tr').count()>0
    values=page.locator('#scanner tr td:nth-child(4)').all_text_contents();assert all(v.startswith('-') for v in values)
    page.locator('#scanFilter').select_option('all');page.locator('#more').click();assert page.locator('#scanner tr').count()==25
    code=page.locator('#scanner [data-symbol]').first.get_attribute('data-symbol');page.locator('#scanner [data-symbol]').first.click();expect(page.locator('#assetSymbol')).to_have_text(code)
    # All four markets, including the three-stock Korean catalog.
    for market in ['US','JP','KS','TW']:
        page.locator('#market').select_option(market);expect(page.locator('#dashboard')).to_have_attribute('aria-busy','false');expect(page.locator('#assetAvatar')).to_have_text(market)
        assert page.locator('#mainChart svg').count()==1
    # Delayed response cannot overwrite a newer selection.
    delayed=[]
    page.route('**/price-history/TW/0056.json',lambda route: delayed.append(route))
    page.locator('#search').fill('0056');page.locator('#search').press('Enter');page.wait_for_function('document.querySelector("#dashboard").getAttribute("aria-busy")==="true"')
    page.locator('#search').fill('2330');page.locator('#search').press('Enter');expect(page.locator('#assetSymbol')).to_have_text('2330')
    for route in delayed: route.continue_()
    expect(page.locator('#assetSymbol')).to_have_text('2330')
    page.unroute('**/price-history/TW/0056.json')
    page.goto(BASE+'/analysis.html?market=TW&symbol=2330&mode=candle&range=63&sub=rsi&overlays=ma20,ma60')
    expect(page.locator('#dashboard')).to_have_attribute('aria-busy','false');page.screenshot(path=str(OUT/'desktop.png'),full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    # Narrow viewports must confine horizontal scrolling to heatmap/table.
    for width in [768,390,360]:
        page.set_viewport_size({'width':width,'height':844});page.wait_for_timeout(150)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),f'Page overflow at {width}px'
        expect(page.locator('#mainChart svg')).to_be_visible()
        page.locator('#mainChart').scroll_into_view_if_needed();page.get_by_role('button',name='MACD',exact=True).click();page.get_by_role('button',name='RSI',exact=True).click()
        if width==390: page.screenshot(path=str(OUT/'mobile.png'),full_page=True)
    # Network failure must clear prior metrics, then recover via retry.
    failing=browser.new_context();fp=failing.new_page()
    fp.route('**/price-history/TW/2330.json',lambda route:route.fulfill(status=503,body='unavailable'))
    fp.goto(BASE+'/analysis.html?market=TW&symbol=2330');expect(fp.locator('#error')).to_be_visible();expect(fp.locator('#price')).to_have_text('—');assert fp.locator('#metrics').inner_text()==''
    fp.unroute('**/price-history/TW/2330.json');fp.locator('#retry').click();expect(fp.locator('#assetName')).to_have_text('台積電');expect(fp.locator('#mainChart svg')).to_be_visible();failing.close()
    # All missing indicator samples remain gaps, including null volume and OHLC.
    short=browser.new_context();sp=short.new_page()
    fixture={'rows':[{'date':'2026-01-02','close':100,'volume':None},{'date':'2026-01-05','close':101,'volume':None}]}
    sp.route('**/price-history/TW/2330.json',lambda route:route.fulfill(json=fixture))
    sp.goto(BASE+'/analysis.html?market=TW&symbol=2330');expect(sp.locator('#dashboard')).to_have_attribute('aria-busy','false');expect(sp.locator('#gauge')).to_contain_text('資料不足');assert not sp.locator('path[d*="NaN"]').count();expect(sp.locator('#mainChart svg')).to_contain_text('無成交量資料');short.close()
    # Homepage entry is discoverable.
    page.goto(BASE+'/index.html');expect(page.get_by_role('link',name='專業分析台 ↗')).to_be_visible();page.get_by_role('link',name='專業分析台 ↗').click();expect(page.locator('#mainChart svg')).to_be_visible()
    assert not errors,errors
    print('PASS: desktop/mobile, four markets, chart modes/indicators, zoom/pan/cursor, calendar, search, benchmark, export, share, pins, filters, focus, races, errors, missing data, navigation')
    print('Artifacts:',OUT)
    browser.close()
