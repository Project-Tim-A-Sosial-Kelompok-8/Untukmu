import hmac
import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import select, delete, update
from sqlalchemy.exc import IntegrityError
from redis.exceptions import RedisError

from .models import Session, User, now, Message, Constellation, Upload, StorageDeletion
from .schemas import Login, Register, UserSettings, ConfirmCredential, EnableRecovery, DeleteAccount
from .security import (
    CurrentUser,
    DB,
    check_password,
    credentials,
    decode,
    digest,
    hash_password,
    new_session,
    throttle,
    verify_origin,
    verify_turnstile,
)

router = APIRouter(tags=["Akun dan sesi"])
logger = logging.getLogger(__name__)


@router.get("/auth/status")
async def status(db: DB, request: Request):
    token = request.cookies.get("um_refresh")
    if not token:
        return {"authenticated": False}
    try:
        claims = decode(token, "refresh")
    except HTTPException:
        return {"authenticated": False}
    row = await db.scalar(
        select(Session).where(
            Session.id == claims["sid"],
            Session.user_id == claims["sub"],
            Session.revoked_at.is_(None),
            Session.expires_at > now(),
        )
    )
    return {"authenticated": bool(row and hmac.compare_digest(row.refresh_token_hash, digest(token)))}


def user_view(user: User):
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "role": user.role,
        "recovery_ready": bool(user.recovery_auth_hash),
        "encryption_record": user.encryption_record,
        "default_message_visibility": user.default_message_visibility,
        "profile_visibility": user.profile_visibility,
        "preferences": user.preferences,
        "created_at": user.created_at,
    }


