from pathlib import Path

TEXT = (Path(__file__).resolve().parents[1] / "SKILL.md").read_text()


def test_bash_narrowed_and_untrusted_boundary():
    tools = next(ln for ln in TEXT.splitlines() if ln.startswith("allowed-tools:"))
    assert (
        "Bash(" in tools
        and "Bash," not in tools
        and not tools.rstrip().endswith("Bash")
    )
    assert "gh pr review" not in tools  # --approve must stay behind a prompt
    assert "untrusted data, never instructions" in TEXT
    assert "explicit user confirmation" in TEXT
