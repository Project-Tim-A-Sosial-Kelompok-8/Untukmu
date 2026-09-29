import asyncio
import json
from datetime import timedelta
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from starlette.requests import Request

from app.config import Settings
from app.main import app
from app.models import Message, Session, User, now
from app.security import throttle
from .conftest import account, galaxy, key_record, message_input


async def test_registration_hashes_credential_and_never_returns_hash(client, database):
    headers = await account(client)
    response = await client.get("/api/v1/users/me", headers=headers)
    assert response.status_code == 200
    assert "password_hash" not in response.json()
    async with database() as db:
        user = await db.scalar(select(User))
        assert user.password_hash.startswith("$argon2id$")
        assert "test-credential" not in user.password_hash
    assert (
        await client.post("/api/v1/auth/login", json={"email": "first@example.com", "password": "wrong"})
    ).status_code == 401
    assert (
        await client.post(
            "/api/v1/auth/login", json={"email": "first@example.com", "password": "test-credential-derived-client-side"}
        )
    ).status_code == 200


async def test_private_crud_and_dashboard_do_not_seed(client, database):
    headers = await account(client)
    assert (await client.get("/api/v1/constellations", headers=headers)).json() == []
    galaxy_id = await galaxy(client, headers)
    payload = message_input(galaxy_id)
    response = await client.post("/api/v1/messages", headers=headers, json=payload)
    assert response.status_code == 201, response.text
    identifier = response.json()["id"]
    assert response.json()["payload"] == payload["payload"]
    async with database() as db:
        stored = await db.get(Message, identifier)
        assert stored.public_body is None
        assert stored.ciphertext == payload["payload"]["ct"]
        assert stored.moderation_status == "not_applicable"
    summary = (await client.get("/api/v1/dashboard/summary", headers=headers)).json()
    assert summary["messages"] == 1 and summary["constellations"] == 1 and summary["prayers_received"] == 0
    assert (await client.delete(f"/api/v1/constellations/{galaxy_id}", headers=headers)).status_code == 409
    payload["tags"] = ["diperbarui"]
    assert (await client.patch(f"/api/v1/messages/{identifier}", headers=headers, json=payload)).status_code == 200
    assert (await client.delete(f"/api/v1/messages/{identifier}", headers=headers)).status_code == 204
    assert (await client.get("/api/v1/dashboard/summary", headers=headers)).json()["messages"] == 0
    assert (await client.delete(f"/api/v1/constellations/{galaxy_id}", headers=headers)).status_code == 204


async def test_cross_account_isolation_for_all_private_resources(client):
    owner = await account(client)
    galaxy_id = await galaxy(client, owner)
    payload = message_input(galaxy_id)
    assert (await client.post("/api/v1/messages", headers=owner, json=payload)).status_code == 201
    other = await account(client, "second@example.com")
    for path in [f"/messages/{payload['id']}", f"/constellations/{galaxy_id}", f"/constellations/{galaxy_id}/messages"]:
        assert (await client.get("/api/v1" + path, headers=other)).status_code == 404
    assert (await client.get(f"/api/v1/messages/{payload['id']}")).status_code == 401
    assert (await client.patch(f"/api/v1/messages/{payload['id']}", headers=other, json=payload)).status_code == 404
    assert (await client.delete(f"/api/v1/messages/{payload['id']}", headers=other)).status_code == 404
    assert (await client.post("/api/v1/messages", headers=other, json=message_input(galaxy_id))).status_code == 404
    assert (await client.get("/api/v1/dashboard/messages", headers=other)).json() == []


@pytest.mark.parametrize("mutation", ["plaintext", "public", "aad", "owner", "invalid_iv", "key"])
async def test_payload_boundary_and_validation_does_not_echo_secrets(client, mutation):
    headers = await account(client)
    body = message_input(await galaxy(client, headers))
    secret = "sensitive-value-must-not-be-reflected"
    if mutation == "plaintext":
        body["public_body"] = secret
    if mutation == "public":
        body["visibility"] = "public_anon"
    if mutation == "aad":
        body["payload"]["aad"] = "unrelated-message"
    if mutation == "owner":
        body["author_id"] = str(uuid4())
    if mutation == "invalid_iv":
        body["payload"]["iv"] = "bad"
    if mutation == "key":
        body["payload"]["master_key"] = secret
    response = await client.post("/api/v1/messages", headers=headers, json=body)
    assert response.status_code == 422, response.text
    assert secret not in response.text


