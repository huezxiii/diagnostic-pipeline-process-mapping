"""Shared Playwright fixtures: one local static server and one browser per test session."""
import functools
import http.server
import threading
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session")
def base_url():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


@pytest.fixture(scope="session")
def browser():
    sync_api = pytest.importorskip("playwright.sync_api")
    with sync_api.sync_playwright() as p:
        try:
            b = p.chromium.launch()
        except Exception:
            b = p.chromium.launch(channel="chrome")
        yield b
        b.close()


@pytest.fixture
def open_page(browser, base_url):
    """open_page("index.html", width=1280) returns a loaded page; all pages close after the test."""
    pages = []

    def _open(name, width=1280):
        page = browser.new_page(viewport={"width": width, "height": 900})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{base_url}/{name}", wait_until="networkidle")
        page.wait_for_timeout(800)  # chart animation and Mermaid
        page.js_errors = errors
        pages.append(page)
        return page

    yield _open
    for page in pages:
        page.close()
