import json

from app.main import app
from app.models import PrayerContent
from app.prayer_catalog import CATALOG
from app.routers.prayers import token_key

from .conftest import account, galaxy, message_input
from .test_social import admin_account, approve, public_message


async def test_catalog_and_curation_permissions(client, database):
    catalog = (await client.get("/api/v1/prayers/traditions")).json()
    assert len(catalog) == 7
    assert all("references" not in t for t in catalog)
    # Visitors only receive curated recordings; drafts stay in the admin catalogue.
    assert sum(len(t["entri"]) for t in catalog) == 5
    assert all(e["reviewed"] and e["audio"] for t in catalog for e in t["entri"])
    assert next(t for t in catalog if t["id"] == "umum")["entri"] == []
    owner = await account(client)
    assert (await client.get("/api/v1/admin/prayers", headers=owner)).status_code == 403
    admin = await admin_account(client, database)
    assert (await client.get("/api/v1/admin/prayers", headers=admin)).status_code == 200
    invalid = {
        "title": "Hening",
        "text": "Hening",
        "source_attribution": "Kurator",
        "duration_seconds": 30,
        "reviewed": True,
    }
    assert (await client.put("/api/v1/admin/prayers/umum/doa-umum", headers=admin, json=invalid)).status_code == 422
    sourced = {**invalid, "source_url": "https://example.invalid/prayer", "review_note": "Fixture only"}
    assert (await client.put("/api/v1/admin/prayers/umum/doa-umum", headers=admin, json=sourced)).status_code == 409


def test_catalog_preserves_utf8_symbols():
    assert next(tradition for tradition in CATALOG if tradition["id"] == "islam")["simbol"] == "\u262a"


async def test_catalog_duration_matches_replaced_audio(client, database, monkeypatch):
    from app.routers import prayers

    owner = await account(client)
    body = await public_message(client, owner, await galaxy(client, owner))
    admin = await admin_account(client, database)
    await approve(client, admin, body["id"])
    async with database() as db:
        row = await db.get(PrayerContent, "katolik/bapa-kami-latin")
        row.audio_key = "curated/katolik/bapa-kami-latin/replacement"
        row.audio_meta = {"duration_seconds": 67, "attribution": "Rekaman kurator"}
        await db.commit()

    class Bucket:
        def generate_presigned_url(self, *args, **kwargs):
            return "https://storage.example.invalid/prayer.mp3"

    monkeypatch.setattr(prayers, "storage", lambda **kwargs: Bucket())
    catalog = (await client.get("/api/v1/prayers/traditions")).json()
    entry = next(t for t in catalog if t["id"] == "katolik")["entri"][0]
    assert entry["audio"] is True
    assert entry["detik"] == 67
    started = await client.post(
        f"/api/v1/messages/{body['id']}/prayers/start", json={"catalog_id": "katolik/bapa-kami-latin"}
    )
    assert started.status_code == 200, started.text
    assert started.json()["seconds"] == entry["detik"]


async def test_prayer_timing_identity_and_idempotence(client, database):
    owner = await account(client)
    body = await public_message(client, owner, await galaxy(client, owner))
    admin = await admin_account(client, database)
    await approve(client, admin, body["id"])
    url = f"/api/v1/messages/{body['id']}/prayers"
    started = await client.post(url + "/start", json={"catalog_id": "katolik/bapa-kami-latin"})
    assert started.status_code == 200, started.text
    session = started.json()
    assert session["audio_url"] == "/api/v1/prayers/audio/pater-noster"
    payload = {"playback_token": session["playback_token"]}
    assert (await client.post(url, json=payload)).status_code == 409
    key = token_key(session["playback_token"])
    state = json.loads(await app.state.redis.get(key))
    state["started"] -= 1000
    await app.state.redis.set(key, json.dumps(state), ex=300)
    assert (await client.post(url, headers=owner, json=payload)).status_code == 403
    assert (await client.post(url, json=payload)).json() == {"added": True, "prayer_count": 1}
    assert (await client.post(url, json=payload)).json() == {"added": False, "prayer_count": 1}
    received = (await client.get("/api/v1/dashboard/prayers-received", headers=owner)).json()
    assert len(received) == 1 and received[0]["message_id"] == body["id"]
    assert "visitor_hash" not in received[0]


