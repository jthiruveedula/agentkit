"""Static WCAG 2.2 AA checks for site/ (stdlib only): contrast from the real CSS
tokens, no dead tab stops, status/alert roles, Esc handlers, pausable motion."""

import re
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "site"
INDEX = (SITE / "index.html").read_text(encoding="utf-8")
AUDIT = (SITE / "audit" / "index.html").read_text(encoding="utf-8")
CSS = (SITE / "site.css").read_text(encoding="utf-8")
APP = (SITE / "app.js").read_text(encoding="utf-8")
AUDIT_JS = (SITE / "audit" / "audit.js").read_text(encoding="utf-8")


def _lum(h):
    c = [int(h[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def _hex(rgb):
    return "#%02X%02X%02X" % tuple(round(v) for v in rgb)


def _mix(ink, paper, p):
    a = [int(ink[i : i + 2], 16) for i in (1, 3, 5)]
    b = [int(paper[i : i + 2], 16) for i in (1, 3, 5)]
    return _hex([x * p + y * (1 - p) for x, y in zip(a, b)])


def ratio(a, b):
    hi, lo = sorted([_lum(a), _lum(b)], reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def _tokens(text, selector):
    block = re.search(re.escape(selector) + r"\{([^}]*)\}", text).group(1)
    return dict(re.findall(r"--([a-z0-9]+):(#[0-9A-Fa-f]{6})", block))


def _themes(text):
    return {
        "light": _tokens(text, ":root"),
        "dark": _tokens(text, ":root[data-theme=dark]"),
    }


def test_wcag_contrast_from_tokens():
    for name, text in (("site.css", CSS), ("audit", AUDIT)):
        for theme, t in _themes(text).items():
            # worst-case surfaces: paper, and ink tints up to 10% (cards, bars)
            for bg in (t["paper"], _mix(t["ink"], t["paper"], 0.10)):
                for key in ("ink", "ink2", "reg"):
                    assert ratio(t[key], bg) >= 4.5, (name, theme, key, bg)
            assert ratio(t["paper"], t["reg"]) >= 4.5, (name, theme, "paper on reg")
            if "ui" in t:  # UI component boundaries need 3:1
                for bg in (t["paper"], _mix(t["ink"], t["paper"], 0.10)):
                    assert ratio(t["ui"], bg) >= 3.0, (name, theme, "ui", bg)


def test_audit_defines_ui_token_in_both_themes():
    for t in _themes(AUDIT).values():
        assert "ui" in t


def test_no_dead_tab_stops_or_positive_tabindex():
    for html in (INDEX, AUDIT):
        assert not re.search(r"tabindex=[\"']?[1-9]", html, re.I)
    for js in (APP, AUDIT_JS):
        assert not re.search(r"\.tabIndex\s*=", js)


def test_filter_count_and_notice_are_status_regions():
    assert re.search(r'id="count"[^>]*role="status"[^>]*aria-live="polite"', AUDIT)
    assert re.search(r'id="notice" role="status"', AUDIT)
    assert 'id="status" class="vh" role="status"' in INDEX
    assert "'Showing '" in AUDIT_JS


def test_failed_fetches_have_alert_with_retry():
    for i in ("skerr", "auerr"):
        assert re.search(r'id="%s" role="alert" hidden>[^<]*<button' % i, INDEX)
    assert "fail('skerr', loadSkills)" in APP and "fail('auerr', loadAudit)" in APP
    assert 'id="retry"' in AUDIT and "location.reload" in AUDIT_JS


def test_escape_dismisses_overlays():
    assert "e.key === 'Escape' && hide()" in APP
    assert "e.key==='Escape'" in AUDIT_JS


def test_pulse_is_pausable_and_reduced_motion_stops_it():
    assert re.search(r"body\.paused \.pulse\{animation-play-state:paused", AUDIT)
    assert "prefers-reduced-motion:reduce" in AUDIT
    assert "$('gpause')" in AUDIT_JS and 'id="gpause"' in AUDIT


def test_hidden_score_tables_exist():
    assert 'id="scoretbl" class="vh"' in AUDIT and "function scoreTable" in AUDIT_JS
    assert "function scoreTable" in APP and 'id="rows" aria-hidden="true"' in INDEX


def _fxa(text, selector):
    block = re.search(re.escape(selector) + r"\{([^}]*)\}", text).group(1)
    return float(re.search(r"--fxa:(\.?\d*\.?\d+)", block).group(1))


def test_text_contrast_over_caustic_canvas_worst_case():
    # the canvas is the page background: worst case is full-alpha caustic over paper
    for theme, sel in (("light", ":root"), ("dark", ":root[data-theme=dark]")):
        t = _themes(CSS)[theme]
        bg = _mix(t["fx"], t["paper"], _fxa(CSS, sel))
        for key in ("ink", "ink2", "reg", "muted"):
            assert ratio(t[key], bg) >= 4.5, (theme, key, bg)
        assert ratio(t["paper"], t["reg"]) >= 4.5  # primary pill text
        assert ratio(t["ui"], bg) >= 3.0  # outlined pill border


def test_canvas_background_is_decorative_pausable_and_reduced_motion_safe():
    fx = (SITE / "fx.js").read_text(encoding="utf-8")
    assert "prefers-reduced-motion: reduce" in fx
    assert "fxpause" in fx and "aria-pressed" in fx
    assert "document.hidden" in fx
    for html in (INDEX, AUDIT):
        assert re.search(r'<canvas id="fx" aria-hidden="true"', html)
        assert 'id="fxpause"' in html and "fx.js" in html
    assert "pointer-events:none" in CSS


def test_nav_is_floating_pill_with_visible_focus_and_skip_link():
    assert 'class="skip" href="#main"' in INDEX and 'id="main"' in INDEX
    assert re.search(r"\.nav\{[^}]*border-radius:999px", CSS)
    assert ":focus-visible{outline:2px solid" in CSS
