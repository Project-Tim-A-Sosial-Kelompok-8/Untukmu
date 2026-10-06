import hashlib
import hmac
import json
from uuid import UUID
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.encoders import jsonable_encoder
from sqlalchemy import and_, cast, exists, func, literal, or_, select, update
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.exc import IntegrityError
from .content import invalidate
from .models import Block, Empathy, Message, ModerationDecision, Report, now
from .public_content import open_public
from .schemas import BlockInput, DecisionInput, PublicAction, ReportInput
from .security import AdminUser, CurrentUser, DB, OptionalUser, get_redis, throttle, verify_turnstile, visitor_identity

router = APIRouter(tags=["Sosial dan moderasi"])


def visible_filter(user):
    condition = and_(Message.visibility == "public_anon", Message.moderation_status == "approved")
    if user:
        condition = and_(condition, ~exists().where(or_(
            and_(Block.blocker_id == user.id, Block.blocked_id == Message.author_id),
            and_(Block.blocked_id == user.id, Block.blocker_id == Message.author_id))))
    return condition


async def readable_public(db, identifier, user):
    row = await db.scalar(select(Message).where(Message.id == str(identifier), visible_filter(user)))
    if row is None:
        raise HTTPException(404, "Pesan tidak ditemukan.")
    return row


def public_view(row, user=None):
    return {"id": row.id, "entry_type": row.entry_type, "visibility": row.visibility, "public_body": open_public(row.id, row.public_body if row.visibility == "public_anon" else row.ciphertext),
            "date_label": row.date_label, "mood": row.mood, "tags": row.tags, "created_at": row.created_at,
            "prayer_count": row.prayer_count, "empathy_count": row.empathy_count,
            "is_mine": bool(user and user.id == row.author_id), "author_deleted": row.author_id is None,
            "constellation_ids": [], "attachment_ids": [],
            "moderation_status": "approved"}


@router.get("/explore")
async def explore(db: DB, request: Request, user: OptionalUser, offset: int = Query(0, ge=0, le=100000),
                  limit: int = Query(30, ge=1, le=100), sort: str = Query("new", pattern="^(new|prayers)$"),
                  mood: str | None = Query(None, max_length=40), tag: str | None = Query(None, max_length=50)):
    cache = get_redis(request)
    version = await cache.get("feed:version") or "0"
    key = "feed:" + json.dumps([version, user.id if user else None, offset, limit, sort, mood, tag])
    saved = await cache.get(key)
    if saved:
        return json.loads(saved)
    query = select(Message).where(visible_filter(user))
    if mood:
        query = query.where(Message.mood == mood)
    if tag:
        if db.bind.dialect.name == "postgresql":
            query = query.where(Message.tags.op("@>")(cast([tag], JSONB)))
        else:
            values = func.json_each(Message.tags).table_valued("value")
            query = query.where(exists(select(literal(1)).select_from(values).where(values.c.value == tag)))
    order = [Message.prayer_count.desc()] if sort == "prayers" else []
    rows = await db.scalars(query.order_by(*order, Message.created_at.desc(), Message.id).offset(offset).limit(limit))
    result = [public_view(row, user) for row in rows]
    await cache.set(key, json.dumps(jsonable_encoder(result)), ex=20)
    return result


@router.post("/messages/{message_id}/empathy")
async def empathy(message_id: UUID, body: PublicAction, user: OptionalUser, db: DB, request: Request):
    identity = visitor_identity(request, user)
    await throttle(request, "empathy", 20, identity)
    if not user:
        await verify_turnstile(request, body.turnstile_token, "empathy")
    row = await readable_public(db, message_id, user)
    added = False
    try:
        async with db.begin_nested():
            db.add(Empathy(message_id=row.id, visitor_hash=identity))
            await db.flush()
        added = True
    except IntegrityError:
        pass
    if added:
        await db.execute(update(Message).where(Message.id == row.id).values(empathy_count=Message.empathy_count + 1))
    await db.commit()
    await db.refresh(row)
    await invalidate(request, row.author_id)
    return {"added": added, "empathy_count": row.empathy_count}