async def test_unreviewed_and_private_prayers_refused(client, database):
    owner = await account(client)
    gid = await galaxy(client, owner)
    private = message_input(gid)
    await client.post("/api/v1/messages", headers=owner, json=private)
    assert (
        await client.post(
            f"/api/v1/messages/{private['id']}/prayers/start",
            headers=owner,
            json={"catalog_id": "katolik/bapa-kami-latin"},
        )
    ).status_code == 404
    body = await public_message(client, owner, gid)
    admin = await admin_account(client, database)
    await approve(client, admin, body["id"])
    identifier = "islam/rabbana-atina"
    assert (
        await client.post(f"/api/v1/messages/{body['id']}/prayers/start", json={"catalog_id": identifier})
    ).status_code == 409
    # Reviewed text alone must not silently become a religious audio session.
    async with database() as db:
        row = await db.get(PrayerContent, identifier)
        row.reviewed = True
        await db.commit()
    response = await client.post(f"/api/v1/messages/{body['id']}/prayers/start", json={"catalog_id": identifier})
    assert response.status_code == 409
    assert "Audio doa belum tersedia" in response.json()["detail"]


async def test_general_prayer_cannot_count_silence_or_unrecorded_text(client, database):
    owner = await account(client)
    body = await public_message(client, owner, await galaxy(client, owner))
    admin = await admin_account(client, database)
    await approve(client, admin, body["id"])
    start = f"/api/v1/messages/{body['id']}/prayers/start"
    assert (await client.post(start, json={"catalog_id": "umum/hening"})).status_code == 409
    async with database() as db:
        row = await db.get(PrayerContent, "umum/doa-umum")
        row.reviewed = True
        await db.commit()
    assert (await client.post(start, json={"catalog_id": "umum/doa-umum"})).status_code == 409
    assert (await client.get("/api/v1/messages/" + body["id"])).json()["prayer_count"] == 0


async def test_team_audio_upload_curation_and_replacement_invalidate_sessions(client, database, monkeypatch):
    from app.routers import prayers

    owner = await account(client)
    body = await public_message(client, owner, await galaxy(client, owner))
    admin = await admin_account(client, database)
    await approve(client, admin, body["id"])
    target = "/api/v1/admin/prayers/katolik/bapa-kami-katolik"

    class Bucket:
        size = 256

        def generate_presigned_post(self, *args, **kwargs):
            return {"url": "https://storage.example.invalid/upload", "fields": {}}

        def head_object(self, **kwargs):
            return {"ContentLength": self.size, "ContentType": "audio/mpeg"}

        def generate_presigned_url(self, *args, **kwargs):
            return "https://storage.example.invalid/team-audio.mp3"

    bucket = Bucket()
    monkeypatch.setattr(prayers, "storage", lambda **kwargs: bucket)
    upload = {
        "byte_size": 256,
        "content_type": "audio/mpeg",
        "license": "Fixture tim",
        "attribution": "Rekaman tim pengujian",
        "duration_seconds": 12,
    }
    assert (await client.post(target + "/audio/presign", headers=owner, json=upload)).status_code == 403
    assert (await client.post(target + "/audio/presign", headers=admin, json=upload)).status_code == 200
    bucket.size = 200
    assert (await client.post(target + "/audio/complete", headers=admin)).status_code == 422
    bucket.size = 256
    assert (await client.post(target + "/audio/complete", headers=admin)).json()["reviewed"] is False
    start = f"/api/v1/messages/{body['id']}/prayers/start"
    assert (await client.post(start, json={"catalog_id": "katolik/bapa-kami-katolik"})).status_code == 409
    reviewed = {
        "title": "Fixture katalog",
        "text": "Teks khusus pengujian, bukan materi produksi.",
        "source_attribution": "Kurator pengujian",
        "source_url": "https://example.invalid/fixture",
        "review_note": "Peninjauan fixture",
        "duration_seconds": 5,
        "reviewed": True,
    }
    assert (await client.put(target, headers=admin, json=reviewed)).status_code == 200
    session = (await client.post(start, json={"catalog_id": "katolik/bapa-kami-katolik"})).json()
    assert session["seconds"] == 12 and session["audio_url"].endswith("/team-audio.mp3")
    finish = f"/api/v1/messages/{body['id']}/prayers"
    payload = {"playback_token": session["playback_token"]}
    assert (await client.post(finish, json=payload)).status_code == 409
    key = token_key(session["playback_token"])
    state = json.loads(await app.state.redis.get(key))
    state["started"] -= 1000
    await app.state.redis.set(key, json.dumps(state), ex=300)
    assert (await client.post(finish, json=payload)).json() == {"added": True, "prayer_count": 1}
    assert (await client.post(finish, json=payload)).json() == {"added": False, "prayer_count": 1}
    await client.post(target + "/audio/presign", headers=admin, json=upload)
    await client.post(target + "/audio/complete", headers=admin)
    assert (await client.post(finish, json=payload)).status_code == 409


