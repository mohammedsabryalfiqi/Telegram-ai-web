"""Text extraction for knowledge-base files uploaded from the dashboard."""

from __future__ import annotations

import io
from pathlib import Path

MAX_CHARS = 200_000


class ExtractError(Exception):
    pass


def extract(filename: str, data: bytes) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix in {".txt", ".md", ".csv", ".json", ".yaml", ".yml", ".log"}:
        return _decode(data)
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(data))
            text = "\n".join((page.extract_text() or "") for page in reader.pages)
            return text.strip()[:MAX_CHARS]
        except Exception as exc:  # pragma: no cover - parser dependent
            raise ExtractError(f"Could not read the PDF: {exc}") from exc
    if suffix == ".docx":
        try:
            import docx

            document = docx.Document(io.BytesIO(data))
            text = "\n".join(paragraph.text for paragraph in document.paragraphs)
            return text.strip()[:MAX_CHARS]
        except Exception as exc:  # pragma: no cover - parser dependent
            raise ExtractError(f"Could not read the DOCX: {exc}") from exc
    raise ExtractError("Supported files: .txt, .md, .csv, .pdf, .docx")


def _decode(data: bytes) -> str:
    for encoding in ("utf-8", "utf-16", "windows-1256", "latin-1"):
        try:
            return data.decode(encoding).strip()[:MAX_CHARS]
        except UnicodeDecodeError:
            continue
    raise ExtractError("Could not decode the text file")
