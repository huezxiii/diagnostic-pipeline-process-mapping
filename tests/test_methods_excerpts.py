"""Code excerpts on methods.html must be verbatim slices of the real source files."""
import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def norm(text):
    return re.sub(r"\s+", " ", text).strip()


def test_excerpts_match_sources():
    page = (ROOT / "methods.html").read_text(encoding="utf-8")
    excerpts = re.findall(r'<pre[^>]*data-source="([^"]+)"[^>]*><code[^>]*>(.*?)</code></pre>', page, re.S)
    assert len(excerpts) >= 2
    for source, code in excerpts:
        snippet = norm(html.unescape(code))
        assert snippet, source
        assert snippet in norm((ROOT / source).read_text(encoding="utf-8")), f"excerpt drifted from {source}"


def test_download_links_exist():
    page = (ROOT / "methods.html").read_text(encoding="utf-8")
    for href in re.findall(r'<a[^>]+href="([^"#:]+)"[^>]*download', page):
        assert (ROOT / href).exists(), href
