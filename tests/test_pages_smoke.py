"""Headless smoke test: every page loads with zero console errors and no horizontal scroll.

Serves the repo on a local port and drives Chromium via Playwright at desktop
and phone widths. Needs network access for the pinned CDN scripts.
Set SCREENSHOT_DIR to save full-page screenshots for visual review.
"""
import functools
import http.server
import os
import threading
from pathlib import Path

import pytest

sync_api = pytest.importorskip("playwright.sync_api")

ROOT = Path(__file__).resolve().parents[1]
PAGES = {
    "index.html": ["#vsm .vsm-bar span", "#as-is-map svg", "#to-be-map svg", "#c-roi"],
    "dashboard.html": ["#kpis .kpi", "#c-stages"],
    "methods.html": ["#sql-blocks .method-block", "#mining-table table"],
}
WIDTHS = [1280, 375]


@pytest.fixture(scope="module")
def base_url():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


@pytest.fixture(scope="module")
def browser():
    with sync_api.sync_playwright() as p:
        try:
            b = p.chromium.launch()
        except Exception:
            b = p.chromium.launch(channel="chrome")
        yield b
        b.close()


@pytest.mark.parametrize("width", WIDTHS)
@pytest.mark.parametrize("page_name", sorted(PAGES))
def test_page_renders_cleanly(browser, base_url, page_name, width):
    page = browser.new_page(viewport={"width": width, "height": 900})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{base_url}/{page_name}", wait_until="networkidle")
    page.wait_for_timeout(1500)  # chart animations and Mermaid rendering

    for selector in PAGES[page_name]:
        assert page.locator(selector).count() > 0, f"{page_name}: missing {selector}"

    overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    assert overflow <= 0, f"{page_name} @ {width}px scrolls horizontally by {overflow}px"
    assert not errors, f"{page_name} @ {width}px console errors: {errors}"

    shots = os.environ.get("SCREENSHOT_DIR")
    if shots:
        page.screenshot(path=str(Path(shots) / f"{page_name[:-5]}-{width}.png"), full_page=True)
    page.close()


def test_dashboard_interactions(browser, base_url):
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{base_url}/dashboard.html", wait_until="networkidle")

    first_tile = page.locator("#kpis .kpi-value").first
    as_is = first_tile.inner_text()
    page.click("[data-view=to_be]")
    assert first_tile.inner_text() != as_is
    assert page.locator(".kpi-delta.good").count() >= 5

    page.click("[data-view=compare]")
    assert "To-Be orders" in page.inner_text("#result-count")
    assert "view=compare" in page.url

    # Impossible combination: ED orders never come from a clinic.
    page.select_option("#f-source", "ED")
    page.select_option("#f-facility", "C01")
    assert page.inner_text("#result-count").startswith("0 ")
    assert page.locator(".empty-state:not([hidden])").count() == 6
    assert "NaN" not in page.inner_text("main")

    page.click("#reset")
    page.click(".chart-card .table-toggle >> nth=0")
    assert page.locator(".chart-table table").count() == 1
    assert not errors, errors
    page.close()
