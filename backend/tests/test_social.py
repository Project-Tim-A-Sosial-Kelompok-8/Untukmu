from uuid import uuid4
from sqlalchemy import select
from app.models import Message, User
from app.worker import scan_pending
from .conftest import account, galaxy, message_input


async def admin_account(client, database):
    headers = await account(client, "moderator@example.com")
    async with database() as db:
        user = await db.scalar(select(User).where(User.email == "moderator@example.com"))
        user.role = "admin"
        await db.commit()
    return headers


async def public_message(client, owner, gid):
    body = {"id": str(uuid4()), "constellation_ids": [gid], "visibility": "public_anon",
            "public_body": "Pesan publik yang sengaja dibagikan.", "tags": ["kenangan", "syukur"]}
    result = await client.post("/api/v1/messages", headers=owner, json=body)
    assert result.status_code == 201, result.text
    return body


async def approve(client, admin, identifier):
    queue = (await client.get("/api/v1/admin/moderation/queue", headers=admin)).json()
    token = next(item["review_token"] for item in queue if item["id"] == identifier)
    response = await client.post(f"/api/v1/admin/moderation/{identifier}/decision", headers=admin,
        json={"decision": "approve", "review_token": token})
    assert response.status_code == 200, response.text


async def test_public_requires_review_and_encrypted_at_rest(client, database):
    owner = await account(client)
    body = await public_message(client, owner, await galaxy(client, owner))
    assert (await client.get("/api/v1/explore")).json() == []
    assert (await client.get("/api/v1/admin/moderation/queue", headers=owner)).status_code == 403
    async with database() as db:
        row = await db.get(Message, body["id"])
        assert row.public_body.startswith("v1:") and body["public_body"] not in row.public_body
        assert row.ciphertext is None
    admin = await admin_account(client, database)
    await approve(client, admin, body["id"])
    feed = (await client.get("/api/v1/explore?tag=syukur")).json()
    assert len(feed) == 1 and feed[0]["public_body"] == body["public_body"]
    assert not {"author_id", "email", "payload", "encryption_record"} & set(feed[0])
    assert feed[0]["attachment_ids"] == []


async def test_explore_filters_match_normalized_and_legacy_labels(client, database):
    owner = await account(client)
    gid = await galaxy(client, owner)
    body = {"id": str(uuid4()), "constellation_ids": [gid], "visibility": "public_anon",
            "public_body": "Ucapan dengan suasana dan tag.", "mood": " Rindu ",
            "tags": ["#KeNaNgAn", " kenangan ", "#Keluarga"]}
    result = await client.post("/api/v1/messages", headers=owner, json=body)
    assert result.status_code == 201, result.text
    assert result.json()["tags"] == ["kenangan", "keluarga"]
    assert result.json()["mood"] == "rindu"
    admin = await admin_account(client, database)
    await approve(client, admin, body["id"])
    matched = await client.get("/api/v1/explore", params={"mood": " LONGING ", "tag": " #KENANGAN "})
    assert [row["id"] for row in matched.json()] == [body["id"]]
    assert (await client.get("/api/v1/explore", params={"mood": "syukur", "tag": "kenangan"})).json() == []
    async with database() as db:
        legacy = await db.get(Message, body["id"])
        legacy.tags = [" #KeluArGa "]
        legacy.mood = " Longing "
        await db.commit()
    matched = await client.get("/api/v1/explore", params={"mood": "rindu", "tag": "keluarga"})
    assert matched.json()[0]["tags"] == ["keluarga"]
    assert matched.json()[0]["mood"] == "rindu"
    pending = await public_message(client, owner, gid)
    assert pending["id"] not in {row["id"] for row in (await client.get("/api/v1/explore?tag=syukur")).json()}


