"""Tests for the GET /commands command queue endpoint — 12 tests."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import flask
import pytest

from conftest import call, valid_payload
import main

_app = flask.Flask(__name__)


# ---------------------------------------------------------------------------
# Helper: call_cmd — build a GET /commands request with mocked RTDB
# ---------------------------------------------------------------------------

def call_cmd(
    device_id: str = "socket1",
    secret: str | None = None,
    cmd_doc: dict | None = None,   # None → node does not exist
) -> tuple[int, dict, dict]:
    """
    Build a GET /commands test request with a mocked RTDB reference.
    cmd_doc: the dict stored in commands/{device_id} (None = node missing).
    Returns (status_code, response_headers, parsed_json_body).
    """
    import os
    key = secret if secret is not None else os.environ.get("DEVICE_SHARED_SECRET", "")

    # Build a fake RTDB reference that returns cmd_doc when .get() is called
    fake_cmd_ref = MagicMock()
    fake_cmd_ref.get.return_value = cmd_doc  # None = missing, dict = exists

    with _app.test_request_context(
        f"/ingest/commands?device_id={device_id}",
        method="GET",
        headers={"X-Device-Key": key},
    ):
        with patch.object(main, 'db') as mock_db, \
             patch.object(main.RTDBStore, '_init'):
            mock_db.reference.return_value = fake_cmd_ref
            store = main.RTDBStore()
            store._initialized = True
            with patch.object(main, 'get_store', return_value=store):
                result = main.ingest(flask.request)

    body_str, status_code, resp_headers = result
    try:
        parsed = json.loads(body_str)
    except (json.JSONDecodeError, TypeError):
        parsed = body_str
    return status_code, resp_headers, parsed


# ===========================================================================
# CMD-1 – CMD-3: Auth tests
# ===========================================================================

def test_cmd_rejects_missing_key(env):
    """CMD-1: No X-Device-Key → 401."""
    status, _, body = call_cmd(secret="")
    assert status == 401
    assert body["error"] == "unauthorized"


def test_cmd_rejects_wrong_key(env):
    """CMD-2: Wrong key → 401."""
    status, _, body = call_cmd(secret="totally-wrong-key-1234567890abcde")
    assert status == 401


def test_cmd_rejects_unknown_device(env):
    """CMD-3: device_id not in allowlist → 403."""
    status, _, body = call_cmd(device_id="rogue_device")
    assert status == 403


# ===========================================================================
# CMD-4 – CMD-6: No pending command
# ===========================================================================

def test_cmd_returns_null_when_no_doc(env):
    """CMD-4: No node in commands/ → { command: null }."""
    status, _, body = call_cmd(cmd_doc=None)
    assert status == 200
    assert body["command"] is None


def test_cmd_returns_null_for_invalid_command_value(env):
    """CMD-5: Node with invalid command string → null (sanitized)."""
    status, _, body = call_cmd(cmd_doc={"command": "EXPLODE"})
    assert status == 200
    assert body["command"] is None


def test_cmd_returns_null_for_missing_command_field(env):
    """CMD-6: Node exists but has no 'command' key → null."""
    issued_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    status, _, body = call_cmd(cmd_doc={"issued_at": issued_ms})
    assert status == 200
    assert body["command"] is None


# ===========================================================================
# CMD-7 – CMD-9: Valid commands returned
# ===========================================================================

@pytest.mark.parametrize("cmd", ["ON", "OFF", "RESET"])
def test_cmd_returns_valid_commands(env, cmd):
    """CMD-7/8/9: ON / OFF / RESET returned correctly for fresh docs."""
    issued_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    status, _, body = call_cmd(cmd_doc={"command": cmd, "issued_at": issued_ms})
    assert status == 200
    assert body["command"] == cmd


# ===========================================================================
# CMD-10 – CMD-11: TTL expiry
# ===========================================================================

def test_cmd_discards_stale_command(env):
    """CMD-10: Command older than COMMAND_TTL_S (30s) → null (TTL expired)."""
    stale_ms = int((datetime.now(timezone.utc) - timedelta(seconds=60)).timestamp() * 1000)
    status, _, body = call_cmd(cmd_doc={"command": "OFF", "issued_at": stale_ms})
    assert status == 200
    assert body["command"] is None


def test_cmd_accepts_fresh_command(env):
    """CMD-11: Command 5s old → returned (within TTL)."""
    fresh_ms = int((datetime.now(timezone.utc) - timedelta(seconds=5)).timestamp() * 1000)
    status, _, body = call_cmd(cmd_doc={"command": "RESET", "issued_at": fresh_ms})
    assert status == 200
    assert body["command"] == "RESET"


# ===========================================================================
# CMD-12: CORS headers present
# ===========================================================================

def test_cmd_response_has_cors_headers(env):
    """CMD-12: GET /commands response must include CORS headers."""
    status, headers, _ = call_cmd(cmd_doc=None)
    assert status == 200
    assert headers.get("Access-Control-Allow-Origin") == "*"


# ===========================================================================
# Regression: existing POST ingest still works, OPTIONS returns 204
# ===========================================================================

def test_ingest_post_still_works_after_routing(fake_store, env, clock):
    """REG-1: Adding GET /commands route must not break POST telemetry ingest."""
    status, _, body = call(method="POST", json_body=valid_payload(), secret=env)
    assert status == 200
    assert body["status"] == "ok"


def test_options_preflight_returns_204(env):
    """REG-2: OPTIONS preflight (CORS) → 204 with CORS headers."""
    with _app.test_request_context("/", method="OPTIONS"):
        result = main.ingest(flask.request)
    body_str, status_code, headers = result
    assert status_code == 204
    assert headers.get("Access-Control-Allow-Origin") == "*"