async def test_uploaded_audio_preview_is_admin_only_until_curated(client, database, monkeypatch):
    from app.routers import prayers

    owner = await account(client)
    admin = await admin_account(client, database)
    identifier = "konghucu/ren"
    # A controlled storage fixture exercises the same route used by uploaded recordings.
    async with database() as db:
        row = await db.get(PrayerContent, identifier)
        assert row is not None
        row.audio_key = "curated/konghucu/ren/fixture"
        row.audio_meta = {"duration_seconds": 20, "attribution": "Fixture kurator", "license": "Fixture"}
        row.reviewed = False
        await db.commit()

    class Bucket:
        def generate_presigned_url(self, operation, *, Params, ExpiresIn):
            assert operation == "get_object"
            assert Params["Key"] == "curated/konghucu/ren/fixture"
            assert ExpiresIn == 1200
            return "https://storage.example.invalid/curated-prayer.ogg"

    monkeypatch.setattr(prayers, "storage", lambda **kwargs: Bucket())
    endpoint = f"/api/v1/admin/prayers/{identifier}/audio/preview"
    assert (await client.get(endpoint)).status_code == 401
    assert (await client.get(endpoint, headers=owner)).status_code == 403
    preview = await client.get(endpoint, headers=admin)
    assert preview.status_code == 200
    assert preview.json() == {"audio_url": "https://storage.example.invalid/curated-prayer.ogg", "seconds": 20}
    public_endpoint = f"/api/v1/prayers/{identifier}/audio/preview"
    assert (await client.get(public_endpoint)).status_code == 404
    async with database() as db:
        row = await db.get(PrayerContent, identifier)
        row.reviewed = True
        await db.commit()
    public = await client.get(public_endpoint, follow_redirects=False)
    assert public.status_code == 307
    assert public.headers["location"] == preview.json()["audio_url"]
    assert public.headers["cache-control"] == "no-store"
    catalog = (await client.get("/api/v1/prayers/traditions")).json()
    approved = next(tradition for tradition in catalog if tradition["id"] == "konghucu")["entri"][0]
    assert approved["audio_preview_url"] == public_endpoint
    assert approved["detik"] == 20
    from sqlalchemy import func, select

    from app.models import Prayer

    async with database() as db:
        assert await db.scalar(select(func.count()).select_from(Prayer)) == 0
    assert not await app.state.redis.keys("prayer-session:*")


async def test_audio_upload_and_completion_have_separate_bounded_admin_limits(client, database, monkeypatch):
    from app.routers import prayers

    owner = await account(client)
    admin = await admin_account(client, database)
    target = "/api/v1/admin/prayers/katolik/bapa-kami-katolik/audio"

    class Bucket:
        presigns = 0
        completions = 0

        def generate_presigned_post(self, *args, **kwargs):
            self.presigns += 1
            return {"url": "https://storage.example.invalid/upload", "fields": {}}

        def head_object(self, **kwargs):
            self.completions += 1
            return {"ContentLength": 256, "ContentType": "audio/mpeg"}

    bucket = Bucket()
    monkeypatch.setattr(prayers, "storage", lambda **kwargs: bucket)
    upload = {
        "byte_size": 256,
        "content_type": "audio/mpeg",
        "license": "Fixture tim",
        "attribution": "Rekaman tim pengujian",
        "duration_seconds": 12,
    }
    assert (await client.post(target + "/presign", json=upload)).status_code == 401
    assert (await client.post(target + "/presign", headers=owner, json=upload)).status_code == 403
    assert (await client.post(target + "/complete", headers=owner)).status_code == 403
    # Each recording needs two requests; completing one must not consume the
    # presign allowance for the next recording in the curation queue.
    for _ in range(10):
        signed = await client.post(target + "/presign", headers=admin, json=upload)
        assert signed.status_code == 200, signed.text
        completed = await client.post(target + "/complete", headers=admin)
        assert completed.status_code == 200, completed.text
        assert completed.json()["reviewed"] is False
    for endpoint in ("/presign", "/complete"):
        response = await client.post(target + endpoint, headers=admin, json=upload if endpoint == "/presign" else None)
        assert response.status_code == 429, response.text
        assert response.headers["Retry-After"] == "60"
    assert bucket.presigns == bucket.completions == 10


async def test_audio_preview_rejects_missing_and_retired_catalogue_entries(client, database):
    admin = await admin_account(client, database)
    assert (await client.get("/api/v1/admin/prayers/umum/doa-umum/audio/preview", headers=admin)).status_code == 409
    assert (await client.get("/api/v1/admin/prayers/umum/hening/audio/preview", headers=admin)).status_code == 404
    assert (await client.get("/api/v1/prayers/umum/hening/audio/preview")).status_code == 404
