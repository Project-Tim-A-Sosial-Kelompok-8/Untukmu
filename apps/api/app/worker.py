"""Durable public-only moderation scan. Heuristics flag; only humans approve."""
import asyncio
import logging
import re
from redis.asyncio import Redis
from sqlalchemy import select
from .config import settings
from .db import SessionFactory
from .models import Message, now
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


async def scan_pending(db):
    rows = (await db.scalars(select(Message).where(Message.visibility.in_(["public_anon", "unlisted"]),
        Message.moderation_status == "pending", Message.moderation_checked_at.is_(None)
    ).order_by(Message.created_at).limit(50).with_for_update(skip_locked=True))).all()
    for row in rows:
        row.moderation_flags = spam_flags(open_public(row.id, row.public_body or row.ciphertext))
        row.moderation_checked_at = now()
    await db.commit()
    return len(rows)


async def run():
    cache = Redis.from_url(settings().redis_url, decode_responses=True)
    try:
        while True:
            try:
                async with SessionFactory() as db:
                    count = await scan_pending(db)
                if count < 50:
                    await cache.blpop("moderation:notify", timeout=5)
            except Exception:
                logging.exception("Moderation worker retry; no content logged")
                await asyncio.sleep(5)
    finally:
        await cache.aclose()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
