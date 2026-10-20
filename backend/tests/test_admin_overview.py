import json
from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models import Message, MessageConstellation, User, now
from app.public_content import seal_public

from .conftest import account, galaxy
from .test_social import admin_account


def stored_message(author_id, visibility="private", created_at=None):
    identifier = str(uuid4())
    values = {
        "id": identifier,
        "author_id": author_id,
        "visibility": visibility,
        "created_at": created_at or now() - timedelta(days=1),
    }
    if visibility == "public_anon":
        values.update(
            public_body=seal_public(identifier, "Ucapan publik untuk pengujian."), moderation_status="approved"
        )
    else:
        values.update(
            ciphertext="private-ciphertext-must-not-be-returned",
            iv="private-iv",
            encryption_meta={"alg": "A256GCM"},
        )
    return Message(**values)


async def overview_dataset(client, database):
    admin = await admin_account(client, database)
    await account(client, "alpha@example.com")
    await account(client, "beta@example.com")
    first, second = await galaxy(client, admin), await galaxy(client, admin)
    async with database() as db:
        users = {user.email: user for user in await db.scalars(select(User))}
        admin_id = users["moderator@example.com"].id
        alpha_id = users["alpha@example.com"].id
        beta_id = users["beta@example.com"].id
        users["alpha@example.com"].display_name = "Ayu Putri"
        users["beta@example.com"].display_name = "Bima %_ Aman"
        users["beta@example.com"].created_at = now() - timedelta(days=60)
        own_messages = [stored_message(admin_id), stored_message(admin_id)]
        messages = [
            *own_messages,
            *[stored_message(alpha_id) for _ in range(3)],
            *[stored_message(alpha_id, "public_anon") for _ in range(3)],
            *[stored_message(alpha_id, "unlisted") for _ in range(2)],
            stored_message(beta_id),
            *[stored_message(beta_id, "public_anon") for _ in range(2)],
            stored_message(beta_id, "unlisted"),
            stored_message(None, "public_anon"),
            stored_message(alpha_id, created_at=now() - timedelta(days=40)),
        ]
        db.add_all(messages)
        await db.flush()
        # One ID linked to two galaxies must still count as one message.
        db.add_all(MessageConstellation(message_id=own_messages[0].id, constellation_id=gid) for gid in [first, second])
        await db.commit()
    return admin, {"admin": admin_id, "alpha": alpha_id, "beta": beta_id, "own_message": own_messages[0].id}


async def test_metrics_distinguish_two_admin_messages_from_fifteen_across_all_accounts(client, database):
    admin, identifiers = await overview_dataset(client, database)
    response = await client.get("/api/v1/admin/metrics?days=30", headers=admin)
    assert response.status_code == 200, response.text
    metrics = response.json()
    assert metrics["scope"] == "all_accounts"
    assert metrics["message_count_scope"] == "retained_messages_created_in_period"
    assert metrics["days"] == 30
    assert metrics["created_messages"] == 15
    assert metrics["admin_created_messages"] == 2
    assert metrics["messages_by_visibility"] == {"private": 6, "public_anon": 6, "unlisted": 3}
    assert metrics["messages_by_author_status"] == {"active_account": 14, "deleted_account": 1}
    assert metrics["public_messages"] == 6 and metrics["public_messages_with_prayer"] == 0
    assert metrics["registered_users"] == 2 and metrics["total_users"] == 3
    assert metrics["period_start"] < metrics["period_end"]
    assert identifiers["own_message"] not in response.text and "email" not in response.text


async def test_admin_users_search_and_pagination_return_safe_all_time_counts(client, database):
    admin, identifiers = await overview_dataset(client, database)
    all_users = (await client.get("/api/v1/admin/users", headers=admin)).json()
    assert all_users["total"] == 3 and len(all_users["items"]) == 3
    assert all_users["message_count_scope"] == "all_time_retained"
    by_id = {item["id"]: item for item in all_users["items"]}
    assert by_id[identifiers["admin"]]["message_count"] == 2
    assert by_id[identifiers["alpha"]]["message_count"] == 9
    assert by_id[identifiers["alpha"]]["messages_by_visibility"] == {
        "private": 4,
        "public_anon": 3,
        "unlisted": 2,
    }
    assert by_id[identifiers["beta"]]["message_count"] == 4
    safe_keys = {"id", "email", "display_name", "role", "created_at", "message_count", "messages_by_visibility"}
    assert all(set(item) == safe_keys for item in all_users["items"])
    serialized = json.dumps(all_users)
    for forbidden in [
        "password_hash",
        "encryption_record",
        "recovery_auth_hash",
        "refresh_token_hash",
        "private-ciphertext",
        "public_body",
        "sessions",
    ]:
        assert forbidden not in serialized
    for query in [" AYU ", "ALPHA@EXAMPLE"]:
        matched = (await client.get("/api/v1/admin/users", headers=admin, params={"q": query, "limit": 1})).json()
        assert matched["total"] == 1 and matched["items"][0]["id"] == identifiers["alpha"]
    literal_wildcard = (await client.get("/api/v1/admin/users", headers=admin, params={"q": "%_"})).json()
    assert literal_wildcard["total"] == 1 and literal_wildcard["items"][0]["id"] == identifiers["beta"]
    pages = []
    for offset in range(3):
        page = (await client.get("/api/v1/admin/users", headers=admin, params={"offset": offset, "limit": 1})).json()
        assert page["total"] == 3 and page["offset"] == offset and page["limit"] == 1
        pages.append(page["items"][0]["id"])
    assert len(set(pages)) == 3
    missing = (await client.get("/api/v1/admin/users?q=not-registered", headers=admin)).json()
    assert missing["total"] == 0 and missing["items"] == []


async def test_metrics_and_user_counts_follow_physical_message_deletion(client, database):
    admin, identifiers = await overview_dataset(client, database)
    async with database() as db:
        await db.delete(await db.get(Message, identifiers["own_message"]))
        await db.commit()
    metrics = (await client.get("/api/v1/admin/metrics", headers=admin)).json()
    assert metrics["created_messages"] == 14 and metrics["admin_created_messages"] == 1
    users = (await client.get("/api/v1/admin/users?q=moderator", headers=admin)).json()
    assert users["items"][0]["message_count"] == 1


async def test_admin_user_without_messages_is_included_with_zero_counts(client, database):
    admin = await admin_account(client, database)
    result = (await client.get("/api/v1/admin/users", headers=admin)).json()
    assert result["total"] == 1
    assert result["items"][0]["message_count"] == 0
    assert result["items"][0]["messages_by_visibility"] == {"private": 0, "public_anon": 0, "unlisted": 0}


@pytest.mark.parametrize("path", ["/admin/metrics", "/admin/users", "/admin/users?q=moderator"])
async def test_admin_overview_rejects_guests_and_regular_accounts(client, path):
    regular = await account(client)
    assert (await client.get("/api/v1" + path)).status_code == 401
    assert (await client.get("/api/v1" + path, headers=regular)).status_code == 403


@pytest.mark.parametrize("parameters", [{"offset": -1}, {"limit": 0}, {"limit": 101}, {"q": "a" * 255}])
async def test_admin_user_list_validates_pagination_and_search(client, database, parameters):
    admin = await admin_account(client, database)
    assert (await client.get("/api/v1/admin/users", headers=admin, params=parameters)).status_code == 422
