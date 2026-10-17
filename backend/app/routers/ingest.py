"""Agent-facing ingestion API (authenticated by bot backup key)."""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from .. import config, db
from ..security import require_user
from ..services import backup, changes
from ..util import human_size, now_iso, safe_filename, sha256_file
from .deps import bot_from_key

log = logging.getLogger("control.ingest")
router = APIRouter(prefix="/api", tags=["agent"])


AGENT_SCRIPT = Path(__file__).resolve().parents[3] / "agent" / "backup_agent.py"


@router.get("/agent/script")
def agent_script(_user: dict = Depends(require_user)) -> FileResponse:
    """Download the standalone backup agent (also shipped in agent/)."""
    if not AGENT_SCRIPT.is_file():
        raise HTTPException(status_code=404, detail="Agent script is not bundled in this build")
    return FileResponse(AGENT_SCRIPT, filename="backup_agent.py", media_type="text/x-python")


@router.get("/agent/hello")
def hello(request: Request, bot: dict = Depends(bot_from_key)) -> dict[str, Any]:
    db.execute("UPDATE bots SET updated_at=? WHERE id=?", (now_iso(), bot["id"]))
    return {
        "ok": True,
        "bot": {"id": bot["id"], "name": bot["name"], "interval_hours": bot["backup_interval_hours"]},
        "pending_changes": len(changes.pending(bot["id"])),
        "max_upload_mb": config.MAX_UPLOAD_MB,
        "server_time": now_iso(),
    }


@router.post("/ingest")
async def ingest(
    request: Request,
    file: UploadFile = File(...),
    bot: dict = Depends(bot_from_key),
    x_checksum_sha256: str | None = Header(default=None),
    x_agent_version: str | None = Header(default=None),
    x_source: str | None = Header(default="agent"),
) -> dict[str, Any]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No archive attached")
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip snapshots are accepted")
    with tempfile.NamedTemporaryFile(prefix="ingest-", suffix=".zip", delete=False) as temp:
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
    if total == 0:
        temp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Empty archive")
    try:
        snapshot = backup.register_snapshot(
            bot,
            temp_path,
            source=(x_source or "agent")[:20],
            original_name=safe_filename(file.filename),
            client_sha256=(x_checksum_sha256 or "").strip(),
        )
    except backup.BackupError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive
        log.exception("ingest failed for bot %s", bot["id"])
        raise HTTPException(status_code=500, detail=f"Backup could not be stored: {exc}") from exc
    finally:
        temp_path.unlink(missing_ok=True)
    db.execute("UPDATE bots SET updated_at=? WHERE id=?", (now_iso(), bot["id"]))
    db.add_event(
        "backup",
        f"Agent uploaded {human_size(int(snapshot['size_bytes']))} "
        f"(agent v{x_agent_version or '?'}) → snapshot #{snapshot['id']}",
        bot["id"],
    )
    return {
        "ok": True,
        "snapshot_id": snapshot["id"],
        "size_bytes": snapshot["size_bytes"],
        "sha256": snapshot["sha256"],
        "pending_changes": len(changes.pending(bot["id"])),
    }


@router.get("/agent/changes")
def agent_changes(bot: dict = Depends(bot_from_key)) -> dict[str, Any]:
    pending = changes.pending(bot["id"])
    return {
        "ok": True,
        "changes": [
            {"id": item["id"], "sql": item["sql"], "description": item["description"], "created_at": item["created_at"]}
            for item in pending
        ],
    }


@router.post("/agent/changes/ack")
def agent_ack(payload: dict, bot: dict = Depends(bot_from_key)) -> dict[str, Any]:
    ids = [int(value) for value in payload.get("ids", []) if str(value).isdigit()]
    applied = changes.ack(bot["id"], ids)
    db.add_event("change", f"Agent applied {applied} change(s)", bot["id"])
    return {"ok": True, "applied": applied}


@router.post("/agent/heartbeat")
def heartbeat(payload: dict, bot: dict = Depends(bot_from_key)) -> dict[str, Any]:
    note = str(payload.get("note") or "")[:300]
    db.execute("UPDATE bots SET updated_at=? WHERE id=?", (now_iso(), bot["id"]))
    if note:
        db.add_event("agent", note, bot["id"])
    return {"ok": True, "server_time": now_iso()}
