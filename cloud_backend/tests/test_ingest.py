"""Tests for the ingest Cloud Function handler — 36 handler tests + 4 pure-function tests."""
from __future__ import annotations

import json
import os
import secrets as secrets_mod
from datetime import datetime, timezone, timedelta
from unittest.mock import patch

import pytest

# Import helpers from conftest
from conftest import call, valid_payload

import main


# ===========================================================================
# 1–4: Method and Auth Tests
# ===========================================================================

@pytest.mark.parametrize("method", ["PUT", "DELETE", "PATCH"])
def test_rejects_non_post_methods(fake_store, env, method):
    """Test 1: Only POST (and GET /commands) is accepted; PUT/DELETE/PATCH are rejected."""
    status, headers, body = call(method=method, json_body=valid_payload(), secret=env)
    assert status == 405
    assert "POST" in headers.get("Allow", "")
    assert len(fake_store.calls) == 0


def test_rejects_missing_auth_header(fake_store):
    """Test 2: No X-Device-Key header → 401."""
    status, _, body = call(headers={"X-Device-Key": ""}, json_body=valid_payload())
    assert status == 401
    assert body["error"] == "unauthorized"


def test_rejects_wrong_auth_key(fake_store, env):
    """Test 3: Wrong shared secret → 401."""
    status, _, body = call(secret="totally-wrong-key-1234567890", json_body=valid_payload())
    assert status == 401


def test_rejects_key_with_right_prefix(fake_store, env):
    """Test 4: Secret minus last char / plus extra char → 401."""
    status1, _, _ = call(secret=env[:-1], json_body=valid_payload())
    assert status1 == 401
    status2, _, _ = call(secret=env + "x", json_body=valid_payload())
    assert status2 == 401


# ===========================================================================
# 5–8: Fail-closed config tests
# ===========================================================================

def test_fails_closed_when_secret_unset(fake_store, monkeypatch):
    """Test 5: Missing DEVICE_SHARED_SECRET → 500, store not called."""
    monkeypatch.delenv("DEVICE_SHARED_SECRET", raising=False)
    status, _, body = call(headers={"X-Device-Key": ""}, json_body=valid_payload())
    assert status == 500
    assert body["error"] == "server misconfigured"
    assert len(fake_store.calls) == 0


def test_fails_closed_when_secret_too_short(fake_store, monkeypatch):
    """Test 6: Secret shorter than MIN_SECRET_LEN → 500."""
    monkeypatch.setenv("DEVICE_SHARED_SECRET", "short")
    status, _, body = call(secret="short", json_body=valid_payload())
    assert status == 500
    assert body["error"] == "server misconfigured"


def test_fails_closed_when_allowlist_unset(fake_store, monkeypatch):
    """Test 7: Missing ALLOWED_DEVICE_IDS → 500."""
    monkeypatch.delenv("ALLOWED_DEVICE_IDS", raising=False)
    status, _, body = call(json_body=valid_payload())
    assert status == 500


@pytest.mark.parametrize("val", ["abc", "-1", "nan"])
def test_fails_closed_when_min_interval_invalid(fake_store, monkeypatch, val):
    """Test 8: Invalid MIN_PUSH_INTERVAL_S → 500."""
    monkeypatch.setenv("MIN_PUSH_INTERVAL_S", val)
    status, _, body = call(json_body=valid_payload())
    assert status == 500


# ===========================================================================
# 9–10: Secret handling tests
# ===========================================================================

def test_uses_constant_time_compare(fake_store, env):
    """Test 9: Verify hmac.compare_digest is actually called."""
    with patch("main.hmac.compare_digest", wraps=main.hmac.compare_digest) as spy:
        call(secret=env, json_body=valid_payload())
        assert spy.call_count == 1


def test_secret_read_from_env_not_hardcoded(fake_store, monkeypatch):
    """Test 10: Old secret → 401; new random secret → 200."""
    old_secret = secrets_mod.token_urlsafe(32)
    monkeypatch.setenv("DEVICE_SHARED_SECRET", old_secret)
    status1, _, _ = call(secret="wrong-key-definitely-not-this", json_body=valid_payload())
    assert status1 == 401

    new_secret = secrets_mod.token_urlsafe(32)
    monkeypatch.setenv("DEVICE_SHARED_SECRET", new_secret)
    status2, _, _ = call(secret=new_secret, json_body=valid_payload())
    assert status2 == 200


# ===========================================================================
# 11–17: Content-type, size, and JSON parsing tests
# ===========================================================================

def test_rejects_wrong_content_type(fake_store, env):
    """Test 11: text/plain → 415."""
    status, _, body = call(secret=env, content_type="text/plain", raw=b'{"device_id":"socket1"}')
    assert status == 415


def test_accepts_content_type_with_charset(fake_store, env, clock):
    """Test 12: application/json; charset=utf-8 → 200."""
    status, _, _ = call(
        secret=env,
        content_type="application/json; charset=utf-8",
        json_body=valid_payload(),
    )
    assert status == 200


