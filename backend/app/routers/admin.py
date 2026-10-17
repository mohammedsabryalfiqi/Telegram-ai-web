"""Owner settings, storage configuration and system status."""

from __future__ import annotations

import os
import platform
import shutil
import time
from typing import Any

from fastapi import APIRouter, Depends

from .. import config, db
from ..security import require_user
from ..services import ai_client, storage
from ..util import human_size, now_iso

router = APIRouter(prefix="/api", tags=["admin"])
_STARTED = time.time()


def _general() -> dict[str, Any]:
    return {
        "retention_days": int(db.get_setting("retention_days", str(config.DEFAULT_RETENTION_DAYS)) or 0),
        "keep_last_snapshots": int(db.get_setting("keep_last_snapshots", str(config.DEFAULT_KEEP_LAST)) or 0),
        "backup_stale_hours": config.BACKUP_STALE_HOURS,
        "max_upload_mb": config.MAX_UPLOAD_MB,
    }


@router.get("/settings")
def get_settings(user: dict = Depends(require_user)) -> dict[str, Any]:
    return {
        "general": _general(),
        "storage": storage.public_storage_settings(),
        "ai": ai_client.get_config(),
        "app": {
            "name": config.APP_NAME,
            "version": "1.0.0",
            "app_url": config.APP_URL,
            "data_dir": str(config.DATA_DIR),
            "demo_seed": config.DEMO_SEED,
        },
    }


@router.put("/settings/general")
def put_general(payload: dict, user: dict = Depends(require_user)) -> dict[str, Any]:
    if "retention_days" in payload:
        db.set_setting("retention_days", str(max(0, min(int(payload["retention_days"]), 3650))))
    if "keep_last_snapshots" in payload:
        db.set_setting("keep_last_snapshots", str(max(1, min(int(payload["keep_last_snapshots"]), 1000))))
    db.add_event("settings", "Backup retention updated")
    return {"ok": True, "general": _general()}


@router.put("/settings/storage")
def put_storage(payload: dict, user: dict = Depends(require_user)) -> dict[str, Any]:
    storage.save_s3_settings(payload)
    db.add_event("settings", "Object storage settings updated")
    return {"ok": True, "storage": storage.public_storage_settings()}


@router.post("/settings/storage/test")
def test_storage(user: dict = Depends(require_user)) -> dict[str, Any]:
    return storage.test_connection()


@router.get("/system")
def system(user: dict = Depends(require_user)) -> dict[str, Any]:
    disk = shutil.disk_usage(str(config.DATA_DIR))
    snapshots = db.row(
        "SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes),0) AS bytes FROM snapshots"
    ) or {}
    workspaces = storage.dir_size(config.WORKSPACES_DIR)
    s = storage.storage_settings()
    return {
        "version": "1.0.0",
        "uptime_seconds": int(time.time() - _STARTED),
        "python": platform.python_version(),
        "server_time": now_iso(),
        "bots": db.scalar("SELECT COUNT(*) FROM bots", default=0),
        "snapshots": int(snapshots.get("count") or 0),
        "snapshot_bytes": int(snapshots.get("bytes") or 0),
        "snapshot_human": human_size(int(snapshots.get("bytes") or 0)),
        "local_backups": human_size(storage.dir_size(config.BACKUPS_DIR)),
        "workspaces": human_size(workspaces),
        "disk_total": human_size(disk.total),
        "disk_free": human_size(disk.free),
        "data_dir": str(config.DATA_DIR),
        "s3_configured": bool(s.get("s3_bucket")),
        "s3_bucket": s.get("s3_bucket", ""),
        "retention_days": int(db.get_setting("retention_days", str(config.DEFAULT_RETENTION_DAYS)) or 0),
        "max_upload_mb": config.MAX_UPLOAD_MB,
        "demo_seed": config.DEMO_SEED,
    }


@router.get("/events")
def events(user: dict = Depends(require_user), limit: int = 50) -> dict[str, Any]:
    limit = max(1, min(limit, 300))
    return {"events": db.rows("SELECT * FROM events ORDER BY id DESC LIMIT ?", (limit,))}
