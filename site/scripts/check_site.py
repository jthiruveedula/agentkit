#!/usr/bin/env python3
"""Static security lint for site/ (stdlib). Exit 1 with messages on any violation."""

import base64
import hashlib
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
PAGES = [SITE / "index.html", SITE / "audit" / "index.html"]
# innerHTML-family write whose RHS is not a plain string literal
SINK = re.compile(
    r"(?:\.(?:innerHTML|outerHTML)\s*(?:\+)?=(?!=)\s*(?!\s)(?![\"'`][^`\"'$+]*[\"'`]\s*[;,)\n])|insertAdjacentHTML\s*\(|document\.write(?:ln)?\s*\(|\beval\s*\(|new\s+Function\s*\(|set(?:Timeout|Interval)\s*\(\s*[\"'`])"
)


class P(HTMLParser):
    def __init__(self):
        super().__init__()
        self.csp = None
        self.inline = []
        self.errs = []
        self._in = False
        self._buf = ""

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if (
            tag == "meta"
            and (a.get("http-equiv") or "").lower() == "content-security-policy"
        ):
            self.csp = a.get("content", "")
        if tag == "script":
            if "src" not in a:
                self._in = True
                self._buf = ""
        if a.get("target") == "_blank" and "noopener" not in (a.get("rel") or ""):
            self.errs.append(f"target=_blank without noopener: {a.get('href')}")
        if tag == "img" and "alt" not in a:
            self.errs.append(f"<img> without alt: {a.get('src')}")
        for k in ("src", "href"):
            v = a.get(k) or ""
            if v.startswith("http://"):
                self.errs.append(f"http:// URL: {v}")

    def handle_data(self, d):
        if self._in:
            self._buf += d

    def handle_endtag(self, tag):
        if tag == "script" and self._in:
            self._in = False
            self.inline.append(self._buf)


def check():
    errs = []
    for page in PAGES:
        rel = page.relative_to(SITE)
        p = P()
        src = page.read_text(encoding="utf-8")
        p.feed(src)
        errs += [f"{rel}: {e}" for e in p.errs]
        if not p.csp:
            errs.append(f"{rel}: missing CSP meta")
            continue
        if "'unsafe-eval'" in p.csp:
            errs.append(f"{rel}: CSP has unsafe-eval")
        m = re.search(r"script-src([^;]*)", p.csp)
        ss = m.group(1) if m else ""
        for body in p.inline:
            h = (
                "'sha256-"
                + base64.b64encode(hashlib.sha256(body.encode()).digest()).decode()
                + "'"
            )
            if h not in ss:
                errs.append(f"{rel}: inline script hash not in script-src")
            if SINK.search(body):
                errs.append(f"{rel}: unsafe DOM sink in inline script")
        for must in ("base-uri 'none'", "object-src 'none'", "default-src 'none'"):
            if must not in p.csp:
                errs.append(f"{rel}: CSP lacks {must}")
    for js in SITE.rglob("*.js"):
        for n, line in enumerate(js.read_text(encoding="utf-8").splitlines(), 1):
            if SINK.search(line):
                errs.append(
                    f"{js.relative_to(SITE)}:{n}: unsafe DOM sink: {line.strip()[:80]}"
                )
    return errs


if __name__ == "__main__":
    e = check()
    print("\n".join(e) if e else "site security check: ok")
    sys.exit(1 if e else 0)