def test_rejects_oversized_body(fake_store, env):
    """Test 13: Body > 2048 bytes → 413."""
    big = json.dumps({"device_id": "socket1", "padding": "x" * 3000}).encode("utf-8")
    status, _, body = call(secret=env, raw=big)
    assert status == 413


def test_rejects_empty_body(fake_store, env):
    """Test 14: Empty body → 400."""
    status, _, body = call(secret=env, raw=b"")
    assert status == 400


def test_rejects_malformed_json(fake_store, env):
    """Test 15: Broken JSON → 400."""
    status, _, body = call(secret=env, raw=b"{not json at all")
    assert status == 400
    assert body["error"] == "invalid JSON"


def test_rejects_nan_and_infinity_literals(fake_store, env):
    """Test 16: NaN/Infinity JSON literals → 400."""
    for literal in [b'{"voltage": NaN}', b'{"voltage": Infinity}', b'{"voltage": -Infinity}']:
        status, _, body = call(secret=env, raw=literal)
        assert status == 400


@pytest.mark.parametrize("raw", [b"[]", b'"x"', b"null", b"42"])
def test_rejects_non_object_json(fake_store, env, raw):
    """Test 17: Non-object JSON → 400."""
    status, _, body = call(secret=env, raw=raw)
    assert status == 400


# ===========================================================================
# 18–26: Payload validation tests
# ===========================================================================

@pytest.mark.parametrize("field", list(main.REQUIRED_FIELDS))
def test_missing_fields_are_listed(fake_store, env, field):
    """Test 18: Removing each required field → 400 with field listed in 'missing'."""
    payload = valid_payload()
    del payload[field]
    status, _, body = call(secret=env, json_body=payload)
    assert status == 400
    assert field in body.get("missing", [])


@pytest.mark.parametrize("bad_id", [
    "",          # empty
    "a/b",       # path separator
    "..",         # reserved
    "__x__",     # Firestore reserved
    "x" * 65,    # over length
    "émoji",     # non-ASCII
    123,         # not a string
])
def test_rejects_bad_device_ids(fake_store, env, bad_id):
    """Test 19: Invalid device_id formats → 400."""
    status, _, body = call(secret=env, json_body=valid_payload(device_id=bad_id))
    assert status == 400
    assert "invalid" in body.get("error", "") or "missing" in body.get("error", "")


def test_rejects_bool_as_number(fake_store, env):
    """Test 20: voltage: true → 400 (bool is not a number)."""
    status, _, body = call(secret=env, json_body=valid_payload(voltage=True))
    assert status == 400
    assert "voltage" in body.get("invalid", {})


def test_rejects_string_as_number(fake_store, env):
    """Test 21: power: "12" → 400."""
    status, _, body = call(secret=env, json_body=valid_payload(power="12"))
    assert status == 400
    assert "power" in body.get("invalid", {})


def test_rejects_number_as_bool(fake_store, env):
    """Test 22: tripped: 1 → 400."""
    status, _, body = call(secret=env, json_body=valid_payload(tripped=1))
    assert status == 400
    assert "tripped" in body.get("invalid", {})


def test_accepts_null_sensor_values(fake_store, env, clock):
    """Test 23: All six sensor fields as null → 200, nulls stored."""
    payload = valid_payload(
        voltage=None, current=None, power=None,
        energy=None, frequency=None, power_factor=None,
    )
    status, _, _ = call(secret=env, json_body=payload)
    assert status == 200
    assert len(fake_store.calls) == 1
    record = fake_store.calls[0]["record"]
    for f in main.NULLABLE_SENSOR_FIELDS:
        assert record[f] is None


def test_rejects_null_threshold(fake_store, env):
    """Test 24: threshold: null → 400."""
    status, _, body = call(secret=env, json_body=valid_payload(threshold=None))
    assert status == 400
    assert "threshold" in body.get("invalid", {})


@pytest.mark.parametrize("field,bad_value", [
    ("rssi", "x"),
    ("seq", True),
    ("device_name", "x" * 65),
])
def test_optional_field_types(fake_store, env, field, bad_value):
    """Test 25: Invalid optional field types → 400."""
    status, _, body = call(secret=env, json_body=valid_payload(**{field: bad_value}))
    assert status == 400
    assert field in body.get("invalid", {})


def test_unknown_fields_are_dropped(fake_store, env, clock):
    """Test 26: Extra fields → 200, but not stored."""
    status, _, _ = call(secret=env, json_body=valid_payload(evil="injection"))
    assert status == 200
    record = fake_store.calls[0]["record"]
    assert "evil" not in record


# ===========================================================================
# 27–29: Allow-list and dynamic ID tests
# ===========================================================================

def test_rejects_device_not_in_allowlist(fake_store, env):
    """Test 27: Unknown device → 403, store not called."""
    status, _, body = call(secret=env, json_body=valid_payload(device_id="rogue_device"))
    assert status == 403
    assert len(fake_store.calls) == 0


