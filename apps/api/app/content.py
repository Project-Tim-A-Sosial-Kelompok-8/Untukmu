from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from .models import Constellation, Message, MessageAttachment, MessageConstellation, Upload
from .schemas import GalaxyInput, AnyMessageInput
from .security import CurrentUser, DB, OptionalUser, get_redis, throttle, verify_turnstile

from .public_content import open_public, seal_public

router = APIRouter(tags=["Galaksi dan pesan privat"])


async def owned(db, model, identity, user_id):
    row = await db.get(model, str(identity))
    owner = getattr(row, "owner_id", getattr(row, "author_id", None))
    if row is None or owner != user_id:
        raise HTTPException(404, "Data tidak ditemukan.")
    return row


def galaxy_view(row):
    return {
        name: getattr(row, name)
        for name in [
            "id",
            "target_kind",
            "target_label",
            "custom_category",
            "visual_type",
            "visual_ref",
            "kind",
            "color",
            "radius",
            "particle_count",
            "created_at",
        ]
    }


async def invalidate(request, user_id):
    await get_redis(request).delete(f"summary:{user_id}")
    await get_redis(request).incr("feed:version")


async def verify_photo(body, user, db):
    if body.visual_ref:
        row = await owned(db, Upload, body.visual_ref, user.id)
        if not row.complete:
            raise HTTPException(409, "Unggahan foto belum selesai.")


@router.get("/constellations")
async def list_galaxies(user: CurrentUser, db: DB, offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200)):
    rows = await db.scalars(
        select(Constellation)
        .where(Constellation.owner_id == user.id)
        .order_by(Constellation.created_at.desc(), Constellation.id)
        .offset(offset)
        .limit(limit)
    )
    return [galaxy_view(row) for row in rows]


@router.post("/constellations", status_code=201)
async def create_galaxy(body: GalaxyInput, user: CurrentUser, db: DB, request: Request):
    await throttle(request, "constellations", 20, user.id)
    await verify_photo(body, user, db)
    row = Constellation(owner_id=user.id, **body.model_dump(mode="json"))
    db.add(row)
    await db.commit()
    await invalidate(request, user.id)
    return galaxy_view(row)


@router.get("/constellations/{galaxy_id}")
async def get_galaxy(galaxy_id: UUID, user: CurrentUser, db: DB):
    return galaxy_view(await owned(db, Constellation, galaxy_id, user.id))


@router.patch("/constellations/{galaxy_id}")
async def patch_galaxy(galaxy_id: UUID, body: GalaxyInput, user: CurrentUser, db: DB, request: Request):
    await throttle(request, "write", 60, user.id)
    row = await owned(db, Constellation, galaxy_id, user.id)
    await verify_photo(body, user, db)
    for name, value in body.model_dump(mode="json").items():
        setattr(row, name, value)
    await db.commit()
    return galaxy_view(row)


@router.delete("/constellations/{galaxy_id}", status_code=204)
async def delete_galaxy(galaxy_id: UUID, user: CurrentUser, db: DB, request: Request):
    await throttle(request, "write", 60, user.id)
    row = await owned(db, Constellation, galaxy_id, user.id)
    # Do not orphan messages or silently delete them when a galaxy is removed.
    used = await db.scalar(
        select(func.count()).select_from(MessageConstellation).where(MessageConstellation.constellation_id == row.id)
    )
    if used:
        raise HTTPException(409, "Hapus pesan di galaksi terlebih dahulu.")
    await db.delete(row)
    await db.commit()
    await invalidate(request, user.id)


async def message_views(rows, db):
    if not rows:
        return []
    identifiers = [row.id for row in rows]
    links = (
        await db.execute(
            select(MessageConstellation.message_id, MessageConstellation.constellation_id).where(
                MessageConstellation.message_id.in_(identifiers)
            )
        )
    ).all()
    attachments = (
        await db.execute(
            select(MessageAttachment.message_id, MessageAttachment.upload_id).where(
                MessageAttachment.message_id.in_(identifiers)
            )
        )
    ).all()
    return [
        {
            "id": row.id,
            "entry_type": row.entry_type,
            "constellation_ids": [g for m, g in links if m == row.id],
            "visibility": row.visibility,
            "public_body": open_public(row.id, row.public_body if row.visibility == "public_anon" else row.ciphertext) if row.visibility != "private" else None,
            "is_mine": True, "empathy_count": row.empathy_count,
            "payload": {**(row.encryption_meta or {}), "ct": row.ciphertext, "iv": row.iv},
            "date_label": row.date_label,
            "mood": row.mood,
            "tags": row.tags,
            "prayer_count": row.prayer_count,
            "created_at": row.created_at,
            "attachment_ids": [u for m, u in attachments if m == row.id],
            "moderation_status": row.moderation_status,
        }
        for row in rows
    ]


