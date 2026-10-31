import importlib.util
from pathlib import Path

_p = Path(__file__).resolve().parent.parent / "site" / "scripts" / "check_site.py"
_s = importlib.util.spec_from_file_location("check_site", _p)
m = importlib.util.module_from_spec(_s)
_s.loader.exec_module(m)


def test_site_security():
    assert m.check() == []


def test_sink_regex_catches_dynamic():
    assert m.SINK.search("el.innerHTML = x;")
    assert m.SINK.search("eval(x)")
    assert not m.SINK.search("el.innerHTML = '';")


def _csp(page):
    p = m.P()
    p.feed(page.read_text(encoding="utf-8"))
    return p.csp


def test_csp_has_no_third_party_host():
    for page in m.PAGES:
        csp = _csp(page)
        assert "http" not in csp and "//" not in csp, page
        assert "font-src 'self'" in csp


def test_fonts_self_hosted_with_license_and_preload():
    fonts = m.SITE / "assets" / "fonts"
    assert len(list(fonts.glob("*.woff2"))) == 3
    assert list(fonts.glob("OFL-*.txt"))
    for page in m.PAGES:
        html = page.read_text(encoding="utf-8")
        assert 'rel="preload"' in html and "woff2" in html
        assert "font-display:swap" in html or "font-display:swap" in (
            m.SITE / "site.css"
        ).read_text(encoding="utf-8")
        assert "googleapis" not in html


def test_check_fonts_flags_remote_url(tmp_path):
    page = m.SITE / "index.html"
    errs = m.check_fonts(page, "@font-face{src:url(https://x.test/a.woff2)}")
    assert any("remote font url" in e for e in errs)
