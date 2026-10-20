import hashlib
import json

from app.main import app
from app.prayer_catalog import CATALOG
from app.prayer_recordings import RECORDINGS, ROOT
from app.routers.prayers import token_key

from .conftest import account, galaxy
from .test_social import admin_account, approve, public_message


async def test_original_recordings_integrity_and_range_requests(client):
    for identifier, metadata in RECORDINGS.items():
        path = ROOT / metadata["file"]
        assert hashlib.sha256(path.read_bytes()).hexdigest() == metadata["sha256"]
        response = await client.get(f"/api/v1/prayers/audio/{identifier}", headers={"Range": "bytes=0-127"})
        assert response.status_code == 206
        assert response.content == path.read_bytes()[:128]
        assert response.headers["content-range"] == f"bytes 0-127/{metadata['bytes']}"
        assert response.headers["content-type"].startswith("audio/")
    assert (await client.get("/api/v1/prayers/audio/unknown-recording")).status_code == 404


async def test_recorded_prayer_requires_duration_and_is_idempotent(client, database):
    owner = await account(client)
    target = await public_message(client, owner, await galaxy(client, owner))
    admin = await admin_account(client, database)
    await approve(client, admin, target["id"])
    endpoint = f"/api/v1/messages/{target['id']}/prayers"
    started = await client.post(endpoint + "/start", json={"catalog_id": "katolik/bapa-kami-latin"})
    assert started.status_code == 200, started.text
    session = started.json()
    assert session["audio_url"] == "/api/v1/prayers/audio/pater-noster"
    assert session["seconds"] == RECORDINGS["pater-noster"]["duration_seconds"]
    assert "Dan Palraz" in session["audio_attribution"]
    payload = {"playback_token": session["playback_token"]}
    assert (await client.post(endpoint, json=payload)).status_code == 409
    key = token_key(session["playback_token"])
    state = json.loads(await app.state.redis.get(key))
    state["started"] -= session["seconds"] + 1
    await app.state.redis.set(key, json.dumps(state), ex=300)
    assert (await client.post(endpoint, json=payload)).json() == {"added": True, "prayer_count": 1}
    assert (await client.post(endpoint, json=payload)).json() == {"added": False, "prayer_count": 1}


async def test_catalog_keeps_recording_languages_and_unavailable_choices_honest(client):
    catalog = (await client.get("/api/v1/prayers/traditions")).json()
    entries = [entry for tradition in catalog for entry in tradition["entri"]]
    recorded = [entry for entry in entries if entry.get("audio_preview_url")]
    assert len(recorded) == 5
    assert {entry["audio_language"] for entry in recorded} == {"Arab", "Latin", "Sanskerta", "Inggris"}
    assert all(entry["audio_license_url"].startswith("https://creativecommons.org/") for entry in recorded)
    assert all(entry["audio_attribution"] and entry["review_note"] for entry in recorded)
    konghucu = next(tradition for tradition in catalog if tradition["id"] == "konghucu")
    assert not any(entry["audio"] for entry in konghucu["entri"])


async def test_identical_gayatri_draft_has_reference_audio_without_auto_approval(client, database):
    admin = await admin_account(client, database)
    rows = (await client.get("/api/v1/admin/prayers", headers=admin)).json()
    draft = next(row for row in rows if row["id"] == "hindu/gayatri")
    reference = next(row for row in rows if row["id"] == "hindu/gayatri-audio")
    assert draft["content"]["teks"]["id"] == reference["content"]["teks"]["id"]
    assert draft["has_audio"] is True
    assert draft["reviewed"] is False
    assert draft["publicly_available"] is False
    response = await client.get("/api/v1/admin/prayers/hindu/gayatri/audio/preview", headers=admin)
    assert response.status_code == 200
    assert response.json()["audio_url"] == "/api/v1/prayers/audio/gayatri"
    catalog = (await client.get("/api/v1/prayers/traditions")).json()
    hindu = next(tradition for tradition in catalog if tradition["id"] == "hindu")
    assert not any(entry["id"] == "gayatri" for entry in hindu["entri"])
    assert sum(bool(entry.get("recording_id")) for tr in CATALOG for entry in tr["entri"]) == 7


async def test_original_namo_tassa_is_available_for_curation_but_not_published(client, database):
    admin = await admin_account(client, database)
    rows = (await client.get("/api/v1/admin/prayers", headers=admin)).json()
    draft = next(row for row in rows if row["id"] == "buddha/namo-tassa")
    assert draft["has_audio"] is True
    assert draft["reviewed"] is False
    assert draft["publicly_available"] is False
    assert draft["content"]["detik"] == 43
    assert draft["audio_meta"]["language"] == "Pali"
    assert draft["audio_meta"]["license_url"] == "https://amaravati.org/support/amaravati-publications/"
    assert "free distribution" in draft["audio_meta"]["license"]
    response = await client.get("/api/v1/admin/prayers/buddha/namo-tassa/audio/preview", headers=admin)
    assert response.status_code == 200
    assert response.json()["audio_url"] == "/api/v1/prayers/audio/namo-tassa"
    public = (await client.get("/api/v1/prayers/traditions")).json()
    buddha = next(tradition for tradition in public if tradition["id"] == "buddha")
    assert not any(entry["id"] == "namo-tassa" for entry in buddha["entri"])
