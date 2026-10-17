"""Alfiqi Control — FastAPI application (API + SPA hosting)."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import config, db
from .routers import admin, ai, auth, bots, dashboard, ingest, snapshots
from .security import ensure_bootstrap_admin
from .services import demo, scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("control")

VERSION = "1.0.0"


@asynccontextmanager
async def lifespan(app: FastAPI):
    config.ensure_dirs()
    db.init_db()
    ensure_bootstrap_admin()
    if config.DEMO_SEED:
        try:
            if demo.seed_demo():
                log.info("demo workspace seeded")
        except Exception as exc:  # pragma: no cover - demo must never block boot
            log.warning("demo seed failed: %s", exc)
    scheduler.start()
    log.info("%s %s ready (data=%s)", config.APP_NAME, VERSION, config.DATA_DIR)
    yield


app = FastAPI(
    title=config.APP_NAME,
    version=VERSION,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?|https://[a-z0-9-]+\.e2b\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    # No X-Frame-Options: the panel must be embeddable in the hosted preview.
    response.headers.setdefault("Referrer-Policy", "same-origin")
    return response


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("unhandled error on %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


for module in (auth, bots, ingest, snapshots, dashboard, ai, admin):
    app.include_router(module.router)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "app": config.APP_NAME, "version": VERSION}


@app.get("/api/meta")
def meta() -> dict:
    return {
        "name": config.APP_NAME,
        "version": VERSION,
        "demo_seed": config.DEMO_SEED,
        "max_upload_mb": config.MAX_UPLOAD_MB,
        "storage": "local+s3" if db.get_setting("s3_bucket") else "local",
    }


# --------------------------------------------------------------------------
# SPA hosting
# --------------------------------------------------------------------------
_DIST = config.FRONTEND_DIST
if (_DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=_DIST / "assets"), name="assets")


@app.get("/{full_path:path}", include_in_schema=False)
def spa(full_path: str):
    if full_path.startswith("api/"):
        return JSONResponse(status_code=404, content={"detail": "Not found"})
    if _DIST.is_dir():
        candidate = (_DIST / full_path).resolve()
        try:
            candidate.relative_to(_DIST)
        except ValueError:
            candidate = _DIST / "index.html"
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        index = _DIST / "index.html"
        if index.is_file():
            return FileResponse(index)
    return HTMLResponse(
        """<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">
        <title>Alfiqi Control</title>
        <body style="font-family:system-ui;background:#f8fafc;color:#0f172a;display:grid;place-items:center;height:100vh;margin:0">
        <div style="max-width:560px;padding:32px;background:#fff;border:1px solid #e2e8f0;border-radius:20px">
        <h1 style="margin:0 0 8px">Alfiqi Control</h1>
        <p style="color:#475569;line-height:1.8">الواجهة لم تُبنَ بعد. شغّل <code style="background:#f1f5f9;padding:2px 6px;border-radius:6px">cd frontend &amp;&amp; npm install &amp;&amp; npm run build</code> ثم أعد تشغيل السيرفر.</p>
        <p style="color:#64748b">API is live at <a href="/api/docs">/api/docs</a>.</p>
        </div></body></html>""",
        status_code=200,
    )
