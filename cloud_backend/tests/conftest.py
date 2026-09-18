"""Shared fixtures for cloud_backend tests."""
from __future__ import annotations

import json
import secrets as secrets_mod
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Optional
from unittest.mock import MagicMock

import flask
import pytest

# Put cloud_backend/ on sys.path so `import main` works
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import main  # noqa: E402


# ---------------------------------------------------------------------------
# Fixture: env (autouse) — sets required env vars with a random secret
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def env(monkeypatch):
    """Set up valid environment variables with a random secret for every test."""
    secret = secrets_mod.token_urlsafe(32)
    monkeypatch.setenv("DEVICE_SHARED_SECRET", secret)
    monkeypatch.setenv("ALLOWED_DEVICE_IDS", "socket1,socket2,garage_unit_7")
    monkeypatch.setenv("MIN_PUSH_INTERVAL_S", "2.0")
    # Reset the global store so each test starts fresh
    monkeypatch.setattr(main, "_store", None)
    return secret


# ---------------------------------------------------------------------------
# Fixture: clock — mutable aware UTC datetime
# ---------------------------------------------------------------------------

class MockClock:
    def __init__(self):
        self.now = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)

    def advance(self, seconds: float):
        self.now += timedelta(seconds=seconds)


@pytest.fixture
def clock(monkeypatch):
    """Provide a mutable clock; monkeypatches main._now to use it."""
    c = MockClock()
    monkeypatch.setattr(main, "_now", lambda: c.now)
    return c


# ---------------------------------------------------------------------------
# Fixture: fake_store — in-memory store that records calls
# ---------------------------------------------------------------------------

class FakeStore:
    """In-memory replacement for FirestoreStore that uses rate_limit_retry_after."""

    def __init__(self):
        self.calls: list[dict] = []
        self._docs: dict[str, dict] = {}  # device_id -> stored record
        self._last_seen: dict[str, datetime] = {}  # device_id -> last write time
        self.raise_on_write: Optional[Exception] = None

    def write_if_allowed(self, device_id: str, record: dict, now: datetime, min_interval: float) -> Optional[float]:
        if self.raise_on_write is not None:
            raise self.raise_on_write

        retry = main.rate_limit_retry_after(
            self._last_seen.get(device_id),
            now,
            min_interval,
        )
        if retry is not None:
            self.calls.append({"device_id": device_id, "action": "rate_limited", "retry": retry})
            return retry

        self._docs[device_id] = record
        self._last_seen[device_id] = now
        self.calls.append({"device_id": device_id, "action": "written", "record": record})
        return None


@pytest.fixture
def fake_store(monkeypatch):
    """Install a FakeStore and return it."""
    store = FakeStore()
    monkeypatch.setattr(main, "_store", store)
    monkeypatch.setattr(main, "get_store", lambda: store)
    return store


# ---------------------------------------------------------------------------
# Helper: valid_payload
# ---------------------------------------------------------------------------

def valid_payload(**overrides) -> dict:
    """Return a complete valid payload for socket1, with optional overrides."""
    base = {
        "device_id": "socket1",
        "device_name": "Living Room Socket",
        "voltage": 230.1,
        "current": 1.42,
        "power": 326.7,
        "energy": 4.2,
        "frequency": 50.0,
        "power_factor": 0.98,
        "threshold": 1500.0,
        "tripped": False,
        "relay_on": True,
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Helper: call — build a Flask test request and invoke main.ingest
# ---------------------------------------------------------------------------

_app = flask.Flask(__name__)


def call(
    method: str = "POST",
    json_body: Any = None,
    raw: bytes | None = None,
    headers: dict | None = None,
    content_type: str = "application/json",
    secret: str | None = None,
) -> tuple[int, dict, Any]:
    """
    Build a test request and call main.ingest().
    Returns (status_code, response_headers_dict, parsed_json_body).
    """
    if raw is None and json_body is not None:
        raw = json.dumps(json_body).encode("utf-8")
    elif raw is None:
        raw = b""

    h = {}
    if secret is not None:
        h["X-Device-Key"] = secret
    elif "X-Device-Key" not in (headers or {}):
        # Use the current env var as the default secret
        import os
        h["X-Device-Key"] = os.environ.get("DEVICE_SHARED_SECRET", "")
    if headers:
        h.update(headers)

    with _app.test_request_context(
        "/",
        method=method,
        data=raw,
        content_type=content_type,
        headers=h,
    ):
        result = main.ingest(flask.request)

    # result is a tuple: (body_str, status_code, headers_dict)
    body_str, status_code, resp_headers = result
    try:
        parsed = json.loads(body_str)
    except (json.JSONDecodeError, TypeError):
        parsed = body_str
    return status_code, resp_headers, parsed
