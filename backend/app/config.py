"""Application configuration (environment driven, safe defaults)."""

from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("DATA_DIR", BASE_DIR / "data")).resolve()
FRONTEND_DIST = Path(os.environ.get("FRONTEND_DIST", BASE_DIR / "frontend" / "dist")).resolve()

BACKUPS_DIR = DATA_DIR / "backups"
WORKSPACES_DIR = DATA_DIR / "workspaces"
TMP_DIR = DATA_DIR / "tmp"
CONTROL_DB = DATA_DIR / "control.db"
SECRET_FILE = DATA_DIR / "secret.key"

APP_NAME = os.environ.get("APP_NAME", "Alfiqi Control")
APP_URL = os.environ.get("APP_URL", "").rstrip("/")

ADMIN_EMAIL = (os.environ.get("ADMIN_EMAIL") or "").strip().lower()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ""
ADMIN_NAME = os.environ.get("ADMIN_NAME") or "Owner"

DEMO_SEED = (os.environ.get("DEMO_SEED", "0") or "0").strip() not in {"0", "false", "no", "off"}

COOKIE_NAME = "cp_session"
COOKIE_SECURE = (os.environ.get("COOKIE_SECURE", "0") or "0").strip() in {"1", "true", "yes"}
SESSION_DAYS = int(os.environ.get("SESSION_DAYS", "14"))
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "2048"))
DEFAULT_RETENTION_DAYS = int(os.environ.get("RETENTION_DAYS", "30"))
DEFAULT_KEEP_LAST = int(os.environ.get("KEEP_LAST_SNAPSHOTS", "40"))
BACKUP_STALE_HOURS = int(os.environ.get("BACKUP_STALE_HOURS", "12"))
PREVIEW_ORIGINS = [
    origin.strip()
    for origin in (os.environ.get("CORS_ORIGINS") or "").split(",")
    if origin.strip()
]


def ensure_dirs() -> None:
    for path in (DATA_DIR, BACKUPS_DIR, WORKSPACES_DIR, TMP_DIR):
        path.mkdir(parents=True, exist_ok=True)
