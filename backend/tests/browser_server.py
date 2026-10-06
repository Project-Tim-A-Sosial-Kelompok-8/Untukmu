"""Isolated browser test server. NEVER imported by the production application."""

import os
from contextlib import asynccontextmanager
from pathlib import Path

os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///" + os.environ.get("UNTUKMU_BROWSER_DATABASE", str(Path(__file__).resolve().parents[1] / "browser-test.db"))
os.environ["JWT_SECRET"] = "browser-test-secret-not-for-production-0123456789"
os.environ["APP_ORIGIN"] = os.environ.get("UNTUKMU_TEST_BASE_URL", "http://localhost:3000")
os.environ["TURNSTILE_SECRET"] = ""

from fakeredis.aioredis import FakeRedis
from sqlalchemy import event
from app.db import engine, SessionFactory
from app.main import app
from app.models import Base
from app.prayer_catalog import seed_catalog


@event.listens_for(engine.sync_engine, "connect")
def foreign_keys(connection, record):
    connection.execute("PRAGMA foreign_keys=ON")


@asynccontextmanager
async def testing_lifespan(app):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    async with SessionFactory() as db:
        await seed_catalog(db)
    app.state.redis = FakeRedis(decode_responses=True)
    yield
    await app.state.redis.aclose()
    await engine.dispose()


app.router.lifespan_context = testing_lifespan
