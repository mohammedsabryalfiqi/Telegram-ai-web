"""Snapshot detail, verification, downloads and restore records."""

from __future__ import annotations

import zipfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from .. import config, db
from ..security import require_user
from ..services import backup, storage
from ..services.scheduler import verify_snapshot
from ..util import now_iso, safe_filename
from .bots import _snapshot_row

router = APIRouter(prefix="/api", tags=["snapshots"])


def _snapshot(snapshot_id: int) -> dict[str, Any]:
    snap = db.row("SELECT s.*, b.name AS bot_name FROM snapshots s JOIN bots b ON b.id=s.bot_id WHERE s.id=?", (snapshot_id,))
    if snap is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return snap


@router.get("/snapshots/{snapshot_id}")
def detail(snapshot_id: int, user: dict = Depends(require_user)) -> dict[str, Any]:
    snap = _snapshot(snapshot_id)
    return {"snapshot": _snapshot_row(snap), "bot_name": snap.get("bot_name")}


@router.get("/snapshots/{snapshot_id}/download")
def download(snapshot_id: int, user: dict = Depends(require_user)) -> FileResponse:
    snap = _snapshot(snapshot_id)
    try:
        archive = backup.snapshot_path(snap)
    except backup.BackupError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return FileResponse(
        path=archive,
        media_type="application/zip",
        filename=safe_filename(snap["filename"]),
    )


@router.get("/snapshots/{snapshot_id}/restore-package")
def restore_package(snapshot_id: int, user: dict = Depends(require_user)) -> FileResponse:
    snap = _snapshot(snapshot_id)
    try:
        archive, guide = backup.restore_package(snap)
    except backup.BackupError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    package = config.TMP_DIR / f"restore-{snapshot_id}.zip"
    with zipfile.ZipFile(package, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
        bundle.write(archive, archive.name)
        bundle.writestr("RESTORE.md", guide)
    return FileResponse(
        path=package,
        media_type="application/zip",
        filename=safe_filename(f"restore-{snap['bot_name']}-{snapshot_id}.zip"),
    )


@router.post("/snapshots/{snapshot_id}/verify")
def verify(snapshot_id: int, user: dict = Depends(require_user)) -> dict[str, Any]:
    snap = _snapshot(snapshot_id)
    ok = verify_snapshot(snap)
    fresh = _snapshot(snapshot_id)
    return {"ok": ok, "snapshot": _snapshot_row(fresh)}


@router.post("/snapshots/{snapshot_id}/restore")
def create_restore(snapshot_id: int, payload: dict | None = None, user: dict = Depends(require_user)) -> dict[str, Any]:
    snap = _snapshot(snapshot_id)
    payload = payload or {}
    note = str(payload.get("note") or "")[:500]
    try:
        archive, guide = backup.restore_package(snap)
    except backup.BackupError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    restore_id = db.insert(
        "INSERT INTO restores(bot_id, snapshot_id, created_at, mode, target, note, status) VALUES (?,?,?,?,?,?,?)",
        (snap["bot_id"], snapshot_id, now_iso(), "download", str(archive), note, "ready"),
    )
    db.add_event("restore", f"Restore package prepared from snapshot #{snapshot_id}", snap["bot_id"])
    return {
        "ok": True,
        "restore_id": restore_id,
        "download_url": f"/api/snapshots/{snapshot_id}/download",
        "package_url": f"/api/snapshots/{snapshot_id}/restore-package",
        "guide": guide,
        "filename": snap["filename"],
        "size_bytes": snap["size_bytes"],
        "sha256": snap["sha256"],
    }


@router.get("/bots/{bot_id}/restores")
def restores(bot_id: int, user: dict = Depends(require_user)) -> dict[str, Any]:
    return {"restores": db.rows("SELECT * FROM restores WHERE bot_id=? ORDER BY id DESC LIMIT 50", (bot_id,))}


@router.delete("/snapshots/{snapshot_id}")
def delete_snapshot(snapshot_id: int, user: dict = Depends(require_user)) -> dict[str, Any]:
    snap = _snapshot(snapshot_id)
    count = db.scalar("SELECT COUNT(*) FROM snapshots WHERE bot_id=?", (snap["bot_id"],), 0) or 0
    if count <= 1:
        raise HTTPException(status_code=400, detail="At least one snapshot per bot must be kept")
    storage.remove_snapshot_files(snap)
    if snap.get("s3_key"):
        storage.delete_remote(snap["s3_key"])
    db.execute("DELETE FROM snapshots WHERE id=?", (snapshot_id,))
    db.add_event("backup", f"Snapshot #{snapshot_id} deleted", snap["bot_id"])
    return {"ok": True}
