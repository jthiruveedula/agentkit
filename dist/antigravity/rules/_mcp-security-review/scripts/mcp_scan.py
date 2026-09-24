#!/usr/bin/env python3
"""Scan MCP server configs for common security misconfigurations.

Usage: mcp_scan.py [config ...] [--json]

With no config paths given, scans the default locations that exist:
.mcp.json (cwd), ~/.claude.json, ~/.cursor/mcp.json, and the Claude
Desktop config. Parses `mcpServers` at the top level and nested under
`projects.<path>.mcpServers` (the shape ~/.claude.json uses).

Findings never include secret values -- only the key name that looks
sensitive. Exit 0 when no HIGH-severity findings, 1 otherwise.
"""

import argparse
import json
import os
import sys
from pathlib import Path

# Finding codes -- meaning documented here, never embedded in output that
# could leak into logs alongside a secret value.
#   UNPINNED        (medium): npx/uvx/bunx/pipx package arg has no pinned
#                    version, or is pinned to @latest
#   SECRET_IN_CONFIG (high):  env/args value looks like a live secret
#   BROAD_FS        (high):  filesystem server rooted at /, ~, or $HOME
#   REMOTE_NO_AUTH  (medium): remote server on plain http (non-localhost)
#                    (low when https with no auth headers: OAuth is typical)
#   SHELL_WRAPPER   (low):   command is a shell invoked with -c

SEVERITY = {
    "UNPINNED": "medium",
    "SECRET_IN_CONFIG": "high",
    "BROAD_FS": "high",
    "REMOTE_NO_AUTH": "medium",
    "SHELL_WRAPPER": "low",
}

PACKAGE_RUNNERS = {"npx", "uvx", "bunx", "pipx"}
SHELLS = {"sh", "bash", "cmd", "cmd.exe", "powershell", "pwsh"}
SECRET_KEY_RE_PARTS = ("TOKEN", "KEY", "SECRET", "PASSWORD")
SECRET_VALUE_PATTERNS = ("sk-", "ghp_", "gho_", "xox", "AKIA")
PLACEHOLDER_MARKERS = ("<", ">", "${", "$env:", "your-", "xxx", "changeme", "example")

DEFAULT_CONFIG_PATHS = [
    Path.cwd() / ".mcp.json",
    Path.home() / ".claude.json",
    Path.home() / ".cursor" / "mcp.json",
    Path.home()
    / "Library"
    / "Application Support"
    / "Claude"
    / "claude_desktop_config.json",
    Path.home() / ".config" / "Claude" / "claude_desktop_config.json",
]


def default_configs():
    return [p for p in DEFAULT_CONFIG_PATHS if p.is_file()]


def iter_servers(config):
    """Yield (server_name, server_dict) for top-level and nested projects.*.mcpServers."""
    for name, server in (config.get("mcpServers") or {}).items():
        yield name, server
    for proj_path, proj in (config.get("projects") or {}).items():
        if not isinstance(proj, dict):
            continue
        for name, server in (proj.get("mcpServers") or {}).items():
            yield "%s (project: %s)" % (name, proj_path), server


def looks_like_placeholder(value):
    lowered = value.lower()
    return any(marker in lowered for marker in PLACEHOLDER_MARKERS)


def is_secret_key(key):
    upper = key.upper()
    return any(part in upper for part in SECRET_KEY_RE_PARTS)


def check_secret(key, value, file, server_name, findings):
    if not isinstance(value, str) or not value:
        return
    key_flagged = is_secret_key(key) and not looks_like_placeholder(value)
    pattern_flagged = any(marker in value for marker in SECRET_VALUE_PATTERNS)
    if key_flagged or pattern_flagged:
        findings.append(
            {
                "server": server_name,
                "file": file,
                "code": "SECRET_IN_CONFIG",
                "severity": SEVERITY["SECRET_IN_CONFIG"],
                "detail": "key '%s' looks like a live secret" % key,
            }
        )


def check_unpinned(command, args, file, server_name, findings):
    base = os.path.basename(command or "")
    if base not in PACKAGE_RUNNERS:
        return
    for arg in args or []:
        if not isinstance(arg, str) or arg.startswith("-"):
            continue
        if arg.endswith("@latest"):
            findings.append(
                {
                    "server": server_name,
                    "file": file,
                    "code": "UNPINNED",
                    "severity": SEVERITY["UNPINNED"],
                    "detail": "'%s' pinned to @latest" % arg,
                }
            )
        elif "@" not in arg.lstrip("@"):
            # first non-flag package-like arg with no version pin
            findings.append(
                {
                    "server": server_name,
                    "file": file,
                    "code": "UNPINNED",
                    "severity": SEVERITY["UNPINNED"],
                    "detail": "'%s' has no pinned version" % arg,
                }
            )
        break


