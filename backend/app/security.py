"""Authentication, password hashing, signed session cookies and secret encryption."""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import time
from datetime import timedelta
from typing import Any

import jwt
from cryptography.fernet import Fernet, InvalidToken
from fastapi import Depends, HTTPException, Request

from . import config, db
from .util import now, now_iso

_PBKDF2_ROUNDS = 260_000
_SECRET: str | None = None
_FERNET: Fernet | None = None


def _load_secret() -> str:
    global _SECRET
    if _SECRET:
        return _SECRET
    config.ensure_dirs()
    env_secret = (os.environ.get("APP_SECRET") or "").strip()
    if env_secret:
        _SECRET = env_secret
        return _SECRET
    if config.SECRET_FILE.exists():
        _SECRET = config.SECRET_FILE.read_text(encoding="utf-8").strip()
    if not _SECRET:
        _SECRET = secrets.token_urlsafe(48)
        config.SECRET_FILE.write_text(_SECRET, encoding="utf-8")
        try:
            os.chmod(config.SECRET_FILE, 0o600)
        except OSError:
            pass
    return _SECRET


def _fernet() -> Fernet:
    global _FERNET
    if _FERNET is None:
        digest = hashlib.sha256(_load_secret().encode()).digest()
        _FERNET = Fernet(base64.urlsafe_b64encode(digest))
    return _FERNET


def encrypt_secret(value: str) -> str:
    if not value:
        return ""
    return _fernet().encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str:
    if not value:
        return ""
    try:
        return _fernet().decrypt(value.encode()).decode()
    except (InvalidToken, ValueError):
        return ""


# --------------------------------------------------------------------------
# Passwords
# --------------------------------------------------------------------------
def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ROUNDS)
    return "pbkdf2${}${}${}".format(
        _PBKDF2_ROUNDS,
        base64.b64encode(salt).decode(),
        base64.b64encode(digest).decode(),
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, rounds, salt_b64, digest_b64 = stored.split("$", 3)
        if scheme != "pbkdf2":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, int(rounds))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


# --------------------------------------------------------------------------
# Session tokens
# --------------------------------------------------------------------------
def create_token(user_id: int, email: str) -> str:
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "email": email,
        "iat": int(time.time()),
        "exp": int((now() + timedelta(days=config.SESSION_DAYS)).timestamp()),
    }
    return jwt.encode(payload, _load_secret(), algorithm="HS256")


def decode_token(token: str | None) -> dict[str, Any] | None:
    if not token:
        return None
    try:
        return jwt.decode(token, _load_secret(), algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


def public_user(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "created_at": user["created_at"],
        "last_login_at": user.get("last_login_at"),
    }


def current_user(request: Request) -> dict[str, Any]:
    token = request.cookies.get(config.COOKIE_NAME)
    if not token:
        header = request.headers.get("authorization", "")
        if header.lower().startswith("bearer "):
            token = header[7:].strip()
    claims = decode_token(token)
    if not claims:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = db.row("SELECT * FROM users WHERE id=?", (int(claims.get("sub", 0)),))
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def require_user(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return user


def users_exist() -> bool:
    return bool(db.scalar("SELECT COUNT(*) AS n FROM users", default=0))


def create_user(name: str, email: str, password: str) -> dict[str, Any]:
    email = (email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="A valid email is required")
    if len(password or "") < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    user_id = db.insert(
        "INSERT INTO users(name, email, password_hash, created_at) VALUES (?,?,?,?)",
        ((name or "").strip() or email.split("@")[0], email, hash_password(password), now_iso()),
    )
    return db.row("SELECT * FROM users WHERE id=?", (user_id,))  # type: ignore[return-value]


def ensure_bootstrap_admin() -> None:
    if users_exist() or not config.ADMIN_EMAIL or not config.ADMIN_PASSWORD:
        return
    try:
        create_user(config.ADMIN_NAME, config.ADMIN_EMAIL, config.ADMIN_PASSWORD)
    except HTTPException:
        pass