async def test_refresh_rotation_replay_revokes_session(client):
    headers = await account(client)
    original = client.cookies.get("um_refresh")
    rotated = await client.post("/api/v1/auth/refresh")
    assert rotated.status_code == 200
    assert client.cookies.get("um_refresh") != original
    replay = await client.post("/api/v1/auth/refresh", headers={"Cookie": f"um_refresh={original}"})
    assert replay.status_code == 401
    assert (await client.get("/api/v1/users/me", headers=headers)).status_code == 401


async def test_auth_status_rejects_old_refresh_without_revoking_current_session(client):
    headers = await account(client)
    original = client.cookies.get("um_refresh")
    assert (await client.post("/api/v1/auth/refresh")).status_code == 200
    stale = await client.get("/api/v1/auth/status", headers={"Cookie": f"um_refresh={original}"})
    assert stale.json() == {"authenticated": False}
    assert (await client.get("/api/v1/auth/status")).json() == {"authenticated": True}
    assert (await client.get("/api/v1/users/me", headers=headers)).status_code == 200


async def test_expired_session_is_rejected_even_with_unexpired_tokens(client, database):
    headers = await account(client)
    async with database() as db:
        session = await db.scalar(select(Session))
        session.expires_at = now() - timedelta(seconds=1)
        await db.commit()
    assert (await client.get("/api/v1/auth/status")).json() == {"authenticated": False}
    assert (await client.get("/api/v1/users/me", headers=headers)).status_code == 401
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401

    login = await client.post(
        "/api/v1/auth/login", json={"email": "first@example.com", "password": "test-credential-derived-client-side"}
    )
    assert login.status_code == 200
    active = {"Authorization": "Bearer " + login.json()["access_token"]}
    assert len((await client.get("/api/v1/auth/sessions", headers=active)).json()) == 1


async def test_cookie_flags_and_cross_origin_csrf(client):
    await account(client)
    assert (
        await client.post("/api/v1/auth/refresh", headers={"Origin": "https://attacker.invalid"})
    ).status_code == 403
    response = await client.post(
        "/api/v1/auth/login", json={"email": "first@example.com", "password": "test-credential-derived-client-side"}
    )
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie and "path=/api/v1/auth" in cookie
    refresh = client.cookies.get("um_refresh")
    assert (await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {refresh}"})).status_code == 401


async def test_logout_and_session_ownership(client):
    first = await account(client)
    sessions = (await client.get("/api/v1/auth/sessions", headers=first)).json()
    second = await account(client, "second@example.com")
    assert (await client.delete(f"/api/v1/auth/sessions/{sessions[0]['id']}", headers=second)).status_code == 404
    assert (await client.post("/api/v1/auth/logout")).status_code == 204
    assert (await client.get("/api/v1/users/me", headers=second)).status_code == 401
    assert (await client.get("/api/v1/users/me", headers=first)).status_code == 200


async def test_rate_limit_is_atomic(database):
    request = Request({"type": "http", "app": app, "headers": [], "client": ("127.0.0.1", 1000)})
    results = await asyncio.gather(
        *(throttle(request, "test", 5, "one-user") for _ in range(20)), return_exceptions=True
    )
    assert sum(item is None for item in results) == 5
    assert sum(isinstance(item, HTTPException) and item.status_code == 429 for item in results) == 15


async def test_unowned_or_unfinished_photo_rejected(client):
    headers = await account(client)
    response = await client.post(
        "/api/v1/constellations",
        headers=headers,
        json={"target_kind": "custom", "target_label": "Tujuan", "visual_type": "photo", "visual_ref": str(uuid4())},
    )
    assert response.status_code == 404


def test_production_requires_https_and_real_database():
    with pytest.raises(ValueError):
        Settings(environment="production", database_url="sqlite+aiosqlite:///:memory:", jwt_secret="x" * 40)
    with pytest.raises(ValueError):
        Settings(
            environment="production",
            database_url="postgresql+asyncpg://u:p@db/app",
            jwt_secret="x" * 40,
            app_origin="http://unsafe.example",
        )


def test_openapi_has_unique_operations_and_no_plaintext_private_input():
    schema = app.openapi()
    operations = [op["operationId"] for methods in schema["paths"].values() for op in methods.values()]
    assert len(operations) == len(set(operations))
    assert len(schema["paths"]) >= 18
    assert "public_body" not in json.dumps(schema["components"]["schemas"]["MessageInput"])


async def test_invalid_key_record_cannot_include_raw_key(client):
    record = key_record()
    record["master_key"] = "must-never-be-stored"
    result = await client.post(
        "/api/v1/auth/register",
        json={"email": "key@example.com", "password": "a-long-credential", "encryption_record": record},
    )
    assert result.status_code == 422
    assert "must-never-be-stored" not in result.text
