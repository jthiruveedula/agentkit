import importlib.util
from pathlib import Path

_p = Path(__file__).resolve().parent.parent / "site" / "scripts" / "check_site.py"
_s = importlib.util.spec_from_file_location("check_site", _p)
m = importlib.util.module_from_spec(_s)
_s.loader.exec_module(m)


def test_site_security():
    assert m.check() == []


def test_sink_regex_catches_dynamic():
    assert m.SINK.search("el.innerHTML = x;")
    assert m.SINK.search("eval(x)")
    assert not m.SINK.search("el.innerHTML = '';")
