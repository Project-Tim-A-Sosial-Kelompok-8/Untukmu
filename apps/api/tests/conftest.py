import base64
import os
from uuid import uuid4

os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("JWT_SECRET", "test-only-random-looking-secret-not-production-abcdef")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("APP_ORIGIN", "http://localhost:3000")

import pytest
from fakeredis.aioredis import FakeRedis
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db import get_db
from app.main import app
from app.models import Base
from app.prayer_catalog import seed_catalog


def key_record():
    def encode(count):
        return base64.b64encode(os.urandom(count)).decode()

    return {
        "v": 2,
        "kdf": "Argon2id",
        "memory": 65536,
        "iter": 3,
        "parallelism": 1,
        "salt": encode(16),
        "wrapped": {"iv": encode(12), "ct": encode(48)},
        "wrappedRecovery": {"iv": encode(12), "ct": encode(48)},
    }


def message_input(galaxy_id):
    identifier = str(uuid4())
    return {
        "id": identifier,
        "constellation_ids": [galaxy_id],
        "visibility": "private",
        "payload": {
            "v": 2,
            "alg": "A256GCM",
            "mode": "private",
            "iv": base64.b64encode(os.urandom(12)).decode(),
            "ct": base64.b64encode(os.urandom(64)).decode(),
            "aad": f"untukmu:message:v2:{identifier}:private",
        },
        "tags": ["kenangan"],
    }


@pytest.fixture
async def database(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/test.db")

    @event.listens_for(engine.sync_engine, "connect")
    def foreign_keys(connection, record):
        connection.execute("PRAGMA foreign_keys=ON")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as db:
        await seed_catalog(db)

    async def override():
        async with factory() as db:
            yield db

    app.dependency_overrides[get_db] = override
    app.state.redis = FakeRedis(decode_responses=True)
    yield factory
    await app.state.redis.aclose()
    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.fixture
async def client(database):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://localhost:3000", headers={"Origin": "http://localhost:3000"}
    ) as client:
        yield client


async def account(client, email="first@example.com"):
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "test-credential-derived-client-side", "encryption_record": key_record()},
    )
    assert response.status_code == 201, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def galaxy(client, headers):
    response = await client.post(
        "/api/v1/constellations",
        headers=headers,
        json={"target_kind": "sahabat", "target_label": "Sahabat", "color": "#ffd9a0"},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]