async def validate_targets(body, user, db):
    for identifier in body.constellation_ids:
        await owned(db, Constellation, identifier, user.id)
    for identifier in body.attachment_ids:
        upload = await owned(db, Upload, identifier, user.id)
        if not upload.complete:
            raise HTTPException(409, "Unggahan lampiran belum selesai.")


@router.post("/messages", status_code=201)
async def create_message(body: AnyMessageInput, user: CurrentUser, db: DB, request: Request):
    await throttle(request, "messages", 15, user.id)
    await validate_targets(body, user, db)
    if body.visibility in ("public_anon", "unlisted"):
        await verify_turnstile(request, body.turnstile_token, "publish")
    row = Message(id=str(body.id), author_id=user.id, entry_type=body.entry_type)
    apply_message(row, body, user)
    db.add(row)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(409, "Identitas pesan sudah dipakai.") from exc
    db.add_all([MessageConstellation(message_id=row.id, constellation_id=str(g)) for g in body.constellation_ids])
    db.add_all([MessageAttachment(message_id=row.id, upload_id=str(u)) for u in body.attachment_ids])
    await db.commit()
    await invalidate(request, user.id)
    return (await message_views([row], db))[0]


@router.get("/messages/{message_id}")
async def get_message(message_id: UUID, user: OptionalUser, db: DB):
    row = await db.get(Message, str(message_id))
    if row and user and row.author_id == user.id:
        return (await message_views([row], db))[0]
    if user is None and (row is None or row.visibility != "public_anon" or row.moderation_status != "approved"):
        raise HTTPException(401, "Silakan masuk terlebih dahulu.")
    from .social import public_view, readable_public
    return public_view(await readable_public(db, message_id, user), user)


@router.patch("/messages/{message_id}")
async def edit_message(message_id: UUID, body: AnyMessageInput, user: CurrentUser, db: DB, request: Request):
    await throttle(request, "write", 60, user.id)
    row = await owned(db, Message, message_id, user.id)
    if message_id != body.id:
        raise HTTPException(422, "Identitas pesan tidak cocok.")
    await validate_targets(body, user, db)
    if body.visibility in ("public_anon", "unlisted"):
        await verify_turnstile(request, body.turnstile_token, "publish")
    apply_message(row, body, user)
    await db.execute(delete(MessageConstellation).where(MessageConstellation.message_id == row.id))
    await db.execute(delete(MessageAttachment).where(MessageAttachment.message_id == row.id))
    db.add_all([MessageConstellation(message_id=row.id, constellation_id=str(g)) for g in body.constellation_ids])
    db.add_all([MessageAttachment(message_id=row.id, upload_id=str(u)) for u in body.attachment_ids])
    await db.commit()
    await invalidate(request, user.id)
    return (await message_views([row], db))[0]


@router.delete("/messages/{message_id}", status_code=204)
async def delete_message(message_id: UUID, user: CurrentUser, db: DB, request: Request):
    await throttle(request, "write", 60, user.id)
    row = await owned(db, Message, message_id, user.id)
    await db.delete(row)
    await db.commit()
    await invalidate(request, user.id)


@router.get("/constellations/{galaxy_id}/messages")
async def galaxy_messages(
    galaxy_id: UUID, user: CurrentUser, db: DB, offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200)
):
    await owned(db, Constellation, galaxy_id, user.id)
    rows = (
        await db.scalars(
            select(Message)
            .join(MessageConstellation)
            .where(
                MessageConstellation.constellation_id == str(galaxy_id),
                Message.author_id == user.id,
            )
            .order_by(Message.created_at, Message.id)
            .offset(offset)
            .limit(limit)
        )
    ).all()
    return await message_views(rows, db)


def apply_message(row, body, user):
    payload = getattr(body, "payload", None)
    row.share_token_hash = None
    row.visibility = body.visibility
    row.ciphertext = payload.ct if payload else None
    row.iv = payload.iv if payload else None
    row.kdf_salt = user.encryption_record["salt"] if payload else None
    row.encryption_meta = payload.model_dump(exclude={"ct", "iv"}) if payload else None
    if body.visibility == "unlisted":
        row.ciphertext = seal_public(row.id, body.public_body)
        row.iv = "server-managed"
        row.encryption_meta = {"mode": "unlisted", "alg": "server-A256GCM"}
    row.public_body = seal_public(row.id, body.public_body) if body.visibility == "public_anon" else None
    row.moderation_status = "pending" if body.visibility != "private" else "not_applicable"
    row.moderation_flags, row.moderation_checked_at = [], None
    row.mood, row.tags, row.date_label = body.mood, body.tags, body.date_label
