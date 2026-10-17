"""Backup engine: validate, store, extract, analyse and restore SMARTEL snapshots."""

from __future__ import annotations

import json
import logging
import shutil
import sqlite3
import tempfile
import zipfile
from pathlib import Path
from typing import Any

from .. import config, db
from ..util import human_size, now_iso, safe_extract, safe_filename, sha256_file
from . import storage

log = logging.getLogger("control.backup")

MAX_DB_LISTED = 50


class BackupError(Exception):
    pass


def bot_dir(bot_id: int) -> Path:
    return config.WORKSPACES_DIR / f"bot-{bot_id}"


def current_dir(bot_id: int) -> Path:
    return bot_dir(bot_id) / "current"


def _snapshot_dir(snapshot_id: int) -> Path:
    return config.BACKUPS_DIR / str(snapshot_id)


def find_databases(root: Path) -> list[Path]:
    return sorted(
        path for path in root.rglob("*")
        if path.is_file() and path.suffix.lower() in {".db", ".sqlite", ".sqlite3"}
        and "-wal" not in path.name and "-shm" not in path.name
    )


def pick_main_database(files: list[Path]) -> Path:
    named = [p for p in files if p.name == "smartel.db"]
    if named:
        return named[0]
    shallow = sorted(files, key=lambda p: len(p.parts))
    if not shallow:
        raise BackupError("No SQLite database found inside the archive")
    return shallow[0]


def _db_quick_check(path: Path) -> str:
    try:
        with sqlite3.connect(f"file:{path}?mode=ro", uri=True) as conn:
            result = conn.execute("PRAGMA integrity_check").fetchone()
            return str(result[0]) if result else "unknown"
    except sqlite3.Error as exc:
        return f"error: {exc}"


def _read_manifest(zip_path: Path) -> dict[str, Any]:
    try:
        with zipfile.ZipFile(zip_path) as archive:
            for name in ("manifest.json", "backup-manifest.json"):
                if name in archive.namelist():
                    return json.loads(archive.read(name).decode("utf-8"))
    except (KeyError, zipfile.BadZipFile, ValueError):
        pass
    return {}


def validate_archive(zip_path: Path) -> dict[str, Any]:
    if not zipfile.is_zipfile(zip_path):
        raise BackupError("The uploaded file is not a valid .zip archive")
    try:
        with zipfile.ZipFile(zip_path) as archive:
            bad = archive.testzip()
            if bad:
                raise BackupError(f"Archive member failed its CRC check: {bad}")
    except zipfile.BadZipFile as exc:
        raise BackupError(f"Corrupted zip archive: {exc}") from exc

    manifest = _read_manifest(zip_path)
    with tempfile.TemporaryDirectory(prefix="verify-") as temp:
        temp_dir = Path(temp)
        safe_extract(zip_path, temp_dir)
        files = find_databases(temp_dir)
        if not files:
            raise BackupError("No SQLite database (.db) inside the archive — is this a SMARTEL backup?")
        main_db = pick_main_database(files)
        check = _db_quick_check(main_db)
        counts = _table_counts(main_db)
        main_name = str(main_db.relative_to(temp_dir))
        dbs = [{"name": str(p.relative_to(temp_dir)), "size": p.stat().st_size} for p in files[:MAX_DB_LISTED]]
    return {
        "manifest": manifest,
        "integrity": check,
        "main_db": main_name,
        "databases": dbs,
        "row_counts": counts,
    }


def _table_counts(db_path: Path) -> dict[str, int]:
    tables = (
        "customers", "messages", "unanswered_questions", "faq_entries", "kb_items",
        "kb_chunks", "topic_rules", "resources", "pending_approvals",
        "paused_chats", "paid_messages", "business_connections",
    )
    counts: dict[str, int] = {}
    try:
        with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as conn:
            existing = {
                row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
            }
            for table in tables:
                if table in existing:
                    counts[table] = int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
    except sqlite3.Error:
        pass
    return counts


