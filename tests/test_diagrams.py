"""Swimlane sources: step counts match the spec and index.html embeds the .mmd files verbatim."""
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def norm(text):
    return re.sub(r"\s+", " ", text).strip()


def steps(text):
    # Labels use "N · step" because Mermaid reads "N. step" as an unsupported markdown list.
    return sorted({int(n) for n in re.findall(r'\["(\d+) · ', text)})


@pytest.mark.parametrize("name,count,lanes", [("as_is", 18, 5), ("to_be", 12, 5)])
def test_step_and_lane_counts(name, count, lanes):
    text = (ROOT / "diagrams" / f"{name}.mmd").read_text(encoding="utf-8")
    assert steps(text) == list(range(1, count + 1))
    assert len(re.findall(r"^\s*subgraph ", text, re.M)) == lanes


@pytest.mark.parametrize("name,element_id", [("as_is", "as-is-map"), ("to_be", "to-be-map")])
def test_index_embeds_diagram(name, element_id):
    source = norm((ROOT / "diagrams" / f"{name}.mmd").read_text(encoding="utf-8"))
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    block = re.search(rf'id="{element_id}".*?<pre class="mermaid"[^>]*>(.*?)</pre>', html, re.S)
    assert block, f"no mermaid block inside #{element_id}"
    embedded = norm(block.group(1).replace("&gt;", ">").replace("&lt;", "<").replace("&amp;", "&"))
    assert embedded == source
