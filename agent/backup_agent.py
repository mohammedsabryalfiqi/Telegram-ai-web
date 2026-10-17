#!/usr/bin/env python3
"""Alfiqi Control — backup agent for SmarTel / Tg-bot-ai.

Runs next to the bot (inside the same container or on any host that can read the
storage volume). Standard library only: nothing to install.

Examples
--------
One snapshot, then exit:
    python backup_agent.py --site https://control.example.com --key bk_1_xxx \
        --storage /app/storage --once

Daemon: snapshot every 6h, pull dashboard changes every 60s:
    python backup_agent.py --site https://control.example.com --key bk_1_xxx \
        --storage /app/storage --interval 21600 --pull-changes 60

Restore a downloaded archive (stops nothing — stop the bot first!):
    python backup_agent.py --restore restore-bundle.zip --storage /app/storage --yes

Environment variables are supported as defaults:
    BACKUP_SITE, BACKUP_KEY, SMARTEL_STORAGE_DIR
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import mimetypes
import os
import shutil
import sqlite3
import socket
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

VERSION = "1.0.0"
DB_SUFFIXES = {".db", ".sqlite", ".sqlite3"}
SKIP_DIRS = {"backups", "node_modules", ".git", "__pycache__"}


def log(message: str) -> None:
    stamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{stamp}] {message}", flush=True)


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# Snapshot creation
# ---------------------------------------------------------------------------
def list_databases(storage: Path) -> list[Path]:
    found: list[Path] = []
    for path in sorted(storage.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in DB_SUFFIXES:
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.name.endswith(("-wal", "-shm")):
            continue
        # skip copies already sitting inside a previous backup
        if "backups" in path.parts:
            continue
        found.append(path)
    return found


def sqlite_backup(source: Path, target: Path) -> bool:
    try:
        uri = source.resolve().as_uri() + "?mode=ro"
        with sqlite3.connect(uri, uri=True, timeout=30) as src:
            with sqlite3.connect(target) as dst:
                src.backup(dst)
        return True
    except sqlite3.Error as exc:
        log(f"  ! skipped {source.name}: {exc}")
        return False


def database_counts(path: Path) -> dict:
    counts: dict[str, int] = {}
    try:
        with sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True) as conn:
            tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            for table in ("customers", "messages", "unanswered_questions", "faq_entries", "kb_items", "topic_rules", "resources"):
                if table in tables:
                    counts[table] = int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
    except sqlite3.Error:
        pass
    return counts


def build_archive(storage: Path, target: Path) -> dict:
    storage = storage.resolve()
    if not storage.is_dir():
        raise SystemExit(f"Storage directory not found: {storage}")
    databases = list_databases(storage)
    if not databases:
        raise SystemExit(f"No SQLite database found under {storage}. Is the path right?")
    counts: dict[str, int] = {}
    with tempfile.TemporaryDirectory(prefix="agent-") as temp:
        temp_dir = Path(temp)
        db_copies: list[tuple[Path, str]] = []
        for source in databases:
            relative = source.relative_to(storage)
            copy = temp_dir / "dbs" / relative
            copy.parent.mkdir(parents=True, exist_ok=True)
            if sqlite_backup(source, copy):
                db_copies.append((copy, str(relative)))
                if source.name == "smartel.db" or len(databases) == 1:
                    counts = database_counts(copy)
        if not db_copies:
            raise SystemExit("Could not take a consistent copy of any SQLite database")
        manifest = {
            "app": "SMARTEL",
            "agent_version": VERSION,
            "created_at": now_iso(),
            "hostname": socket.gethostname(),
            "storage": str(storage),
            "databases": [name for _, name in db_copies],
            "counts": counts,
            "python": sys.version.split()[0],
        }
        with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for copy, relative in db_copies:
                archive.write(copy, relative)
            for folder in ("uploads", "vector_store"):
                base = storage / folder
                if not base.is_dir():
                    continue
                for item in base.rglob("*"):
                    if item.is_file() and not item.name.endswith(("-wal", "-shm")):
                        archive.write(item, item.relative_to(storage).as_posix())
            archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    return {"manifest": manifest, "counts": counts}


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


# ---------------------------------------------------------------------------
# HTTP (stdlib)
# ---------------------------------------------------------------------------
def request_json(url: str, key: str, *, method: str = "GET", payload: dict | None = None, timeout: int = 60) -> dict:
    body = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(url, data=body, method=method)
    request.add_header("X-Backup-Key", key)
    request.add_header("User-Agent", f"AlfiqiAgent/{VERSION}")
    request.add_header("Accept", "application/json")
    if body is not None:
        request.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8") or "{}")


def upload_snapshot(site: str, key: str, archive: Path, checksum: str) -> dict:
    boundary = f"----alfiqi{uuid.uuid4().hex}"
    filename = archive.name
    content_type = mimetypes.guess_type(filename)[0] or "application/zip"
    head = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode()
    tail = f"\r\n--{boundary}--\r\n".encode()
    size = archive.stat().st_size
    body = io.BytesIO()
    body.write(head)
    with archive.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            body.write(block)
    body.write(tail)
    data = body.getvalue()
    request = urllib.request.Request(f"{site.rstrip('/')}/api/ingest", data=data, method="POST")
    request.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    request.add_header("Content-Length", str(len(data)))
    request.add_header("X-Backup-Key", key)
    request.add_header("X-Checksum-Sha256", checksum)
    request.add_header("X-Agent-Version", VERSION)
    request.add_header("X-Source", "agent")
    request.add_header("User-Agent", f"AlfiqiAgent/{VERSION}")
    with urllib.request.urlopen(request, timeout=300) as response:
        result = json.loads(response.read().decode("utf-8") or "{}")
    result["_size"] = size
    return result


def upload_with_retry(site: str, key: str, archive: Path, checksum: str) -> dict:
    delay = 5
    last_error: Exception | None = None
    for attempt in range(1, 4):
        try:
            return upload_snapshot(site, key, archive, checksum)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:400]
            if 400 <= exc.code < 500:
                raise SystemExit(f"Server rejected the snapshot ({exc.code}): {detail}")
            last_error = RuntimeError(f"HTTP {exc.code}: {detail}")
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc
        log(f"  upload attempt {attempt} failed: {last_error}; retrying in {delay}s")
        time.sleep(delay)
        delay *= 2
    raise SystemExit(f"Could not upload the snapshot: {last_error}")


# ---------------------------------------------------------------------------
# Change pull (write-back)
# ---------------------------------------------------------------------------
def apply_sql(storage: Path, sql: str) -> None:
    databases = list_databases(storage)
    if not databases:
        raise RuntimeError("No database available to apply changes")
    main = next((path for path in databases if path.name == "smartel.db"), databases[0])
    with sqlite3.connect(main, timeout=30) as conn:
        conn.executescript(sql)
        conn.commit()


def pull_changes(site: str, key: str, storage: Path) -> int:
    result = request_json(f"{site.rstrip('/')}/api/agent/changes", key)
    changes = result.get("changes") or []
    if not changes:
        return 0
    applied: list[int] = []
    for change in changes:
        try:
            apply_sql(storage, str(change.get("sql") or ""))
            applied.append(int(change["id"]))
            log(f"  applied change #{change['id']}: {change.get('description', '')}")
        except Exception as exc:
            log(f"  ! could not apply change #{change.get('id')}: {exc}")
    if applied:
        request_json(
            f"{site.rstrip('/')}/api/agent/changes/ack",
            key,
            method="POST",
            payload={"ids": applied},
        )
    return len(applied)


# ---------------------------------------------------------------------------
# Restore
# ---------------------------------------------------------------------------
def safe_extract(archive: Path, target: Path) -> None:
    target.mkdir(parents=True, exist_ok=True)
    root = target.resolve()
    with zipfile.ZipFile(archive) as zipped:
        bad = zipped.testzip()
        if bad:
            raise SystemExit(f"Corrupted archive member: {bad}")
        for info in zipped.infolist():
            if info.filename.endswith("/"):
                continue
            if info.filename.startswith("/") or ".." in Path(info.filename).parts:
                raise SystemExit("Archive contains an unsafe path")
            destination = (root / info.filename).resolve()
            if not str(destination).startswith(str(root) + os.sep):
                raise SystemExit("Archive contains an unsafe path")
            destination.parent.mkdir(parents=True, exist_ok=True)
            with zipped.open(info) as source, destination.open("wb") as output:
                shutil.copyfileobj(source, output)


def restore_archive(archive: Path, storage: Path, assume_yes: bool) -> None:
    storage = storage.resolve()
    if not archive.is_file():
        raise SystemExit(f"Archive not found: {archive}")
    staging = Path(tempfile.mkdtemp(prefix="alfiqi-restore-"))
    try:
        safe_extract(archive, staging)
        databases = [
            path for path in staging.rglob("*")
            if path.is_file() and path.suffix.lower() in DB_SUFFIXES
            and not path.name.endswith(("-wal", "-shm"))
        ]
        if not databases:
            raise SystemExit("No SQLite database inside this archive")
        for database in databases:
            with sqlite3.connect(f"{database.as_uri()}?mode=ro", uri=True) as conn:
                check = conn.execute("PRAGMA integrity_check").fetchone()[0]
            if check != "ok":
                raise SystemExit(f"Integrity check failed for {database.name}: {check}")
        if not assume_yes:
            print("This will replace files inside:", storage)
            print("Databases:", ", ".join(path.name for path in databases))
            answer = input("Type RESTORE to continue: ").strip()
            if answer != "RESTORE":
                raise SystemExit("Aborted")
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        storage.mkdir(parents=True, exist_ok=True)
        for database in databases:
            relative = database.relative_to(staging)
            target = storage / relative
            if target.exists():
                target.rename(target.with_name(f"{target.name}.bak-{stamp}"))
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(database, target)
            log(f"restored {relative}")
        for folder in ("uploads", "vector_store"):
            source_dir = staging / folder
            if not source_dir.is_dir():
                continue
            for item in source_dir.rglob("*"):
                if not item.is_file():
                    continue
                relative = item.relative_to(staging)
                target = storage / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(item, target)
            log(f"restored {folder}/")
        log(f"Done. Previous files were kept with the suffix .bak-{stamp}")
    finally:
        shutil.rmtree(staging, ignore_errors=True)


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
def take_snapshot(site: str, key: str, storage: Path, keep_archive: Path | None = None) -> bool:
    with tempfile.TemporaryDirectory(prefix="alfiqi-agent-") as temp:
        archive = Path(temp) / f"alfiqi-{datetime.now().strftime('%Y%m%dT%H%M%S')}.zip"
        log("Creating a consistent snapshot…")
        info = build_archive(storage, archive)
        checksum = sha256_of(archive)
        size = archive.stat().st_size
        log(f"Archive ready: {size / 1024:.1f} KB · sha256 {checksum[:16]}…")
        result = upload_with_retry(site, key, archive, checksum)
        log(
            f"Uploaded snapshot #{result.get('snapshot_id')} "
            f"({result.get('size_bytes', size) / 1024:.1f} KB) · pending changes: {result.get('pending_changes', 0)}"
        )
        if keep_archive:
            shutil.copy2(archive, keep_archive)
        return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Alfiqi Control backup agent")
    parser.add_argument("--site", default=os.environ.get("BACKUP_SITE", ""), help="Control panel URL")
    parser.add_argument("--key", default=os.environ.get("BACKUP_KEY", ""), help="Bot backup key (bk_…)")
    parser.add_argument(
        "--storage",
        default=os.environ.get("SMARTEL_STORAGE_DIR", os.environ.get("STORAGE_DIR", "./storage")),
        help="Bot storage directory (default: ./storage)",
    )
    parser.add_argument("--interval", type=int, default=21600, help="Seconds between snapshots (default: 21600 = 6h)")
    parser.add_argument("--pull-changes", type=int, default=60, dest="pull_changes", help="Seconds between change pulls (0 = off)")
    parser.add_argument("--once", action="store_true", help="Take one snapshot and exit")
    parser.add_argument("--no-apply", action="store_true", help="Never apply dashboard changes to the bot DB")
    parser.add_argument("--restore", type=Path, help="Restore from a ZIP archive instead of running")
    parser.add_argument("--yes", action="store_true", help="Skip the restore confirmation prompt")
    parser.add_argument("--keep-archive", type=Path, help="Also keep a local copy of the generated snapshot")
    parser.add_argument("--version", action="version", version=f"Alfiqi Agent {VERSION}")
    args = parser.parse_args()

    if args.restore:
        restore_archive(args.restore, Path(args.storage), args.yes)
        return 0

    if not args.site or not args.key:
        parser.error("--site and --key are required (or set BACKUP_SITE / BACKUP_KEY)")

    storage = Path(args.storage).expanduser()
    site = args.site.rstrip("/")

    if args.once:
        take_snapshot(site, args.key, storage, args.keep_archive)
        if not args.no_apply and args.pull_changes:
            pull_changes(site, args.key, storage)
        return 0

    log(f"Alfiqi agent {VERSION} · {site} · storage={storage.resolve()}")
    log(f"Snapshots every {args.interval}s · change pull every {args.pull_changes}s")
    try:
        hello = request_json(f"{site}/api/agent/hello", args.key)
        log(f"Connected to “{hello['bot']['name']}” · pending changes: {hello.get('pending_changes', 0)}")
        request_json(
            f"{site}/api/agent/heartbeat",
            args.key,
            method="POST",
            payload={"note": f"Agent online on {socket.gethostname()} (v{VERSION})"},
        )
    except Exception as exc:
        log(f"Warning: could not reach the control panel yet: {exc}")

    last_snapshot = 0.0
    last_pull = 0.0
    while True:
        try:
            now_ts = time.time()
            if last_snapshot == 0 or now_ts - last_snapshot >= args.interval:
                take_snapshot(site, args.key, storage, args.keep_archive)
                last_snapshot = now_ts
            if args.pull_changes and not args.no_apply and (last_pull == 0 or now_ts - last_pull >= args.pull_changes):
                applied = pull_changes(site, args.key, storage)
                if applied:
                    log(f"Synced {applied} dashboard change(s) into the bot database")
                last_pull = now_ts
        except SystemExit:
            raise
        except Exception as exc:
            log(f"Error: {exc} — retrying in 60s")
        time.sleep(min(60, max(5, args.pull_changes or 60)))


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        log("Stopped.")
        raise SystemExit(0)
