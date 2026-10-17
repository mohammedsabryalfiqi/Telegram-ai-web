"""Shared FastAPI dependencies."""

from __future__ import annotations

import hmac
import re
from typing import Any

from fastapi import Depends, Header, HTTPException, Request

from .. import db
from ..security import require_user
from ..util import hash_api_key, human_size, now_iso


def get_bot(bot_id: int, _user: dict = Depends(require_user)) -> dict[str, Any]:
    bot = db.row("SELECT * FROM bots WHERE id=?", (bot_id,))
    if bot is None:
        raise HTTPException(status_code=404, detail="Bot not found")
    return bot


def bot_from_key(
    x_backup_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    key = (x_backup_key or "").strip()
    if not key and authorization and authorization.lower().startswith("bearer "):
        key = authorization[7:].strip()
    if not key:
        raise HTTPException(status_code=401, detail="Missing backup key")
    match = re.match(r"^bk_(\d+)_", key)
    if not match:
        raise HTTPException(status_code=401, detail="Malformed backup key")
    bot = db.row("SELECT * FROM bots WHERE id=?", (int(match.group(1)),))
    if bot is None or not bot.get("api_key_hash"):
        raise HTTPException(status_code=401, detail="Unknown backup key")
    if not hmac.compare_digest(hash_api_key(key), bot["api_key_hash"]):
        raise HTTPException(status_code=401, detail="Invalid backup key")
    return bot


def bot_public(bot: dict[str, Any], base_url: str = "") -> dict[str, Any]:
    stats = db.json_load(bot.get("last_stats_json"), {})
    last = db.row("SELECT * FROM snapshots WHERE bot_id=? ORDER BY id DESC LIMIT 1", (bot["id"],))
    from ..util import parse_iso, now

    health = "missing"
    age_hours = None
    if bot.get("last_backup_at"):
        parsed = parse_iso(bot["last_backup_at"])
        if parsed:
            age_hours = round((now() - parsed).total_seconds() / 3600, 1)
            interval = int(bot.get("backup_interval_hours") or 6)
            health = "ok" if age_hours <= interval * 1.5 else "late"
    snapshots = db.scalar("SELECT COUNT(*) FROM snapshots WHERE bot_id=?", (bot["id"],), 0) or 0
    size = db.scalar("SELECT COALESCE(SUM(size_bytes),0) FROM snapshots WHERE bot_id=?", (bot["id"],), 0) or 0
    return {
        "id": bot["id"],
        "name": bot["name"],
        "telegram_username": bot["telegram_username"],
        "notes": bot["notes"],
        "status": bot["status"],
        "created_at": bot["created_at"],
        "updated_at": bot["updated_at"],
        "last_backup_at": bot["last_backup_at"],
        "backup_interval_hours": bot["backup_interval_hours"],
        "credits_total": bot["credits_total"],
        "credits_used": bot["credits_used"],
        "source_mode": bot.get("source_mode", "push"),
        "key_prefix": bot.get("api_key_prefix", ""),
        "has_key": bool(bot.get("api_key_hash")),
        "health": health,
        "age_hours": age_hours,
        "snapshot_count": snapshots,
        "storage_bytes": int(size),
        "storage_human": human_size(int(size)),
        "latest_snapshot": {
            "id": last["id"],
            "created_at": last["created_at"],
            "size_bytes": last["size_bytes"],
            "status": last["status"],
        } if last else None,
        "stats": stats,
        "ingest_url": f"{base_url}/api/ingest" if base_url else "/api/ingest",
    }


def agent_command(bot: dict[str, Any], base_url: str, key_placeholder: str = "bk_…") -> str:
    interval = int(bot.get("backup_interval_hours") or 6) * 3600
    return (
        f"python backup_agent.py --site {base_url} --key {key_placeholder} "
        f"--storage /app/storage --interval {interval} --pull-changes 60"
    )


def record_agent_seen(bot_id: int) -> None:
    db.execute("UPDATE bots SET updated_at=? WHERE id=?", (now_iso(), bot_id))
