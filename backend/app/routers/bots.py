"""Bot management, connection keys, manual uploads and the write-back queue."""

from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from .. import config, db
from ..security import require_user
from ..services import backup, changes
from ..services.analytics import build_overview
from ..util import new_api_key, now_iso, safe_filename
from .deps import agent_command, bot_public, get_bot

router = APIRouter(prefix="/api", tags=["bots"])


class BotPayload(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    telegram_username: str = Field(default="", max_length=80)
    notes: str = Field(default="", max_length=1000)
    backup_interval_hours: int = Field(default=6, ge=1, le=168)
    credits_total: int = Field(default=500, ge=0, le=10_000_000)


class BotPatch(BaseModel):
    name: str | None = Field(default=None, max_length=80)
    telegram_username: str | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=1000)
    backup_interval_hours: int | None = Field(default=None, ge=1, le=168)
    credits_total: int | None = Field(default=None, ge=0, le=10_000_000)
    status: str | None = None


def _base_url(request: Request) -> str:
    if config.APP_URL:
        return config.APP_URL
    forwarded_proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    forwarded_host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{forwarded_proto}://{forwarded_host}".rstrip("/")


@router.get("/bots")
def list_bots(request: Request, user: dict = Depends(require_user)) -> dict[str, Any]:
    base = _base_url(request)
    bots = [bot_public(bot, base) for bot in db.rows("SELECT * FROM bots ORDER BY id")]
    return {"bots": bots, "base_url": base}


@router.post("/bots")
def create_bot(payload: BotPayload, request: Request, user: dict = Depends(require_user)) -> dict[str, Any]:
    bot_id = db.insert(
        "INSERT INTO bots(name, telegram_username, notes, status, created_at, updated_at, "
        "backup_interval_hours, credits_total) VALUES (?,?,?,?,?,?,?,?)",
        (
            payload.name.strip(), payload.telegram_username.strip().lstrip("@"), payload.notes.strip(),
            "active", now_iso(), now_iso(), payload.backup_interval_hours, payload.credits_total,
        ),
    )
    plain, key_hash, prefix = new_api_key(bot_id)
    db.execute(
        "UPDATE bots SET api_key_hash=?, api_key_prefix=?, key_created_at=? WHERE id=?",
        (key_hash, prefix, now_iso(), bot_id),
    )
    db.add_event("bot", f"Bot «{payload.name}» created", bot_id)
    bot = db.row("SELECT * FROM bots WHERE id=?", (bot_id,))
    base = _base_url(request)
    return {
        "ok": True,
        "bot": bot_public(bot, base),
        "api_key": plain,
        "ingest_url": f"{base}/api/ingest",
        "agent_command": agent_command(bot, base, plain),
    }


