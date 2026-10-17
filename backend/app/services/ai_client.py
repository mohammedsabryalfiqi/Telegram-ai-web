"""AI provider client for the Testing playground (OpenAI-compatible + Anthropic)."""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from .. import db
from ..security import decrypt_secret, encrypt_secret

log = logging.getLogger("control.ai")

# provider -> (base_url, default_model, needs_key)
PRESETS: dict[str, dict[str, str]] = {
    "openai": {"base_url": "https://api.openai.com/v1", "model": "gpt-4.1-mini", "label": "OpenAI"},
    "groq": {"base_url": "https://api.groq.com/openai/v1", "model": "llama-3.3-70b-versatile", "label": "Groq"},
    "google": {"base_url": "https://generativelanguage.googleapis.com/v1beta/openai", "model": "gemini-2.5-flash", "label": "Google Gemini"},
    "openrouter": {"base_url": "https://openrouter.ai/api/v1", "model": "meta-llama/llama-3.3-70b-instruct:free", "label": "OpenRouter"},
    "deepseek": {"base_url": "https://api.deepseek.com/v1", "model": "deepseek-chat", "label": "DeepSeek"},
    "mistral": {"base_url": "https://api.mistral.ai/v1", "model": "mistral-small-latest", "label": "Mistral"},
    "xai": {"base_url": "https://api.x.ai/v1", "model": "grok-3-mini", "label": "xAI"},
    "together": {"base_url": "https://api.together.xyz/v1", "model": "meta-llama/Llama-3.3-70B-Instruct-Turbo", "label": "Together"},
    "cerebras": {"base_url": "https://api.cerebras.ai/v1", "model": "llama-3.3-70b", "label": "Cerebras"},
    "anthropic": {"base_url": "https://api.anthropic.com/v1", "model": "claude-sonnet-4-5", "label": "Anthropic"},
    "ollama": {"base_url": "http://localhost:11434/v1", "model": "llama3.2", "label": "Ollama (local)"},
    "custom": {"base_url": "", "model": "", "label": "Custom OpenAI-compatible"},
}

SETTING_KEYS = ("ai_provider", "ai_model", "ai_base_url", "ai_key_enc")


def get_config() -> dict[str, Any]:
    stored = db.all_settings()
    provider = stored.get("ai_provider", "openai")
    preset = PRESETS.get(provider, PRESETS["openai"])
    key = decrypt_secret(stored.get("ai_key_enc", ""))
    return {
        "provider": provider,
        "model": stored.get("ai_model", "") or preset["model"],
        "base_url": stored.get("ai_base_url", "") or preset["base_url"],
        "has_key": bool(key),
        "key_masked": (key[:5] + "…" + key[-4:]) if len(key) > 12 else ("••••" if key else ""),
        "presets": [{"id": pid, **meta} for pid, meta in PRESETS.items()],
    }


def save_config(payload: dict[str, Any]) -> None:
    provider = (payload.get("provider") or "openai").strip()
    if provider not in PRESETS:
        provider = "custom"
    preset = PRESETS[provider]
    db.set_setting("ai_provider", provider)
    db.set_setting("ai_model", (payload.get("model") or "").strip() or preset["model"])
    db.set_setting("ai_base_url", (payload.get("base_url") or "").strip() or preset["base_url"])
    key = (payload.get("api_key") or "").strip()
    if key:
        db.set_setting("ai_key_enc", encrypt_secret(key))
    if payload.get("clear_key"):
        db.set_setting("ai_key_enc", "")


def build_system_prompt(overview: dict[str, Any], extra_notes: list[dict[str, Any]] | None = None) -> str:
    persona = overview.get("persona") or {}
    name = persona.get("business_name") or "the account holder"
    assistant = persona.get("assistant_name") or "the assistant"
    lines = [
        f"You are {assistant}, the Telegram assistant of {name}.",
        f"Tone: {persona.get('tone', 'friendly')}. Reply in the customer's language; "
        "Arabic messages always get an Arabic reply (clear MSA, light Egyptian dialect when appropriate).",
        "Reply naturally on behalf of the account holder. Never invent prices, availability, "
        "delivery times, discounts or policies. If you do not know, say you will check.",
        "Keep replies short and conversational, with at most one emoji.",
    ]
    if persona.get("business_description"):
        lines.append(f"About the account holder: {persona['business_description']}")
    if persona.get("custom_instructions"):
        lines.append(f"Owner instructions: {persona['custom_instructions']}")

    popular = overview.get("popular") or []
    if popular:
        lines.append("Known recurring questions:")
        for item in popular[:6]:
            lines.append(f"- {item['label']}")
    if extra_notes:
        lines.append("Approved knowledge notes from the control panel:")
        for note in extra_notes[:6]:
            lines.append(f"- {note['title']}: {note['content'][:500]}")
    return "\n".join(lines)


async def call_chat(provider: str, base_url: str, api_key: str, model: str,
                    messages: list[dict[str, str]], max_tokens: int = 600) -> dict[str, Any]:
    timeout = httpx.Timeout(45.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        if provider == "anthropic":
            headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
            system = "\n".join(m["content"] for m in messages if m["role"] == "system")
            chat = [m for m in messages if m["role"] != "system"]
            payload = {"model": model, "max_tokens": max_tokens, "messages": chat}
            if system:
                payload["system"] = system
            response = await client.post(f"{base_url.rstrip('/')}/messages", headers=headers, json=payload)
            if response.status_code >= 400:
                return {"ok": False, "error": _error_text(response), "status": response.status_code}
            data = response.json()
            blocks = data.get("content") or []
            text = "".join(block.get("text", "") for block in blocks if block.get("type") == "text")
            return {"ok": True, "text": text, "model": data.get("model", model)}
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        payload = {"model": model, "messages": messages, "temperature": 0.4, "max_tokens": max_tokens}
        response = await client.post(f"{base_url.rstrip('/')}/chat/completions", headers=headers, json=payload)
        if response.status_code >= 400:
            return {"ok": False, "error": _error_text(response), "status": response.status_code}
        data = response.json()
        try:
            text = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            return {"ok": False, "error": "The provider returned no message content", "status": 502}
        return {"ok": True, "text": text, "model": data.get("model", model)}


def _error_text(response: httpx.Response) -> str:
    try:
        data = response.json()
        if isinstance(data, dict):
            error = data.get("error")
            if isinstance(error, dict):
                return str(error.get("message") or error)[:400]
            if error:
                return str(error)[:400]
            return json.dumps(data)[:400]
    except ValueError:
        pass
    return response.text[:400]
