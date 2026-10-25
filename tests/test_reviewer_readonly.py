from pathlib import Path

R = (Path(__file__).resolve().parent.parent / "agents" / "reviewer.md").read_text()


def test_reviewer_has_no_shell_and_untrusted_clause():
    tools = next(ln for ln in R.splitlines() if ln.startswith("tools:"))
    assert "Bash" not in tools
    assert "Untrusted data" in R
