"""Packaging drift guards: package.json metadata and install.sh copies.

These fail fast when the published npm tarball or the Python wheel would
be missing something the install paths need:
- the wheel's src/agentkit/install.sh must be byte-identical to root install.sh
- package.json must ship install.ps1, scripts/, external/skills.lock.json
  and publish to the GitHub Packages registry under the scoped name
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _package_json():
    return json.loads((ROOT / "package.json").read_text(encoding="utf-8"))


def test_install_sh_byte_identical():
    root_sh = ROOT / "install.sh"
    pkg_sh = ROOT / "src" / "agentkit" / "install.sh"
    assert pkg_sh.exists(), "src/agentkit/install.sh missing -- copy root install.sh"
    assert root_sh.read_bytes() == pkg_sh.read_bytes(), (
        "src/agentkit/install.sh drifted from root install.sh"
    )


def test_package_name_scoped():
    assert _package_json()["name"] == "@jthiruveedula/agentkit"


def test_package_json_files():
    files = _package_json()["files"]
    for entry in ("install.ps1", "scripts/", "external/skills.lock.json"):
        assert entry in files, f"package.json files[] missing {entry!r}"


def test_package_json_publish_config():
    pkg = _package_json()
    assert pkg["publishConfig"]["registry"] == "https://npm.pkg.github.com"


def test_versions_in_sync():
    # release-please bumps package.json and the manifest; extra-files in
    # release-please-config.json carry pyproject and marketplace along.
    pyproject = (ROOT / "pyproject.toml").read_text(encoding="utf-8")
    py_ver = re.search(r'^version = "([^"]+)"', pyproject, re.M).group(1)
    market = json.loads(
        (ROOT / ".claude-plugin" / "marketplace.json").read_text(encoding="utf-8")
    )
    manifest = json.loads(
        (ROOT / ".github" / "release-please-manifest.json").read_text(encoding="utf-8")
    )
    assert (
        _package_json()["version"]
        == py_ver
        == market["plugins"][0]["version"]
        == manifest["."]
    )
