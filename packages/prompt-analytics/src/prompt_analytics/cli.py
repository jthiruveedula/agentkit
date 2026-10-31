"""prompt-analytics command line."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import stat
import sys
from pathlib import Path
from typing import Any

from .config import Config

COMMANDS = ("scan", "analyze", "serve", "export", "doctor", "run", "exposure")
ML_BACKENDS = ("fastembed", "model2vec", "umap", "sentence_transformers")
MODEL = "BAAI/bge-small-en-v1.5"


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="prompt-analytics", description="Local-first analytics over AI coding sessions.")
    p.add_argument("--data-dir", type=Path, default=None)
    sub = p.add_subparsers(dest="cmd")

    def scan_args(s: argparse.ArgumentParser) -> None:
        s.add_argument("--full", action="store_true", help="ignore watermarks, re-parse everything")
        s.add_argument("--source", action="append", default=None, help="limit to a source (repeatable)")
        s.add_argument("--store-text", choices=("none", "redacted", "full"), default=None)

    def mode_args(s: argparse.ArgumentParser) -> None:
        s.add_argument("--mode", choices=("auto", "basic", "ml", "deep"), default=None, help="analysis tier (default: [analysis] mode, else auto)")

    def serve_args(s: argparse.ArgumentParser) -> None:
        s.add_argument("--port", type=int, default=0)
        s.add_argument("--no-open", action="store_true")

    s = sub.add_parser("scan", help="ingest session files into the local store")
    scan_args(s)
    s.add_argument("--json", action="store_true")
    s = sub.add_parser("analyze", help="compute metrics, topics and insights")
    mode_args(s)
    s = sub.add_parser("serve", help="export and serve the dashboard on 127.0.0.1")
    serve_args(s)
    s = sub.add_parser("export", help="write the single-file dashboard")
    s.add_argument("--out", type=Path, default=None)
    s = sub.add_parser("doctor", help="adapter health, permissions, ML backends")
    s.add_argument("--json", action="store_true")
    s.add_argument("--download-models", action="store_true")
    s = sub.add_parser("exposure", help="sensitive data pasted into assistants (counts only)")
    s.add_argument("--json", action="store_true")
    s.add_argument("--since", type=int, default=None, metavar="DAYS")
    s.add_argument("--reveal", metavar="TURN_ID", default=None, help="print raw context of a flagged prompt (stdout only)")
    s = sub.add_parser("run", help="scan, analyze, serve (default)")
    scan_args(s)
    serve_args(s)
    mode_args(s)
    return p


def _scan(cfg: Config, args: argparse.Namespace, as_json: bool = False) -> int:
    from . import scan

    rep = scan.run(cfg, sources=args.source, full=args.full)
    if as_json:
        print(json.dumps(rep.to_dict(), indent=2, default=str))
        return 0
    print(f"{'source':<12} {'status':<12} {'files':>6} {'parsed':>6} {'skip':>6} {'sess':>6} warn")
    for r in rep.sources.values():
        print(f"{r.source:<12} {r.status:<12} {r.files_seen:>6} {r.parsed:>6} {r.skipped:>6} {r.sessions:>6} {r.n_warnings}")
        for w in r.warnings[:3]:
            print(f"    ! {w}")
    o = rep.outcomes
    if o:
        print(f"outcomes: {o.get('outcomes', 0)} commits in {o.get('repos', 0)} repos ({o.get('linked', 0)} linked)")
    _print_exposure_warning(rep.exposures)
    return 0


_LABEL = {"secret": "secrets", "pii": "PII", "phi": "PHI"}


def _print_exposure_warning(exp: dict[str, Any]) -> None:
    if not exp:
        return
    parts = []
    for cat in ("secret", "pii", "phi"):
        v = exp.get(cat)
        if v:
            kinds = ", ".join(f"{k} {n}" for k, n in sorted(v["kinds"].items(), key=lambda x: -x[1]))
            parts.append(f"{_LABEL[cat]} in {v['sessions']} session{'s' * (v['sessions'] != 1)} ({kinds})")
    print("WARNING: sensitive data pasted into assistants: " + " | ".join(parts))
    for cat in ("secret", "pii", "phi"):
        if exp.get(cat):
            print(f"  {_LABEL[cat]}: {exp[cat]['advice']}")
    print("  See: prompt-analytics exposure")


def _status(t: dict[str, int]) -> str:
    return ", ".join(f"{n} {k}" for k, n in t.items() if n) or "-"


def _exposure(cfg: Config, args: argparse.Namespace) -> int:
    from . import store

    if not cfg.db_path.exists():
        print("no data yet; run: prompt-analytics scan", file=sys.stderr)
        return 0
    con = store.connect(cfg, read_only=args.reveal is None)
    try:
        if args.reveal:
            from . import scan

            found = scan.reveal(cfg, con, args.reveal)
            if found is None:
                print("unknown turn, or its source file is gone/changed", file=sys.stderr)
                return 1
            for f in found:
                print(f"[{f['category']}/{f['kind']}] {f['before']!r} >>> {f['value']!r} <<< {f['after']!r}")
            return 0
        data = store.exposure_summary(con, args.since)
    finally:
        con.close()
    if args.json:
        print(json.dumps(data, indent=2))
        return 0
    if not data["categories"]:
        print("no sensitive data detected in user prompts")
        return 0
    for cat, v in data["categories"].items():
        print(f"{_LABEL.get(cat, cat)}: {v['sessions']} sessions, {v['prompts']} prompts, "
              f"{v['first']}..{v['last']}, by source {v['by_source']}")
        for k, x in v["kinds"].items():
            print(f"    {k:<14} sessions {x['sessions']:>4}  prompts {x['prompts']:>4}  matches {x['count']:>4}")
        print(f"    advice: {v['advice']}")
    print("\nsessions (source, date, title, kinds):")
    for s in data["sessions"][:50]:
        print(f"  {s['source']:<12} {s['date']}  {(s['title'] or '-')[:60]:<60}  {', '.join(s['kinds'])}  [{_status(s['turns'])}]")
    return 0


def _analyze(cfg: Config, mode: str | None = None) -> int:
    try:
        from . import analyze
    except ImportError as e:
        print(f"analyze unavailable: {e}", file=sys.stderr)
        return 0
    from . import store

    con = store.connect(cfg)
    try:
        rep = analyze.run(cfg, con, mode)
    finally:
        con.close()
    eng = rep.engine
    if mode not in (None, "auto") and eng.get("mode") != mode:
        print(f"warning: {rep.reason}", file=sys.stderr)
        if eng.get("upgrade"):
            print(f"  to unlock {eng['upgrade']['mode']}: {eng['upgrade']['command']}", file=sys.stderr)
    print(f"analyze: done ({eng.get('mode')} tier; {rep.reason})")
    return 0


def _export(cfg: Config, out: Path | None) -> int:
    try:
        from . import export, store
    except ImportError as e:
        print(f"export unavailable: {e}", file=sys.stderr)
        return 0
    con = store.connect(cfg)
    try:
        path = export.write(cfg, export.build(con, cfg), out or cfg.export_dir)
    except Exception as e:
        print(f"export failed: {type(e).__name__}: {e}", file=sys.stderr)
        return 2
    finally:
        con.close()
    print(path)
    return 0


def _serve(cfg: Config, args: argparse.Namespace) -> int:
    from . import server

    try:
        server.serve(cfg, port=args.port, open_browser=not args.no_open)
    except Exception as e:
        print(f"serve failed: {type(e).__name__}: {e}", file=sys.stderr)
        return 2
    return 0


def _loose_perms(root: Path) -> list[str]:
    if not root.exists():
        return []
    return [str(p.relative_to(root)) or "." for p in [root, *root.rglob("*")] if stat.S_IMODE(p.stat().st_mode) & 0o077]


def _download_models(cfg: Config) -> str:
    if importlib.util.find_spec("fastembed") is None:
        return "fastembed not installed; run: uv pip install 'prompt-analytics[embed]'"
    from .privacy import block_network, unblock_network

    unblock_network()
    for v in ("HF_HUB_OFFLINE", "TRANSFORMERS_OFFLINE", "HF_DATASETS_OFFLINE"):
        os.environ.pop(v, None)
    try:
        from fastembed import TextEmbedding

        cfg.models_dir.mkdir(parents=True, exist_ok=True)
        TextEmbedding(MODEL, cache_dir=str(cfg.models_dir))
        return f"downloaded {MODEL} into {cfg.models_dir}"
    except Exception as e:
        return f"download failed: {type(e).__name__}: {e}"
    finally:
        block_network()


def _doctor(cfg: Config, args: argparse.Namespace) -> int:
    from . import scan
    from .adapters.base import Health
    from .privacy import block_network

    if not args.download_models:
        block_network()
    health: list[Health] = [scan.check_health(a) for a in scan._load_adapters()
                            if cfg.sources is None or a.name in cfg.sources]
    ml = {m: importlib.util.find_spec(m) is not None for m in ML_BACKENDS}
    from . import capabilities

    pr = capabilities.probe(cfg.models_dir, cfg.analysis.get("mode"))
    tier, why = capabilities.resolve(cfg.analysis.get("mode"), pr)
    loose = _loose_perms(cfg.data_dir)
    dl = _download_models(cfg) if args.download_models else None
    if args.json:
        out: dict[str, Any] = {
            "sources": [vars(h) for h in health],
            "data_dir": {"path": str(cfg.data_dir), "exists": cfg.data_dir.exists(), "loose_perms": loose},
            "ml": ml,
            "analysis": {**pr, "mode": tier, "reason": why},
        }
        if dl:
            out["download"] = dl
        print(json.dumps(out, indent=2))
        return 0
    print(f"{'source':<12} {'status':<12} {'sessions':>8}  versions / messages")
    for h in health:
        print(f"{h.source:<12} {h.status:<12} {h.sessions_found:>8}  {','.join(h.versions_seen)}")
        for m in h.messages:
            print(f"    {m}")
    print(f"data dir: {cfg.data_dir} " + ("(missing)" if not cfg.data_dir.exists() else
          "(perms ok)" if not loose else f"(LOOSE perms on {len(loose)} paths: {', '.join(loose[:5])})"))
    print("ml backends: " + ", ".join(f"{k}={'yes' if v else 'no'}" for k, v in ml.items()) + " (tfidf always)")
    print("analysis libs:")
    for k, v in pr["libs"].items():
        print(f"    {k:<22} {v or 'missing'}")
    print(f"    {'embedding model cached':<22} {'yes' if pr['model_cached'] else 'no'}")
    print(f"tiers available: {', '.join(pr['available'])}; would run: {tier} ({why})")
    if pr["upgrade"]:
        print(f"to unlock {pr['upgrade']['mode']}: {pr['upgrade']['command']}")
    if dl:
        print(dl)
    return 0


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    pre = argparse.ArgumentParser(add_help=False)
    pre.add_argument("--data-dir", type=Path, default=None)
    g, rest = pre.parse_known_args(argv)
    if (not rest or rest[0] not in COMMANDS) and "-h" not in rest and "--help" not in rest:
        rest = ["run", *rest]
    full = (["--data-dir", str(g.data_dir)] if g.data_dir else []) + rest
    try:
        args = _parser().parse_args(full)
    except SystemExit as e:
        return int(e.code or 0)
    cfg = Config.load(args.data_dir, store_text=getattr(args, "store_text", None))
    c = args.cmd
    if c == "scan":
        return _scan(cfg, args, args.json)
    if c == "analyze":
        return _analyze(cfg, args.mode)
    if c == "export":
        return _export(cfg, args.out)
    if c == "serve":
        return _serve(cfg, args)
    if c == "exposure":
        return _exposure(cfg, args)
    if c == "doctor":
        return _doctor(cfg, args)
    rc = _scan(cfg, args) or _analyze(cfg, args.mode)
    return rc or _serve(cfg, args)
