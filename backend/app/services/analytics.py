"""Read-only analytics over the latest SMARTEL snapshot."""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .. import db
from ..util import last_days, now, now_iso, parse_iso
from .backup import main_db_path

log = logging.getLogger("control.analytics")


def _connect(bot_id: int) -> sqlite3.Connection | None:
    path = main_db_path(bot_id)
    if path is None:
        return None
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=10)
        conn.row_factory = sqlite3.Row
        return conn
    except sqlite3.Error as exc:
        log.warning("could not open workspace db for bot %s: %s", bot_id, exc)
        return None


def _tables(conn: sqlite3.Connection) -> set[str]:
    return {r["name"] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}


def _scalar(conn: sqlite3.Connection, sql: str, params: tuple = (), default: int = 0) -> int:
    try:
        row = conn.execute(sql, params).fetchone()
        return int(row[0]) if row and row[0] is not None else default
    except sqlite3.Error:
        return default


def _rows(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    try:
        return [dict(r) for r in conn.execute(sql, params).fetchall()]
    except sqlite3.Error:
        return []


def _settings(conn: sqlite3.Connection, tables: set[str]) -> dict[str, str]:
    if "settings" not in tables:
        return {}
    return {str(r["key"]): str(r["value"] or "") for r in conn.execute("SELECT key, value FROM settings")}


def _bool(settings: dict[str, str], key: str, default: bool = False) -> bool:
    raw = settings.get(key)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _tenant_zero(settings: dict[str, str], key: str) -> str:
    return settings.get(key, settings.get(f"0:{key}", ""))


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _series(conn: sqlite3.Connection, tables: set[str], days: int = 30) -> list[dict[str, Any]]:
    dates = last_days(days)
    start = dates[0]
    incoming: dict[str, int] = {}
    outgoing: dict[str, int] = {}
    new_customers: dict[str, int] = {}
    unanswered: dict[str, int] = {}
    if "messages" in tables:
        for r in _rows(
            conn,
            "SELECT substr(created_at,1,10) d, direction, COUNT(*) n FROM messages "
            "WHERE created_at >= ? GROUP BY d, direction",
            (start,),
        ):
            if r["direction"] == "in":
                incoming[r["d"]] = int(r["n"])
            elif r["direction"] == "out":
                outgoing[r["d"]] = int(r["n"])
    if "customers" in tables:
        for r in _rows(
            conn,
            "SELECT substr(created_at,1,10) d, COUNT(*) n FROM customers "
            "WHERE created_at >= ? GROUP BY d",
            (start,),
        ):
            new_customers[r["d"]] = int(r["n"])
    if "unanswered_questions" in tables:
        for r in _rows(
            conn,
            "SELECT substr(created_at,1,10) d, COUNT(*) n FROM unanswered_questions "
            "WHERE created_at >= ? GROUP BY d",
            (start,),
        ):
            unanswered[r["d"]] = int(r["n"])
    return [
        {
            "date": day,
            "incoming": incoming.get(day, 0),
            "outgoing": outgoing.get(day, 0),
            "new_customers": new_customers.get(day, 0),
            "unanswered": unanswered.get(day, 0),
        }
        for day in dates
    ]


def _trend(series: list[dict[str, Any]], field: str) -> dict[str, Any]:
    current = sum(item[field] for item in series[-7:])
    previous = sum(item[field] for item in series[-14:-7])
    if previous == 0:
        pct = 0.0 if current == 0 else 100.0
    else:
        pct = round((current - previous) / previous * 100, 1)
    return {"current": current, "previous": previous, "change_pct": pct}


def _dialogs(conn: sqlite3.Connection, tables: set[str]) -> int:
    if "messages" not in tables:
        return 0
    return _scalar(
        conn,
        "SELECT COUNT(*) FROM (SELECT DISTINCT COALESCE(business_connection_id,''), customer_chat_id "
        "FROM messages WHERE customer_chat_id IS NOT NULL)",
    )


def _popular(conn: sqlite3.Connection, tables: set[str], limit: int = 6) -> list[dict[str, Any]]:
    popular: list[dict[str, Any]] = []
    if "faq_entries" in tables:
        for r in _rows(
            conn,
            "SELECT COALESCE(NULLIF(question,''), keywords) label, hits FROM faq_entries "
            "WHERE enabled=1 ORDER BY hits DESC, id DESC LIMIT ?",
            (limit,),
        ):
            if int(r.get("hits") or 0) > 0:
                popular.append({"label": r["label"], "count": int(r["hits"]), "source": "faq"})
    if len(popular) < limit and "unanswered_questions" in tables:
        for r in _rows(
            conn,
            "SELECT question label, COUNT(*) n FROM unanswered_questions "
            "WHERE question != '' GROUP BY question ORDER BY n DESC, MAX(id) DESC LIMIT ?",
            (limit - len(popular),),
        ):
            popular.append({"label": r["label"], "count": int(r["n"]), "source": "unanswered"})
    if len(popular) < limit and "messages" in tables:
        for r in _rows(
            conn,
            "SELECT content label, COUNT(*) n FROM messages WHERE direction='in' AND length(content) BETWEEN 8 AND 160 "
            "GROUP BY content ORDER BY n DESC, MAX(id) DESC LIMIT ?",
            (limit - len(popular),),
        ):
            popular.append({"label": r["label"], "count": int(r["n"]), "source": "message"})
    return popular[:limit]


def _recent_chats(conn: sqlite3.Connection, tables: set[str], limit: int = 8) -> list[dict[str, Any]]:
    if "messages" not in tables:
        return []
    chats = _rows(
        conn,
        """
        SELECT m.business_connection_id AS bcid, m.customer_chat_id AS chat_id,
               MAX(m.created_at) AS last_at,
               (SELECT content FROM messages x WHERE x.customer_chat_id = m.customer_chat_id
                 AND COALESCE(x.business_connection_id,'') = COALESCE(m.business_connection_id,'')
                 ORDER BY x.id DESC LIMIT 1) AS last_message,
               (SELECT direction FROM messages x WHERE x.customer_chat_id = m.customer_chat_id
                 AND COALESCE(x.business_connection_id,'') = COALESCE(m.business_connection_id,'')
                 ORDER BY x.id DESC LIMIT 1) AS last_direction
        FROM messages m
        WHERE m.customer_chat_id IS NOT NULL
        GROUP BY COALESCE(m.business_connection_id,''), m.customer_chat_id
        ORDER BY last_at DESC
        LIMIT ?
        """,
        (limit,),
    )
    if "customers" in tables:
        for chat in chats:
            match = _rows(
                conn,
                "SELECT first_name, last_name, username FROM customers "
                "WHERE customer_chat_id=? AND COALESCE(business_connection_id,'')=COALESCE(?,'') LIMIT 1",
                (chat["chat_id"], chat["bcid"]),
            )
            if match:
                name = " ".join(filter(None, [match[0].get("first_name"), match[0].get("last_name")])).strip()
                chat["name"] = name or (f"@{match[0]['username']}" if match[0].get("username") else "")
                chat["username"] = match[0].get("username") or ""
    for chat in chats:
        chat.setdefault("name", "")
        chat["last_message"] = (chat.get("last_message") or "").strip()[:160]
    return chats


def _unanswered(conn: sqlite3.Connection, tables: set[str], limit: int = 10) -> list[dict[str, Any]]:
    if "unanswered_questions" not in tables:
        return []
    return _rows(
        conn,
        "SELECT id, question, customer_chat_id, status, created_at FROM unanswered_questions "
        "WHERE status='open' ORDER BY id DESC LIMIT ?",
        (limit,),
    )


def _backup_health(bot: dict[str, Any], last_snapshot: dict[str, Any] | None) -> dict[str, Any]:
    interval = int(bot.get("backup_interval_hours") or 6)
    last_at = bot.get("last_backup_at") or (last_snapshot or {}).get("created_at")
    parsed = parse_iso(last_at)
    if parsed is None:
        return {"last_at": None, "next_due_at": None, "status": "missing", "age_hours": None, "interval_hours": interval}
    age_hours = round((now() - parsed).total_seconds() / 3600, 1)
    status = "ok" if age_hours <= interval * 1.5 else "late"
    return {
        "last_at": last_at,
        "next_due_at": (parsed + timedelta(hours=interval)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "status": status,
        "age_hours": age_hours,
        "interval_hours": interval,
    }


def build_overview(bot_id: int, snapshot_id: int | None = None) -> dict[str, Any]:
    bot = db.row("SELECT * FROM bots WHERE id=?", (bot_id,))
    if bot is None:
        raise ValueError("bot not found")
    snapshot = None
    if snapshot_id:
        snapshot = db.row("SELECT * FROM snapshots WHERE id=? AND bot_id=?", (snapshot_id, bot_id))
    if snapshot is None:
        snapshot = db.row("SELECT * FROM snapshots WHERE bot_id=? ORDER BY id DESC LIMIT 1", (bot_id,))
    total_snapshots = db.scalar("SELECT COUNT(*) FROM snapshots WHERE bot_id=?", (bot_id,), 0) or 0
    total_size = db.scalar("SELECT COALESCE(SUM(size_bytes),0) FROM snapshots WHERE bot_id=?", (bot_id,), 0) or 0

    conn = _connect(bot_id)
    settings: dict[str, str] = {}
    tables: set[str] = set()
    series: list[dict[str, Any]] = []
    totals: dict[str, Any] = {}
    popular: list[dict[str, Any]] = []
    recent_chats: list[dict[str, Any]] = []
    unanswered: list[dict[str, Any]] = []
    persona: dict[str, Any] = {}
    if conn is not None:
        try:
            tables = _tables(conn)
            settings = _settings(conn, tables)
            series = _series(conn, tables)
            messages_total = _scalar(conn, "SELECT COUNT(*) FROM messages") if "messages" in tables else 0
            ai_replies = _scalar(
                conn,
                "SELECT COUNT(*) FROM messages WHERE direction='out' AND role='assistant'",
            ) if "messages" in tables else 0
            month_start = now().replace(day=1, hour=0, minute=0, second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")
            ai_this_month = _scalar(
                conn,
                "SELECT COUNT(*) FROM messages WHERE direction='out' AND role='assistant' AND created_at>=?",
                (month_start,),
            ) if "messages" in tables else 0
            totals = {
                "dialogs": _dialogs(conn, tables),
                "leads": _scalar(conn, "SELECT COUNT(*) FROM customers") if "customers" in tables else 0,
                "messages": messages_total,
                "incoming": _scalar(conn, "SELECT COUNT(*) FROM messages WHERE direction='in'") if "messages" in tables else 0,
                "outgoing": _scalar(conn, "SELECT COUNT(*) FROM messages WHERE direction='out'") if "messages" in tables else 0,
                "ai_replies": ai_replies,
                "ai_this_month": ai_this_month,
                "unanswered_open": _scalar(
                    conn, "SELECT COUNT(*) FROM unanswered_questions WHERE status='open'"
                ) if "unanswered_questions" in tables else 0,
                "unanswered_answered": _scalar(
                    conn, "SELECT COUNT(*) FROM unanswered_questions WHERE status='answered'"
                ) if "unanswered_questions" in tables else 0,
                "approvals_pending": _scalar(
                    conn, "SELECT COUNT(*) FROM pending_approvals WHERE status='pending'"
                ) if "pending_approvals" in tables else 0,
                "paused_chats": _scalar(conn, "SELECT COUNT(*) FROM paused_chats") if "paused_chats" in tables else 0,
                "faq": _scalar(conn, "SELECT COUNT(*) FROM faq_entries WHERE enabled=1") if "faq_entries" in tables else 0,
                "kb_items": _scalar(conn, "SELECT COUNT(*) FROM kb_items") if "kb_items" in tables else 0,
                "kb_chunks": _scalar(conn, "SELECT COUNT(*) FROM kb_chunks") if "kb_chunks" in tables else 0,
                "rules_active": _scalar(conn, "SELECT COUNT(*) FROM topic_rules WHERE enabled=1") if "topic_rules" in tables else 0,
                "rules_total": _scalar(conn, "SELECT COUNT(*) FROM topic_rules") if "topic_rules" in tables else 0,
                "resources": _scalar(conn, "SELECT COUNT(*) FROM resources WHERE enabled=1") if "resources" in tables else 0,
                "connections": _scalar(conn, "SELECT COUNT(*) FROM business_connections") if "business_connections" in tables else 0,
                "paid_messages": _scalar(conn, "SELECT COUNT(*) FROM paid_messages") if "paid_messages" in tables else 0,
            }
            persona = {
                "assistant_name": _tenant_zero(settings, "assistant_name"),
                "business_name": _tenant_zero(settings, "business_name"),
                "business_description": _tenant_zero(settings, "business_description"),
                "tone": _tenant_zero(settings, "tone") or "friendly",
                "reply_language": _tenant_zero(settings, "reply_language") or "auto",
                "custom_instructions": _tenant_zero(settings, "custom_instructions"),
                "auto_reply_enabled": _bool(settings, "auto_reply_enabled"),
                "approval_mode_enabled": _bool(settings, "approval_mode_enabled", True),
                "kb_enabled": _bool(settings, "kb_enabled", True),
                "strict_kb_mode": _bool(settings, "strict_kb_mode"),
                "faq_enabled": _bool(settings, "faq_enabled", True),
                "rules_enabled": _bool(settings, "rules_enabled", True),
                "resources_enabled": _bool(settings, "resources_enabled", True),
                "unanswered_enabled": _bool(settings, "unanswered_enabled", True),
                "direct_reply_enabled": _bool(settings, "direct_reply_enabled", True),
                "disclose_ai": _bool(settings, "disclose_ai"),
                "ai_provider": _tenant_zero(settings, "ai_provider") or "openai",
                "max_reply_chars": _safe_int(_tenant_zero(settings, "max_reply_chars"), 900),
            }
            popular = _popular(conn, tables)
            recent_chats = _recent_chats(conn, tables)
            unanswered = _unanswered(conn, tables)
            db.execute(
                "UPDATE bots SET credits_used=? WHERE id=?",
                (min(int(bot.get("credits_total") or 500), ai_this_month), bot_id),
            )
            bot["credits_used"] = min(int(bot.get("credits_total") or 500), ai_this_month)
        finally:
            conn.close()

    credits_total = int(bot.get("credits_total") or 500)
    credits_used = int(bot.get("credits_used") or 0)
    backup_health = _backup_health(bot, snapshot)
    events = db.rows(
        "SELECT kind, message, created_at FROM events WHERE bot_id=? OR bot_id IS NULL ORDER BY id DESC LIMIT 12",
        (bot_id,),
    )
    return {
        "generated_at": now_iso(),
        "bot": {
            "id": bot["id"],
            "name": bot["name"],
            "telegram_username": bot["telegram_username"],
            "status": bot["status"],
            "created_at": bot["created_at"],
            "backup_interval_hours": int(bot.get("backup_interval_hours") or 6),
            "credits_total": credits_total,
            "credits_used": credits_used,
            "credits_left": max(0, credits_total - credits_used),
        },
        "snapshot": _snapshot_public(snapshot) if snapshot else None,
        "backup_health": backup_health,
        "backup_summary": {
            "snapshots": total_snapshots,
            "total_bytes": int(total_size),
            "latest_version": snapshot["id"] if snapshot else None,
        },
        "totals": totals,
        "trends": {
            "incoming": _trend(series, "incoming"),
            "outgoing": _trend(series, "outgoing"),
            "new_customers": _trend(series, "new_customers"),
            "unanswered": _trend(series, "unanswered"),
        },
        "series": series,
        "popular": popular,
        "recent_chats": recent_chats,
        "unanswered": unanswered,
        "persona": persona,
        "events": events,
    }


def _snapshot_public(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": snapshot["id"],
        "created_at": snapshot["created_at"],
        "filename": snapshot["filename"],
        "size_bytes": int(snapshot["size_bytes"] or 0),
        "sha256": snapshot["sha256"],
        "status": snapshot["status"],
        "verified_at": snapshot.get("verified_at"),
        "source": snapshot["source"],
        "s3_key": snapshot.get("s3_key", ""),
        "has_local": bool(snapshot.get("local_path")) or (
            Path(snapshot.get("local_path") or "").exists() if snapshot.get("local_path") else False
        ),
    }


# --------------------------------------------------------------------------
# Content readers used by Knowledge Base / Rules / Resources / FAQ screens
# --------------------------------------------------------------------------
def content(bot_id: int, table: str, limit: int = 500, where: str = "", params: tuple = ()) -> list[dict[str, Any]]:
    conn = _connect(bot_id)
    if conn is None:
        return []
    try:
        if table not in _tables(conn):
            return []
        sql = f"SELECT * FROM {table}"
        if where:
            sql += f" WHERE {where}"
        sql += " ORDER BY id DESC LIMIT ?"
        return [dict(r) for r in conn.execute(sql, params + (limit,)).fetchall()]
    except sqlite3.Error:
        return []
    finally:
        conn.close()


def kb_items(bot_id: int) -> list[dict[str, Any]]:
    conn = _connect(bot_id)
    if conn is None:
        return []
    try:
        if "kb_items" not in _tables(conn):
            return []
        rows = [dict(r) for r in conn.execute(
            "SELECT i.*, (SELECT COUNT(*) FROM kb_chunks c WHERE c.item_id=i.id) chunks "
            "FROM kb_items i ORDER BY i.id DESC"
        ).fetchall()]
        for item in rows:
            item["preview"] = ""
            chunk = conn.execute(
                "SELECT content FROM kb_chunks WHERE item_id=? ORDER BY chunk_index LIMIT 1",
                (item["id"],),
            ).fetchone()
            if chunk:
                item["preview"] = str(chunk["content"] or "")[:240]
        return rows
    except sqlite3.Error:
        return []
    finally:
        conn.close()


def workspace_db(bot_id: int) -> sqlite3.Connection | None:
    """Writable connection to the workspace copy (dashboard edits)."""
    path = main_db_path(bot_id)
    if path is None:
        return None
    conn = sqlite3.connect(str(path), timeout=15)
    conn.row_factory = sqlite3.Row
    return conn


def bot_settings(bot_id: int) -> dict[str, str]:
    conn = _connect(bot_id)
    if conn is None:
        return {}
    try:
        tables = _tables(conn)
        if "settings" not in tables:
            return {}
        return _settings(conn, tables)
    finally:
        conn.close()
