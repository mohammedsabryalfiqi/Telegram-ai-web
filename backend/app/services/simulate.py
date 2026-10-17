"""Offline reply simulation — deterministic, no external AI call.

Useful when no provider key is configured (or the sandbox has no outbound access
to the provider). It mirrors the bot's FAQ-first behaviour using the latest
snapshot: FAQ matching, then knowledge-base keyword matching, then topic rules.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from ..util import now_iso
from .analytics import bot_settings, content, kb_items, workspace_db
from .backup import main_db_path
import sqlite3

_STOP = set(
    "من في على عن إلى ان أن انا أنا هل ما ماذا كيف ايه إيه هو هي عندكم عندك فيه فيها كام بكام لو ولا و يا ازاي إزاي ممكن عايز عاوز".split()
)


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[أإآٱ]", "ا", text)
    text = text.replace("ى", "ي").replace("ة", "ه")
    text = re.sub(r"[^\w\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip().lower()


def tokens(text: str) -> set[str]:
    return {word for word in normalize(text).split() if len(word) > 2 and word not in _STOP}


def _score(query_tokens: set[str], text: str) -> float:
    if not query_tokens:
        return 0.0
    target = tokens(text)
    if not target:
        return 0.0
    overlap = len(query_tokens & target)
    return overlap / max(1, len(query_tokens))


def simulate(bot_id: int, message: str) -> dict[str, Any]:
    query = tokens(message)
    best: dict[str, Any] | None = None

    # 1) FAQ quick answers
    for row in content(bot_id, "faq_entries", limit=300):
        if int(row.get("enabled") or 0) != 1:
            continue
        haystack = f"{row.get('keywords') or ''} {row.get('question') or ''}"
        score = _score(query, haystack)
        if score > 0 and (best is None or score > best["score"]):
            best = {
                "score": round(score, 2),
                "answer": row.get("answer") or "",
                "source": "faq",
                "label": row.get("question") or row.get("keywords") or "Quick answer",
            }

    # 2) knowledge base chunks (keyword fallback, no embeddings)
    path = main_db_path(bot_id)
    if path is not None:
        try:
            conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
            conn.row_factory = sqlite3.Row
            for row in conn.execute(
                "SELECT c.content, i.title FROM kb_chunks c JOIN kb_items i ON i.id=c.item_id LIMIT 800"
            ):
                score = _score(query, f"{row['title']} {row['content']}")
                if score > 0 and (best is None or score > best["score"]):
                    best = {
                        "score": round(score, 2),
                        "answer": row["content"],
                        "source": "kb",
                        "label": row["title"],
                    }
            conn.close()
        except sqlite3.Error:
            pass

    # 3) active topic rules
    for row in content(bot_id, "topic_rules", limit=200):
        if int(row.get("enabled") or 0) != 1:
            continue
        score = _score(query, f"{row.get('topic') or ''} {row.get('rule') or ''}")
        if score > 0 and (best is None or score > best["score"]):
            best = {
                "score": round(score, 2),
                "answer": row.get("rule") or "",
                "source": "rule",
                "label": row.get("topic") or "Rule",
            }

    settings = bot_settings(bot_id)
    signature = (settings.get("signature") or "").strip()
    if best and best["score"] >= 0.34:
        text = best["answer"].strip()
        if signature and not text.endswith(signature):
            text = f"{text}\n{signature}"
        return {
            "ok": True,
            "mode": "simulation",
            "text": text,
            "source": best["source"],
            "label": best["label"],
            "confidence": best["score"],
            "generated_at": now_iso(),
        }

    return {
        "ok": True,
        "mode": "simulation",
        "text": "مش لاقي إجابة مؤكدة للسؤال ده في قاعدة المعرفة. هسأل الفريق وأرجعلك بإجابة دقيقة بدل ما أخمّن. 🙏",
        "source": "fallback",
        "label": "",
        "confidence": best["score"] if best else 0,
        "generated_at": now_iso(),
    }
