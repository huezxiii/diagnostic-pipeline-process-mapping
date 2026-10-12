"""Readability checks: the plain-language aids a non-technical reader relies on."""
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
CASE_SECTIONS = ["problem", "scope", "as-is", "bottlenecks", "value-stream", "to-be",
                 "levers", "roadmap", "impact", "roi", "conclusion"]


def read(name):
    return (ROOT / name).read_text(encoding="utf-8")


def plain(fragment):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", fragment)).strip()


def in_short_text(html, section_id):
    """Text of every .in-short paragraph in a section; asserts each directly follows the h2."""
    block = re.search(rf'<section[^>]*id="{section_id}"[^>]*>(.*?)</section>', html, re.S)
    assert block, f"no section #{section_id}"
    body = block.group(1)
    found = re.findall(r'</h2>\s*<p class="in-short">(.*?)</p>', body, re.S)
    assert len(found) == len(re.findall(r'class="in-short"', body)), f"#{section_id}: .in-short not right after h2"
    return [plain(f) for f in found]


@pytest.mark.parametrize("section", CASE_SECTIONS)
def test_case_study_sections_open_with_in_short(section):
    lines = in_short_text(read("index.html"), section)
    assert len(lines) == 1, f"#{section} needs exactly one In short line"
    words = len(lines[0].split())
    assert 5 <= words <= 25, f"#{section}: {words} words"


def test_hero_states_the_outcome_plainly():
    h1 = plain(re.search(r"<h1>(.*?)</h1>", read("index.html"), re.S).group(1))
    assert h1 == "Lab results took 18.6 hours. The fix got them to 4.6 hours without buying new machines."


@pytest.mark.parametrize("name", ["index.html", "dashboard.html", "methods.html"])
def test_prose_has_no_dashes_or_arrow_connectors(name):
    html = read(name)
    html = re.sub(r'<pre.*?</pre>', "", html, flags=re.S)       # Mermaid and code
    html = re.sub(r'<td class="num"[^>]*>.*?</td>', "", html)    # data cells and placeholders
    text = plain(re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html, flags=re.S))
    assert "—" not in text and "–" not in text, f"{name}: dash in prose"
    assert " → " not in text, f"{name}: arrow used as a connector"


def test_hero_figure_is_bound_to_metrics(open_page):
    page = open_page("index.html")
    assert page.inner_text(".hero-figure .from s") == "18.6 h"
    assert page.inner_text(".hero-figure .to [data-metric]") == "4.6 h"
    assert page.inner_text("h1") == "Lab results took 18.6 hours. The fix got them to 4.6 hours without buying new machines."
    assert not page.js_errors


PAGES = ["index.html", "dashboard.html", "methods.html"]
TERMS = ["tat", "pce", "stat", "priority-inversion", "sipoc", "accessioning", "value-stream", "swimlane", "rekey"]


@pytest.mark.parametrize("name", PAGES)
def test_jargon_has_definitions(open_page, name):
    page = open_page(name)
    terms = page.locator("dfn[data-term]")
    assert terms.count() >= 2, f"{name}: no defined terms"
    defs = terms.evaluate_all("els => els.map(e => e.dataset.def || '')")
    assert all(len(d.split()) >= 5 for d in defs), defs
    assert not page.js_errors


def test_index_defines_every_term():
    keys = re.findall(r'<dfn data-term="([^"]+)"', read("index.html"))
    assert sorted(set(keys)) == sorted(TERMS)


def test_definition_shows_on_keyboard_focus(open_page):
    page = open_page("index.html")
    first = page.locator("dfn[data-term]").first
    first.focus()
    tip = page.locator("#dfn-tip")
    assert tip.is_visible()
    assert first.get_attribute("data-def") in tip.inner_text()
    page.keyboard.press("Escape")
    assert not tip.is_visible()


@pytest.mark.parametrize("name", PAGES)
def test_open_definition_never_scrolls_sideways(open_page, name):
    page = open_page(name, width=375)
    last = page.locator("dfn[data-term]").last
    last.scroll_into_view_if_needed()
    last.click()
    assert page.locator("#dfn-tip").is_visible()
    assert page.evaluate("document.documentElement.scrollWidth - window.innerWidth") <= 0


def test_glossary_lists_every_term(open_page):
    page = open_page("index.html")
    rows = page.locator("#glossary-list > div")
    assert rows.count() == len(TERMS)
    for i in range(rows.count()):
        assert rows.nth(i).locator("dt").inner_text().strip()
        assert len(rows.nth(i).locator("dd").inner_text().split()) >= 5


def test_progress_rail_tracks_the_story(open_page):
    page = open_page("index.html")
    texts = [re.sub(r"\s+", "", t) for t in page.locator(".progress-rail a[data-stage]").all_inner_texts()]
    assert texts == ["1Problem", "2Cause", "3Fix", "4Result"]
    page.evaluate("document.getElementById('levers').scrollIntoView({block: 'start'})")
    page.wait_for_timeout(300)
    assert page.locator('.progress-rail [aria-current="step"]').get_attribute("data-stage") == "fix"
    assert page.locator(".progress-rail a.done").count() == 2
    assert page.locator(".progress-rail").is_visible()  # sticky header keeps it on screen
