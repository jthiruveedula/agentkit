"""Shared fixtures. Everything here is synthetic; no real session content."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

import pytest

from prompt_analytics.adapters.base import Health, SourceFile, stat_file
from prompt_analytics.config import Config
from prompt_analytics.privacy import unblock_network
from prompt_analytics.schema import CodeEdit, ParsedBatch, Session, ToolCall, Turn

T0 = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def _network_restored():
    yield
    unblock_network()


@pytest.fixture
def cfg(tmp_path: Path) -> Config:
    return Config(data_dir=tmp_path / "data")


class FakeAdapter:
    """File-per-session adapter over ``root/*.jsonl``; behaviour injected per test."""

    name = "fake"

    def __init__(self, root: Path, make_batch: Callable[[SourceFile], ParsedBatch] | None = None,
                 parse_error: bool = False, health_error: bool = False):
        self.root, self.make_batch = root, make_batch
        self.parse_error, self.health_error = parse_error, health_error
        self.parse_calls = 0

    def discover(self) -> list[SourceFile]:
        return [stat_file(self.name, p) for p in sorted(self.root.glob("*.jsonl"))]

    def parse(self, f: SourceFile) -> ParsedBatch:
        self.parse_calls += 1
        if self.parse_error:
            raise ValueError("boom")
        return (self.make_batch or default_batch)(f)

    def health(self) -> Health:
        if self.health_error:
            raise RuntimeError("health boom")
        return Health(self.name, "ok", len(self.discover()))


def default_batch(f: SourceFile) -> ParsedBatch:
    sid = f"fake:{f.path.stem}"
    return ParsedBatch(
        sessions=[Session(sid, "fake", f.key, project_path=None, title="t", started_at=T0, ended_at=T0 + timedelta(minutes=5),
                          model="claude-sonnet-4-5")],
        turns=[Turn(f"{sid}:0", sid, 0, "user", T0, "hello"),
               Turn(f"{sid}:1", sid, 1, "assistant", T0 + timedelta(minutes=1), "hi", model="claude-sonnet-4-5",
                    tokens_in=1000, tokens_out=500)],
    )


@pytest.fixture
def fake_root(tmp_path: Path) -> Path:
    r = tmp_path / "fake_src"
    r.mkdir()
    (r / "a.jsonl").write_text("a")
    return r


@pytest.fixture
def make_fake(fake_root):
    return lambda **kw: FakeAdapter(fake_root, **kw)
