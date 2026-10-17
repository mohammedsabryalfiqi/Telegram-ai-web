"""Small shared helpers."""

from __future__ import annotations

import hashlib
import io
import re
import secrets
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

from fastapi import HTTPException


def now() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now().strftime("%Y-%m-%dT%H:%M:%SZ")


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
            try:
                parsed = datetime.strptime(value[:19], fmt)
                break
            except ValueError:
                continue
        else:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def human_size(size: int) -> str:
    value = float(size)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if value < 1024 or unit == "TB":
            if unit == "B":
                return f"{int(value)} {unit}"
            return f"{value:.1f} {unit}"
        value /= 1024
    return f"{size} B"


def safe_filename(name: str, fallback: str = "backup.zip") -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._\-\u0600-\u06FF ]+", "_", (name or "").strip())
    cleaned = cleaned.strip(" .")[:150]
    return cleaned or fallback


def sha256_file(path: Path, chunk: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(chunk)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def safe_extract(zip_path: Path, target_dir: Path) -> list[Path]:
    """Extract a zip with zip-slip / symlink protection; returns extracted files."""
    target_dir.mkdir(parents=True, exist_ok=True)
    root = target_dir.resolve()
    extracted: list[Path] = []
    with zipfile.ZipFile(zip_path) as archive:
        for info in archive.infolist():
            name = info.filename
            if name.endswith("/"):
                continue
            if name.startswith("/") or ".." in Path(name).parts:
                raise HTTPException(status_code=400, detail="Archive contains an unsafe path")
            dest = (root / name).resolve()
            if not str(dest).startswith(str(root) + "/"):
                raise HTTPException(status_code=400, detail="Archive contains an unsafe path")
            if info.file_size > 4 * 1024 ** 3:
                raise HTTPException(status_code=400, detail="Archive member is too large")
            dest.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as src, dest.open("wb") as out:
                while True:
                    block = src.read(1024 * 1024)
                    if not block:
                        break
                    out.write(block)
            extracted.append(dest)
    return extracted


def iter_zip_files(zip_path: Path) -> Iterable[zipfile.ZipInfo]:
    with zipfile.ZipFile(zip_path) as archive:
        yield from archive.infolist()


def new_api_key(bot_id: int) -> tuple[str, str, str]:
    """Return (plaintext, sha256 hash, display prefix)."""
    token = secrets.token_urlsafe(32)
    plain = f"bk_{bot_id}_{token}"
    return plain, hashlib.sha256(plain.encode()).hexdigest(), f"bk_{bot_id}_{token[:6]}…"


def hash_api_key(value: str) -> str:
    return hashlib.sha256((value or "").encode()).hexdigest()


def mask_secret(value: str) -> str:
    value = value or ""
    if len(value) <= 8:
        return "••••••••" if value else ""
    return f"{value[:4]}••••{value[-4:]}"


def relative_time(value: str | None) -> str:
    parsed = parse_iso(value)
    if parsed is None:
        return "—"
    delta = now() - parsed
    seconds = int(delta.total_seconds())
    if seconds < 0:
        seconds = 0
    if seconds < 60:
        return "just now"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes}m ago"
    hours = minutes // 60
    if hours < 24:
        return f"{hours}h ago"
    days = hours // 24
    if days < 30:
        return f"{days}d ago"
    return parsed.strftime("%Y-%m-%d")


def last_days(count: int) -> list[str]:
    today = now().date()
    return [(today - timedelta(days=offset)).isoformat() for offset in range(count - 1, -1, -1)]
