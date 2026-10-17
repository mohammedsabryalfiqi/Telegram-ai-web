"""Dashboard content endpoints: analytics, knowledge, FAQ, rules, resources, unanswered."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from .. import db
from ..services import changes
from ..services.analytics import bot_settings, build_overview, content, kb_items
from ..services.extract import ExtractError, extract
from ..util import human_size, now_iso
from .deps import get_bot

router = APIRouter(prefix="/api/bots/{bot_id}", tags=["dashboard"])

BEHAVIOR_KEYS = {
    "auto_reply_enabled": "الرد التلقائي",
    "approval_mode_enabled": "وضع الموافقة قبل الإرسال",
    "kb_enabled": "قاعدة المعرفة",
    "strict_kb_mode": "الرد من قاعدة المعرفة فقط",
    "faq_enabled": "الردود السريعة",
    "rules_enabled": "قواعد الموضوعات",
    "resources_enabled": "المصادر",
    "unanswered_enabled": "تسجيل الأسئلة غير المجابة",
    "direct_reply_enabled": "الرد على رسائل البوت المباشرة",
    "disclose_ai": "الإفصاح بأن الرد آلي",
    "assistant_name": "اسم المساعد",
    "business_name": "اسم الحساب أو المجموعة",
    "business_description": "وصف المساعد ودوره",
    "tone": "نبرة الرد",
    "reply_language": "لغة الرد",
    "custom_instructions": "تعليمات المالك",
    "max_reply_chars": "أقصى طول للرد",
    "max_messages_per_customer_per_hour": "حد الرسائل في الساعة",
}
BOOL_KEYS = {
    "auto_reply_enabled", "approval_mode_enabled", "kb_enabled", "strict_kb_mode",
    "faq_enabled", "rules_enabled", "resources_enabled", "unanswered_enabled",
    "direct_reply_enabled", "disclose_ai",
}
INT_KEYS = {"max_reply_chars", "max_messages_per_customer_per_hour"}


@router.get("/analytics")
def analytics(bot_id: int, days: int = 30, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    days = 7 if days <= 7 else 14 if days <= 14 else 30 if days <= 30 else 90
    data = build_overview(bot_id)
    series = data.get("series") or []
    if len(series) > days:
        data["series"] = series[-days:]
    return data


@router.get("/kb")
def kb(bot_id: int, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    items = kb_items(bot_id)
    notes = db.rows("SELECT * FROM training_notes WHERE bot_id=? ORDER BY id DESC", (bot_id,))
    settings = bot_settings(bot_id)
    return {
        "items": items,
        "notes": notes,
        "kb_enabled": (settings.get("kb_enabled", "true").lower() in {"1", "true", "yes", "on"}),
        "strict": (settings.get("strict_kb_mode", "false").lower() in {"1", "true", "yes", "on"}),
        "chunks": sum(int(item.get("chunks") or 0) for item in items),
    }


class TextPayload(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    content: str = Field(min_length=3, max_length=200_000)


@router.post("/kb/text")
def add_kb_text(bot_id: int, payload: TextPayload, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    change_id = changes.kb_text_change(bot_id, payload.title.strip(), payload.content.strip())
    return {"ok": True, "change_id": change_id, "items": kb_items(bot_id)}


@router.post("/kb/file")
async def add_kb_file(bot_id: int, file: UploadFile = File(...), bot: dict = Depends(get_bot)) -> dict[str, Any]:
    name = file.filename or "upload.txt"
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File exceeds 15 MB")
    try:
        text = extract(name, data)
    except ExtractError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not text.strip():
        raise HTTPException(status_code=400, detail="No text could be extracted from this file")
    change_id = changes.kb_text_change(bot_id, name, text)
    return {
        "ok": True,
        "change_id": change_id,
        "chars": len(text),
        "title": name,
        "items": kb_items(bot_id),
    }


@router.delete("/kb/items/{item_id}")
def delete_kb_item(bot_id: int, item_id: int, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    changes.apply_ws(bot_id, "DELETE FROM kb_chunks WHERE item_id=?", (item_id,))
    changes.apply_ws(bot_id, "DELETE FROM kb_items WHERE id=?", (item_id,))
    changes.queue(bot_id, f"DELETE FROM kb_chunks WHERE item_id={int(item_id)};\nDELETE FROM kb_items WHERE id={int(item_id)};", "KB item deleted")
    return {"ok": True, "items": kb_items(bot_id)}


# --------------------------------------------------------------------------
# FAQ
# --------------------------------------------------------------------------
@router.get("/faq")
def faq(bot_id: int, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    return {"entries": content(bot_id, "faq_entries")}


class FaqPayload(BaseModel):
    keywords: str = Field(min_length=1, max_length=500)
    answer: str = Field(min_length=1, max_length=5000)
    question: str = Field(default="", max_length=500)


@router.post("/faq")
def add_faq(bot_id: int, payload: FaqPayload, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    change_id = changes.faq_change(bot_id, payload.keywords.strip(), payload.answer.strip(), payload.question.strip())
    return {"ok": True, "change_id": change_id, "entries": content(bot_id, "faq_entries")}


@router.delete("/faq/{entry_id}")
def delete_faq(bot_id: int, entry_id: int, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    change_id = changes.faq_delete_change(bot_id, entry_id)
    return {"ok": True, "change_id": change_id, "entries": content(bot_id, "faq_entries")}


# --------------------------------------------------------------------------
# Topic rules
# --------------------------------------------------------------------------
@router.get("/rules")
def rules(bot_id: int, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    rows = content(bot_id, "topic_rules")
    return {
        "rules": rows,
        "active": sum(1 for row in rows if int(row.get("enabled") or 0) == 1),
        "total": len(rows),
    }


class RulePayload(BaseModel):
    topic: str = Field(min_length=1, max_length=160)
    rule: str = Field(min_length=3, max_length=3000)
    enabled: bool = True
    priority: int = Field(default=100, ge=1, le=999)


@router.post("/rules")
def add_rule(bot_id: int, payload: RulePayload, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    change_id = changes.rule_add_change(bot_id, payload.topic.strip(), payload.rule.strip(), payload.priority, payload.enabled)
    return {"ok": True, "change_id": change_id, "rules": content(bot_id, "topic_rules")}


class TogglePayload(BaseModel):
    enabled: bool


@router.patch("/rules/{rule_id}")
def toggle_rule(bot_id: int, rule_id: int, payload: TogglePayload, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    change_id = changes.rule_toggle_change(bot_id, rule_id, payload.enabled)
    return {"ok": True, "change_id": change_id, "rules": content(bot_id, "topic_rules")}


@router.delete("/rules/{rule_id}")
def delete_rule(bot_id: int, rule_id: int, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    change_id = changes.rule_delete_change(bot_id, rule_id)
    return {"ok": True, "change_id": change_id, "rules": content(bot_id, "topic_rules")}


# --------------------------------------------------------------------------
# Resources
# --------------------------------------------------------------------------
@router.get("/resources")
def resources(bot_id: int, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    return {"resources": content(bot_id, "resources")}


class ResourcePayload(BaseModel):
    kind: str = Field(default="link", max_length=20)
    title: str = Field(min_length=1, max_length=200)
    url: str = Field(default="", max_length=1000)
    notes: str = Field(default="", max_length=2000)


@router.post("/resources")
def add_resource(bot_id: int, payload: ResourcePayload, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    change_id = changes.resource_add_change(bot_id, payload.kind, payload.title.strip(), payload.url.strip(), payload.notes.strip())
    return {"ok": True, "change_id": change_id, "resources": content(bot_id, "resources")}


@router.patch("/resources/{resource_id}")
def toggle_resource(bot_id: int, resource_id: int, payload: TogglePayload, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    change_id = changes.resource_toggle_change(bot_id, resource_id, payload.enabled)
    return {"ok": True, "change_id": change_id, "resources": content(bot_id, "resources")}


@router.delete("/resources/{resource_id}")
def delete_resource(bot_id: int, resource_id: int, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    change_id = changes.resource_delete_change(bot_id, resource_id)
    return {"ok": True, "change_id": change_id, "resources": content(bot_id, "resources")}


# --------------------------------------------------------------------------
# Unanswered
# --------------------------------------------------------------------------
@router.get("/unanswered")
def unanswered(bot_id: int, status: str = "open", bot: dict = Depends(get_bot)) -> dict[str, Any]:
    rows = content(bot_id, "unanswered_questions", where="status=?", params=(status,))
    counts = {
        "open": len(content(bot_id, "unanswered_questions", where="status='open'", limit=5000)),
        "answered": len(content(bot_id, "unanswered_questions", where="status='answered'", limit=5000)),
    }
    return {"questions": rows, "counts": counts}


class AnswerPayload(BaseModel):
    answer: str = Field(min_length=1, max_length=5000)


@router.post("/unanswered/{question_id}/answer")
def answer(bot_id: int, question_id: int, payload: AnswerPayload, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    rows = content(bot_id, "unanswered_questions", where="id=?", params=(question_id,), limit=1)
    if not rows:
        raise HTTPException(status_code=404, detail="Question not found")
    question = rows[0].get("question") or ""
    change_id = changes.answer_question_change(bot_id, question_id, question, payload.answer.strip())
    return {"ok": True, "change_id": change_id}


@router.post("/unanswered/{question_id}/ignore")
def ignore(bot_id: int, question_id: int, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    changes.apply_ws(bot_id, "UPDATE unanswered_questions SET status='ignored' WHERE id=?", (question_id,))
    changes.queue(bot_id, f"UPDATE unanswered_questions SET status='ignored' WHERE id={int(question_id)};", "Question ignored")
    return {"ok": True}


# --------------------------------------------------------------------------
# Bot settings (behaviour) — edits are queued for the agent
# --------------------------------------------------------------------------
@router.get("/settings")
def settings(bot_id: int, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    raw = bot_settings(bot_id)
    values: dict[str, Any] = {}
    for key in BEHAVIOR_KEYS:
        if not key in raw:
            continue
        if key in BOOL_KEYS:
            values[key] = raw[key].strip().lower() in {"1", "true", "yes", "on"}
        elif key in INT_KEYS:
            try:
                values[key] = int(float(raw[key]))
            except ValueError:
                values[key] = 0
        else:
            values[key] = raw[key]
    labels = BEHAVIOR_KEYS
    persona = build_overview(bot_id).get("persona") or {}
    return {"values": values, "labels": labels, "bool_keys": sorted(BOOL_KEYS), "persona": persona}


class SettingsPatch(BaseModel):
    values: dict[str, Any]


@router.patch("/settings")
def update_settings(bot_id: int, payload: SettingsPatch, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    updated = []
    for key, value in payload.values.items():
        if key not in BEHAVIOR_KEYS:
            continue
        if key in BOOL_KEYS:
            normalized = "true" if bool(value) else "false"
        else:
            normalized = str(value)[:4000]
        changes.set_setting_change(bot_id, key, normalized, BEHAVIOR_KEYS[key])
        updated.append(key)
    return {"ok": True, "updated": updated}


@router.get("/health")
def bot_health(bot_id: int, bot: dict = Depends(get_bot)) -> dict[str, Any]:
    latest = db.row("SELECT * FROM snapshots WHERE bot_id=? ORDER BY id DESC LIMIT 1", (bot_id,))
    pending = db.scalar("SELECT COUNT(*) FROM pending_changes WHERE bot_id=? AND status='pending'", (bot_id,), 0) or 0
    usage = db.scalar("SELECT COALESCE(SUM(size_bytes),0) FROM snapshots WHERE bot_id=?", (bot_id,), 0) or 0
    return {
        "bot_id": bot_id,
        "status": bot["status"],
        "latest_snapshot": latest["id"] if latest else None,
        "latest_at": latest["created_at"] if latest else None,
        "last_backup_at": bot.get("last_backup_at"),
        "pending_changes": pending,
        "storage_bytes": int(usage),
        "storage_human": human_size(int(usage)),
        "backup_interval_hours": bot["backup_interval_hours"],
        "generated_at": now_iso(),
    }
