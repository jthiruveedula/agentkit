import runpy

from prompt_analytics.privacy import Redactor


def test_detector_selfcheck():
    runpy.run_module("prompt_analytics.sensitive", run_name="__main__")


def test_ssn_and_card_redacted_before_persist():
    r = Redactor()
    out = r.redact("ssn 123-45-6789 card 4111 1111 1111 1111")
    assert "6789" not in out and "4111" not in out
    assert r.redact(out) == out
