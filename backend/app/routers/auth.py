"""Auth: first-run setup, login/logout, profile."""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from .. import config, db
from ..security import (
    create_token,
    current_user,
    hash_password,
    public_user,
    require_user,
    users_exist,
    verify_password,
)
from ..util import now_iso

router = APIRouter(prefix="/api", tags=["auth"])

_attempts: dict[str, list[float]] = {}


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    return (forwarded.split(",")[0].strip() if forwarded else request.client.host if request.client else "unknown")


def _check_rate(ip: str) -> None:
    now_ts = time.time()
    window = [t for t in _attempts.get(ip, []) if now_ts - t < 600]
    _attempts[ip] = window
    if len(window) >= 12:
        raise HTTPException(status_code=429, detail="Too many attempts. Try again in a few minutes.")


def _record_failure(ip: str) -> None:
    _attempts.setdefault(ip, []).append(time.time())


def _set_session(response: Response, user: dict[str, Any]) -> None:
    token = create_token(int(user["id"]), user["email"])
    response.set_cookie(
        config.COOKIE_NAME,
        token,
        max_age=config.SESSION_DAYS * 86400,
        httponly=True,
        secure=config.COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


class SetupPayload(BaseModel):
    name: str = Field(default="", max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)


class LoginPayload(BaseModel):
    email: EmailStr
    password: str


class PasswordPayload(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=200)


@router.get("/status")
def status() -> dict[str, Any]:
    user = None
    return {
        "needs_setup": not users_exist(),
        "app_name": config.APP_NAME,
        "demo_seed": config.DEMO_SEED,
        "version": "1.0.0",
        "authenticated": False,
        "user": user,
    }


@router.get("/bootstrap")
def bootstrap(request: Request, user: dict = Depends(current_user)) -> dict[str, Any]:
    return {"needs_setup": False, "user": public_user(user), "app_name": config.APP_NAME, "version": "1.0.0"}


@router.post("/setup")
def setup(payload: SetupPayload, response: Response) -> dict[str, Any]:
    if users_exist():
        raise HTTPException(status_code=409, detail="Setup has already been completed")
    from ..security import create_user

    user = create_user(payload.name, str(payload.email), payload.password)
    _set_session(response, user)
    db.add_event("system", f"Owner account created: {user['email']}")
    return {"ok": True, "user": public_user(user)}


@router.post("/login")
def login(payload: LoginPayload, request: Request, response: Response) -> dict[str, Any]:
    ip = _client_ip(request)
    _check_rate(ip)
    user = db.row("SELECT * FROM users WHERE email=?", (str(payload.email).strip().lower(),))
    if user is None or not verify_password(payload.password, user["password_hash"]):
        _record_failure(ip)
        raise HTTPException(status_code=401, detail="Wrong email or password")
    db.execute("UPDATE users SET last_login_at=? WHERE id=?", (now_iso(), user["id"]))
    user["last_login_at"] = now_iso()
    _set_session(response, user)
    db.add_event("auth", f"Login from {ip}")
    return {"ok": True, "user": public_user(user)}


@router.post("/logout")
def logout(response: Response) -> dict[str, Any]:
    response.delete_cookie(config.COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me")
def me(user: dict = Depends(require_user)) -> dict[str, Any]:
    return {"user": public_user(user)}


@router.post("/me/password")
def change_password(payload: PasswordPayload, user: dict = Depends(require_user)) -> dict[str, Any]:
    if not verify_password(payload.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is wrong")
    db.execute("UPDATE users SET password_hash=? WHERE id=?", (hash_password(payload.new_password), user["id"]))
    db.add_event("auth", "Password changed")
    return {"ok": True}


@router.get("/activity")
def activity(user: dict = Depends(require_user), limit: int = 40) -> dict[str, Any]:
    limit = max(1, min(limit, 200))
    return {"events": db.rows("SELECT * FROM events ORDER BY id DESC LIMIT ?", (limit,))}
