import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import mcp_scan  # noqa: E402


def write_config(tmp_path, data, name="config.json"):
    path = tmp_path / name
    path.write_text(json.dumps(data))
    return path


def codes(findings):
    return {f["code"] for f in findings}


def test_unpinned_latest(tmp_path):
    cfg = write_config(
        tmp_path,
        {"mcpServers": {"foo": {"command": "npx", "args": ["some-pkg@latest"]}}},
    )
    findings, errors = [], []
    mcp_scan.scan_file(cfg, findings, errors)
    assert "UNPINNED" in codes(findings)


def test_unpinned_no_version(tmp_path):
    cfg = write_config(
        tmp_path,
        {"mcpServers": {"foo": {"command": "uvx", "args": ["some-pkg"]}}},
    )
    findings, errors = [], []
    mcp_scan.scan_file(cfg, findings, errors)
    assert "UNPINNED" in codes(findings)


def test_pinned_version_clean(tmp_path):
    cfg = write_config(
        tmp_path,
        {"mcpServers": {"foo": {"command": "npx", "args": ["some-pkg@1.2.3"]}}},
    )
    findings, errors = [], []
    mcp_scan.scan_file(cfg, findings, errors)
    assert "UNPINNED" not in codes(findings)


def test_secret_in_env_key_name_only(tmp_path):
    # Built at runtime (not a literal) so this test fixture doesn't itself
    # trip the repo's own secret-pattern scanner in scripts/validate.py.
    secret_value = "sk-" + "abcdefghijklmnopqrstuvwxyz1234567890"
    cfg = write_config(
        tmp_path,
        {
            "mcpServers": {
                "foo": {
                    "command": "node",
                    "args": ["server.js"],
                    "env": {"API_TOKEN": secret_value},
                }
            }
        },
    )
    findings, errors = [], []
    mcp_scan.scan_file(cfg, findings, errors)
    assert "SECRET_IN_CONFIG" in codes(findings)
    dumped = json.dumps(findings)
    assert secret_value not in dumped
    assert "API_TOKEN" in dumped


def test_placeholder_secret_not_flagged(tmp_path):
    cfg = write_config(
        tmp_path,
        {
            "mcpServers": {
                "foo": {"command": "node", "env": {"API_TOKEN": "${API_TOKEN}"}}
            }
        },
    )
    findings, errors = [], []
    mcp_scan.scan_file(cfg, findings, errors)
    assert "SECRET_IN_CONFIG" not in codes(findings)


def test_broad_fs_root(tmp_path):
    cfg = write_config(
        tmp_path,
        {
            "mcpServers": {
                "fs": {
                    "command": "npx",
                    "args": ["@modelcontextprotocol/server-filesystem@1.0.0", "/"],
                }
            }
        },
    )
    findings, errors = [], []
    mcp_scan.scan_file(cfg, findings, errors)
    assert "BROAD_FS" in codes(findings)


def test_remote_no_auth_http(tmp_path):
    cfg = write_config(
        tmp_path, {"mcpServers": {"remote": {"url": "http://example.com/mcp"}}}
    )
    findings, errors = [], []
    mcp_scan.scan_file(cfg, findings, errors)
    assert "REMOTE_NO_AUTH" in codes(findings)
    assert findings[0]["severity"] == "medium"


def test_remote_localhost_clean(tmp_path):
    cfg = write_config(
        tmp_path, {"mcpServers": {"remote": {"url": "http://localhost:3000/mcp"}}}
    )
    findings, errors = [], []
    mcp_scan.scan_file(cfg, findings, errors)
    assert "REMOTE_NO_AUTH" not in codes(findings)


def test_remote_https_no_headers(tmp_path):
    cfg = write_config(
        tmp_path, {"mcpServers": {"remote": {"url": "https://example.com/mcp"}}}
    )
    findings, errors = [], []
    mcp_scan.scan_file(cfg, findings, errors)
    assert "REMOTE_NO_AUTH" in codes(findings)
    assert findings[0]["severity"] == "low"  # OAuth servers look like this


def test_remote_https_with_auth_header_clean(tmp_path):
    cfg = write_config(
        tmp_path,
        {
            "mcpServers": {
                "remote": {
                    "url": "https://example.com/mcp",
                    "headers": {"Authorization": "Bearer x"},
                }
            }
        },
    )
    findings, errors = [], []
    mcp_scan.scan_file(cfg, findings, errors)
    assert "REMOTE_NO_AUTH" not in codes(findings)


