"""Minimal YAML-frontmatter reader.

Deliberately not PyYAML: the installer must work on a locked-down box with
nothing but a stock interpreter. Supported subset is all the skill schema
needs -- `key: scalar` and `key: [a, b]`, no nesting, no anchors, no
multi-line scalars.
"""
import re
from pathlib import Path

DELIM = "---"
_KV = re.compile(r"^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$")


class FrontmatterError(ValueError):
    pass


def _scalar(raw):
    raw = raw.strip()
    if not raw:
        return ""
    if raw[0] in "'\"" and raw[-1] == raw[0] and len(raw) > 1:
        return raw[1:-1]
    if raw.startswith("[") and raw.endswith("]"):
        inner = raw[1:-1].strip()
        return [_scalar(p) for p in inner.split(",")] if inner else []
    return raw


def parse(text, origin="<string>"):
    """Return (meta: dict, body: str). Raises FrontmatterError if malformed."""
    lines = text.splitlines()
    if not lines or lines[0].strip() != DELIM:
        raise FrontmatterError("%s: missing opening '---' frontmatter delimiter" % origin)
    try:
        end = next(i for i in range(1, len(lines)) if lines[i].strip() == DELIM)
    except StopIteration:
        raise FrontmatterError("%s: unterminated frontmatter block" % origin)

    meta = {}
    for n, line in enumerate(lines[1:end], start=2):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        m = _KV.match(line)
        if not m:
            raise FrontmatterError("%s:%d: not a 'key: value' pair: %r" % (origin, n, line))
        key, val = m.group(1), _scalar(m.group(2))
        if key in meta:
            raise FrontmatterError("%s:%d: duplicate key %r" % (origin, n, key))
        meta[key] = val
    body = "\n".join(lines[end + 1:]).lstrip("\n")
    return meta, (body.rstrip("\n") + "\n") if body.strip() else ""


def load(path):
    p = Path(path)
    return parse(p.read_text(encoding="utf-8"), origin=str(p))


def dump(meta, order=None):
    """Render a frontmatter block (including delimiters, trailing newline)."""
    keys = [k for k in (order or []) if k in meta] + [k for k in meta if k not in (order or [])]
    out = [DELIM]
    for k in keys:
        v = meta[k]
        if isinstance(v, list):
            s = "[%s]" % ", ".join(str(i) for i in v)
        elif isinstance(v, bool):
            s = "true" if v else "false"
        else:
            s = str(v)
            # quote only when the scalar would otherwise reparse as something else
            if s and (s[0] in "[{#'\"" or s.strip() != s):
                s = "'%s'" % s.replace("'", "''")
        out.append("%s: %s" % (k, s))
    out.append(DELIM)
    return "\n".join(out) + "\n"


def demo():
    meta, body = parse("---\nname: x\ndescription: 'a, b'\nallowed-tools: [Read, Bash]\n---\n\nhello\n")
    assert meta == {"name": "x", "description": "a, b", "allowed-tools": ["Read", "Bash"]}, meta
    assert body == "hello\n", repr(body)
    assert "allowed-tools: [Read, Bash]" in dump(meta)
    for bad in ("no frontmatter", "---\nname: x\n", "---\nnot a pair\n---\n"):
        try:
            parse(bad)
        except FrontmatterError:
            pass
        else:
            raise AssertionError("expected FrontmatterError for %r" % bad)
    print("frontmatter demo ok")


if __name__ == "__main__":
    demo()
