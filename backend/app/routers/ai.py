"""Testing playground: AI provider config, chat with bot grounding, offline simulation."""

from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from .. import db
from ..security import decrypt_secret, require_user
from ..services import ai_client, simulate
from ..services.analytics import build_overview
from ..util import now_iso
from .deps import get_bot

router = APIRouter(prefix="/api", tags=["ai"])


class AIConfigPayload(BaseModel):
    provider: str = Field(default="openai", max_length=40)
    model: str = Field(default="", max_length=200)
    base_url: str = Field(default="", max_length=500)
    api_key: str = Field(default="", max_length=500)
    clear_key: bool = False


@router.get("/ai/config")
def get_config(user: dict = Depends(require_user)) -> dict[str, Any]:
    return ai_client.get_config()


@router.put("/ai/config")
def put_config(payload: AIConfigPayload, user: dict = Depends(require_user)) -> dict[str, Any]:
    ai_client.save_config(payload.dict())
    return {"ok": True, "config": ai_client.get_config()}


class ChatPayload(BaseModel):
    bot_id: int
    message: str = Field(min_length=1, max_length=4000)
    history: list[dict[str, str]] = Field(default_factory=list)


@router.post("/ai/chat")
async def chat(payload: ChatPayload, user: dict = Depends(require_user)) -> dict[str, Any]:
    bot = db.row("SELECT * FROM bots WHERE id=?", (payload.bot_id,))
    if bot is None:
        return {"ok": False, "code": "no_bot", "error": "Bot not found"}
    config = ai_client.get_config()
    if not config["has_key"] and config["provider"] not in {"ollama", "custom"}:
        return {
            "ok": False,
            "code": "no_key",
            "error": "No AI key configured. Add one in Settings → AI, or use the offline simulation.",
        }
    stored = db.all_settings()
    key = decrypt_secret(stored.get("ai_key_enc", ""))
    overview = build_overview(payload.bot_id)
    notes = db.rows("SELECT * FROM training_notes WHERE bot_id=? ORDER BY id DESC LIMIT 8", (payload.bot_id,))
    system = ai_client.build_system_prompt(overview, notes)
    messages: list[dict[str, str]] = [{"role": "system", "content": system}]
    for item in payload.history[-10:]:
        role = "assistant" if item.get("role") == "assistant" else "user"
        content = str(item.get("content") or "")[:4000]
        if content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": payload.message})
    db.insert(
        "INSERT INTO ai_messages(bot_id, role, content, created_at) VALUES (?,?,?,?)",
        (payload.bot_id, "user", payload.message[:4000], now_iso()),
    )
    try:
        result = await ai_client.call_chat(
            config["provider"], config["base_url"], key, config["model"], messages,
        )
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout, httpx.HTTPError) as exc:
        return {
            "ok": False,
            "code": "network",
            "error": (
                "تعذر الوصول إلى مزوّد الذكاء الاصطناعي من هذا السيرفر. "
                "تأكد من إعدادات الشبكة أو استخدم المحاكاة المحلية."
            ),
            "detail": str(exc)[:300],
        }
    if not result.get("ok"):
        return {"ok": False, "code": "provider", "error": result.get("error", "Provider error"),
                "status": result.get("status")}
    text = (result.get("text") or "").strip()
    db.insert(
        "INSERT INTO ai_messages(bot_id, role, content, created_at) VALUES (?,?,?,?)",
        (payload.bot_id, "assistant", text[:8000], now_iso()),
    )
    return {
        "ok": True,
        "mode": "live",
        "text": text,
        "model": result.get("model"),
        "provider": config["provider"],
        "generated_at": now_iso(),
    }


class SimulatePayload(BaseModel):
    bot_id: int
    message: str = Field(min_length=1, max_length=4000)


@router.post("/ai/simulate")
def simulate_reply(payload: SimulatePayload, user: dict = Depends(require_user)) -> dict[str, Any]:
    if not db.row("SELECT id FROM bots WHERE id=?", (payload.bot_id,)):
        return {"ok": False, "error": "Bot not found"}
    return simulate.simulate(payload.bot_id, payload.message)


@router.get("/bots/{bot_id}/ai/messages")
def history(bot_id: int, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    return {"messages": db.rows("SELECT * FROM ai_messages WHERE bot_id=? ORDER BY id DESC LIMIT 40", (bot_id,))[::-1]}


@router.delete("/bots/{bot_id}/ai/messages")
def clear_history(bot_id: int, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    db.execute("DELETE FROM ai_messages WHERE bot_id=?", (bot_id,))
    return {"ok": True}
