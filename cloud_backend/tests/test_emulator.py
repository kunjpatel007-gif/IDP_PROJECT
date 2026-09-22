"""Optional emulator-based tests — skipped unless RTDB_EMULATOR_HOST is set.

To run:
    firebase emulators:start --only database
    set RTDB_EMULATOR_HOST=localhost:9000
    pytest tests/test_emulator.py -v
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from datetime import datetime, timezone

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import main

pytest.importorskip("firebase_admin")

pytestmark = pytest.mark.skipif(
    not os.environ.get("RTDB_EMULATOR_HOST"),
    reason="RTDB_EMULATOR_HOST not set — skipping emulator tests",
)


@pytest.fixture
def rtdb_store(tmp_path):
    """Create a real RTDBStore pointing at the local emulator."""
    import firebase_admin
    from firebase_admin import db

    emulator_host = os.environ["RTDB_EMULATOR_HOST"]
    db_url = f"http://{emulator_host}?ns=test-project"

    try:
        app = firebase_admin.get_app("emulator_test")
    except ValueError:
        app = firebase_admin.initialize_app(
            options={"databaseURL": db_url},
            name="emulator_test",
        )

    # Use a unique collection per test run to avoid bleed-over
    collection = f"telemetry_test_{os.getpid()}"
    store = main.RTDBStore(collection=collection)
    store._initialized = True
    yield store

    # Cleanup: delete the test node
    db.reference(collection, app=app).delete()


def test_emulator_write_and_rate_limit(rtdb_store, clock):
    """Emulator: write succeeds, then rate-limits within the window."""
    now = clock.now
    record = {"device_id": "socket1", "voltage": 230.0, "power": 500.0}

    result = rtdb_store.write_if_allowed("socket1", record, now, 2.0)
    assert result is None  # first write succeeds

    clock.advance(1.0)
    result = rtdb_store.write_if_allowed("socket1", record, clock.now, 2.0)
    assert result is not None  # within window, blocked

    clock.advance(2.0)
    result = rtdb_store.write_if_allowed("socket1", record, clock.now, 2.0)
    assert result is None  # window passed, write succeeds again
