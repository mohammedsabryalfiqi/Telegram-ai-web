"""Write-back queue: dashboard edits become SQL the bot-side agent can apply."""

from __future__ import annotations

import logging
import sqlite3
from typing import Any

from .. import db
from ..util import now_iso
from .analytics import workspace_db

log = logging.getLogger("control.changes")


def quote(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value).replace("\x00", "")
    return "'" + text.replace("'", "''") + "'"


def queue(bot_id: int, sql: str, description: str) -> int:
    change_id = db.insert(
        "INSERT INTO pending_changes(bot_id, created_at, sql, description, status) VALUES (?,?,?,?,'pending')",
        (bot_id, now_iso(), sql, description[:300]),
    )
    db.add_event("change", f"Change #{change_id} queued: {description}", bot_id)
    return change_id


def apply_ws(bot_id: int, sql: str, params: tuple = ()) -> bool:
    conn = workspace_db(bot_id)
    if conn is None:
        return False
    try:
        conn.execute(sql, params)
        conn.commit()
        return True
    except sqlite3.Error as exc:
        log.warning("workspace edit failed for bot %s: %s", bot_id, exc)
        return False
    finally:
        conn.close()


def pending(bot_id: int) -> list[dict[str, Any]]:
    return db.rows(
        "SELECT id, created_at, sql, description, status, applied_at FROM pending_changes "
        "WHERE bot_id=? AND status='pending' ORDER BY id",
        (bot_id,),
    )


def ack(bot_id: int, ids: list[int]) -> int:
    if not ids:
        return 0
    marks = ",".join("?" for _ in ids)
    return db.execute(
        f"UPDATE pending_changes SET status='applied', applied_at=? WHERE bot_id=? AND id IN ({marks})",
        (now_iso(), bot_id, *ids),
    )


def history(bot_id: int, limit: int = 30) -> list[dict[str, Any]]:
    return db.rows(
        "SELECT id, created_at, description, status, applied_at FROM pending_changes "
        "WHERE bot_id=? ORDER BY id DESC LIMIT ?",
        (bot_id, limit),
    )


def set_setting_change(bot_id: int, key: str, value: Any, label: str) -> int:
    ts = now_iso()
    sql = (
        "INSERT INTO settings(key, value, updated_at) VALUES ("
        f"{quote(key)}, {quote(str(value).lower() if isinstance(value, bool) else value)}, {quote(ts)}) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at;"
    )
    apply_ws(
        bot_id,
        "INSERT INTO settings(key, value, updated_at) VALUES (?,?,?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
        (key, str(value).lower() if isinstance(value, bool) else str(value), ts),
    )
    return queue(bot_id, sql, f"Setting «{label}» → {value}")


def faq_change(bot_id: int, keywords: str, answer: str, question: str = "", enabled: bool = True) -> int:
    ts = now_iso()
    sql = (
        "INSERT INTO faq_entries(tenant_id, keywords, question, answer, enabled, hits, created_at, updated_at) "
        f"VALUES (0, {quote(keywords)}, {quote(question)}, {quote(answer)}, {quote(enabled)}, 0, {quote(ts)}, {quote(ts)});"
    )
    apply_ws(
        bot_id,
        "INSERT INTO faq_entries(tenant_id, keywords, question, answer, enabled, hits, created_at, updated_at) "
        "VALUES (0,?,?,?,?,0,?,?)",
        (keywords, question, answer, int(enabled), ts, ts),
    )
    return queue(bot_id, sql, f"Quick answer added: {question or keywords[:60]}")


def faq_delete_change(bot_id: int, entry_id: int) -> int:
    apply_ws(bot_id, "DELETE FROM faq_entries WHERE id=?", (entry_id,))
    return queue(bot_id, f"DELETE FROM faq_entries WHERE id={int(entry_id)};", f"Quick answer #{entry_id} deleted")


def rule_toggle_change(bot_id: int, rule_id: int, enabled: bool, topic: str = "") -> int:
    ts = now_iso()
    apply_ws(bot_id, "UPDATE topic_rules SET enabled=?, updated_at=? WHERE id=?", (int(enabled), ts, rule_id))
    return queue(
        bot_id,
        f"UPDATE topic_rules SET enabled={1 if enabled else 0}, updated_at={quote(ts)} WHERE id={int(rule_id)};",
        f"Rule «{topic or rule_id}» {'enabled' if enabled else 'disabled'}",
    )


def rule_add_change(bot_id: int, topic: str, rule: str, priority: int = 100, enabled: bool = True) -> int:
    ts = now_iso()
    apply_ws(
        bot_id,
        "INSERT INTO topic_rules(tenant_id, topic, rule, priority, enabled, source, batch, hits, created_at, updated_at) "
        "VALUES (0,?,?,?,?, 'dashboard', 'dashboard', 0, ?, ?)",
        (topic, rule, priority, int(enabled), ts, ts),
    )
    pid = queue(
        bot_id,
        "INSERT INTO topic_rules(tenant_id, topic, rule, priority, enabled, source, batch, hits, created_at, updated_at) "
        f"VALUES (0, {quote(topic)}, {quote(rule)}, {int(priority)}, {1 if enabled else 0}, 'dashboard', 'dashboard', 0, {quote(ts)}, {quote(ts)});",
        f"Rule «{topic}» added",
    )
    return pid


