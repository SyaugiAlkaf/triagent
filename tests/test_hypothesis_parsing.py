from __future__ import annotations

from app.agent import parse_hypotheses


def test_parse_two_hypotheses_sorted_descending():
    text = (
        "Hypothesis 1 (confidence 0.86): DATABASE_URL env var missing.\n\n"
        "Hypothesis 2 (confidence 0.18): nginx image bad.\n\n"
        "Top hypothesis: env_var_missing"
    )
    out = parse_hypotheses(text)
    assert len(out) == 2
    assert out[0]["confidence"] == 0.86
    assert out[1]["confidence"] == 0.18
    assert out[0]["index"] == 1
    assert "DATABASE_URL" in out[0]["label"]


def test_parse_returns_empty_for_blank_input():
    assert parse_hypotheses("") == []
    assert parse_hypotheses("just a paragraph with no hypothesis tag") == []


def test_parse_skips_chunks_without_confidence():
    text = (
        "Hypothesis 1: no confidence on this one.\n\n"
        "Hypothesis 2 (confidence 0.55): valid hypothesis.\n"
    )
    out = parse_hypotheses(text)
    assert len(out) == 1
    assert out[0]["index"] == 2
    assert out[0]["confidence"] == 0.55
