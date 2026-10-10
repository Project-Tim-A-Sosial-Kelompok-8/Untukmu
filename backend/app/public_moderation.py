"""Initial checks for intentionally public text; flagged cases go to an admin."""
import re

from sqlalchemy import exists, select

from .models import Message, ModerationDecision, Report, now
from .public_content import open_public


def spam_flags(text):
    flags = []
    if len(re.findall(r"https?://", text, re.I)) >= 3:
        flags.append("banyak_tautan")
    if re.search(r"(.)\1{30,}", text):
        flags.append("pengulangan_berlebihan")
    if re.search(r"<\s*(script|iframe)\b", text, re.I):
        flags.append("markup_mencurigakan")
    return flags


async def check_public(row, db, *, previous_status=None):
    if row.visibility != "public_anon":
        return
    flags = spam_flags(open_public(row.id, row.public_body))
    reported = await db.scalar(select(exists().where(Report.message_id == row.id, Report.status == "open")))
    latest_decision = None
    if previous_status is not None:
        latest_decision = await db.scalar(select(ModerationDecision.decision).where(
            ModerationDecision.message_id == row.id
        ).order_by(ModerationDecision.created_at.desc(), ModerationDecision.id.desc()).limit(1))
    if reported or previous_status in {"rejected", "removed"} or latest_decision in {"reject", "remove"}:
        flags.append("memerlukan_peninjauan_ulang")
    row.moderation_flags = flags
    row.moderation_checked_at = now()
    row.moderation_status = "pending" if flags else "approved"


def automatic_backlog():
    # Legacy pending messages can have already been scanned by the old worker.
    # Never override a human decision, an open report, or a flagged review.
    return select(Message).where(
        Message.visibility == "public_anon", Message.moderation_status == "pending",
        Message.moderation_flags == [],
        ~exists().where(ModerationDecision.message_id == Message.id),
        ~exists().where(Report.message_id == Message.id, Report.status == "open"),
    ).order_by(Message.created_at).limit(50).with_for_update(skip_locked=True)