def test_shell_wrapper(tmp_path):
    cfg = write_config(
        tmp_path, {"mcpServers": {"sh": {"command": "bash", "args": ["-c", "run.sh"]}}}
    )
    findings, errors = [], []
    mcp_scan.scan_file(cfg, findings, errors)
    assert "SHELL_WRAPPER" in codes(findings)


def test_nested_projects_scanned(tmp_path):
    cfg = write_config(
        tmp_path,
        {
            "projects": {
                "/some/project": {
                    "mcpServers": {"nested": {"command": "npx", "args": ["pkg@latest"]}}
                }
            }
        },
    )
    findings, errors = [], []
    mcp_scan.scan_file(cfg, findings, errors)
    assert "UNPINNED" in codes(findings)
    assert "nested" in findings[0]["server"]


def test_exit_code_high_severity(tmp_path, capsys):
    cfg = write_config(
        tmp_path, {"mcpServers": {"fs": {"command": "npx", "args": ["pkg@1.0.0", "/"]}}}
    )
    rc = mcp_scan.main([str(cfg), "--json"])
    assert rc == 1


def test_exit_code_clean(tmp_path):
    cfg = write_config(
        tmp_path, {"mcpServers": {"foo": {"command": "npx", "args": ["pkg@1.0.0"]}}}
    )
    rc = mcp_scan.main([str(cfg)])
    assert rc == 0


def test_exit_code_medium_only_is_zero(tmp_path):
    cfg = write_config(
        tmp_path, {"mcpServers": {"foo": {"command": "npx", "args": ["pkg@latest"]}}}
    )
    rc = mcp_scan.main([str(cfg)])
    assert rc == 0


def _secret_findings(tmp_path, server):
    cfg = write_config(tmp_path, {"mcpServers": {"s": server}})
    findings, errors = [], []
    mcp_scan.scan_file(cfg, findings, errors)
    return [f for f in findings if f["code"] == "SECRET_IN_CONFIG"], json.dumps(
        findings
    )


def test_secret_in_two_arg_flag_and_bare_arg_never_printed(tmp_path):
    token = "ghp_" + "a" * 36  # built by concat so the repo's scanner stays quiet
    found, dumped = _secret_findings(
        tmp_path,
        {
            "command": "npx",
            "args": ["pkg@1.0.0", "--api-key", "literalvalue123", token],
        },
    )
    assert len(found) == 2
    assert {f["detail"] for f in found} == {
        "argument 3 looks like a live secret",
        "argument 4 looks like a live secret",
    }
    assert token not in dumped and "literalvalue123" not in dumped


def test_secret_in_header_flagged_placeholder_not(tmp_path):
    found, dumped = _secret_findings(
        tmp_path,
        {
            "url": "https://example.com/mcp",
            "headers": {"Authorization": "Bearer abc123def"},
        },
    )
    assert [f["detail"] for f in found] == [
        "header Authorization looks like a live secret"
    ]
    assert "abc123def" not in dumped
    found, _ = _secret_findings(
        tmp_path,
        {
            "url": "https://example.com/mcp",
            "headers": {"Authorization": "Bearer ${TOKEN}"},
        },
    )
    assert found == []


def test_package_names_are_not_secrets(tmp_path):
    found, _ = _secret_findings(
        tmp_path, {"command": "npx", "args": ["task-master-ai@1.2.0", "--port", "8080"]}
    )
    assert found == []


def test_broad_fs_expanded_home_dirs(tmp_path):
    for root in ["/Users/alice", "/home/bob/", "~/", "C:\\Users\\carol"]:
        cfg = write_config(
            tmp_path,
            {
                "mcpServers": {
                    "fs": {
                        "command": "npx",
                        "args": ["-y", "server-filesystem@1.0.0", root],
                    }
                }
            },
        )
        findings, errors = [], []
        mcp_scan.scan_file(cfg, findings, errors)
        assert "BROAD_FS" in codes(findings), root
    cfg = write_config(
        tmp_path,
        {
            "mcpServers": {
                "fs": {
                    "command": "npx",
                    "args": ["-y", "server-filesystem@1.0.0", "/Users/alice/proj"],
                }
            }
        },
    )
    findings, errors = [], []
    mcp_scan.scan_file(cfg, findings, errors)
    assert "BROAD_FS" not in codes(findings)
