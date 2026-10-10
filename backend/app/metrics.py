"""PRD 16 product aggregates, restricted to administrators."""
from datetime import timedelta, timezone

from fastapi import APIRouter, Query
from sqlalchemy import exists, func, select

from .models import Message, Prayer, Report, Session, User, now
from .security import AdminUser, DB

router = APIRouter(tags=["Metrik keberhasilan"])


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


@router.get("/admin/metrics")
async def product_metrics(admin: AdminUser, db: DB, days: int = Query(30, ge=7, le=365)):
    instant, since = now(), now() - timedelta(days=days)
    registered = await db.scalar(select(func.count()).select_from(User).where(User.created_at >= since))
    messages = await db.scalar(select(func.count()).select_from(Message).where(Message.created_at >= since))
    public = (Message.visibility == "public_anon", Message.moderation_status == "approved",
              Message.created_at >= since, (Message.release_at.is_(None) | (Message.release_at <= instant)))
    total_public = await db.scalar(select(func.count()).select_from(Message).where(*public))
    supported = await db.scalar(select(func.count()).select_from(Message).where(*public,
                               exists().where(Prayer.message_id == Message.id)))
    handled = await db.scalar(select(func.count()).select_from(Report).where(Report.status == "reviewed", Report.reviewed_at >= since))
    cohort = (await db.execute(select(User.created_at, func.max(Session.last_seen_at)).outerjoin(Session)
                              .where(User.created_at >= since, User.created_at <= instant - timedelta(days=7))
                              .group_by(User.id, User.created_at))).all()
    returned = sum(1 for created, last_seen in cohort if last_seen and utc(last_seen) >= utc(created) + timedelta(days=7))
    return {"days": days, "registered_users": registered, "created_messages": messages,
            "public_messages": total_public, "public_messages_with_prayer": supported,
            "prayer_support_ratio": supported / total_public if total_public else None,
            "retention_7d_eligible": len(cohort), "retention_7d_returned": returned,
            "retention_7d_ratio": returned / len(cohort) if cohort else None,
            "reviewed_reports": handled, "security_audit": "Audit berkala harus dicatat oleh pemeriksa; metrik ini tidak menyimpulkan ada atau tidaknya kebocoran."}
