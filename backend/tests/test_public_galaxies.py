from datetime import timedelta
from uuid import uuid4

import pytest

from app.models import Constellation, Message, MessageAttachment, Upload, now

from .conftest import account, galaxy, message_input
from .test_social import public_message


async def test_public_galaxies_and_stars_are_visible_across_accounts_without_private_metadata(client, database):
    owner = await account(client)
    gid = await galaxy(client, owner)
    private = message_input(gid)
    assert (await client.post("/api/v1/messages", headers=owner, json=private)).status_code == 201
    public = await public_message(client, owner, gid, "Terima kasih sudah mendampingiku.")
    upload_id = str(uuid4())
    async with database() as db:
        row = await db.get(Constellation, gid)
        db.add(
            Upload(
                id=upload_id,
                owner_id=row.owner_id,
                storage_key=f"{row.owner_id}/{upload_id}.enc",
                byte_size=64,
                encryption_meta={"private": "photo metadata"},
                complete=True,
            )
        )
        await db.flush()
        row.target_label = "Nama penerima yang pribadi"
        row.custom_category = "Kategori yang pribadi"
        row.visual_type, row.visual_ref = "photo", upload_id
        db.add(MessageAttachment(message_id=public["id"], upload_id=upload_id))
        await db.commit()
    reader = await account(client, "reader@example.com")
    for headers in [{}, reader]:
        galaxies = await client.get("/api/v1/explore/constellations", headers=headers)
        assert galaxies.status_code == 200
        assert len(galaxies.json()) == 1
        shown = galaxies.json()[0]
        assert shown["id"] == gid and shown["public_message_count"] == 1
        assert shown["is_mine"] is False
        assert shown["target_label"] == "Galaksi anonim" and shown["custom_category"] is None
        assert shown["visual_type"] == "light_symbol" and shown["visual_ref"] is None
        assert not {"owner_id", "email"} & shown.keys()
        for endpoint in ["/explore/messages", f"/explore/constellations/{gid}/messages"]:
            response = await client.get("/api/v1" + endpoint, headers=headers)
            assert response.status_code == 200, response.text
            assert [row["id"] for row in response.json()] == [public["id"]]
            message = response.json()[0]
            assert message["public_body"] == public["public_body"]
            assert message["constellation_ids"] == [gid]
            assert message["is_mine"] is False and message["attachment_ids"] == []
            assert not {"author_id", "payload", "ciphertext", "encryption_meta", "share_payload"} & message.keys()
            assert private["payload"]["ct"] not in response.text and upload_id not in response.text
    owned = (await client.get(f"/api/v1/constellations/{gid}", headers=owner)).json()
    assert owned["target_label"] == "Nama penerima yang pribadi" and owned["visual_ref"] == upload_id
    assert (await client.get("/api/v1/explore/constellations", headers=owner)).json()[0]["is_mine"] is True
    assert (await client.get("/api/v1/explore/messages", headers=owner)).json()[0]["is_mine"] is True
    assert (await client.get(f"/api/v1/constellations/{gid}", headers=reader)).status_code == 404
    assert (await client.get(f"/api/v1/constellations/{gid}/messages", headers=reader)).status_code == 404
    assert (await client.delete(f"/api/v1/messages/{public['id']}", headers=reader)).status_code == 404


@pytest.mark.parametrize("kind", ["private", "unlisted", "pending", "future", "rejected", "removed", "empty"])
async def test_nonpublic_galaxies_and_messages_are_not_disclosed(client, database, kind):
    owner = await account(client)
    gid = await galaxy(client, owner)
    if kind in {"private", "unlisted"}:
        body = message_input(gid)
        body["visibility"] = kind
        body["payload"]["aad"] = f"untukmu:message:v2:{body['id']}:{kind}"
        assert (await client.post("/api/v1/messages", headers=owner, json=body)).status_code == 201
    elif kind != "empty":
        body = await public_message(client, owner, gid, "Ucapan yang belum tersedia bagi pembaca.")
        async with database() as db:
            row = await db.get(Message, body["id"])
            if kind == "future":
                row.release_at = now() + timedelta(days=1)
            else:
                row.moderation_status = kind
            await db.commit()
    reader = await account(client, "reader@example.com")
    for headers in [{}, reader, owner]:
        assert (await client.get("/api/v1/explore/constellations", headers=headers)).json() == []
        assert (await client.get("/api/v1/explore/messages", headers=headers)).json() == []
        assert (await client.get(f"/api/v1/explore/constellations/{gid}/messages", headers=headers)).status_code == 404


