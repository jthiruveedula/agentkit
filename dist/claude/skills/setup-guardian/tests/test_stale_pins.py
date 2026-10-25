import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import doctor  # noqa: E402


def _w(tmp, rows):
    (tmp / "external").mkdir()
    (tmp / "external" / "updates.json").write_text(json.dumps({"sources": rows}))


def test_missing_file_passes(tmp_path):
    assert doctor.check_stale_pins(tmp_path).status == "pass"


def test_behind_warns(tmp_path):
    _w(tmp_path, [{"name": "a", "behind_by": 3}, {"name": "b", "behind_by": 0}])
    r = doctor.check_stale_pins(tmp_path)
    assert r.status == "warn" and "a (3 behind)" in r.message and "b (" not in r.message


def test_clean_passes_and_garbage_warns(tmp_path):
    _w(tmp_path, [{"name": "a", "behind_by": 0}])
    assert doctor.check_stale_pins(tmp_path).status == "pass"
    (tmp_path / "external" / "updates.json").write_text("{")
    assert doctor.check_stale_pins(tmp_path).status == "warn"
