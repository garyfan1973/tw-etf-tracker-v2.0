"""Homepage should open stock information with the symbol search ready for typing.

Start: python3 -m http.server 8017 --bind 127.0.0.1 --directory webapp
Run:   uv run --with playwright python tests/homepage_browser.py
"""
from playwright.sync_api import sync_playwright, expect


BASE = "http://127.0.0.1:8017"


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome", headless=True)
    context = browser.new_context(viewport={"width": 1280, "height": 900})

    def local_only(route):
        url = route.request.url
        if url.startswith(BASE):
            if "/auth.js" in url or "/member-gate.js" in url:
                route.fulfill(
                    content_type="text/javascript",
                    body="window.ETFAuth={isConfigured:()=>true,isMembershipReady:()=>true,canUseSite:()=>true,user:()=>({id:'test'}),canUseChartAnalysis:()=>false};document.dispatchEvent(new CustomEvent('etfauth:change'));",
                )
            elif "/api/" in url:
                route.fulfill(status=503, content_type="application/json", body='{"ok":false}')
            else:
                route.continue_()
        else:
            route.abort()

    context.route("**/*", local_only)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    page.goto(BASE + "/")
    page.wait_for_url("**/tracker.html?view=overview&focus=search")
    expect(page.locator("#workspaceTitle")).to_have_text("個股資訊")
    expect(page.locator("#marketOverviewViewBtn")).to_have_attribute("aria-selected", "true")
    search = page.locator("#assetSearch")
    expect(search).to_be_focused()
    page.keyboard.type("2330")
    expect(search).to_have_value("2330")
    expect(page.locator("#assetResults")).to_contain_text("台積電")

    page.goto(BASE + "/tracker.html?view=overview&market=TW&symbol=2330")
    page.wait_for_function("window.MarketChart?.currentAsset?.symbol === '2330'")
    assert page.evaluate("document.activeElement?.id") != "assetSearch"
    assert not errors, errors
    print("PASS: homepage redirects to stock information, focuses symbol search, and keeps deep-link focus unchanged")
    browser.close()
