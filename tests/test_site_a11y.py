"""Static WCAG 2.2 AA checks for site/ (stdlib only): contrast from the real CSS
tokens, no dead tab stops, status/alert roles, Esc handlers, pausable motion."""

import json
import re
from pathlib import Path

import pytest

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


PAGES = (("site.css", CSS), ("audit", AUDIT))


@pytest.mark.parametrize("name,text", PAGES)
def test_wcag_contrast_from_tokens(name, text):
    for theme, t in _themes(text).items():
        # worst-case surfaces: paper, and ink tints up to 10% (cards, bars)
        for bg in (t["paper"], _mix(t["ink"], t["paper"], 0.10)):
            for key in ("ink", "ink2", "reg"):
                assert ratio(t[key], bg) >= 4.5, (name, theme, key, bg)
        assert ratio(t["paper"], t["reg"]) >= 4.5, (name, theme, "paper on reg")
        for bg in (t["paper"], _mix(t["ink"], t["paper"], 0.10)):
            assert ratio(t["ui"], bg) >= 3.0, (name, theme, "ui", bg)  # 3:1 boundaries


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


@pytest.mark.parametrize("name,text", PAGES)
def test_text_contrast_over_caustic_canvas_worst_case(name, text):
    # the canvas is the page background: worst case is full-alpha caustic over paper
    for theme, sel in (("light", ":root"), ("dark", ":root[data-theme=dark]")):
        t = _themes(text)[theme]
        bg = _mix(t["fx"], t["paper"], _fxa(text, sel))
        for key in ("ink", "ink2", "reg"):
            assert ratio(t[key], bg) >= 4.5, (name, theme, key, bg)
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
    for text in (CSS, AUDIT):
        assert re.search(r"#fx\{[^}]*pointer-events:none", text)


def test_nav_is_floating_pill_with_visible_focus_and_skip_link():
    assert 'class="skip" href="#main"' in INDEX and 'id="main"' in INDEX
    assert re.search(r"\.nav\{[^}]*border-radius:999px", CSS)
    assert ":focus-visible{outline:2px solid" in CSS


def test_pause_button_label_is_fixed_and_state_is_aria_pressed():
    fx = (SITE / "fx.js").read_text(encoding="utf-8")
    assert "Play motion" not in fx and "textContent" not in fx
    for html in (INDEX, AUDIT):
        assert re.search(
            r'id="fxpause"[^>]*aria-pressed="false"[^>]*>Pause motion<', html
        )


def test_js_only_controls_are_hidden_until_js_runs():
    assert re.search(r'id="seg" hidden>', INDEX)
    for html in (INDEX, AUDIT):
        assert re.search(r'id="fxpause"[^>]*\bhidden\b', html)
    assert "btn.hidden = false" in (SITE / "fx.js").read_text(encoding="utf-8")
    assert "$('seg').hidden = false" in APP
    assert (
        re.search(r'id="gpause"[^>]*\bhidden\b', AUDIT)
        and "$('gpause').hidden=false" in AUDIT_JS
    )
    for text in (CSS, AUDIT):
        assert "[hidden]{display:none!important}" in text


def test_audit_is_readable_without_js():
    m = re.search(r"<noscript><style>([^<]*)</style></noscript>", AUDIT)
    assert m and "opacity:1" in m.group(1)  # .rise would otherwise stay at opacity 0
    assert re.search(r"<noscript>[^<]*<p[^>]*>.*audit\.json", AUDIT, re.S)


def test_keyboard_reachable_audit_controls_are_real_buttons_built_eagerly():
    assert "lazy(" not in AUDIT_JS  # a lazily built graph/gallery is skipped by Tab
    assert "el('button','fchip'" in AUDIT_JS and "b.type='button'" in AUDIT_JS
    assert not re.search(r"<div[^>]*id=\"chips\"[^>]*tabindex", AUDIT)


def test_scroll_padding_keeps_focus_clear_of_fixed_ui():
    for text in (CSS, AUDIT):
        assert "scroll-padding-top:84px;scroll-padding-bottom:180px" in text


def test_touch_targets_44px_on_coarse_pointer_and_small_screens():
    assert re.search(
        r"@media \(pointer:coarse\),\(max-width:767px\)\{[^}]*\.nav a[^}]*min-height:44px",
        CSS,
    )
    m = re.search(r"@media \(pointer:coarse\),\(max-width:767px\)\{(.*)\}\n", AUDIT)
    assert (
        m
        and ".fchip" in m.group(1)
        and ".f a" in m.group(1)
        and "min-height:44px" in m.group(1)
    )


def test_narrow_screens_do_not_overflow_or_clip():
    assert re.search(
        r"\.cmdbox code\{[^}]*white-space:pre-wrap;word-break:break-all", CSS
    )
    assert "hide-xs" in CSS and "hide-xs" in AUDIT and "hide-xs" in INDEX
    assert re.search(r"max-width:599px\)\{\.node text\{display:none", AUDIT)


def test_catalog_count_matches_data_and_native_router_are_marked():
    n = json.loads((SITE / "assets" / "skills.json").read_text(encoding="utf-8"))[
        "count"
    ]
    assert re.search(r'id="n38">%d<' % n, INDEX)
    assert 'li class="brk"' in INDEX and "'brk'" in APP
    assert ".pills .x button::before" in CSS


def test_first_catalog_draw_is_not_announced_and_nav_marks_last_link_at_bottom():
    assert "setAttribute('aria-live', 'off')" in APP
    assert "links[links.length - 1]" in APP


def test_audit_app_js_guards_missing_fields():
    assert APP.index("scoreTable(sc, tg, base, sha)") < APP.index("txt($('aps')")
    assert "isn(v)" in APP and "'n/a'" in APP


def test_canvas_resolution_is_adaptive_and_capped():
    fx = (SITE / "fx.js").read_text(encoding="utf-8")
    assert "innerWidth / 320" in fx and "MAXPX" in fx and "MutationObserver" in fx
    assert "requestAnimationFrame(() => { rs = 0" in fx
    assert "backdrop-filter" not in re.search(
        r"\.card,details,#gwrap\{[^}]*\}", AUDIT
    ).group(0)
