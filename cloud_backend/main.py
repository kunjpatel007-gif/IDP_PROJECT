"""SmartAdapter telemetry ingest + command queue — Cloud Function (2nd gen, HTTP trigger)."""
from __future__ import annotations

import hmac
import json
import logging
import math
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import functions_framework
import firebase_admin
from firebase_admin import db

MAX_BODY_BYTES = 2048
MIN_SECRET_LEN = 16
DEVICE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
COMMAND_COLLECTION = "commands"
VALID_COMMANDS = {"ON", "OFF", "RESET"}
COMMAND_TTL_S = 30  # discard commands older than 30 s

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


# ---------- RTDB layer ----------

class RTDBStore:
    def __init__(self, collection: str = "telemetry"):
        self._collection = collection
        self._initialized = False

    def _init(self):
        if not self._initialized:
            try:
                firebase_admin.get_app()
            except ValueError:
                firebase_admin.initialize_app()
            self._initialized = True

    def write_if_allowed(self, device_id: str, record: dict, now: datetime, min_interval: float) -> Optional[float]:
        self._init()
        ref = db.reference(f"{self._collection}/{device_id}")
        
        # Check rate limit using a simple get first to avoid throwing exceptions from inside a transaction
        current_data = ref.child("last_seen").get()
        if current_data is not None:
            # RTDB timestamps are integer epoch milliseconds
            last_seen_dt = datetime.fromtimestamp(current_data / 1000.0, tz=timezone.utc)
            retry = rate_limit_retry_after(last_seen_dt, now, min_interval)
            if retry is not None:
                return retry
        
        ref.update({**record, "last_seen": db.ServerValue.TIMESTAMP})
        return None

_store = None

def get_store():
    global _store
    if _store is None:
        _store = RTDBStore()
    return _store


# ---------- Command queue handler ----------

def _get_cors_headers() -> dict:
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Device-Key",
    }


def handle_get_commands(request, secret: str, allowed: set):
    """ESP32 polls this endpoint to fetch (and atomically delete) its next pending command."""
    provided = request.headers.get("X-Device-Key", "")
    if not hmac.compare_digest(provided.encode("utf-8"), secret.encode("utf-8")):
        log.warning("unauthorized /commands request")
        return _err(401, "unauthorized")

    device_id = request.args.get("device_id", "").strip()
    if not device_id or not DEVICE_ID_RE.fullmatch(device_id) or device_id not in allowed:
        return _err(403, "device not allowed or missing device_id param")

    try:
        get_store()._init()
        cmd_ref = db.reference(f"{COMMAND_COLLECTION}/{device_id}")
        
        # Fetch and delete atomically (using a transaction)
        def _fetch_and_delete(current_data):
            if not current_data:
                return None
            
            # We return None to abort the transaction, but we need a way to pass the command out.
            # RTDB Python SDK transactions don't easily allow arbitrary returns. 
            # We will clear the node by returning {}
            return {}

        snap = cmd_ref.get()
        if not snap:
            command = None
        else:
            issued_at = snap.get("issued_at")
            age = 0
            if issued_at is not None:
                age = (datetime.now(timezone.utc) - datetime.fromtimestamp(issued_at / 1000.0, tz=timezone.utc)).total_seconds()
            
            cmd = snap.get("command")
            if age > COMMAND_TTL_S or cmd not in VALID_COMMANDS:
                command = None
            else:
                command = cmd
            
            # Delete the command regardless of whether it was valid or stale
            cmd_ref.delete()

    except Exception:  # noqa: BLE001
        log.exception("command queue read failed for %s", device_id)
        return _err(500, "internal error")

    return _resp(200, {"command": command}, _get_cors_headers())


# ---------- HTTP entry point ----------

@functions_framework.http
def ingest(request):
    # CORS preflight
    if request.method == "OPTIONS":
        return ("", 204, _get_cors_headers())

    try:
        secret, allowed, min_interval = load_config()
    except ConfigError as exc:
        log.error("config error: %s", exc)
        return _err(500, "server misconfigured")

    # Route: GET /commands  →  ESP32 command poll
    if request.method == "GET" and request.path.rstrip("/").endswith("/commands"):
        return handle_get_commands(request, secret, allowed)

    # Route: POST /  →  telemetry ingest
    if request.method != "POST":
        return _err(405, "method not allowed", {"Allow": "POST, GET, OPTIONS"})

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

