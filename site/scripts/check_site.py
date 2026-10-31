#!/usr/bin/env python3
"""Static security lint for site/ (stdlib). Exit 1 with messages on any violation."""

import base64
import hashlib
import json
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


# Local css/js refs carry ?v=<content hash> so a returning visitor never pairs
# fresh HTML with a cached stale stylesheet (Pages serves max-age=600).
ASSET_RE = re.compile(
    r'((?:href|src)=")((?:\.\./)?[\w./-]+\.(?:css|js))(?:\?v=\w+)?(")'
)


def stamp(page, src):
    def one(m):
        h = hashlib.sha256((page.parent / m.group(2)).read_bytes()).hexdigest()[:10]
        return f"{m.group(1)}{m.group(2)}?v={h}{m.group(3)}"

    return ASSET_RE.sub(one, src)


class P(HTMLParser):
    def __init__(self):
        super().__init__()
        self.csp = None
        self.inline = []
        self.errs = []
        self._in = False
        self._ld = False
        self.ld = []
        self._buf = ""

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if (
            tag == "meta"
            and (a.get("http-equiv") or "").lower() == "content-security-policy"
        ):
            self.csp = a.get("content", "")
        if tag == "script":
            if a.get("type") == "application/ld+json":
                self._ld = True  # data block: never executed, so outside script-src
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
            (self.ld if self._ld else self.inline).append(self._buf)
            self._ld = False


def check_fonts(page, src):
    """Every @font-face url() must be a local file; fonts ship with their OFL text."""
    errs = []
    srcs = [(src, page.parent)]
    if page.parent == SITE:
        srcs.append(((SITE / "site.css").read_text(encoding="utf-8"), SITE))
    urls = [
        (u.strip("\"'"), base)
        for text, base in srcs
        for u in re.findall(r"@font-face[^}]*?url\(([^)]+)\)", text)
    ]
    if not urls:
        errs.append("no self-hosted @font-face")
    for u, base in urls:
        if re.match(r"[a-z]+:|//", u):
            errs.append(f"remote font url: {u}")
        elif not (base / u).resolve().is_file():
            errs.append(f"font file missing: {u}")
    if not list((SITE / "assets" / "fonts").glob("OFL-*.txt")):
        errs.append("fonts lack OFL license text")
    return errs


SEO = ("og:title", "og:description", "og:url", "twitter:card", "twitter:title")


def check_seo(src):
    """Canonical + og:* + twitter:* present; robots.txt and sitemap.xml ship."""
    errs = []
    if not re.search(r'<link rel="canonical" href="https://[^"]+">', src):
        errs.append("missing canonical link")
    for k in SEO:
        if not re.search(r'<meta (?:property|name)="%s" content="[^"]+"' % k, src):
            errs.append(f"missing meta {k}")
    return errs


def check_seo_files():
    errs = [
        f"missing {n}"
        for n in ("robots.txt", "sitemap.xml")
        if not (SITE / n).is_file()
    ]
    if not errs and "sitemap.xml" not in (SITE / "robots.txt").read_text(
        encoding="utf-8"
    ):
        errs.append("robots.txt does not reference sitemap.xml")
    return errs


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
        for body in p.ld:
            try:
                json.loads(body)
            except ValueError:
                errs.append(f"{rel}: JSON-LD is not valid JSON")
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
        if re.search(r"https?:|//", p.csp):
            errs.append(f"{rel}: CSP names a third-party host")
        if stamp(page, src) != src:
            errs.append(f"{rel}: stale asset ?v= hash; run check_site.py --fix")
        errs += [f"{rel}: {e}" for e in check_fonts(page, src)]
        errs += [f"{rel}: {e}" for e in check_seo(src)]
    for js in SITE.rglob("*.js"):
        for n, line in enumerate(js.read_text(encoding="utf-8").splitlines(), 1):
            if SINK.search(line):
                errs.append(
                    f"{js.relative_to(SITE)}:{n}: unsafe DOM sink: {line.strip()[:80]}"
                )
    return errs


if __name__ == "__main__":
    if "--fix" in sys.argv:
        for pg in PAGES:
            pg.write_text(stamp(pg, pg.read_text(encoding="utf-8")), encoding="utf-8")
    e = check()
    print("\n".join(e) if e else "site security check: ok")
    sys.exit(1 if e else 0)
