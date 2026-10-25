#!/usr/bin/env python3
"""Report (and optionally bump) upstream updates for external/skills.lock.json.

Read-only by default. Queries only https://api.github.com. Never executes or
extracts anything it downloads. --bump rewrites the lock's sha (and sha256 when
the entry already had one) for sources that are behind, not archived, and whose
license is unchanged; everything else is flagged, never bumped.

Usage: scripts/check-external-updates.py [--json] [--out FILE] [--bump] [--strict]
Optional GITHUB_TOKEN env raises the API rate limit (sent as header only).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = "https://api.github.com"
REPO_RE = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\Z")
SHA_RE = re.compile(r"[0-9a-f]{40}\Z")
REF_RE = re.compile(r"[A-Za-z0-9_./-]{1,200}\Z")
MAX_TARBALL = 200 * 1024 * 1024
PIN_RE = re.compile(r"(?<![\w.-])((?:@[\w.-]+/)?[A-Za-z0-9][\w.-]*)@(\d+\.\d+\.\d+)\b")


class FetchError(Exception):
    def __init__(self, kind: str):
        super().__init__(kind)
        self.kind = kind


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):  # never forward the token elsewhere
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def fetch(url: str, token: str | None = None) -> dict:
    """GET a GitHub API URL, return parsed JSON. Raises FetchError(kind)."""
    if not url.startswith(API + "/"):
        raise FetchError("bad_url")
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "agentkit-update-check",
    }
    if token:
        headers["Authorization"] = "Bearer " + token
    last = "network"
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=headers)
            with _OPENER.open(req, timeout=10) as r:  # noqa: S310 (https only, checked above)
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 or (
                e.code == 403 and e.headers.get("X-RateLimit-Remaining") == "0"
            ):
                raise FetchError("rate_limited") from None
            if e.code in (404, 403, 401, 422):
                raise FetchError("http_%d" % e.code) from None
            last = "http_%d" % e.code
        except (urllib.error.URLError, TimeoutError, OSError, ValueError):
            last = "network"
        time.sleep(2**attempt)
    raise FetchError(last)


def check_source(src: dict, get=None) -> dict:
    get = get or fetch
    row = {
        "name": src.get("name"),
        "repo": src.get("repo"),
        "pinned": src.get("sha"),
        "latest": None,
        "behind_by": None,
        "archived": None,
        "license": None,
        "license_changed": None,
        "compare_url": None,
        "error": None,
    }
    repo, sha = str(src.get("repo", "")), str(src.get("sha", ""))
    if not REPO_RE.match(repo) or not SHA_RE.match(sha):
        row["error"] = "invalid_input"
        return row
    try:
        meta = get("%s/repos/%s" % (API, repo))
        branch = str(meta.get("default_branch", ""))
        if not REF_RE.match(branch):
            row["error"] = "invalid_branch"
            return row
        row["archived"] = bool(meta.get("archived"))
        row["license"] = (meta.get("license") or {}).get("spdx_id") or "NOASSERTION"
        row["license_changed"] = row["license"] != src.get("license")
        cmp_ = get(
            "%s/repos/%s/compare/%s...%s"
            % (API, repo, sha, urllib.parse.quote(branch, safe="/"))
        )
        row["behind_by"] = int(cmp_.get("ahead_by", 0))
        commits = cmp_.get("commits") or []
        latest = (
            commits[-1].get("sha")
            if commits and row["behind_by"] == len(commits)
            else None
        )
        if row["behind_by"] and not latest:
            latest = get(
                "%s/repos/%s/commits/%s"
                % (API, repo, urllib.parse.quote(branch, safe="/"))
            ).get("sha")
        row["latest"] = latest if row["behind_by"] else sha
        if not SHA_RE.match(str(row["latest"])):
            row["error"] = "invalid_latest_sha"
            row["latest"] = None
        url = str(cmp_.get("html_url", ""))
        row["compare_url"] = url if url.startswith("https://github.com/") else None
    except FetchError as e:
        row["error"] = e.kind
    return row


def tarball_sha256(repo: str, sha: str) -> str:
    if not REPO_RE.match(repo) or not SHA_RE.match(sha):
        raise ValueError("invalid repo/sha")
    h, n = hashlib.sha256(), 0
    req = urllib.request.Request(
        "https://codeload.github.com/%s/tar.gz/%s" % (repo, sha),
        headers={"User-Agent": "agentkit-update-check"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:  # noqa: S310
        while chunk := r.read(1 << 16):
            n += len(chunk)
            if n > MAX_TARBALL:
                raise ValueError("tarball exceeds size cap")
            h.update(chunk)
    return h.hexdigest()


def eligible(row: dict) -> bool:
    return (
        bool(row["behind_by"])
        and not row["error"]
        and row["archived"] is False
        and row["license_changed"] is False
        and bool(row["latest"])
    )


def bump(
    lock_path: Path, rows: list[dict], sources: list[dict], sha256_fn=tarball_sha256
) -> list[str]:
    """Text-level rewrite (preserves formatting). Returns bumped names."""
    text = lock_path.read_text(encoding="utf-8")
    done = []
    by_name = {s["name"]: s for s in sources}
    for row in rows:
        if not eligible(row):
            continue
        src = by_name[row["name"]]
        if text.count('"%s"' % src["sha"]) != 1:  # ambiguous: don't guess
            row["error"] = "pin_not_unique"
            continue
        new_text = text.replace('"%s"' % src["sha"], '"%s"' % row["latest"], 1)
        if src.get("sha256"):
            try:
                new = sha256_fn(row["repo"], row["latest"])
            except (OSError, ValueError) as e:
                row["error"] = "sha256_failed: %s" % e
                continue
            new_text = new_text.replace('"%s"' % src["sha256"], '"%s"' % new, 1)
        text = new_text
        row["bumped"] = True
        done.append(row["name"])
    if done:
        json.loads(text)  # must still parse
        fd, tmp = tempfile.mkstemp(dir=str(lock_path.parent), prefix=".lock-")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, lock_path)
    return done


def manual_pins(root: Path) -> list[dict]:
    """Read-only list of non-lock pins that need a human to check."""
    out = []
    for f in ("install.sh", "install.ps1"):
        p = root / f
        if p.is_file():
            for i, line in enumerate(
                p.read_text(encoding="utf-8", errors="replace").splitlines(), 1
            ):
                if re.match(r"\s*\$?BOOST_INSTALL_SH_SHA256\s*=", line):
                    out.append(
                        {"where": "%s:%d" % (f, i), "pin": "boost installer sha256"}
                    )
    for p in sorted(root.glob("skills/*/SKILL.md")):
        for i, line in enumerate(
            p.read_text(encoding="utf-8", errors="replace").splitlines(), 1
        ):
            for m in PIN_RE.finditer(line):
                out.append(
                    {
                        "where": "%s:%d" % (p.relative_to(root), i),
                        "pin": "%s@%s" % m.groups(),
                    }
                )
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--out", help="also write JSON report to FILE")
    ap.add_argument("--bump", action="store_true")
    ap.add_argument("--strict", action="store_true", help="exit 1 on errors/rate limit")
    ap.add_argument("--lock", default=str(ROOT / "external" / "skills.lock.json"))
    a = ap.parse_args(argv)
    lock_path = Path(a.lock)
    sources = json.loads(lock_path.read_text(encoding="utf-8"))["sources"]
    token = os.environ.get("GITHUB_TOKEN") or None
    rows = [check_source(s, lambda u: fetch(u, token)) for s in sources]
    if a.bump:
        bump(lock_path, rows, sources)
    report = {"sources": rows, "manual_check": manual_pins(lock_path.parents[1])}
    if a.out:
        Path(a.out).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    if a.json:
        print(json.dumps(report, indent=2))
    else:
        print(
            "%-26s %-8s %-8s %-9s %s"
            % ("name", "behind", "archived", "license", "note")
        )
        for r in rows:
            note = r["error"] or (
                "BUMPED"
                if r.get("bumped")
                else "FLAG: archived/license changed"
                if r["behind_by"] and not eligible(r)
                else ""
            )
            print(
                "%-26s %-8s %-8s %-9s %s"
                % (r["name"], r["behind_by"], r["archived"], r["license"], note)
            )
        for m in report["manual_check"]:
            print("manual-check  %-40s %s" % (m["where"], m["pin"]))
    bad = any(r["error"] for r in rows)
    return 1 if (a.strict and bad) else 0


if __name__ == "__main__":
    sys.exit(main())
