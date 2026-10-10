"""Durable public-only initial checks and storage cleanup."""
import asyncio
import logging
from redis.asyncio import Redis
from sqlalchemy import select
from .config import settings
from .db import SessionFactory
from .models import StorageDeletion
from .uploads import storage
from starlette.concurrency import run_in_threadpool
from .public_moderation import automatic_backlog, check_public


async def scan_pending(db):
    rows = (await db.scalars(automatic_backlog())).all()
    for row in rows:
        await check_public(row, db)
    await db.commit()
    return len(rows)


async def clean_deleted_uploads(db):
    rows = (await db.scalars(select(StorageDeletion).order_by(StorageDeletion.created_at)
                            .limit(50).with_for_update(skip_locked=True))).all()
    for row in rows:
        await run_in_threadpool(storage().delete_object, Bucket=settings().s3_bucket, Key=row.storage_key)
        await db.delete(row)
    await db.commit()
    return len(rows)


async def run():
    cache = Redis.from_url(settings().redis_url, decode_responses=True)
    try:
        while True:
            try:
                async with SessionFactory() as db:
                    await clean_deleted_uploads(db)
            except Exception:
                logging.exception("Storage deletion retry; no content logged")
            try:
                async with SessionFactory() as db:
                    count = await scan_pending(db)
                if count:
                    await cache.incr("feed:version")
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
