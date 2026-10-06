import json

from fastapi import APIRouter, Query, Request
from sqlalchemy import func, select

from .content import message_views
from .models import Constellation, Message, Prayer
from .security import CurrentUser, DB, get_redis, visitor_identity

router = APIRouter(tags=["Dashboard"])


@router.get("/dashboard/prayers-received")
async def prayers_received(user: CurrentUser, db: DB, limit: int = Query(100, ge=1, le=200)):
    rows = (
        await db.scalars(
            select(Prayer)
            .join(Message)
            .where(Message.author_id == user.id)
            .order_by(Prayer.created_at.desc())
            .limit(limit)
        )
    ).all()
    return [
        {
            "id": row.id,
            "message_id": row.message_id,
            "tradition": row.tradition,
            "prayer_type": row.prayer_type,
            "created_at": row.created_at,
            "source_attribution": row.source_attribution,
        }
        for row in rows
    ]


@router.get("/dashboard/summary")
async def summary(user: CurrentUser, db: DB, request: Request):
    cache = get_redis(request)
    cached = await cache.get(f"summary:{user.id}")
    if cached:
        previous = json.loads(cached)
        if "written_prayers" not in previous:
            return previous
    galaxies = await db.scalar(select(func.count()).select_from(Constellation).where(Constellation.owner_id == user.id))
    counts = dict(
        (
            await db.execute(
                select(Message.visibility, func.count())
                .where(Message.author_id == user.id)
                .group_by(Message.visibility)
            )
        ).all()
    )
    prayer_count = await db.scalar(
        select(func.coalesce(func.sum(Message.prayer_count), 0)).where(Message.author_id == user.id)
    )
    given = await db.scalar(select(func.count()).select_from(Prayer).where(Prayer.visitor_hash == visitor_identity(request, user)))
    result = {
        "constellations": galaxies,
        "targets": galaxies,
        "messages": sum(counts.values()),
        "entries": sum(counts.values()),
        "prayers_received": prayer_count,
        "prayers_given": given,
        "by_visibility": counts,
    }
    await cache.set(f"summary:{user.id}", json.dumps(result), ex=30)
    return result


@router.get("/dashboard/messages")
async def my_messages(user: CurrentUser, db: DB, offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200)):
    rows = (
        await db.scalars(
            select(Message)
            .where(Message.author_id == user.id)
            .order_by(Message.created_at, Message.id)
            .offset(offset)
            .limit(limit)
        )
    ).all()
    return await message_views(rows, db)
