"""PRD 16 product aggregates, restricted to administrators."""

from datetime import timedelta, timezone

from fastapi import APIRouter, Query
from sqlalchemy import case, exists, func, or_, select

from ..models import Message, Prayer, Report, Session, User, now
from ..security import DB, AdminUser

router = APIRouter(tags=["Metrik keberhasilan"])


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


@router.get("/admin/metrics")
async def product_metrics(admin: AdminUser, db: DB, days: int = Query(30, ge=7, le=365)):
    instant = now()
    since = instant - timedelta(days=days)
    registered = await db.scalar(
        select(func.count()).select_from(User).where(User.created_at >= since, User.created_at <= instant)
    )
    total_users = await db.scalar(select(func.count()).select_from(User))
    # Count stored message IDs directly. One message may belong to several
    # galaxies; joining their links would inflate these product aggregates.
    period = Message.created_at >= since, Message.created_at <= instant
    counts = (
        await db.execute(
            select(
                func.count(Message.id).label("total"),
                func.count(case((Message.author_id == admin.id, 1))).label("admin"),
                func.count(case((Message.visibility == "private", 1))).label("private"),
                func.count(case((Message.visibility == "public_anon", 1))).label("public_anon"),
                func.count(case((Message.visibility == "unlisted", 1))).label("unlisted"),
                func.count(case((Message.author_id.is_not(None), 1))).label("active_account"),
                func.count(case((Message.author_id.is_(None), 1))).label("deleted_account"),
            ).where(*period)
        )
    ).one()
    public = (
        Message.visibility == "public_anon",
        Message.moderation_status == "approved",
        *period,
        (Message.release_at.is_(None) | (Message.release_at <= instant)),
    )
    total_public = await db.scalar(select(func.count()).select_from(Message).where(*public))
    supported = await db.scalar(
        select(func.count()).select_from(Message).where(*public, exists().where(Prayer.message_id == Message.id))
    )
    handled = await db.scalar(
        select(func.count()).select_from(Report).where(Report.status == "reviewed", Report.reviewed_at >= since)
    )
    cohort = (
        await db.execute(
            select(User.created_at, func.max(Session.last_seen_at))
            .outerjoin(Session)
            .where(User.created_at >= since, User.created_at <= instant - timedelta(days=7))
            .group_by(User.id, User.created_at)
        )
    ).all()
    returned = sum(
        1 for created, last_seen in cohort if last_seen and utc(last_seen) >= utc(created) + timedelta(days=7)
    )
    return {
        "days": days,
        "scope": "all_accounts",
        "period_start": since,
        "period_end": instant,
        "message_count_scope": "retained_messages_created_in_period",
        "total_users": total_users,
        "registered_users": registered,
        "created_messages": counts.total,
        "admin_created_messages": counts.admin,
        "messages_by_visibility": {name: getattr(counts, name) for name in ["private", "public_anon", "unlisted"]},
        "messages_by_author_status": {
            "active_account": counts.active_account,
            "deleted_account": counts.deleted_account,
        },
        "public_messages": total_public,
        "public_messages_with_prayer": supported,
        "prayer_support_ratio": supported / total_public if total_public else None,
        "retention_7d_eligible": len(cohort),
        "retention_7d_returned": returned,
        "retention_7d_ratio": returned / len(cohort) if cohort else None,
        "reviewed_reports": handled,
        "security_audit": "Audit berkala harus dicatat oleh pemeriksa; metrik ini tidak menyimpulkan ada atau tidaknya kebocoran.",
    }


@router.get("/admin/users")
async def registered_users(
    admin: AdminUser,
    db: DB,
    offset: int = Query(0, ge=0, le=100000),
    limit: int = Query(50, ge=1, le=100),
    q: str = Query("", max_length=254),
):
    search = q.strip().lower()
    matches = []
    if search:
        matches.append(
            or_(
                func.lower(User.email).contains(search, autoescape=True),
                func.lower(User.display_name).contains(search, autoescape=True),
            )
        )
    total = await db.scalar(select(func.count()).select_from(User).where(*matches))
    counts = (
        select(
            Message.author_id.label("user_id"),
            func.count(Message.id).label("message_count"),
            func.count(case((Message.visibility == "private", 1))).label("private"),
            func.count(case((Message.visibility == "public_anon", 1))).label("public_anon"),
            func.count(case((Message.visibility == "unlisted", 1))).label("unlisted"),
        )
        .where(Message.author_id.is_not(None))
        .group_by(Message.author_id)
        .subquery()
    )
    rows = await db.execute(
        select(
            User.id,
            User.email,
            User.display_name,
            User.role,
            User.created_at,
            func.coalesce(counts.c.message_count, 0).label("message_count"),
            func.coalesce(counts.c.private, 0).label("private"),
            func.coalesce(counts.c.public_anon, 0).label("public_anon"),
            func.coalesce(counts.c.unlisted, 0).label("unlisted"),
        )
        .outerjoin(counts, counts.c.user_id == User.id)
        .where(*matches)
        .order_by(User.created_at.desc(), User.id)
        .offset(offset)
        .limit(limit)
    )
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "message_count_scope": "all_time_retained",
        "items": [
            {
                **{
                    name: getattr(row, name)
                    for name in ["id", "email", "display_name", "role", "created_at", "message_count"]
                },
                "messages_by_visibility": {name: getattr(row, name) for name in ["private", "public_anon", "unlisted"]},
            }
            for row in rows
        ],
    }
