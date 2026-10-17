"""Backup storage: local filesystem + optional S3-compatible object storage (R2/B2/S3).

The control plane always keeps a local copy (unless S3_ONLY is configured) and can
mirror each archive to an S3 bucket so a lost Railway volume is never a lost backup.
Secrets are encrypted at rest with the application secret.
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Any

from .. import config, db
from ..security import decrypt_secret, encrypt_secret
from ..util import human_size

log = logging.getLogger("control.storage")

S3_KEYS = {
    "s3_endpoint": "",
    "s3_bucket": "",
    "s3_region": "auto",
    "s3_access_key": "",
    "s3_secret_key_enc": "",
    "s3_prefix": "alfiqi-backups",
    "s3_keep_local": "1",
}


def storage_settings() -> dict[str, str]:
    stored = db.all_settings()
    result = dict(S3_KEYS)
    for key in S3_KEYS:
        if key in stored:
            result[key] = stored[key]
    # env overrides (useful for Railway variables)
    import os

    env_map = {
        "s3_endpoint": "S3_ENDPOINT",
        "s3_bucket": "S3_BUCKET",
        "s3_region": "S3_REGION",
        "s3_access_key": "S3_ACCESS_KEY",
        "s3_prefix": "S3_PREFIX",
        "s3_keep_local": "S3_KEEP_LOCAL",
    }
    for key, env_name in env_map.items():
        if os.environ.get(env_name):
            result[key] = os.environ[env_name]
    if os.environ.get("S3_SECRET_KEY"):
        result["s3_secret_key"] = os.environ["S3_SECRET_KEY"]
    else:
        result["s3_secret_key"] = decrypt_secret(result.pop("s3_secret_key_enc", ""))
    return result


def public_storage_settings() -> dict[str, Any]:
    s = storage_settings()
    return {
        "s3_enabled": bool(s.get("s3_bucket")),
        "s3_endpoint": s.get("s3_endpoint", ""),
        "s3_bucket": s.get("s3_bucket", ""),
        "s3_region": s.get("s3_region", "auto"),
        "s3_access_key_masked": (s.get("s3_access_key") or "")[:6] + "…" if s.get("s3_access_key") else "",
        "s3_prefix": s.get("s3_prefix", ""),
        "s3_keep_local": s.get("s3_keep_local", "1") == "1",
        "secret_configured": bool(s.get("s3_secret_key")),
        "local_dir": str(config.BACKUPS_DIR),
        "local_usage": dir_size(config.BACKUPS_DIR),
        "local_usage_human": human_size(dir_size(config.BACKUPS_DIR)),
    }


def save_s3_settings(payload: dict[str, Any]) -> None:
    mapping = {
        "s3_endpoint": "s3_endpoint",
        "s3_bucket": "s3_bucket",
        "s3_region": "s3_region",
        "s3_access_key": "s3_access_key",
        "s3_prefix": "s3_prefix",
    }
    for value_key, setting_key in mapping.items():
        if value_key in payload:
            db.set_setting(setting_key, str(payload.get(value_key) or "").strip())
    if "s3_keep_local" in payload:
        db.set_setting("s3_keep_local", "1" if payload.get("s3_keep_local") else "0")
    secret = (payload.get("s3_secret_key") or "").strip()
    if secret:
        db.set_setting("s3_secret_key_enc", encrypt_secret(secret))
    if payload.get("clear_secret"):
        db.set_setting("s3_secret_key_enc", "")


def dir_size(path: Path) -> int:
    total = 0
    if not path.exists():
        return 0
    for file in path.rglob("*"):
        if file.is_file():
            try:
                total += file.stat().st_size
            except OSError:
                pass
    return total


def _client(settings: dict[str, str] | None = None):
    import boto3
    from botocore.config import Config

    s = settings or storage_settings()
    if not s.get("s3_bucket"):
        return None
    kwargs: dict[str, Any] = {
        "service_name": "s3",
        "region_name": s.get("s3_region") or "auto",
        "config": Config(signature_version="s3v4", retries={"max_attempts": 2, "mode": "standard"}),
    }
    if s.get("s3_endpoint"):
        kwargs["endpoint_url"] = s["s3_endpoint"]
    if s.get("s3_access_key") and s.get("s3_secret_key"):
        kwargs["aws_access_key_id"] = s["s3_access_key"]
        kwargs["aws_secret_access_key"] = s["s3_secret_key"]
    if not s.get("s3_access_key"):
        # fall back to the instance role / environment credentials
        pass
    return boto3.client(**kwargs)


def object_key(bot_id: int, filename: str) -> str:
    s = storage_settings()
    prefix = (s.get("s3_prefix") or "alfiqi-backups").strip("/")
    return f"{prefix}/bot-{bot_id}/{filename}"


def upload(path: Path, bot_id: int, filename: str) -> str:
    """Mirror a snapshot to S3. Returns the object key, or '' when disabled."""
    s = storage_settings()
    if not s.get("s3_bucket"):
        return ""
    client = _client(s)
    if client is None:
        return ""
    key = object_key(bot_id, filename)
    extra = {"ContentType": "application/zip"}
    client.upload_file(str(path), s["s3_bucket"], key, ExtraArgs=extra)
    log.info("snapshot %s uploaded to s3://%s/%s", filename, s["s3_bucket"], key)
    return key


def download(key: str, target: Path) -> Path:
    s = storage_settings()
    client = _client(s)
    if client is None or not s.get("s3_bucket"):
        raise RuntimeError("S3 storage is not configured")
    target.parent.mkdir(parents=True, exist_ok=True)
    client.download_file(s["s3_bucket"], key, str(target))
    return target


def delete_remote(key: str) -> None:
    if not key:
        return
    s = storage_settings()
    client = _client(s)
    if client is None or not s.get("s3_bucket"):
        return
    try:
        client.delete_object(Bucket=s["s3_bucket"], Key=key)
    except Exception as exc:  # pragma: no cover - network dependent
        log.warning("could not delete s3 object %s: %s", key, exc)


def test_connection() -> dict[str, Any]:
    s = storage_settings()
    if not s.get("s3_bucket"):
        return {"ok": False, "message": "No bucket configured"}
    try:
        client = _client(s)
        if client is None:
            return {"ok": False, "message": "Could not build the S3 client"}
        client.head_bucket(Bucket=s["s3_bucket"])
        return {"ok": True, "message": f"Connected to {s['s3_bucket']}"}
    except Exception as exc:
        return {"ok": False, "message": str(exc)[:300]}


def local_snapshot_path(local_path: str, filename: str, snapshot_id: int) -> Path | None:
    """Locate the local archive (falls back to the well-known folder)."""
    if local_path:
        candidate = Path(local_path)
        if candidate.is_file():
            return candidate
    fallback = config.BACKUPS_DIR / str(snapshot_id) / filename
    return fallback if fallback.is_file() else None


def remove_snapshot_files(snapshot: dict[str, Any]) -> None:
    path = local_snapshot_path(snapshot.get("local_path", ""), snapshot["filename"], snapshot["id"])
    if path and path.exists():
        shutil.rmtree(path.parent, ignore_errors=True)
