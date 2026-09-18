"""Optional emulator-based tests — skipped unless FIRESTORE_EMULATOR_HOST is set.

To run:
    gcloud emulators firestore start --host-port=localhost:8085
    set FIRESTORE_EMULATOR_HOST=localhost:8085
    pytest tests/test_emulator.py -v
"""
from __future__ import annotations

import os
import sys
import threading
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST"),
    reason="FIRESTORE_EMULATOR_HOST not set — skipping emulator tests",
)


@pytest.fixture
def store():
    """Create a real FirestoreStore pointing at the emulator with a unique collection."""
    import main
    from google.cloud import firestore

    client = firestore.Client(project="test-project")
    # Use a unique collection per test run to avoid interference
    import secrets as s
    collection = f"test_devices_{s.token_hex(4)}"
    return main.FirestoreStore(client=client, collection=collection)


def test_real_upsert_creates_document(store):
    """Test 48: Document is created with fields + server last_seen."""
    now = datetime.now(timezone.utc)
    record = {
        "device_id": "socket1",
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
    result = store.write_if_allowed("socket1", record, now, 2.0)
    assert result is None  # write succeeded

    # Read it back
    doc = store.client.collection(store._collection).document("socket1").get()
    assert doc.exists
    data = doc.to_dict()
    assert data["voltage"] == 230.1
    assert "last_seen" in data


def test_real_rate_limit(store):
    """Test 49: Second write within 2s → returns retry value."""
    now = datetime.now(timezone.utc)
    record = {"device_id": "socket1", "voltage": 230.0, "threshold": 1500.0,
              "tripped": False, "relay_on": True, "current": 1.0, "power": 230.0,
              "energy": 1.0, "frequency": 50.0, "power_factor": 0.99}
    result1 = store.write_if_allowed("socket1", record, now, 2.0)
    assert result1 is None

    # Second write 0.5s later
    result2 = store.write_if_allowed("socket1", record, now + timedelta(seconds=0.5), 2.0)
    assert result2 is not None
    assert result2 > 0


def test_concurrent_writes_only_one_wins(store):
    """Test 50: Two threads writing for the same device — exactly one gets rate-limited."""
    now = datetime.now(timezone.utc)
    record = {"device_id": "socket1", "voltage": 230.0, "threshold": 1500.0,
              "tripped": False, "relay_on": True, "current": 1.0, "power": 230.0,
              "energy": 1.0, "frequency": 50.0, "power_factor": 0.99}

    # First write to establish the document
    store.write_if_allowed("socket1", record, now - timedelta(seconds=10), 2.0)

    barrier = threading.Barrier(2, timeout=5)
    results = [None, None]

    def writer(idx):
        barrier.wait()
        results[idx] = store.write_if_allowed("socket1", record, now, 2.0)

    t1 = threading.Thread(target=writer, args=(0,))
    t2 = threading.Thread(target=writer, args=(1,))
    t1.start()
    t2.start()
    t1.join(timeout=10)
    t2.join(timeout=10)

    # Exactly one should succeed (None) and one should be rate-limited (float)
    nones = [r for r in results if r is None]
    retries = [r for r in results if r is not None]
    assert len(nones) == 1, f"Expected exactly 1 success, got {len(nones)}: {results}"
    assert len(retries) == 1, f"Expected exactly 1 retry, got {len(retries)}: {results}"
