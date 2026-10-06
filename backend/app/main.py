from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import text

from . import auth, content, dashboard, uploads, social, prayers, recovery, export, sharing
from .config import settings
from .db import SessionFactory, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.redis = Redis.from_url(settings().redis_url, decode_responses=True)
    await app.state.redis.ping()
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    yield
    await app.state.redis.aclose()
    await engine.dispose()


app = FastAPI(
    title="Untukmu API",
    version="1.0.0",
    lifespan=lifespan,
    description="Untukmu Fase 1–5: akun, pesan terenkripsi, sosial, doa, kurasi, pemulihan dan ekspor.",
)
for router in (auth.router, content.router, dashboard.router, uploads.router, social.router, prayers.router, recovery.router, export.router, sharing.router):
    app.include_router(router, prefix="/api/v1")


@app.middleware("http")
async def privacy_headers(request: Request, call_next):
    if request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get("origin") not in (
        None,
        settings().app_origin,
    ):
        return JSONResponse({"detail": "Asal permintaan tidak diizinkan."}, status_code=403)
    if request.headers.get("content-length", "").isdigit() and int(request.headers["content-length"]) > 200000:
        return JSONResponse({"detail": "Permintaan terlalu besar."}, status_code=413)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.exception_handler(RequestValidationError)
async def sanitized_validation(request: Request, exc: RequestValidationError):
    # Never reflect a submitted password, plaintext, or encrypted payload in error responses.
    return JSONResponse(
        {"detail": [{"loc": e["loc"], "msg": e["msg"], "type": e["type"]} for e in exc.errors()]}, status_code=422
    )


@app.exception_handler(RedisError)
async def redis_unavailable(request: Request, exc: RedisError):
    return JSONResponse({"detail": "Layanan sementara tidak tersedia."}, status_code=503)


@app.get("/api/v1/health", tags=["Operasional"])
async def health(request: Request):
    try:
        await request.app.state.redis.ping()
        async with SessionFactory() as db:
            await db.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(503, "Layanan belum siap.") from exc
    return {"status": "ok", "phase": 5}


@app.get("/api/v1/capabilities", tags=["Operasional"])
async def capabilities():
    return {
        "phase": 5,
        "public_messages": True,
        "unlisted_messages": True,
        "prayers": True,
        "moderation": True,
        "multi_target": True,
    }