@router.get("/bots/{bot_id}")
def get_one(bot_id: int, request: Request, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    return {"bot": bot_public(bot, _base_url(request))}


@router.patch("/bots/{bot_id}")
def patch_bot(bot_id: int, payload: BotPatch, request: Request, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    data = payload.dict(exclude_unset=True)
    if "status" in data and data["status"] not in {"active", "paused"}:
        raise HTTPException(status_code=400, detail="status must be active or paused")
    allowed = {"name", "telegram_username", "notes", "backup_interval_hours", "credits_total", "status"}
    fields = {k: v for k, v in data.items() if k in allowed and v is not None}
    if fields:
        sets = ", ".join(f"{key}=?" for key in fields)
        db.execute(
            f"UPDATE bots SET {sets}, updated_at=? WHERE id=?",
            (*fields.values(), now_iso(), bot_id),
        )
    fresh = db.row("SELECT * FROM bots WHERE id=?", (bot_id,))
    return {"ok": True, "bot": bot_public(fresh, _base_url(request))}


@router.delete("/bots/{bot_id}")
def delete_bot(bot_id: int, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    if bot.get("source_mode") == "demo":
        shutil.rmtree(config.WORKSPACES_DIR / f"bot-{bot_id}", ignore_errors=True)
        for snap in db.rows("SELECT * FROM snapshots WHERE bot_id=?", (bot_id,)):
            backup.storage.remove_snapshot_files(snap)
        db.execute("DELETE FROM snapshots WHERE bot_id=?", (bot_id,))
        db.execute("DELETE FROM bots WHERE id=?", (bot_id,))
        db.add_event("bot", f"Demo workspace «{bot['name']}» deleted")
        return {"ok": True}
    total_bots = db.scalar("SELECT COUNT(*) FROM bots", default=0) or 0
    if total_bots <= 1:
        raise HTTPException(
            status_code=400,
            detail="This is your only workspace. Create another one before deleting it.",
        )
    for snap in db.rows("SELECT * FROM snapshots WHERE bot_id=?", (bot_id,)):
        backup.storage.remove_snapshot_files(snap)
    db.execute("DELETE FROM snapshots WHERE bot_id=?", (bot_id,))
    db.execute("DELETE FROM bots WHERE id=?", (bot_id,))
    shutil.rmtree(config.WORKSPACES_DIR / f"bot-{bot_id}", ignore_errors=True)
    db.add_event("bot", f"Bot «{bot['name']}» deleted")
    return {"ok": True}


@router.post("/bots/{bot_id}/key")
def rotate_key(bot_id: int, request: Request, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    plain, key_hash, prefix = new_api_key(bot_id)
    db.execute(
        "UPDATE bots SET api_key_hash=?, api_key_prefix=?, key_created_at=?, updated_at=? WHERE id=?",
        (key_hash, prefix, now_iso(), now_iso(), bot_id),
    )
    base = _base_url(request)
    db.add_event("bot", "Backup key rotated", bot_id)
    return {
        "ok": True,
        "api_key": plain,
        "api_key_prefix": prefix,
        "ingest_url": f"{base}/api/ingest",
        "agent_command": agent_command(bot, base, plain),
    }


@router.get("/bots/{bot_id}/connect")
def connect_info(bot_id: int, request: Request, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    base = _base_url(request)
    return {
        "bot": bot_public(bot, base),
        "ingest_url": f"{base}/api/ingest",
        "agent_command": agent_command(bot, base),
        "has_key": bool(bot.get("api_key_hash")),
        "steps": [
            "انسخ ملف agent/backup_agent.py إلى مجلد البوت على Railway (أو أي سيرفر يرى الـ Volume).",
            "دوّر مفتاحًا جديدًا من هنا ثم ضعه في أمر التشغيل.",
            "شغّل الوكيل كعملية دائمة أو Cron كل 6 ساعات.",
            "أول نسخة احتياطية ستظهر تلقائيًا في لوحة التحكم.",
        ],
    }


@router.post("/bots/{bot_id}/snapshots/upload")
async def manual_upload(
    bot_id: int,
    request: Request,
    file: UploadFile = File(...),
    bot: dict = Depends(get_bot),
) -> dict[str, Any]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")
    suffix = Path(file.filename).suffix.lower()
    if suffix != ".zip":
        raise HTTPException(status_code=400, detail="Upload the .zip produced by scripts/backup_data.py")
    with tempfile.NamedTemporaryFile(prefix="upload-", suffix=".zip", delete=False) as temp:
        temp_path = Path(temp.name)
        total = 0
        while True:
            block = await file.read(1024 * 1024)
            if not block:
                break
            total += len(block)
            if total > config.MAX_UPLOAD_MB * 1024 * 1024:
                temp_path.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail=f"Archive exceeds {config.MAX_UPLOAD_MB} MB")
            temp.write(block)
    try:
        snapshot = backup.register_snapshot(
            bot, temp_path, source="upload", original_name=safe_filename(file.filename),
        )
    except backup.BackupError as exc:
        temp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        temp_path.unlink(missing_ok=True)
    return {"ok": True, "snapshot": _snapshot_row(snapshot)}


@router.get("/bots/{bot_id}/snapshots")
def list_snapshots(bot_id: int, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    snaps = db.rows("SELECT * FROM snapshots WHERE bot_id=? ORDER BY id DESC", (bot_id,))
    return {"snapshots": [_snapshot_row(snap) for snap in snaps]}


def _snapshot_row(snap: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": snap["id"],
        "bot_id": snap["bot_id"],
        "created_at": snap["created_at"],
        "filename": snap["filename"],
        "size_bytes": snap["size_bytes"],
        "sha256": snap["sha256"],
        "source": snap["source"],
        "status": snap["status"],
        "verified_at": snap.get("verified_at"),
        "row_counts": db.json_load(snap.get("row_counts_json"), {}),
        "manifest": db.json_load(snap.get("manifest_json"), {}),
        "s3_key": snap.get("s3_key", ""),
        "has_local": bool(snap.get("local_path")) and Path(snap.get("local_path") or "").exists(),
        "error": snap.get("error", ""),
    }


@router.get("/bots/{bot_id}/overview")
def overview(bot_id: int, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    return build_overview(bot_id)


@router.get("/bots/{bot_id}/changes")
def list_changes(bot_id: int, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    return {"pending": changes.pending(bot_id), "history": changes.history(bot_id)}


@router.post("/bots/{bot_id}/changes/ack")
def ack_changes(bot_id: int, payload: dict, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    ids = [int(value) for value in payload.get("ids", []) if str(value).isdigit()]
    applied = changes.ack(bot_id, ids)
    return {"ok": True, "applied": applied}


@router.get("/bots/{bot_id}/notes")
def list_notes(bot_id: int, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    return {"notes": db.rows("SELECT * FROM training_notes WHERE bot_id=? ORDER BY id DESC", (bot_id,))}


@router.post("/bots/{bot_id}/notes")
def add_note(bot_id: int, payload: dict, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    title = str(payload.get("title") or "").strip()[:160]
    content = str(payload.get("content") or "").strip()
    if not title or not content:
        raise HTTPException(status_code=400, detail="title and content are required")
    note_id = db.insert(
        "INSERT INTO training_notes(bot_id, title, content, created_at) VALUES (?,?,?,?)",
        (bot_id, title, content, now_iso()),
    )
    change_id = changes.kb_text_change(bot_id, title, content)
    return {"ok": True, "id": note_id, "change_id": change_id, "note": db.row("SELECT * FROM training_notes WHERE id=?", (note_id,))}


@router.delete("/bots/{bot_id}/notes/{note_id}")
def delete_note(bot_id: int, note_id: int, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    db.execute("DELETE FROM training_notes WHERE id=? AND bot_id=?", (note_id, bot_id))
    return {"ok": True}