def check_broad_fs(command, args, server, file, server_name, findings):
    candidates = list(args or [])
    if isinstance(server.get("cwd"), str):
        candidates.append(server["cwd"])
    broad_roots = {"/", "~", "$HOME", "%USERPROFILE%"}
    for arg in candidates:
        if isinstance(arg, str) and arg.strip() in broad_roots:
            findings.append(
                {
                    "server": server_name,
                    "file": file,
                    "code": "BROAD_FS",
                    "severity": SEVERITY["BROAD_FS"],
                    "detail": "filesystem root '%s' grants broad access" % arg.strip(),
                }
            )


def check_shell_wrapper(command, args, file, server_name, findings):
    base = os.path.basename(command or "")
    if base in SHELLS and "-c" in (args or []):
        findings.append(
            {
                "server": server_name,
                "file": file,
                "code": "SHELL_WRAPPER",
                "severity": SEVERITY["SHELL_WRAPPER"],
                "detail": "command runs '%s -c' -- opaque shell invocation" % base,
            }
        )


def check_remote_no_auth(server, file, server_name, findings):
    url = server.get("url") or server.get("http") or server.get("sse")
    if not isinstance(url, str):
        return
    is_localhost = any(h in url for h in ("localhost", "127.0.0.1", "::1"))
    if url.startswith("http://") and not is_localhost:
        findings.append(
            {
                "server": server_name,
                "file": file,
                "code": "REMOTE_NO_AUTH",
                "severity": SEVERITY["REMOTE_NO_AUTH"],
                "detail": "remote server uses plain http:// (%s)" % url,
            }
        )
        return
    headers = server.get("headers")
    has_auth = bool(headers) and any("auth" in k.lower() for k in headers)
    if not is_localhost and not has_auth:
        findings.append(
            {
                "server": server_name,
                "file": file,
                "code": "REMOTE_NO_AUTH",
                # https + no headers is normal for OAuth servers (/mcp login),
                # so it's a prompt to verify, not a medium finding.
                "severity": "low",
                "detail": "no auth headers configured -- fine if it authenticates via OAuth (/mcp), otherwise add auth",
            }
        )


def scan_server(server_name, server, file, findings):
    if not isinstance(server, dict):
        return
    command = server.get("command")
    args = server.get("args") or []

    check_unpinned(command, args, file, server_name, findings)
    check_broad_fs(command, args, server, file, server_name, findings)
    check_shell_wrapper(command, args, file, server_name, findings)
    check_remote_no_auth(server, file, server_name, findings)

    for key, value in (server.get("env") or {}).items():
        check_secret(key, value, file, server_name, findings)
    for arg in args:
        if isinstance(arg, str) and "=" in arg:
            key, _, value = arg.partition("=")
            check_secret(key, value, file, server_name, findings)


def scan_file(path, findings, errors):
    try:
        config = json.loads(Path(path).read_text())
    except (OSError, json.JSONDecodeError) as exc:
        errors.append("%s: %s" % (path, exc))
        return
    for server_name, server in iter_servers(config):
        scan_server(server_name, server, str(path), findings)


def format_table(findings):
    if not findings:
        return "No findings."
    lines = ["%-8s %-10s %-24s %s" % ("SEVERITY", "CODE", "SERVER", "DETAIL")]
    for f in findings:
        lines.append(
            "%-8s %-10s %-24s %s  [%s]"
            % (f["severity"], f["code"], f["server"], f["detail"], f["file"])
        )
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Scan MCP server configs for security risks."
    )
    parser.add_argument(
        "configs",
        nargs="*",
        help="config file paths; defaults to known locations that exist",
    )
    parser.add_argument(
        "--json", action="store_true", help="emit JSON instead of a human table"
    )
    args = parser.parse_args(argv)

    paths = [Path(p) for p in args.configs] if args.configs else default_configs()
    findings = []
    errors = []
    for path in paths:
        scan_file(path, findings, errors)

    for err in errors:
        print(err, file=sys.stderr)

    if args.json:
        print(json.dumps(findings, indent=2))
    else:
        print(format_table(findings))

    has_high = any(f["severity"] == "high" for f in findings)
    return 1 if has_high else 0


if __name__ == "__main__":
    sys.exit(main())
