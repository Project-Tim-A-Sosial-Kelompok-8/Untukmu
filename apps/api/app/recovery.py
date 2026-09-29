import hashlib
import hmac
import json
import secrets
from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import select, update
from .models import Session, User, now
from .schemas import RecoveryBegin, RecoveryFinish
from .security import DB, check_password, get_redis, hash_password, new_session, throttle, verify_turnstile

router = APIRouter(tags=["Pemulihan akun"])


def key(token):
    return "recovery:" + hashlib.sha256(token.encode()).hexdigest()


@router.post("/auth/recovery/begin")
async def begin(body: RecoveryBegin, db: DB, request: Request):
    email = str(body.email).lower()
    await throttle(request, "recovery-ip", 5)
    await throttle(request, "recovery-email", 5, email)
    await verify_turnstile(request, body.turnstile_token, "recovery")
    user = await db.scalar(select(User).where(User.email == email))
    if user is None or not user.recovery_auth_hash:
        await hash_password(body.recovery_verifier)
        raise HTTPException(401, "Surel atau kode pemulihan tidak cocok.")
    if not await check_password(user.recovery_auth_hash, body.recovery_verifier):
        raise HTTPException(401, "Surel atau kode pemulihan tidak cocok.")
    token = secrets.token_urlsafe(32)
    await get_redis(request).set(key(token), json.dumps({"user_id": user.id, "version": hashlib.sha256(user.recovery_auth_hash.encode()).hexdigest()}), ex=300)
    return {"challenge": token, "encryption_record": user.encryption_record}


@router.post("/auth/recovery/finish")
async def finish(body: RecoveryFinish, db: DB, request: Request, response: Response):
    await throttle(request, "recovery-finish", 10)
    state = await get_redis(request).get(key(body.challenge))
    if not state:
        raise HTTPException(401, "Sesi pemulihan tidak berlaku.")
    state = json.loads(state)
    user = await db.scalar(select(User).where(User.id == state["user_id"]).with_for_update())
    if not user or not user.recovery_auth_hash or not hmac.compare_digest(state["version"], hashlib.sha256(user.recovery_auth_hash.encode()).hexdigest()):
        raise HTTPException(401, "Sesi pemulihan sudah dipakai.")
    user.password_hash = await hash_password(body.password)
    user.recovery_auth_hash = await hash_password(body.recovery_verifier)
    user.encryption_record = body.encryption_record.model_dump()
    await db.execute(update(Session).where(Session.user_id == user.id).values(revoked_at=now()))
    result = await new_session(user, db, request, response)
    await get_redis(request).delete(key(body.challenge))
    return result
