"""Control-plane SQLite database.

One connection guarded by an RLock; WAL for concurrent readers. Every write goes
through ``tx()`` which takes an IMMEDIATE transaction so two requests can never
interleave a read-modify-write cycle.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from typing import Any, Iterator

from . import config
from .util import now_iso

_conn: sqlite3.Connection | None = None
_lock = threading.RLock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL DEFAULT '',
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS bots (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    name                  TEXT NOT NULL,
    telegram_username     TEXT NOT NULL DEFAULT '',
    notes                 TEXT NOT NULL DEFAULT '',
    status                TEXT NOT NULL DEFAULT 'active',
    api_key_hash          TEXT NOT NULL DEFAULT '',
    api_key_prefix        TEXT NOT NULL DEFAULT '',
    key_created_at        TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL,
    last_backup_at        TEXT,
    backup_interval_hours INTEGER NOT NULL DEFAULT 6,
    credits_total         INTEGER NOT NULL DEFAULT 500,
    credits_used          INTEGER NOT NULL DEFAULT 0,
    last_stats_json       TEXT NOT NULL DEFAULT '{}',
    source_mode           TEXT NOT NULL DEFAULT 'push'
);

CREATE TABLE IF NOT EXISTS snapshots (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id          INTEGER NOT NULL,
    created_at      TEXT NOT NULL,
    filename        TEXT NOT NULL,
    size_bytes      INTEGER NOT NULL DEFAULT 0,
    sha256          TEXT NOT NULL DEFAULT '',
    source          TEXT NOT NULL DEFAULT 'agent',
    status          TEXT NOT NULL DEFAULT 'ok',
    verified_at     TEXT,
    row_counts_json TEXT NOT NULL DEFAULT '{}',
    manifest_json   TEXT NOT NULL DEFAULT '{}',
    s3_key          TEXT NOT NULL DEFAULT '',
    local_path      TEXT NOT NULL DEFAULT '',
    error           TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(bot_id) REFERENCES bots(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_snapshots_bot ON snapshots(bot_id, id DESC);

CREATE TABLE IF NOT EXISTS restores (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id      INTEGER NOT NULL,
    snapshot_id INTEGER,
    created_at  TEXT NOT NULL,
    mode        TEXT NOT NULL DEFAULT 'download',
    target      TEXT NOT NULL DEFAULT '',
    note        TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'ready',
    FOREIGN KEY(bot_id) REFERENCES bots(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS training_notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id     INTEGER NOT NULL,
    title      TEXT NOT NULL DEFAULT '',
    content    TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY(bot_id) REFERENCES bots(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pending_changes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id      INTEGER NOT NULL,
    created_at  TEXT NOT NULL,
    sql         TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'pending',
    applied_at  TEXT,
    FOREIGN KEY(bot_id) REFERENCES bots(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_changes_bot ON pending_changes(bot_id, status, id);

CREATE TABLE IF NOT EXISTS ai_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id     INTEGER NOT NULL,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(bot_id) REFERENCES bots(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id     INTEGER,
    kind       TEXT NOT NULL,
    message    TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC);

CREATE TABLE IF NOT EXISTS app_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);
"""


def connect() -> sqlite3.Connection:
    global _conn
    if _conn is not None:
        return _conn
    config.ensure_dirs()
    conn = sqlite3.connect(str(config.CONTROL_DB), check_same_thread=False, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    _conn = conn
    return conn


def init_db() -> None:
    config.ensure_dirs()
    with _lock:
        conn = connect()
        conn.executescript(SCHEMA)
        conn.commit()
        _migrate(conn)


def _migrate(conn: sqlite3.Connection) -> None:
    def cols(table: str) -> set[str]:
        return {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}

    bot_cols = cols("bots")
    for name, ddl in {
        "last_stats_json": "ALTER TABLE bots ADD COLUMN last_stats_json TEXT NOT NULL DEFAULT '{}'",
        "backup_interval_hours": "ALTER TABLE bots ADD COLUMN backup_interval_hours INTEGER NOT NULL DEFAULT 6",
        "credits_total": "ALTER TABLE bots ADD COLUMN credits_total INTEGER NOT NULL DEFAULT 500",
        "credits_used": "ALTER TABLE bots ADD COLUMN credits_used INTEGER NOT NULL DEFAULT 0",
        "source_mode": "ALTER TABLE bots ADD COLUMN source_mode TEXT NOT NULL DEFAULT 'push'",
    }.items():
        if name not in bot_cols:
            conn.execute(ddl)
    snap_cols = cols("snapshots")
    for name, ddl in {
        "manifest_json": "ALTER TABLE snapshots ADD COLUMN manifest_json TEXT NOT NULL DEFAULT '{}'",
        "error": "ALTER TABLE snapshots ADD COLUMN error TEXT NOT NULL DEFAULT ''",
    }.items():
        if name not in snap_cols:
            conn.execute(ddl)
    conn.commit()


@contextmanager
def read() -> Iterator[sqlite3.Connection]:
    with _lock:
        yield connect()


@contextmanager
def tx() -> Iterator[sqlite3.Connection]:
    with _lock:
        conn = connect()
        conn.execute("BEGIN IMMEDIATE")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise


def rows(sql: str, params: tuple | list = ()) -> list[dict[str, Any]]:
    with read() as conn:
        cur = conn.execute(sql, tuple(params))
        return [dict(r) for r in cur.fetchall()]


def row(sql: str, params: tuple | list = ()) -> dict[str, Any] | None:
    with read() as conn:
        cur = conn.execute(sql, tuple(params))
        found = cur.fetchone()
        return dict(found) if found is not None else None


def scalar(sql: str, params: tuple | list = (), default: Any = None) -> Any:
    found = row(sql, params)
    if not found:
        return default
    return next(iter(found.values()), default)


def insert(sql: str, params: tuple | list = ()) -> int:
    with tx() as conn:
        cur = conn.execute(sql, tuple(params))
        return int(cur.lastrowid)


def execute(sql: str, params: tuple | list = ()) -> int:
    with tx() as conn:
        cur = conn.execute(sql, tuple(params))
        return cur.rowcount


def executemany(sql: str, seq: list[tuple]) -> None:
    with tx() as conn:
        conn.executemany(sql, seq)


# --------------------------------------------------------------------------
# app settings (control plane only; bot settings live in the bot's own DB)
# --------------------------------------------------------------------------
def get_setting(key: str, default: str = "") -> str:
    with read() as conn:
        cur = conn.execute("SELECT value FROM app_settings WHERE key=?", (key,))
        found = cur.fetchone()
        return found["value"] if found is not None else default


def set_setting(key: str, value: str) -> None:
    with tx() as conn:
        conn.execute(
            "INSERT INTO app_settings(key, value, updated_at) VALUES (?,?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
            (key, str(value), now_iso()),
        )


def all_settings() -> dict[str, str]:
    with read() as conn:
        return {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM app_settings")}


def add_event(kind: str, message: str, bot_id: int | None = None) -> None:
    try:
        insert(
            "INSERT INTO events(bot_id, kind, message, created_at) VALUES (?,?,?,?)",
            (bot_id, kind, message[:1000], now_iso()),
        )
    except Exception:
        pass


def json_load(value: str | None, default: Any) -> Any:
    try:
        return json.loads(value or "")
    except (TypeError, ValueError):
        return default
