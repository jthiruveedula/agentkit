"""Exposure scan: what sensitive data did the user paste into an assistant?

Runs on RAW user-turn text inside ``scan`` before redaction, and stores only
counts per (session, turn, kind) in ``exposures``; matched values never
persist. Categories:

- ``secret``: credentials (reuses the Redactor's secret rules).
- ``pii``: email, phone, SSN, payment card (Luhn), IBAN, DOB, passport/licence.
- ``phi``: medical identifiers (MRN, NPI, health-plan id) or a health term in
  the same prompt as a personal identifier (HIPAA's "health info + identifier").

Configure with ``[sensitive]`` in config.toml: ``enabled = false`` or
``disabled = ["phone", ...]``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from .privacy import _PLACEHOLDER, Redactor, luhn

SECRET_KINDS = ("pem", "aws", "github", "anthropic", "openai", "google", "slack", "stripe", "jwt", "bearer", "urlcred", "assign")

_PII: dict[str, re.Pattern[str]] = {
    "email": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
    "ssn": re.compile(r"\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b"),
    "card": re.compile(r"(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])"),
    "phone": re.compile(r"(?<![\w.])\+?\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]\d{3,4}[\s.-]\d{3,4}(?![\w.])"),
    "iban": re.compile(r"\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,3})?\b"),
    "dob": re.compile(r"(?i)\b(?:dob|d\.o\.b\.?|date of birth|birth ?date|born on)\b\s*[:=-]?\s*\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}"),
    "gov_id": re.compile(r"(?i)\b(?:passport|driver'?s? licen[cs]e|licen[cs]e no\.?|national id|aadhaar|pan card)\s*(?:no\.?|number|#)?\s*[:=-]?\s*[A-Z0-9][A-Z0-9 -]{5,}"),
}
_PHI_ID: dict[str, re.Pattern[str]] = {
    "mrn": re.compile(r"(?i)\b(?:mrn|medical record (?:number|no\.?|#)|patient id)\s*[:#=-]?\s*[A-Z0-9-]{5,}"),
    "npi": re.compile(r"(?i)\bnpi\s*[:#=-]?\s*\d{10}\b"),
    "health_plan": re.compile(r"(?i)\b(?:member id|subscriber id|policy (?:no\.?|number)|insurance id|medicare|medicaid)\s*[:#=-]?\s*[A-Z0-9-]{6,}"),
}
_HEALTH = re.compile(
    r"(?i)\b(?:diagnos(?:is|ed|es)|prescri(?:bed|ption)|patient|symptoms?|icd-?10|hiv|cancer|diabetes|"
    r"depression|pregnan(?:t|cy)|blood (?:pressure|test)|lab results?|medication|dosage|allerg(?:y|ies)|"
    r"therapy|psychiatr\w*|chemotherapy|discharge summary|clinical notes?)\b"
)
# Identifiers that turn a health mention into PHI.
_PHI_LINK = ("email", "phone", "ssn", "dob", "gov_id")

CATEGORY = {**{k: "secret" for k in SECRET_KINDS}, **{k: "pii" for k in _PII}, **{k: "phi" for k in _PHI_ID}, "phi_context": "phi"}

ADVICE = {
    "secret": "Never paste credentials; reference env var names or a secrets manager instead.",
    "pii": "Swap real personal data for fake fixtures (faker, example.com, 555-01xx).",
    "phi": "Do not paste patient data; use de-identified or synthetic records.",
}


def _real(kind: str, value: str) -> bool:
    if _PLACEHOLDER.search(value):
        return False
    if kind == "card":
        d = re.sub(r"\D", "", value)
        return luhn(d)
    if kind == "iban":
        return any(c.isalpha() for c in value[4:]) or len(value.replace(" ", "")) >= 18
    if kind == "email":
        return not re.search(r"(?i)@(?:example\.(?:com|org|net)|test\.com|localhost)\b|noreply|no-reply", value)
    return True


@dataclass(frozen=True)
class Exposure:
    kind: str
    category: str
    count: int


@dataclass(frozen=True)
class Hit:
    kind: str
    category: str
    start: int
    end: int


class Detector:
    def __init__(self, cfg: dict[str, Any] | None = None, redactor: Redactor | None = None):
        cfg = cfg or {}
        self.enabled = bool(cfg.get("enabled", True))
        off = set(cfg.get("disabled") or [])
        self.redactor = redactor or Redactor()
        self.secret_rules = [r for r in self.redactor.rules if r.kind in SECRET_KINDS and r.kind not in off]
        self.pii = {k: rx for k, rx in _PII.items() if k not in off}
        self.phi = {k: rx for k, rx in _PHI_ID.items() if k not in off}
        self.phi_context = "phi_context" not in off

    def find(self, text: str | None) -> list[Hit]:
        """Every finding with its span in ``text`` (phi_context has an empty span)."""
        if not self.enabled or not text:
            return []
        hits: list[Hit] = []
        for r in self.secret_rules:
            hits += [Hit(r.kind, "secret", *m.span(r.group)) for m in r.rx.finditer(text) if _real(r.kind, m.group(r.group))]
        # Card/SSN first, then blank them so phone doesn't re-count the same digits.
        masked = text
        for k, rx in {**self.pii, **self.phi}.items():
            hits += [Hit(k, CATEGORY[k], *m.span()) for m in rx.finditer(masked) if _real(k, m.group(0))]
            if k in ("card", "ssn"):  # long digit runs are never phones, valid or not
                masked = rx.sub(lambda m: " " * len(m.group(0)), masked)
        if self.phi_context and {h.kind for h in hits} & set(_PHI_LINK) and _HEALTH.search(text):
            hits.append(Hit("phi_context", "phi", 0, 0))
        return hits

    def scan(self, text: str | None) -> list[Exposure]:
        """Kinds found in one prompt with match counts. Values are discarded."""
        counts: dict[str, int] = {}
        for h in self.find(text):
            counts[h.kind] = counts.get(h.kind, 0) + 1
        return [Exposure(k, CATEGORY[k], n) for k, n in sorted(counts.items())]

    def preview(self, text: str | None, width: int = 160) -> str | None:
        """Safe-to-persist context: a window around the first finding with every
        finding replaced by ``⟦kind⟧`` and the rest redacted as usual."""
        hits = sorted((h for h in self.find(text) if h.end > h.start), key=lambda h: h.start)
        if not text or not hits:
            return None
        out, pos = [], 0
        for h in hits:
            if h.start < pos:
                continue  # overlapping rules: first one wins
            out.append(text[pos : h.start] + f"\u27e6{h.kind}\u27e7")
            pos = h.end
        masked = self.redactor.redact("".join(out) + text[pos:]) or ""
        first = masked.find("\u27e6")
        lo = max(0, first - width // 3)
        snippet = masked[lo : lo + width]
        return ("\u2026" if lo else "") + snippet + ("\u2026" if lo + width < len(masked) else "")

    def reveal(self, text: str | None, pad: int = 80) -> list[dict[str, str]]:
        """Raw context around each finding, for the local review UI only. Never persist."""
        return [
            {"kind": h.kind, "category": h.category, "before": text[max(0, h.start - pad) : h.start],
             "value": text[h.start : h.end], "after": text[h.end : h.end + pad]}
            for h in sorted(self.find(text), key=lambda h: h.start) if h.end > h.start and text
        ]


if __name__ == "__main__":
    d = Detector()
    kinds = lambda t: {e.kind for e in d.scan(t)}  # noqa: E731
    aws = "AK" + "IA" + "ABCDEFGHIJKLMNOP"
    assert kinds(f"key {aws}") == {"aws"}
    assert kinds("card 4111 1111 1111 1111") == {"card"}
    assert kinds("card 4111 1111 1111 1112") == set()  # fails Luhn
    assert kinds("ssn 123-45-6789") == {"ssn"}
    assert kinds("patient jane@acme.io diagnosed with diabetes") == {"email", "phi_context"}
    assert kinds("MRN: 00123456 follow-up") == {"mrn"}
    assert kinds("mail me at dev@example.com, sha 0123456789abcdef0123456789abcdef01234567") == set()
    assert kinds("fix [REDACTED:email] bug") == set()
    assert Detector({"disabled": ["ssn"]}).scan("123-45-6789") == []
    pv = d.preview(f"please deploy with {aws} to prod")
    assert pv is not None and "\u27e6aws\u27e7" in pv and aws not in pv
    assert d.reveal(f"x {aws} y")[0]["value"] == aws
    print("ok")
