"""SmartAdapter telemetry ingest — Cloud Function (2nd gen, HTTP trigger)."""
from __future__ import annotations

import hmac
import json
import logging
import math
import os
import re
from datetime import datetime, timezone
from typing import Any, Optional

import functions_framework
from google.cloud import firestore

MAX_BODY_BYTES = 2048
MIN_SECRET_LEN = 16
DEVICE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

NULLABLE_SENSOR_FIELDS = ("voltage", "current", "power", "energy", "frequency", "power_factor")
REQUIRED_NUMBER_FIELDS = ("threshold",)
REQUIRED_BOOL_FIELDS = ("tripped", "relay_on")
REQUIRED_FIELDS = ("device_id",) + NULLABLE_SENSOR_FIELDS + REQUIRED_NUMBER_FIELDS + REQUIRED_BOOL_FIELDS
OPTIONAL_STR_FIELDS = {"device_name": 64, "fw_version": 32}
OPTIONAL_INT_FIELDS = ("rssi", "uptime_s", "seq", "free_heap")

log = logging.getLogger("ingest")


class ConfigError(RuntimeError):
    pass


def _now() -> datetime:
    """Injectable clock (tests monkeypatch this)."""
    return datetime.now(timezone.utc)


def _resp(status: int, body: dict, headers: Optional[dict] = None):
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    return json.dumps(body), status, h


def _err(status: int, msg: str, headers: Optional[dict] = None, **extra: Any):
    return _resp(status, {"status": "error", "error": msg, **extra}, headers)


def load_config() -> tuple[str, set[str], float]:
    """Read config at request time (not import time) so tests and redeploys pick up changes."""
    secret = os.environ.get("DEVICE_SHARED_SECRET", "")
    if len(secret) < MIN_SECRET_LEN:
        raise ConfigError("DEVICE_SHARED_SECRET missing or shorter than %d chars" % MIN_SECRET_LEN)
    allowed = {x.strip() for x in os.environ.get("ALLOWED_DEVICE_IDS", "").split(",") if x.strip()}
    if not allowed:
        raise ConfigError("ALLOWED_DEVICE_IDS missing or empty")
    try:
        min_interval = float(os.environ.get("MIN_PUSH_INTERVAL_S", "2.0"))
    except ValueError as exc:
        raise ConfigError("MIN_PUSH_INTERVAL_S is not a number") from exc
    if not math.isfinite(min_interval) or min_interval < 0:
        raise ConfigError("MIN_PUSH_INTERVAL_S must be a finite number >= 0")
    return secret, allowed, min_interval


def _is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _reject_constant(name: str):
    raise ValueError(f"non-finite JSON literal {name} not allowed")


def validate_payload(payload: Any) -> tuple[Optional[dict], Optional[dict]]:
    """Return (record, None) on success or (None, error_body_fields) on failure."""
    if not isinstance(payload, dict):
        return None, {"error": "body must be a JSON object"}
    missing = [f for f in REQUIRED_FIELDS if f not in payload]
    if missing:
        return None, {"error": "missing fields", "missing": missing}

    invalid: dict[str, str] = {}
    device_id = payload["device_id"]
    if not isinstance(device_id, str) or not DEVICE_ID_RE.fullmatch(device_id) or (device_id.startswith("__") and device_id.endswith("__")):
        invalid["device_id"] = "must match ^[A-Za-z0-9_-]{1,64}$ and not be reserved __.*__"
    for f in NULLABLE_SENSOR_FIELDS:
        if payload[f] is not None and not _is_number(payload[f]):
            invalid[f] = "must be a finite number or null"
    for f in REQUIRED_NUMBER_FIELDS:
        if not _is_number(payload[f]):
            invalid[f] = "must be a finite number"
    for f in REQUIRED_BOOL_FIELDS:
        if not isinstance(payload[f], bool):
            invalid[f] = "must be a boolean"
    for f, max_len in OPTIONAL_STR_FIELDS.items():
        if f in payload and not (isinstance(payload[f], str) and len(payload[f]) <= max_len):
            invalid[f] = f"must be a string of at most {max_len} chars"
    for f in OPTIONAL_INT_FIELDS:
        if f in payload and (not isinstance(payload[f], int) or isinstance(payload[f], bool)):
            invalid[f] = "must be an integer"
    if invalid:
        return None, {"error": "invalid fields", "invalid": invalid}

    record = {f: payload[f] for f in REQUIRED_FIELDS}
    for f in (*OPTIONAL_STR_FIELDS, *OPTIONAL_INT_FIELDS):
        if f in payload:
            record[f] = payload[f]
    return record, None