@router.post("/reports", status_code=201)
async def report(body: ReportInput, user: OptionalUser, db: DB, request: Request):
    await throttle(request, "report", 5, visitor_identity(request, user))
    if not user:
        await verify_turnstile(request, body.turnstile_token, "report")
    row = await readable_public(db, body.message_id, user)
    report = Report(message_id=row.id, reporter_id=user.id if user else None, reason=body.reason.strip())
    db.add(report)
    await db.commit()
    return {"id": report.id, "status": report.status}


@router.post("/users/blocks", status_code=201)
async def block(body: BlockInput, user: CurrentUser, db: DB, request: Request):
    await throttle(request, "write", 60, user.id)
    message = await readable_public(db, body.message_id, user)
    if message.author_id is None:
        raise HTTPException(409, "Akun penulis sudah dihapus. Konten tetap dapat dilaporkan kepada moderator.")
    if message.author_id == user.id:
        raise HTTPException(422, "Akun sendiri tidak dapat diblokir.")
    row = Block(blocker_id=user.id, blocked_id=message.author_id)
    db.add(row)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(409, "Pengguna sudah diblokir.") from exc
    await invalidate(request, user.id)
    return {"id": row.id, "created_at": row.created_at}


@router.get("/users/blocks")
async def blocks(user: CurrentUser, db: DB):
    rows = await db.scalars(select(Block).where(Block.blocker_id == user.id).order_by(Block.created_at.desc()))
    return [{"id": row.id, "created_at": row.created_at} for row in rows]


@router.delete("/users/blocks/{block_id}", status_code=204)
async def unblock(block_id: UUID, user: CurrentUser, db: DB, request: Request):
    await throttle(request, "write", 60, user.id)
    row = await db.get(Block, str(block_id))
    if row is None or row.blocker_id != user.id:
        raise HTTPException(404, "Pemblokiran tidak ditemukan.")
    await db.delete(row)
    await db.commit()
    await invalidate(request, user.id)


@router.get("/admin/moderation/queue")
async def moderation_queue(admin: AdminUser, db: DB, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100)):
    reported = exists().where(Report.message_id == Message.id, Report.status == "open")
    rows = await db.scalars(select(Message).where(Message.visibility.in_(["public_anon", "unlisted"]), or_(
        Message.moderation_status == "pending", reported)).order_by(Message.created_at, Message.id).offset(offset).limit(limit))
    result = []
    for row in rows:
        reports = await db.scalars(select(Report).where(Report.message_id == row.id, Report.status == "open"))
        result.append({**public_view(row), "moderation_status": row.moderation_status,
                       "flags": row.moderation_flags, "checked_at": row.moderation_checked_at,
                       "review_token": hashlib.sha256((row.public_body or row.ciphertext).encode()).hexdigest(),
                       "reports": [{"id": r.id, "reason": r.reason} for r in reports]})
    return result


@router.post("/admin/moderation/{message_id}/decision")
async def decide(message_id: UUID, body: DecisionInput, admin: AdminUser, db: DB, request: Request):
    await throttle(request, "moderation", 60, admin.id)
    row = await db.scalar(select(Message).where(Message.id == str(message_id), Message.visibility.in_(["public_anon", "unlisted"])).with_for_update())
    if row is None:
        raise HTTPException(404, "Konten publik tidak ditemukan.")
    if not hmac.compare_digest(body.review_token, hashlib.sha256((row.public_body or row.ciphertext).encode()).hexdigest()):
        raise HTTPException(409, "Pesan berubah. Muat ulang antrean lalu tinjau kembali.")
    row.moderation_status = {"approve": "approved", "reject": "rejected", "remove": "removed"}[body.decision]
    db.add(ModerationDecision(message_id=row.id, reviewer_id=admin.id, decision=body.decision, reason=body.reason))
    await db.execute(update(Report).where(Report.message_id == row.id, Report.status == "open").values(status="reviewed", reviewed_at=now()))
    await db.commit()
    await invalidate(request, row.author_id)
    return {"id": row.id, "moderation_status": row.moderation_status}