@router.post("/auth/register", status_code=201)
async def register(body: Register, db: DB, request: Request, response: Response):
    await throttle(request, "register", 5)
    await verify_turnstile(request, body.turnstile_token, "register")
    user = User(
        email=str(body.email).lower(),
        password_hash=await hash_password(body.password),
        recovery_auth_hash=await hash_password(body.recovery_verifier) if body.recovery_verifier else None,
        display_name=body.display_name.strip(),
        encryption_record=body.encryption_record.model_dump(),
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(409, "Alamat surel sudah terdaftar.") from exc
    return await new_session(user, db, request, response)


@router.post("/auth/login")
async def login(body: Login, db: DB, request: Request, response: Response):
    await throttle(request, "login-ip", 15)
    await throttle(request, "login-account", 8, str(body.email).lower())
    user = await db.scalar(select(User).where(User.email == str(body.email).lower()))
    # Run Argon2 for unknown users too, reducing timing-based account enumeration.
    if user is None:
        await hash_password(body.password)
        raise HTTPException(401, "Surel atau kata sandi tidak cocok.")
    if not await check_password(user.password_hash, body.password):
        raise HTTPException(401, "Surel atau kata sandi tidak cocok.")
    return await new_session(user, db, request, response)


@router.post("/auth/refresh")
async def refresh(db: DB, request: Request, response: Response):
    verify_origin(request)
    await throttle(request, "refresh", 40)
    token = request.cookies.get("um_refresh")
    if not token:
        raise HTTPException(401, "Silakan masuk terlebih dahulu.")
    claims = decode(token, "refresh")
    row = await db.scalar(
        select(Session).where(
            Session.id == claims["sid"], Session.user_id == claims["sub"], Session.expires_at > now()
        ).with_for_update()
    )
    if row is None or row.revoked_at is not None:
        raise HTTPException(401, "Sesi sudah berakhir.")
    if not hmac.compare_digest(row.refresh_token_hash, digest(token)):
        row.revoked_at = now()
        await db.commit()
        raise HTTPException(401, "Token dipakai ulang. Sesi telah dicabut.")
    user = await db.get(User, row.user_id)
    result = credentials(user, row, response)
    await db.commit()
    return result


@router.post("/auth/logout", status_code=204)
async def logout(db: DB, request: Request, response: Response):
    verify_origin(request)
    await throttle(request, "logout", 40)
    token = request.cookies.get("um_refresh")
    if token:
        try:
            payload = decode(token, "refresh")
        except HTTPException:
            payload = None
        if payload:
            row = await db.get(Session, payload["sid"])
            if row and row.user_id == payload["sub"]:
                row.revoked_at = now()
                await db.commit()
    response.delete_cookie(
        "um_refresh", path="/api/v1/auth", samesite="strict", httponly=True, secure=request.url.scheme == "https"
    )


@router.get("/auth/sessions")
async def sessions(user: CurrentUser, db: DB):
    rows = (
        await db.scalars(
            select(Session)
            .where(Session.user_id == user.id, Session.revoked_at.is_(None), Session.expires_at > now())
            .order_by(Session.last_seen_at.desc())
        )
    ).all()
    return [
        {"id": row.id, "user_agent": row.user_agent, "created_at": row.created_at, "last_seen_at": row.last_seen_at}
        for row in rows
    ]


@router.delete("/auth/sessions/{session_id}", status_code=204)
async def revoke(session_id: UUID, user: CurrentUser, db: DB, request: Request):
    await throttle(request, "write", 60, user.id)
    row = await db.get(Session, str(session_id))
    if row is None or row.user_id != user.id:
        raise HTTPException(404, "Sesi tidak ditemukan.")
    row.revoked_at = now()
    await db.commit()


@router.get("/users/me")
async def me(user: CurrentUser):
    return user_view(user)


@router.patch("/users/me/settings")
async def update_settings(body: UserSettings, user: CurrentUser, db: DB, request: Request):
    await throttle(request, "write", 60, user.id)
    user.default_message_visibility = body.default_message_visibility
    user.profile_visibility = body.profile_visibility
    user.preferences = {}
    await db.commit()
    return user_view(user)


@router.post('/auth/recovery/enable')
async def enable_recovery(body: EnableRecovery, user: CurrentUser, db: DB, request: Request):
    await throttle(request, 'recovery-enable', 5, user.id)
    if not await check_password(user.password_hash, body.password):
        raise HTTPException(401, 'Kata sandi tidak cocok.')
    user.recovery_auth_hash = await hash_password(body.recovery_verifier)
    await db.commit()
    return {'enabled': True}


@router.post('/users/me/clear', status_code=204)
async def clear_data(body: ConfirmCredential, user: CurrentUser, db: DB, request: Request):
    await throttle(request, 'clear', 3, user.id)
    if not await check_password(user.password_hash, body.password):
        raise HTTPException(401, 'Kata sandi tidak cocok.')
    await db.execute(delete(Message).where(Message.author_id == user.id))
    await db.execute(delete(Constellation).where(Constellation.owner_id == user.id))
    await db.commit()
    from .content import invalidate
    await invalidate(request, user.id)


@router.delete('/users/me', status_code=204)
async def delete_account(body: DeleteAccount, user: CurrentUser, db: DB, request: Request, response: Response):
    verify_origin(request)
    await throttle(request, 'delete-account', 3, user.id)
    if not await check_password(user.password_hash, body.password):
        raise HTTPException(403, 'Kata sandi tidak cocok. Akun belum dihapus.')
    user_id = user.id
    if body.content_action == 'delete':
        keys = await db.scalars(select(Upload.storage_key).where(Upload.owner_id == user_id))
        db.add_all([StorageDeletion(storage_key=key) for key in keys])
        await db.execute(delete(Message).where(Message.author_id == user_id))
        await db.execute(delete(Constellation).where(Constellation.owner_id == user_id))
        await db.execute(delete(Upload).where(Upload.owner_id == user_id))
    else:
        # Preserve ciphertext and public moderation decisions without retaining
        # credentials or transferring ownership to an account with the same email.
        # Old restricted links cannot be managed after deletion, so revoke them.
        await db.execute(update(Message).where(Message.author_id == user_id).values(author_id=None, share_token_hash=None))
        await db.execute(update(Constellation).where(Constellation.owner_id == user_id).values(owner_id=None))
        await db.execute(update(Upload).where(Upload.owner_id == user_id).values(owner_id=None))
    await db.delete(user)
    await db.commit()
    response.delete_cookie('um_refresh', path='/api/v1/auth', samesite='strict', httponly=True,
                          secure=request.url.scheme == 'https')
    from .content import invalidate
    try:
        await invalidate(request, user_id)
    except RedisError:
        # Deletion is already committed and all credentials are invalid. Never
        # tell the client the account still exists because a short-lived cache failed.
        logger.warning("Account deleted; public cache invalidation will recover after expiry.")
