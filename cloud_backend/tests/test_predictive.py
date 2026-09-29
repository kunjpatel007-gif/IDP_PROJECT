"""Tests for Adaptive Predictive Load Protection telemetry fields."""
from __future__ import annotations

import pytest
from conftest import call, valid_payload
import main


def test_accepts_valid_predictive_fields(fake_store, env):
    """Predictive fields: active_appliance, dynamic_threshold, risk_level, degradation_pct, etc."""
    payload = valid_payload(
        active_appliance="Espresso Machine",
        dynamic_threshold=1350.5,
        risk_level=42.0,
        degradation_pct=6.5,
        degradation_alert=False,
        inrush_power=1480.0,
        p_normal=1200.0,
        sigma=35.0,
    )
    status, _, body = call(secret=env, json_body=payload)
    assert status == 200
    assert body["status"] == "ok"
    assert len(fake_store.calls) == 1
    call_entry = fake_store.calls[0]
    assert call_entry["action"] == "written"
    written = call_entry["record"]
    assert written["active_appliance"] == "Espresso Machine"
    assert written["dynamic_threshold"] == 1350.5
    assert written["risk_level"] == 42.0
    assert written["degradation_pct"] == 6.5
    assert written["degradation_alert"] is False
    assert written["inrush_power"] == 1480.0
    assert written["p_normal"] == 1200.0
    assert written["sigma"] == 35.0


def test_accepts_predictive_fields_as_null(fake_store, env):
    """Optional numeric fields can be null or absent when in standby/learning."""
    payload = valid_payload(
        active_appliance="Laptop Charger",
        dynamic_threshold=None,
        risk_level=None,
        degradation_pct=None,
    )
    status, _, body = call(secret=env, json_body=payload)
    assert status == 200
    assert body["status"] == "ok"


def test_rejects_invalid_predictive_number(fake_store, env):
    """Non-finite or string in dynamic_threshold must be rejected."""
    payload = valid_payload(dynamic_threshold="one-thousand")
    status, _, body = call(secret=env, json_body=payload)
    assert status == 400
    assert "dynamic_threshold" in body.get("invalid", {})


def test_rejects_invalid_predictive_bool(fake_store, env):
    """degradation_alert must be a boolean."""
    payload = valid_payload(degradation_alert="yes")
    status, _, body = call(secret=env, json_body=payload)
    assert status == 400
    assert "degradation_alert" in body.get("invalid", {})


def test_rejects_too_long_active_appliance_name(fake_store, env):
    """active_appliance name > 64 chars is rejected."""
    payload = valid_payload(active_appliance="A" * 65)
    status, _, body = call(secret=env, json_body=payload)
    assert status == 400
    assert "active_appliance" in body.get("invalid", {})