async def test_public_galaxy_filters_blocks_in_both_directions_and_restores_after_unblock(client):
    owner = await account(client)
    gid = await galaxy(client, owner)
    public = await public_message(client, owner, gid, "Ucapan publik untuk sahabat.")
    reader = await account(client, "reader@example.com")
    own_gid = await galaxy(client, reader)
    own_public = await public_message(client, reader, own_gid, "Ucapan publik dari pembaca.")
    blocked = await client.post("/api/v1/users/blocks", headers=reader, json={"message_id": public["id"]})
    assert blocked.status_code == 201
    for headers, visible_gid, hidden_gid, visible_id in [
        (reader, own_gid, gid, own_public["id"]),
        (owner, gid, own_gid, public["id"]),
    ]:
        assert [row["id"] for row in (await client.get("/api/v1/explore/constellations", headers=headers)).json()] == [
            visible_gid
        ]
        assert [row["id"] for row in (await client.get("/api/v1/explore/messages", headers=headers)).json()] == [
            visible_id
        ]
        assert (
            await client.get(f"/api/v1/explore/constellations/{hidden_gid}/messages", headers=headers)
        ).status_code == 404
    assert len((await client.get("/api/v1/explore/constellations")).json()) == 2
    assert (await client.delete(f"/api/v1/users/blocks/{blocked.json()['id']}", headers=reader)).status_code == 204
    assert len((await client.get("/api/v1/explore/constellations", headers=reader)).json()) == 2


async def test_public_stars_keep_all_galaxy_links_and_pagination_without_duplicates(client):
    owner = await account(client)
    first, second = await galaxy(client, owner), await galaxy(client, owner)
    public = await public_message(client, owner, first, "Satu ucapan di dua galaksi.")
    public["constellation_ids"] = [first, second]
    assert (await client.patch(f"/api/v1/messages/{public['id']}", headers=owner, json=public)).status_code == 200
    another = await public_message(client, owner, first, "Ucapan publik lainnya.")
    messages = (await client.get("/api/v1/explore/messages")).json()
    assert len(messages) == 2
    assert set(next(row for row in messages if row["id"] == public["id"])["constellation_ids"]) == {first, second}
    pages = [
        (await client.get("/api/v1/explore/messages", params={"offset": offset, "limit": 1})).json()[0]["id"]
        for offset in [0, 1]
    ]
    assert set(pages) == {public["id"], another["id"]}
    galaxies = (await client.get("/api/v1/explore/constellations")).json()
    assert {row["id"]: row["public_message_count"] for row in galaxies} == {first: 2, second: 1}
    galaxy_pages = [
        (await client.get("/api/v1/explore/constellations", params={"offset": offset, "limit": 1})).json()[0]["id"]
        for offset in [0, 1]
    ]
    assert set(galaxy_pages) == {first, second}
    only_second = (await client.get(f"/api/v1/explore/constellations/{second}/messages")).json()
    assert len(only_second) == 1 and only_second[0]["constellation_ids"] == [second]


async def test_changing_public_message_to_private_immediately_removes_public_galaxy(client):
    owner = await account(client)
    gid = await galaxy(client, owner)
    public = await public_message(client, owner, gid, "Ucapan publik yang akan dijadikan pribadi.")
    reader = await account(client, "reader@example.com")
    assert len((await client.get("/api/v1/explore/constellations", headers=reader)).json()) == 1
    assert len((await client.get("/api/v1/explore/messages", headers=reader)).json()) == 1
    private = message_input(gid)
    private["id"] = public["id"]
    private["payload"]["aad"] = f"untukmu:message:v2:{public['id']}:private"
    assert (await client.patch(f"/api/v1/messages/{public['id']}", headers=owner, json=private)).status_code == 200
    assert (await client.get("/api/v1/explore/constellations", headers=reader)).json() == []
    assert (await client.get("/api/v1/explore/messages", headers=reader)).json() == []
    assert (await client.get(f"/api/v1/explore/constellations/{gid}/messages", headers=reader)).status_code == 404
