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


def test_hero_kpis_show_before_after_bars(open_page):
    page = open_page("index.html")
    tiles = page.locator("#hero-kpis .kpi")
    assert tiles.count() == 4
    for i in range(4):
        bars = tiles.nth(i).locator(".pair .pair-bar")
        assert bars.count() == 2
        assert "100%" in bars.evaluate_all("els => els.map(e => e.style.width)")


def test_value_stream_labels_waiting_share(open_page):
    page = open_page("index.html")
    assert page.inner_text('[data-vsm-waiting="as_is"]') == "Waiting: 96.2% (17.9 h)"
    assert page.inner_text('[data-vsm-work="as_is"]') == "Real work: 42 min (3.8%)"
    assert page.inner_text('[data-vsm-waiting="to_be"]') == "Waiting: 84.8% (3.9 h)"


def test_dashboard_kpis_pair_only_when_comparing(open_page):
    page = open_page("dashboard.html")
    assert page.locator("#kpis .pair").count() == 0
    page.click("[data-view=to_be]")
    assert page.locator("#kpis .pair").count() == 7
    assert page.locator("#kpis .kpi-was").first.inner_text().startswith("was ")


def test_every_fix_links_to_its_problem():
    html = read("index.html")
    fixes = dict(re.findall(r'<article class="card lever" id="([^"]+)">.*?<a class="fixes" href="#([^"]+)"', html, re.S))
    fixed_by = dict(re.findall(r'<article class="card bottleneck" id="([^"]+)">.*?<a class="fixed-by" href="#([^"]+)"', html, re.S))
    assert len(fixes) == 4 and len(fixed_by) == 4
    for lever, problem in fixes.items():
        assert fixed_by[problem] == lever, f"{lever} and {problem} do not point at each other"
    lever_order = re.findall(r'<article class="card lever" id="([^"]+)"', html)
    assert lever_order == ["l-sorters", "l-stat", "l-dispatch", "l-portal"]


def test_every_chart_explains_how_to_read_it(open_page):
    page = open_page("dashboard.html")
    cards = page.locator(".chart-card")
    assert cards.count() == 7
    for i in range(7):
        text = cards.nth(i).locator(".how-to-read").inner_text()
        assert text.startswith("How to read this:") and len(text.split()) >= 10, text


def test_charts_call_out_the_key_point(open_page):
    page = open_page("dashboard.html")
    assert page.evaluate("Chart.getChart('c-stages').options.plugins.callout.text") == "Biggest queue"
    assert page.inner_text("#stages-takeaway").startswith("Biggest queue: Central Accessioning")
    assert page.evaluate("Chart.getChart('c-priority').options.plugins.callout.text") == "Longest wait"
    assert "upside down" in page.inner_text("#priority-takeaway")
    assert "within 6 hours" in page.inner_text("#hist-takeaway")
    assert "capacity" in page.inner_text("#arrivals-takeaway")
    page.click("[data-view=to_be]")
    assert "upside down" not in page.inner_text("#priority-takeaway")


def test_takeaways_clear_when_no_orders_match(open_page):
    page = open_page("dashboard.html")
    page.select_option("#f-source", "ED")
    page.select_option("#f-facility", "C01")
    assert all(t.strip() == "" for t in page.locator(".chart-takeaway").all_inner_texts())
    assert "NaN" not in page.inner_text("main")
