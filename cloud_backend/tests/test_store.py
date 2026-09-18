"""Tests for the Firestore layer (FirestoreStore + _txn_body) using unittest.mock."""
from __future__ import annotations

import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch, call as mock_call

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import main
from google.cloud import firestore


# ---------------------------------------------------------------------------
# Test 41: Import needs no credentials
# ---------------------------------------------------------------------------

def test_import_needs_no_credentials():
    """Test 41: Importing main.py must not instantiate a Firestore client."""
    # If we got here, the import at the top already succeeded without credentials.
    # Additionally, verify that get_store() with _store=None doesn't eagerly create a client.
    with patch.object(firestore, "Client", side_effect=RuntimeError("should not be called")):
        store = main.FirestoreStore()
        # Accessing .client would raise, but just constructing the store should not.
        assert store._client is None


# ---------------------------------------------------------------------------
# Test 42: Document path uses dynamic device_id
# ---------------------------------------------------------------------------

def test_document_path():
    """Test 42: write_if_allowed('garage_unit_7') → collection('devices').document('garage_unit_7')."""
    mock_client = MagicMock()
    mock_txn = MagicMock()
    mock_client.transaction.return_value = mock_txn
    mock_doc_ref = MagicMock()
    mock_client.collection.return_value.document.return_value = mock_doc_ref
    # Mock the snapshot to indicate no existing doc
    mock_snap = MagicMock()
    mock_snap.exists = False
    mock_doc_ref.get.return_value = mock_snap

    store = main.FirestoreStore(client=mock_client)
    now = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    record = {"device_id": "garage_unit_7", "voltage": 230.0}

    with patch.object(main, "_txn_write", wraps=main._txn_body):
        store.write_if_allowed("garage_unit_7", record, now, 2.0)

    mock_client.collection.assert_called_with("devices")
    mock_client.collection.return_value.document.assert_called_with("garage_unit_7")


# ---------------------------------------------------------------------------
# Test 43: _txn_body writes with SERVER_TIMESTAMP when no doc exists
# ---------------------------------------------------------------------------

def test_txn_body_writes_when_no_doc():
    """Test 43: No existing doc → set() called, last_seen is SERVER_TIMESTAMP."""
    mock_txn = MagicMock()
    mock_doc_ref = MagicMock()
    mock_snap = MagicMock()
    mock_snap.exists = False
    mock_doc_ref.get.return_value = mock_snap

    now = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    record = {"device_id": "socket1", "voltage": 230.0}

    result = main._txn_body(mock_txn, mock_doc_ref, record, now, 2.0)

    assert result is None  # write succeeded
    mock_txn.set.assert_called_once()
    written_data = mock_txn.set.call_args[0][1]
    assert written_data["last_seen"] is firestore.SERVER_TIMESTAMP
    assert written_data["device_id"] == "socket1"


# ---------------------------------------------------------------------------
# Test 44: _txn_body writes after rate-limit window
# ---------------------------------------------------------------------------

def test_txn_body_writes_after_window():
    """Test 44: last_seen = now - 5s, window = 2s → set() called, returns None."""
    mock_txn = MagicMock()
    mock_doc_ref = MagicMock()
    mock_snap = MagicMock()
    mock_snap.exists = True
    now = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    mock_snap.to_dict.return_value = {"last_seen": now - timedelta(seconds=5)}
    mock_doc_ref.get.return_value = mock_snap

    record = {"device_id": "socket1", "voltage": 230.0}
    result = main._txn_body(mock_txn, mock_doc_ref, record, now, 2.0)

    assert result is None
    mock_txn.set.assert_called_once()


# ---------------------------------------------------------------------------
# Test 45: _txn_body blocks within rate-limit window
# ---------------------------------------------------------------------------

def test_txn_body_blocks_within_window():
    """Test 45: last_seen = now - 1s, window = 2s → set() NOT called, returns ~1.0."""
    mock_txn = MagicMock()
    mock_doc_ref = MagicMock()
    mock_snap = MagicMock()
    mock_snap.exists = True
    now = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    mock_snap.to_dict.return_value = {"last_seen": now - timedelta(seconds=1)}
    mock_doc_ref.get.return_value = mock_snap

    record = {"device_id": "socket1", "voltage": 230.0}
    result = main._txn_body(mock_txn, mock_doc_ref, record, now, 2.0)

    assert result is not None
    assert abs(result - 1.0) < 0.1
    mock_txn.set.assert_not_called()


# ---------------------------------------------------------------------------
# Test 46: _txn_body reads inside the transaction
# ---------------------------------------------------------------------------

def test_txn_body_reads_inside_transaction():
    """Test 46: doc_ref.get() is called with transaction=txn."""
    mock_txn = MagicMock()
    mock_doc_ref = MagicMock()
    mock_snap = MagicMock()
    mock_snap.exists = False
    mock_doc_ref.get.return_value = mock_snap

    now = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    main._txn_body(mock_txn, mock_doc_ref, {"device_id": "x"}, now, 2.0)

    mock_doc_ref.get.assert_called_once_with(transaction=mock_txn)


# ---------------------------------------------------------------------------
# Test 47: _txn_body handles doc without last_seen field
# ---------------------------------------------------------------------------

def test_txn_body_handles_doc_without_last_seen():
    """Test 47: Existing doc but no last_seen field → set() called."""
    mock_txn = MagicMock()
    mock_doc_ref = MagicMock()
    mock_snap = MagicMock()
    mock_snap.exists = True
    mock_snap.to_dict.return_value = {"voltage": 220.0}  # no last_seen
    mock_doc_ref.get.return_value = mock_snap

    now = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    result = main._txn_body(mock_txn, mock_doc_ref, {"device_id": "x"}, now, 2.0)

    assert result is None
    mock_txn.set.assert_called_once()
