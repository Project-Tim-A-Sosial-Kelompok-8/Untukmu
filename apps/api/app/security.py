import hashlib
import hmac
import secrets
from datetime import timedelta
from typing import Annotated

import httpx
import jwt
from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from .config import settings
from .db import get_db
from .models import Session, User, now, uid

password_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=1, type=Type.ID)
bearer = HTTPBearer(auto_error=False)
DB = Annotated[AsyncSession, Depends(get_db)]


def digest(value: str) -> str:
    return hmac.new(settings().jwt_secret.encode(), value.encode(), hashlib.sha256).hexdigest()


def ip_key(request: Request) -> str:
    # Trust Uvicorn's configured proxy only; never parse untrusted X-Forwarded-For here.
    return digest(request.client.host if request.client else "unknown")


def get_redis(request: Request) -> Redis:
    return request.app.state.redis


SLIDING_WINDOW = """
local t = redis.call('TIME')
local ms = t[1] * 1000 + math.floor(t[2] / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ms - tonumber(ARGV[1]))
local total = redis.call('ZCARD', KEYS[1])
if total >= tonumber(ARGV[2]) then return 0 end
redis.call('ZADD', KEYS[1], ms, ARGV[3])
redis.call('PEXPIRE', KEYS[1], ARGV[1])
return 1
"""


async def throttle(request: Request, scope: str, limit: int, identity: str | None = None):
    key = f"rate:{scope}:{digest(identity) if identity else ip_key(request)}"
    try:
        allowed = await get_redis(request).eval(SLIDING_WINDOW, 1, key, 60000, limit, secrets.token_hex(16))
    except RedisError as exc:
        raise HTTPException(503, "Pembatasan permintaan belum tersedia; coba kembali.") from exc
    if not allowed:
        raise HTTPException(429, "Terlalu banyak permintaan. Coba satu menit lagi.", headers={"Retry-After": "60"})


def verify_origin(request: Request):
    origin = request.headers.get("origin")
    # Cookie-bearing requests require an explicit, exact trusted origin.
    if origin != settings().app_origin:
        raise HTTPException(403, "Asal permintaan tidak diizinkan.")


async def verify_turnstile(request: Request, token: str | None, action: str):
    conf = settings()
    if conf.environment != "production" and not conf.turnstile_secret:
        return
    if not token:
        raise HTTPException(422, "Verifikasi anti-bot diperlukan.")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                data={"secret": conf.turnstile_secret, "response": token},
            )
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(503, "Verifikasi anti-bot belum tersedia.") from exc
    if (
        not data.get("success")
        or data.get("action") != action
        or (conf.turnstile_hostname and data.get("hostname") != conf.turnstile_hostname)
    ):
        raise HTTPException(403, "Verifikasi anti-bot gagal.")


async def hash_password(password: str) -> str:
    return await run_in_threadpool(password_hasher.hash, password)


async def check_password(encoded: str, password: str) -> bool:
    try:
        return await run_in_threadpool(password_hasher.verify, encoded, password)
    except (VerificationError, InvalidHashError):
        return False


def token_for(user_id: str, session_id: str, kind: str, lifetime: timedelta):
    instant = now()
    return jwt.encode(
        {
            "sub": user_id,
            "sid": session_id,
            "type": kind,
            "jti": uid(),
            "iat": instant,
            "exp": instant + lifetime,
            "iss": "untukmu",
            "aud": "untukmu-web",
        },
        settings().jwt_secret,
        algorithm="HS256",
    )


def decode(token: str, kind: str):
    try:
        payload = jwt.decode(
            token,
            settings().jwt_secret,
            algorithms=["HS256"],
            issuer="untukmu",
            audience="untukmu-web",
            options={"require": ["exp", "iat", "sub", "sid", "jti", "type"]},
        )
        if payload["type"] != kind:
            raise ValueError("wrong token type")
        return payload
    except (jwt.InvalidTokenError, ValueError) as exc:
        raise HTTPException(401, "Sesi tidak berlaku. Silakan masuk kembali.") from exc


def set_refresh_cookie(response: Response, token: str):
    response.set_cookie(
        "um_refresh",
        token,
        httponly=True,
        secure=settings().environment == "production",
        samesite="strict",
        path="/api/v1/auth",
        max_age=settings().refresh_days * 86400,
    )


def credentials(user: User, session: Session, response: Response):
    refresh = token_for(user.id, session.id, "refresh", timedelta(days=settings().refresh_days))
    session.refresh_token_hash = digest(refresh)
    session.last_seen_at = now()
    session.expires_at = now() + timedelta(days=settings().refresh_days)
    set_refresh_cookie(response, refresh)
    return {
        "access_token": token_for(user.id, session.id, "access", timedelta(minutes=settings().access_minutes)),
        "token_type": "bearer",
        "expires_in": settings().access_minutes * 60,
    }


async def new_session(user: User, db: AsyncSession, request: Request, response: Response):
    row = Session(
        id=uid(),
        user_id=user.id,
        refresh_token_hash="",
        ip_hash=ip_key(request),
        user_agent=request.headers.get("user-agent", "")[:400],
        expires_at=now() + timedelta(days=settings().refresh_days),
    )
    db.add(row)
    tokens = credentials(user, row, response)
    await db.commit()
    return tokens


async def current_user(db: DB, auth: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    if auth is None:
        raise HTTPException(401, "Silakan masuk terlebih dahulu.")
    payload = decode(auth.credentials, "access")
    session = await db.scalar(
        select(Session).where(
            Session.id == payload["sid"], Session.user_id == payload["sub"],
            Session.revoked_at.is_(None), Session.expires_at > now()
        )
    )
    if session is None:
        raise HTTPException(401, "Sesi sudah berakhir.")
    user = await db.get(User, payload["sub"])
    if user is None:
        raise HTTPException(401, "Akun tidak ditemukan.")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


async def optional_user(db: DB, auth: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    return await current_user(db, auth) if auth else None


OptionalUser = Annotated[User | None, Depends(optional_user)]


async def admin_user(user: CurrentUser):
    if user.role != "admin":
        raise HTTPException(403, "Akses administrator diperlukan.")
    return user


AdminUser = Annotated[User, Depends(admin_user)]


def visitor_identity(request, user):
    return digest("user:" + user.id) if user else digest("visitor:" + ip_key(request))
