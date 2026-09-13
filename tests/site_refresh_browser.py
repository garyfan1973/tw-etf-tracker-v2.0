"""Browser regression for current macro/news content and repaired navigation."""
from playwright.sync_api import sync_playwright, expect

BASE = "http://127.0.0.1:8012"
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE + "/macro-economy.html")
    expect(page.locator("#macroHero")).to_contain_text("PPI")
    expect(page.locator("#macroHero")).to_contain_text("非農")
    expect(page.locator("#macroHero")).to_contain_text("2026 年 8 月")
    assert "統計月份" in page.locator(".macro-method-note").inner_text()
    page.goto(BASE + "/videos.html")
    expect(page.locator("#channelSections")).not_to_contain_text("錢鏡你家")
    expect(page.locator("#macroNewsSections")).not_to_contain_text("2026-09-06")
    page.goto(BASE + "/taiwan-futures.html")
    expect(page.locator(".futures-night-link")).to_have_attribute("href", "https://www.wantgoo.com/futures")
    assert not errors, errors
    print("PASS: macro periods and latest cards, stale CNBC hidden, channel removed, futures URL")
    browser.close()