async def test_moderation_worker_cannot_read_private_messages(client, database):
    owner = await account(client)
    gid = await galaxy(client, owner)
    private = message_input(gid)
    await client.post("/api/v1/messages", headers=owner, json=private)
    public = await public_message(client, owner, gid)
    admin = await admin_account(client, database)
    async with database() as db:
        assert await scan_pending(db) == 1
        assert (await db.get(Message, private["id"])).moderation_checked_at is None
    queue = await client.get("/api/v1/admin/moderation/queue", headers=admin)
    assert private["payload"]["ct"] not in queue.text and private["id"] not in queue.text
    assert queue.json()[0]["id"] == public["id"]
    response = await client.post(f"/api/v1/admin/moderation/{private['id']}/decision", headers=admin,
        json={"decision": "approve", "review_token": "a" * 64})
    assert response.status_code == 404


async def test_empathy_is_idempotent_and_private_actions_denied(client, database):
    owner = await account(client)
    gid = await galaxy(client, owner)
    body = await public_message(client, owner, gid)
    admin = await admin_account(client, database)
    await approve(client, admin, body["id"])
    one = await client.post(f"/api/v1/messages/{body['id']}/empathy", json={})
    two = await client.post(f"/api/v1/messages/{body['id']}/empathy", json={})
    assert one.json() == {"added": True, "empathy_count": 1}
    assert two.json() == {"added": False, "empathy_count": 1}
    private = message_input(gid)
    await client.post("/api/v1/messages", headers=owner, json=private)
    assert (await client.post(f"/api/v1/messages/{private['id']}/empathy", json={})).status_code == 404
    assert (await client.post("/api/v1/reports", json={"message_id": private["id"], "reason": "Uji isolasi"})).status_code == 404


async def test_blocks_filter_feed_and_direct_access(client, database):
    owner = await account(client)
    body = await public_message(client, owner, await galaxy(client, owner))
    admin = await admin_account(client, database)
    await approve(client, admin, body["id"])
    visitor = await account(client, "reader@example.com")
    blocked = await client.post("/api/v1/users/blocks", headers=visitor, json={"message_id": body["id"]})
    assert blocked.status_code == 201
    bid = blocked.json()["id"]
    assert (await client.get("/api/v1/explore", headers=visitor)).json() == []
    assert (await client.get(f"/api/v1/messages/{body['id']}", headers=visitor)).status_code == 404
    assert (await client.delete(f"/api/v1/users/blocks/{bid}", headers=owner)).status_code == 404
    assert (await client.delete(f"/api/v1/users/blocks/{bid}", headers=visitor)).status_code == 204
    assert len((await client.get("/api/v1/explore", headers=visitor)).json()) == 1


async def test_report_enters_queue_and_stale_decision_refused(client, database):
    owner = await account(client)
    body = await public_message(client, owner, await galaxy(client, owner))
    admin = await admin_account(client, database)
    await approve(client, admin, body["id"])
    assert (await client.post("/api/v1/reports", json={"message_id": body["id"], "reason": "Tinjau konteks pesan"})).status_code == 201
    queue = (await client.get("/api/v1/admin/moderation/queue", headers=admin)).json()
    assert queue[0]["reports"][0]["reason"] == "Tinjau konteks pesan"
    body["public_body"] = "Perubahan setelah peninjauan."
    assert (await client.patch(f"/api/v1/messages/{body['id']}", headers=owner, json=body)).status_code == 200
    result = await client.post(f"/api/v1/admin/moderation/{body['id']}/decision", headers=admin,
        json={"decision": "approve", "review_token": queue[0]["review_token"]})
    assert result.status_code == 409
    assert (await client.get("/api/v1/explore")).json() == []


async def test_no_plaintext_smuggled_into_private_message(client):
    owner = await account(client)
    body = message_input(await galaxy(client, owner))
    body["public_body"] = "Rahasia tidak boleh disimpan sebagai plaintext"
    response = await client.post("/api/v1/messages", headers=owner, json=body)
    assert response.status_code == 422 and body["public_body"] not in response.text


def test_public_ciphertext_bound_to_id():
    import pytest
    from cryptography.exceptions import InvalidTag
    from app.public_content import open_public, seal_public
    identifier = str(uuid4())
    value = seal_public(identifier, "Publik")
    assert open_public(identifier, value) == "Publik"
    with pytest.raises(InvalidTag):
        open_public(str(uuid4()), value)