def rule_delete_change(bot_id: int, rule_id: int, topic: str = "") -> int:
    apply_ws(bot_id, "DELETE FROM topic_rules WHERE id=?", (rule_id,))
    return queue(bot_id, f"DELETE FROM topic_rules WHERE id={int(rule_id)};", f"Rule «{topic or rule_id}» deleted")


def resource_add_change(bot_id: int, kind: str, title: str, url: str, notes: str = "") -> int:
    ts = now_iso()
    apply_ws(
        bot_id,
        "INSERT INTO resources(tenant_id, kind, title, url, notes, enabled, chars, created_at) VALUES (0,?,?,?,?,1,0,?)",
        (kind, title, url, notes, ts),
    )
    return queue(
        bot_id,
        "INSERT INTO resources(tenant_id, kind, title, url, notes, enabled, chars, created_at) "
        f"VALUES (0, {quote(kind)}, {quote(title)}, {quote(url)}, {quote(notes)}, 1, 0, {quote(ts)});",
        f"Resource «{title}» added",
    )


def resource_toggle_change(bot_id: int, resource_id: int, enabled: bool, title: str = "") -> int:
    apply_ws(bot_id, "UPDATE resources SET enabled=? WHERE id=?", (int(enabled), resource_id))
    return queue(
        bot_id,
        f"UPDATE resources SET enabled={1 if enabled else 0} WHERE id={int(resource_id)};",
        f"Resource «{title or resource_id}» {'enabled' if enabled else 'disabled'}",
    )


def resource_delete_change(bot_id: int, resource_id: int, title: str = "") -> int:
    apply_ws(bot_id, "DELETE FROM resources WHERE id=?", (resource_id,))
    return queue(bot_id, f"DELETE FROM resources WHERE id={int(resource_id)};", f"Resource «{title or resource_id}» deleted")


def answer_question_change(bot_id: int, question_id: int, question: str, answer: str) -> int:
    ts = now_iso()
    apply_ws(
        bot_id,
        "UPDATE unanswered_questions SET answer=?, status='answered', answered_at=? WHERE id=?",
        (answer, ts, question_id),
    )
    apply_ws(
        bot_id,
        "INSERT INTO faq_entries(tenant_id, keywords, question, answer, enabled, hits, created_at, updated_at) "
        "VALUES (0,?,?,?,1,0,?,?)",
        (question, question, answer, ts, ts),
    )
    sql = (
        f"UPDATE unanswered_questions SET answer={quote(answer)}, status='answered', answered_at={quote(ts)} "
        f"WHERE id={int(question_id)};\n"
        "INSERT INTO faq_entries(tenant_id, keywords, question, answer, enabled, hits, created_at, updated_at) "
        f"VALUES (0, {quote(question)}, {quote(question)}, {quote(answer)}, 1, 0, {quote(ts)}, {quote(ts)});"
    )
    return queue(bot_id, sql, "Answer learned and reused as a quick answer")


def kb_text_change(bot_id: int, title: str, text: str) -> int:
    ts = now_iso()
    chunks = [text[i:i + 900] for i in range(0, len(text), 900)] or [text]
    statements = [
        "INSERT INTO kb_items(tenant_id, title, source_type, filename, created_at, chunk_count) "
        f"VALUES (0, {quote(title)}, 'text', NULL, {quote(ts)}, {len(chunks)});"
    ]
    for index, chunk in enumerate(chunks):
        statements.append(
            "INSERT INTO kb_chunks(item_id, chunk_index, content, embedding_json, created_at) "
            f"VALUES ((SELECT MAX(id) FROM kb_items), {index}, {quote(chunk)}, NULL, {quote(ts)});"
        )
    sql = "\n".join(statements)

    conn = workspace_db(bot_id)
    if conn is not None:
        try:
            cur = conn.execute(
                "INSERT INTO kb_items(tenant_id, title, source_type, filename, created_at, chunk_count) VALUES (0,?,'text',NULL,?,?)",
                (title, ts, len(chunks)),
            )
            item_id = cur.lastrowid
            for index, chunk in enumerate(chunks):
                conn.execute(
                    "INSERT INTO kb_chunks(item_id, chunk_index, content, embedding_json, created_at) VALUES (?,?,?,NULL,?)",
                    (item_id, index, chunk, ts),
                )
            conn.commit()
        except sqlite3.Error as exc:
            log.debug("workspace kb insert failed: %s", exc)
        finally:
            conn.close()
    return queue(bot_id, sql, f"Knowledge text «{title}» added ({len(chunks)} chunks)")