def rate_limit_retry_after(last_seen: Optional[datetime], now: datetime, min_interval: float) -> Optional[float]:
    """Pure decision function. Returns seconds to wait, or None if the write is allowed."""
    if last_seen is None or min_interval <= 0:
        return None
    elapsed = (now - last_seen).total_seconds()
    if elapsed < min_interval:
        # Clamp: small negative elapsed (clock skew) must not produce a wait longer than the window.
        return min(max(min_interval - elapsed, 0.0), min_interval)
    return None


# ---------- Firestore layer ----------

def _txn_body(transaction, doc_ref, record: dict, now: datetime, min_interval: float) -> Optional[float]:
    """Plain function (unit-testable). Wrapped below with firestore.transactional."""
    snap = doc_ref.get(transaction=transaction)
    last_seen = (snap.to_dict() or {}).get("last_seen") if snap.exists else None
    retry = rate_limit_retry_after(last_seen, now, min_interval)
    if retry is not None:
        return retry
    transaction.set(doc_ref, {**record, "last_seen": firestore.SERVER_TIMESTAMP}, merge=True)
    return None


_txn_write = firestore.transactional(_txn_body)


class FirestoreStore:
    def __init__(self, client: Optional[firestore.Client] = None, collection: str = "devices"):
        self._client = client
        self._collection = collection

    @property
    def client(self) -> firestore.Client:
        if self._client is None:  # lazy: importing main.py must not need GCP credentials
            self._client = firestore.Client()
        return self._client

    def write_if_allowed(self, device_id: str, record: dict, now: datetime, min_interval: float) -> Optional[float]:
        doc_ref = self.client.collection(self._collection).document(device_id)
        return _txn_write(self.client.transaction(), doc_ref, record, now, min_interval)


_store: Optional[FirestoreStore] = None


def get_store():
    global _store
    if _store is None:
        _store = FirestoreStore()
    return _store


# ---------- HTTP entry point ----------

@functions_framework.http
def ingest(request):
    if request.method != "POST":
        return _err(405, "method not allowed", {"Allow": "POST"})

    try:
        secret, allowed, min_interval = load_config()
    except ConfigError as exc:
        log.error("config error: %s", exc)
        return _err(500, "server misconfigured")

    provided = request.headers.get("X-Device-Key", "")
    if not hmac.compare_digest(provided.encode("utf-8"), secret.encode("utf-8")):
        log.warning("unauthorized request")
        return _err(401, "unauthorized")

    if (request.mimetype or "").lower() != "application/json":
        return _err(415, "Content-Type must be application/json")

    if request.content_length is not None and request.content_length > MAX_BODY_BYTES:
        return _err(413, "body too large")
    raw = request.get_data(cache=False)
    if len(raw) > MAX_BODY_BYTES:
        return _err(413, "body too large")
    if not raw:
        return _err(400, "empty body")

    try:
        payload = json.loads(raw, parse_constant=_reject_constant)
    except (ValueError, UnicodeDecodeError):
        return _err(400, "invalid JSON")

    record, error = validate_payload(payload)
    if error:
        return _resp(400, {"status": "error", **error})

    device_id = record["device_id"]
    if device_id not in allowed:
        log.warning("device not allowed: %s", device_id)
        return _err(403, "device not allowed")

    try:
        retry = get_store().write_if_allowed(device_id, record, _now(), min_interval)
    except Exception:  # noqa: BLE001 — never leak internals to the client
        log.exception("firestore write failed for %s", device_id)
        return _err(500, "internal error")

    if retry is not None:
        return _err(429, "too many requests",
                    {"Retry-After": str(max(1, math.ceil(retry)))},
                    retry_after_s=round(retry, 2))

    return _resp(200, {"status": "ok"})
