"""Background maintenance: verify new archives, apply retention, log backup health."""

from __future__ import annotations

import json
import logging
import threading
import time
from datetime import datetime, timedelta, timezone

from .. import config, db
from ..util import human_size, now, parse_iso
from . import backup, storage

log = logging.getLogger("control.scheduler")
_thread: threading.Thread | None = None
_stop = threading.Event()


def verify_snapshot(snapshot: dict) -> bool:
    try:
        path = backup.snapshot_path(snapshot)
        info = backup.validate_archive(path)
        ok = info["integrity"] in {"ok", "unknown"}
        db.execute(
            "UPDATE snapshots SET status=?, verified_at=?, row_counts_json=?, error=? WHERE id=?",
            (
                "ok" if ok else "corrupt",
                datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                json.dumps(info["row_counts"]),
                "" if ok else f"integrity: {info['integrity']}",
                snapshot["id"],
            ),
        )
        return ok
    except Exception as exc:  # pragma: no cover - IO/network dependent
        db.execute("UPDATE snapshots SET status='error', error=? WHERE id=?", (str(exc)[:300], snapshot["id"]))
        return False


def _tick() -> None:
    unverified = db.rows(
        "SELECT * FROM snapshots WHERE verified_at IS NULL AND status IN ('ok','remote') ORDER BY id DESC LIMIT 2"
    )
    for snap in unverified:
        verify_snapshot(snap)

    # health notifications are computed from last_backup_at; record a single event
    for bot in db.rows("SELECT * FROM bots WHERE status='active'"):
        parsed = parse_iso(bot.get("last_backup_at"))
        interval = int(bot.get("backup_interval_hours") or 6)
        if parsed is None:
            continue
        age = (now() - parsed).total_seconds() / 3600
        if age > interval * 1.5:
            recent = db.row(
                "SELECT id FROM events WHERE bot_id=? AND kind='late' AND created_at > ? LIMIT 1",
                (bot["id"], (now() - timedelta(hours=interval)).strftime("%Y-%m-%dT%H:%M:%SZ")),
            )
            if not recent:
                db.add_event("late", f"No backup for {age:.0f}h — check the agent on the bot host", bot["id"])

    backup.prune()
    if not _stop.is_set():
        log.debug("scheduler tick complete; local backups: %s", human_size(storage.dir_size(config.BACKUPS_DIR)))


def _loop() -> None:
    time.sleep(20)
    while not _stop.is_set():
        try:
            _tick()
        except Exception as exc:  # pragma: no cover - last-resort guard
            log.warning("scheduler error: %s", exc)
        _stop.wait(300)


def start() -> None:
    global _thread
    if _thread and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(target=_loop, name="control-scheduler", daemon=True)
    _thread.start()
    log.info("background scheduler started")