def test_accepts_valid_full_payload(fake_store, env, clock):
    """Test 28: Complete valid payload → 200, store called once."""
    status, _, body = call(secret=env, json_body=valid_payload())
    assert status == 200
    assert body["status"] == "ok"
    assert len(fake_store.calls) == 1
    assert fake_store.calls[0]["action"] == "written"


def test_device_id_not_hardcoded(fake_store, env, clock):
    """Test 29: garage_unit_7 → store called with that exact ID."""
    status, _, _ = call(secret=env, json_body=valid_payload(device_id="garage_unit_7"))
    assert status == 200
    assert fake_store.calls[0]["record"]["device_id"] == "garage_unit_7"


# ===========================================================================
# 30–34: Rate limiting tests
# ===========================================================================

def test_rate_limit_rejects_rapid_requests(fake_store, env, clock):
    """Test 30: Two requests 1s apart → second gets 429."""
    call(secret=env, json_body=valid_payload())
    clock.advance(1.0)
    status, headers, body = call(secret=env, json_body=valid_payload())
    assert status == 429
    assert "Retry-After" in headers
    assert int(headers["Retry-After"]) >= 1


def test_rate_limit_boundary(fake_store, env, clock):
    """Test 31: Two requests exactly 2.0s apart → both 200."""
    status1, _, _ = call(secret=env, json_body=valid_payload())
    assert status1 == 200
    clock.advance(2.0)
    status2, _, _ = call(secret=env, json_body=valid_payload())
    assert status2 == 200


def test_rate_limit_allows_after_cooldown(fake_store, env, clock):
    """Test 32: Two requests 5s apart → both 200."""
    call(secret=env, json_body=valid_payload())
    clock.advance(5.0)
    status, _, _ = call(secret=env, json_body=valid_payload())
    assert status == 200


def test_rate_limit_is_per_device(fake_store, env, clock):
    """Test 33: Rapid requests for socket1 AND socket2 → both 200."""
    status1, _, _ = call(secret=env, json_body=valid_payload(device_id="socket1"))
    status2, _, _ = call(secret=env, json_body=valid_payload(device_id="socket2"))
    assert status1 == 200
    assert status2 == 200


def test_rate_limit_disabled_when_zero(fake_store, env, clock, monkeypatch):
    """Test 34: MIN_PUSH_INTERVAL_S=0 → rapid requests both succeed."""
    monkeypatch.setenv("MIN_PUSH_INTERVAL_S", "0")
    status1, _, _ = call(secret=env, json_body=valid_payload())
    status2, _, _ = call(secret=env, json_body=valid_payload())
    assert status1 == 200
    assert status2 == 200


# ===========================================================================
# 35–36: Error handling and security hygiene
# ===========================================================================

def test_store_exception_returns_generic_500(fake_store, env):
    """Test 35: Store exception → 500 with no stack trace leaked."""
    fake_store.raise_on_write = RuntimeError("database on fire")
    status, _, body = call(secret=env, json_body=valid_payload())
    assert status == 500
    assert body["error"] == "internal error"
    assert "database" not in json.dumps(body)
    assert "fire" not in json.dumps(body)


def test_key_never_logged(fake_store, env, caplog, clock):
    """Test 36: Secret string must not appear in any log records."""
    import logging
    with caplog.at_level(logging.DEBUG, logger="ingest"):
        # Trigger both 401 and 200 paths
        call(secret="wrong-key-that-is-long-enough", json_body=valid_payload())
        call(secret=env, json_body=valid_payload())
    for record in caplog.records:
        assert env not in record.getMessage()


# ===========================================================================
# 37–40: Pure function tests (rate_limit_retry_after)
# ===========================================================================

def test_retry_after_none_when_no_last_seen():
    """Test 37: No previous write → None (allow)."""
    result = main.rate_limit_retry_after(None, datetime.now(timezone.utc), 2.0)
    assert result is None


def test_retry_after_value():
    """Test 38: elapsed 0.5s, window 2.0 → returns 1.5."""
    now = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    last = now - timedelta(seconds=0.5)
    result = main.rate_limit_retry_after(last, now, 2.0)
    assert result is not None
    assert abs(result - 1.5) < 0.01


def test_retry_after_clamped_on_clock_skew():
    """Test 39: last_seen 1s in the future → clamped to window (2.0), not 3.0."""
    now = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    last = now + timedelta(seconds=1)  # clock skew: last_seen is in the future
    result = main.rate_limit_retry_after(last, now, 2.0)
    assert result is not None
    assert result <= 2.0


def test_retry_after_works_with_aware_datetimes():
    """Test 40: Using timezone-aware datetimes must not raise TypeError."""
    now = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    last = now - timedelta(seconds=5)
    result = main.rate_limit_retry_after(last, now, 2.0)
    assert result is None  # 5s > 2s window, so allowed