def register_snapshot(
    bot: dict[str, Any],
    upload_path: Path,
    *,
    source: str,
    original_name: str,
    client_sha256: str = "",
    note: str = "",
) -> dict[str, Any]:
    """Validate an uploaded archive, store it (local + S3), and activate its workspace."""
    if not upload_path.exists() or upload_path.stat().st_size == 0:
        raise BackupError("The uploaded archive is empty")
    size = upload_path.stat().st_size
    if size > config.MAX_UPLOAD_MB * 1024 * 1024:
        raise BackupError(f"Archive exceeds the {config.MAX_UPLOAD_MB} MB limit")

    info = validate_archive(upload_path)
    if info["integrity"] not in {"ok", "unknown"}:
        raise BackupError(f"SQLite integrity check failed: {info['integrity']}")

    digest = sha256_file(upload_path)
    if client_sha256 and client_sha256.lower() != digest:
        raise BackupError("Checksum mismatch between the agent header and the received file")

    stamp = now_iso().replace("-", "").replace(":", "")
    filename = safe_filename(f"{bot['name']}-{stamp}.zip")
    filename = filename.replace(" ", "-")
    snapshot_id = db.insert(
        "INSERT INTO snapshots(bot_id, created_at, filename, size_bytes, sha256, source, status, "
        "row_counts_json, manifest_json, local_path) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (
            bot["id"], now_iso(), filename, size, digest, source, "ok",
            json.dumps(info["row_counts"]), json.dumps(info["manifest"]), "",
        ),
    )
    dest_dir = _snapshot_dir(snapshot_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / filename
    shutil.move(str(upload_path), dest)
    db.execute(
        "UPDATE snapshots SET local_path=? WHERE id=?",
        (str(dest), snapshot_id),
    )

    # Mirror to object storage (best effort — the local copy stays authoritative).
    s3_key = ""
    storage_error = ""
    try:
        s3_key = storage.upload(dest, bot["id"], filename)
        if s3_key:
            db.execute("UPDATE snapshots SET s3_key=? WHERE id=?", (s3_key, snapshot_id))
    except Exception as exc:  # pragma: no cover - network dependent
        storage_error = str(exc)[:300]
        log.warning("S3 mirror failed for snapshot %s: %s", snapshot_id, exc)

    activate_workspace(bot["id"], dest)

    from .analytics import build_overview
    overview = build_overview(bot["id"], snapshot_id=snapshot_id)
    db.execute(
        "UPDATE bots SET last_backup_at=?, updated_at=?, last_stats_json=? WHERE id=?",
        (now_iso(), now_iso(), json.dumps(overview["totals"]), bot["id"]),
    )
    db.add_event(
        "backup",
        f"Snapshot #{snapshot_id} received ({human_size(size)}, {source})"
        + (f" — S3 warning: {storage_error}" if storage_error else ""),
        bot["id"],
    )
    return db.row("SELECT * FROM snapshots WHERE id=?", (snapshot_id,))  # type: ignore[return-value]


def activate_workspace(bot_id: int, zip_path: Path) -> Path:
    """Extract the archive into workspaces/bot-<id>/current atomically."""
    staging = bot_dir(bot_id) / "staging"
    target = current_dir(bot_id)
    shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True, exist_ok=True)
    safe_extract(zip_path, staging)
    dbs = find_databases(staging)
    main = pick_main_database(dbs)
    if main.parent != staging:
        # keep the folder layout expected by the bot (db at the archive root)
        for item in list(main.parent.iterdir()):
            shutil.move(str(item), str(staging / item.name))
    shutil.rmtree(target, ignore_errors=True)
    staging.rename(target)
    meta = {
        "activated_at": now_iso(),
        "databases": [str(p.relative_to(target)) for p in find_databases(target)],
    }
    (bot_dir(bot_id) / "workspace.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return target


def main_db_path(bot_id: int) -> Path | None:
    root = current_dir(bot_id)
    if not root.exists():
        return None
    try:
        return pick_main_database(find_databases(root))
    except BackupError:
        return None


def snapshot_path(snapshot: dict[str, Any]) -> Path:
    path = storage.local_snapshot_path(snapshot.get("local_path", ""), snapshot["filename"], snapshot["id"])
    if path:
        return path
    if snapshot.get("s3_key"):
        target = config.TMP_DIR / f"snapshot-{snapshot['id']}.zip"
        if not target.exists():
            storage.download(snapshot["s3_key"], target)
        return target
    raise BackupError("The archive is not available locally or in object storage")


def restore_package(snapshot: dict[str, Any]) -> tuple[Path, str]:
    """Return the archive plus a bilingual restore guide."""
    archive = snapshot_path(snapshot)
    guide = f"""# Restore guide — snapshot #{snapshot['id']}

Bot: {snapshot.get('bot_name', '')}
Created: {snapshot['created_at']}
SHA-256: {snapshot['sha256']}
Archive: {snapshot['filename']}

## 1) استعادة كاملة على Railway (Arabic)
1. أوقف خدمة البوت مؤقتًا من Railway.
2. نزّل هذا الأرشيف ثم ارفعه إلى السيرفر (أو استخدم `agent/backup_agent.py --restore`).
3. فك الضغط داخل مسار الـ Volume، مع الحفاظ على البنية:
   - `smartel.db` (أو ملفات `.db` الأخرى) في جذر `storage/`
   - `uploads/` و `vector_store/` كما هي
4. شغّل البوت من جديد. تأكد أن `DB_PATH` يشير إلى الملف المستعاد.
5. راجع أذونات الملفات: يجب أن يملكها المستخدم الذي يعمل به البوت.

## 2) Command line
```bash
python agent/backup_agent.py --restore {snapshot['filename']} --storage ./storage
```

## 3) التحقق
```bash
sqlite3 storage/smartel.db "PRAGMA integrity_check;"
```

_Generated by Alfiqi Control._
"""
    return archive, guide


def prune(bot_id: int | None = None) -> int:
    """Apply retention (days + keep-last) to local archives. S3 copies stay."""
    retention_days = int(db.get_setting("retention_days", str(config.DEFAULT_RETENTION_DAYS)) or 0)
    keep_last = int(db.get_setting("keep_last_snapshots", str(config.DEFAULT_KEEP_LAST)) or 0)
    if keep_last <= 0 and retention_days <= 0:
        return 0
    query = "SELECT * FROM snapshots"
    params: list[Any] = []
    if bot_id:
        query += " WHERE bot_id=?"
        params.append(bot_id)
    query += " ORDER BY id DESC"
    snapshots = db.rows(query, params)
    removed = 0
    per_bot: dict[int, int] = {}
    for snap in snapshots:
        bid = snap["bot_id"]
        per_bot[bid] = per_bot.get(bid, 0) + 1
        too_many = keep_last > 0 and per_bot[bid] > keep_last
        if retention_days > 0:
            from ..util import parse_iso, now
            created = parse_iso(snap["created_at"])
            too_old = created is not None and (now() - created).days > retention_days
        else:
            too_old = False
        if not (too_many or too_old):
            continue
        # never delete the newest snapshot for a bot
        if per_bot[bid] == 1:
            continue
        storage.remove_snapshot_files(snap)
        if not snap.get("s3_key"):
            db.execute("DELETE FROM snapshots WHERE id=?", (snap["id"],))
        else:
            db.execute("UPDATE snapshots SET local_path='', status='remote' WHERE id=?", (snap["id"],))
        removed += 1
    if removed:
        db.add_event("retention", f"Retention removed {removed} local archive(s) (S3 copies kept)", bot_id)
    return removed
