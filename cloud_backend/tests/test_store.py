"""Tests for the RTDB layer (RTDBStore) using unittest.mock."""
from __future__ import annotations

import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import main


# ---------------------------------------------------------------------------
# Test 41: Import needs no credentials
# ---------------------------------------------------------------------------

def test_import_needs_no_credentials():
    """Test 41: Importing main.py must not initialise a Firebase app."""
    # RTDBStore should not initialise firebase_admin until _init() is called.
    store = main.RTDBStore()
    assert not store._initialized


# ---------------------------------------------------------------------------
# Test 42: Document path uses dynamic device_id
# ---------------------------------------------------------------------------

def test_document_path():
    """Test 42: write_if_allowed writes to telemetry/{device_id} path."""
    mock_ref = MagicMock()
    mock_ref.child.return_value.get.return_value = None  # no existing last_seen

    with patch.object(main, 'db') as mock_db, \
         patch.object(main.RTDBStore, '_init'):
        mock_db.reference.return_value = mock_ref
        store = main.RTDBStore()
        store._initialized = True
        now = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        record = {"device_id": "garage_unit_7", "voltage": 230.0}
        store.write_if_allowed("garage_unit_7", record, now, 2.0)

    mock_db.reference.assert_called_with("telemetry/garage_unit_7")


# ---------------------------------------------------------------------------
# Test 43: write_if_allowed writes SERVER_TIMESTAMP when no existing doc
# ---------------------------------------------------------------------------

def test_writes_when_no_existing_doc():
    """Test 43: No existing data → update() called with SERVER_TIMESTAMP."""
    mock_ref = MagicMock()
    mock_ref.child.return_value.get.return_value = None  # no last_seen

    with patch.object(main, 'db') as mock_db, \
         patch.object(main.RTDBStore, '_init'):
        mock_db.reference.return_value = mock_ref
        mock_db.ServerValue.TIMESTAMP = {"SERVER_TIMESTAMP": True}
        store = main.RTDBStore()
        store._initialized = True
        now = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        record = {"device_id": "socket1", "voltage": 230.0}
        result = store.write_if_allowed("socket1", record, now, 2.0)

    assert result is None
    mock_ref.update.assert_called_once()
    written = mock_ref.update.call_args[0][0]
    assert written["last_seen"] == {"SERVER_TIMESTAMP": True}


# ---------------------------------------------------------------------------
# Test 44: Writes after rate-limit window has passed
# ---------------------------------------------------------------------------

def test_writes_after_window():
    """Test 44: last_seen 5s ago, window 2s → update() called, returns None."""
    now = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    last_seen_ms = int((now - timedelta(seconds=5)).timestamp() * 1000)

    mock_ref = MagicMock()
    mock_ref.child.return_value.get.return_value = last_seen_ms

    with patch.object(main, 'db') as mock_db, \
         patch.object(main.RTDBStore, '_init'):
        mock_db.reference.return_value = mock_ref
        mock_db.ServerValue.TIMESTAMP = {"SERVER_TIMESTAMP": True}
        store = main.RTDBStore()
        store._initialized = True
        record = {"device_id": "socket1", "voltage": 230.0}
        result = store.write_if_allowed("socket1", record, now, 2.0)

    assert result is None
    mock_ref.update.assert_called_once()


# ---------------------------------------------------------------------------
# Test 45: Blocks within rate-limit window
# ---------------------------------------------------------------------------

def test_blocks_within_window():
    """Test 45: last_seen 1s ago, window 2s → update() NOT called, returns ~1.0."""
    now = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    last_seen_ms = int((now - timedelta(seconds=1)).timestamp() * 1000)

    mock_ref = MagicMock()
    mock_ref.child.return_value.get.return_value = last_seen_ms

    with patch.object(main, 'db') as mock_db, \
         patch.object(main.RTDBStore, '_init'):
        mock_db.reference.return_value = mock_ref
        store = main.RTDBStore()
        store._initialized = True
        record = {"device_id": "socket1", "voltage": 230.0}
        result = store.write_if_allowed("socket1", record, now, 2.0)

    assert result is not None
    assert abs(result - 1.0) < 0.1
    mock_ref.update.assert_not_called()
