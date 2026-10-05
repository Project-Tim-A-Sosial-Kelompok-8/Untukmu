import json
from app.main import app
from app.models import PrayerContent
from app.prayer_catalog import CATALOG
from app.prayer_audio import CANDIDATES
from app.prayers import token_key
from .conftest import account, galaxy, message_input
from .test_social import admin_account, public_message, approve


async def test_catalog_and_curation_permissions(client, database):
    catalog = (await client.get('/api/v1/prayers/traditions')).json()
    assert len(catalog) == 7
    assert all(t['references'] for t in catalog if t['id'] != 'umum')
    assert all(ref['url'].startswith('https://') for t in catalog for ref in t['references'])
    # Discovering a credible reference must not bypass curation of its content.
    assert sum(e['reviewed'] for t in catalog for e in t['entri']) == 1
    owner = await account(client)
    assert (await client.get('/api/v1/admin/prayers', headers=owner)).status_code == 403
    admin = await admin_account(client, database)
    assert (await client.get('/api/v1/admin/prayers', headers=admin)).status_code == 200
    invalid = {'title':'Hening', 'text':'Hening', 'source_attribution':'Kurator', 'duration_seconds':30, 'reviewed':True}
    assert (await client.put('/api/v1/admin/prayers/umum/hening', headers=admin, json=invalid)).status_code == 422


def test_catalog_preserves_utf8_symbols():
    assert next(tradition for tradition in CATALOG if tradition['id'] == 'islam')['simbol'] == '\u262a'


async def test_catalog_duration_matches_replaced_audio(client, database, monkeypatch):
    from app import prayers

    owner = await account(client)
    body = await public_message(client, owner, await galaxy(client, owner))
    admin = await admin_account(client, database)
    await approve(client, admin, body['id'])
    async with database() as db:
        row = await db.get(PrayerContent, 'umum/hening')
        row.audio_key = 'curated/umum/hening/replacement'
        row.audio_meta = {'duration_seconds': 67, 'attribution': 'Rekaman kurator'}
        await db.commit()

    class Bucket:
        def generate_presigned_url(self, *args, **kwargs):
            return 'https://storage.example.invalid/prayer.mp3'

    monkeypatch.setattr(prayers, 'storage', lambda **kwargs: Bucket())
    catalog = (await client.get('/api/v1/prayers/traditions')).json()
    entry = next(t for t in catalog if t['id'] == 'umum')['entri'][0]
    assert entry['audio'] is True
    assert entry['detik'] == 67
    started = await client.post(f"/api/v1/messages/{body['id']}/prayers/start", json={'catalog_id': 'umum/hening'})
    assert started.status_code == 200, started.text
    assert started.json()['seconds'] == entry['detik']


async def test_prayer_timing_identity_and_idempotence(client, database):
    owner = await account(client)
    body = await public_message(client, owner, await galaxy(client, owner))
    admin = await admin_account(client, database)
    await approve(client, admin, body['id'])
    url = f"/api/v1/messages/{body['id']}/prayers"
    started = await client.post(url+'/start', json={'catalog_id':'umum/hening'})
    assert started.status_code == 200, started.text
    session = started.json()
    assert session['audio_url'] is None
    payload = {'playback_token':session['playback_token']}
    assert (await client.post(url, json=payload)).status_code == 409
    key = token_key(session['playback_token'])
    state = json.loads(await app.state.redis.get(key))
    state['started'] -= 1000
    await app.state.redis.set(key, json.dumps(state), ex=300)
    assert (await client.post(url, headers=owner, json=payload)).status_code == 403
    assert (await client.post(url, json=payload)).json() == {'added':True,'prayer_count':1}
    assert (await client.post(url, json=payload)).json() == {'added':False,'prayer_count':1}
    received = (await client.get('/api/v1/dashboard/prayers-received', headers=owner)).json()
    assert len(received) == 1 and received[0]['message_id'] == body['id']
    assert 'visitor_hash' not in received[0]


async def test_unreviewed_and_private_prayers_refused(client, database):
    owner = await account(client)
    gid = await galaxy(client, owner)
    private = message_input(gid)
    await client.post('/api/v1/messages', headers=owner, json=private)
    assert (await client.post(f"/api/v1/messages/{private['id']}/prayers/start",headers=owner,json={'catalog_id':'umum/hening'})).status_code == 404
    body = await public_message(client, owner, gid)
    admin = await admin_account(client, database)
    await approve(client, admin, body['id'])
    catalog = (await client.get('/api/v1/prayers/traditions')).json()
    tradition = next(t for t in catalog if t['id']!='umum')
    identifier = tradition['id']+'/'+tradition['entri'][0]['id']
    assert (await client.post(f"/api/v1/messages/{body['id']}/prayers/start",json={'catalog_id':identifier})).status_code == 409
    # Reviewed text alone must not silently become a religious audio session.
    async with database() as db:
        row = await db.get(PrayerContent, identifier)
        row.reviewed = True
        await db.commit()
    response = await client.post(f"/api/v1/messages/{body['id']}/prayers/start", json={'catalog_id': identifier})
    assert response.status_code == 409
    assert 'Audio doa belum tersedia' in response.json()['detail']


async def test_source_audio_preview_and_selection_permissions(client, database):
    admin = await admin_account(client, database)
    catalog = (await client.get('/api/v1/admin/prayers', headers=admin)).json()
    candidates = [candidate for entry in catalog for candidate in entry['audio_candidates']]
    assert len(candidates) == 3
    for candidate in candidates:
        preview = await client.get(candidate['audio_url'], headers={'Range': 'bytes=0-31'})
        assert preview.status_code == 206
        assert len(preview.content) == 32
        assert preview.headers['content-type'] == candidate['content_type']
        assert (await client.post(f"/api/v1/admin/prayers/{candidate['catalog_id']}/audio/candidate",
                                 json={'candidate_id': candidate['id']})).status_code == 401
    assert (await client.get('/api/v1/prayers/audio-candidates/not-found')).status_code == 404
    wrong_entry = await client.post('/api/v1/admin/prayers/hindu/gayatri/audio/candidate', headers=admin,
                                   json={'candidate_id': 'pater-noster-latin'})
    assert wrong_entry.status_code == 422
    restricted = '/api/v1/admin/prayers/buddha/metta/audio/candidate'
    assert (await client.post(restricted, headers=admin, json={'candidate_id': 'karaniya-metta'})).status_code == 422
    assert (await client.post(restricted, headers=admin,
                             json={'candidate_id': 'karaniya-metta', 'noncommercial_use': True})).status_code == 200


async def test_bundled_audio_requires_curation_and_finishes_idempotently(client, database):
    owner = await account(client)
    message = await public_message(client, owner, await galaxy(client, owner))
    admin = await admin_account(client, database)
    await approve(client, admin, message['id'])
    target = '/api/v1/admin/prayers/katolik/bapa-kami-katolik'
    candidate = CANDIDATES['pater-noster-latin']
    payload = {'title': candidate['title'], 'text': 'Naskah fixture yang diperiksa oleh admin pengujian.',
               'source_attribution': candidate['attribution'], 'source_url': candidate['source_url'],
               'review_note': 'Catatan kurasi khusus fixture, bukan persetujuan materi produksi.',
               'duration_seconds': 5, 'reviewed': True}
    assert (await client.put(target, headers=admin, json=payload)).status_code == 409
    assert (await client.post(target + '/audio/candidate', headers=admin,
                             json={'candidate_id': candidate['id']})).json()['reviewed'] is False
    start = f"/api/v1/messages/{message['id']}/prayers/start"
    assert (await client.post(start, json={'catalog_id': candidate['catalog_id']})).status_code == 409
    assert (await client.put(target, headers=admin, json=payload)).status_code == 200
    session = (await client.post(start, json={'catalog_id': candidate['catalog_id']})).json()
    assert session['seconds'] == 29  # Source duration overrides an edited form duration.
    assert session['audio_url'].endswith('/pater-noster-latin')
    assert session['audio_attribution'] == candidate['attribution']
    finish_url = f"/api/v1/messages/{message['id']}/prayers"
    finish_payload = {'playback_token': session['playback_token']}
    assert (await client.post(finish_url, json=finish_payload)).status_code == 409
    key = token_key(session['playback_token'])
    state = json.loads(await app.state.redis.get(key))
    state['started'] -= 1000
    await app.state.redis.set(key, json.dumps(state), ex=300)
    assert (await client.post(finish_url, json=finish_payload)).json() == {'added': True, 'prayer_count': 1}
    assert (await client.post(finish_url, json=finish_payload)).json() == {'added': False, 'prayer_count': 1}
    # Replacing a recording withdraws approval and invalidates earlier sessions.
    await client.post(target + '/audio/candidate', headers=admin, json={'candidate_id': candidate['id']})
    assert (await client.post(finish_url, json=finish_payload)).status_code == 409


def test_modified_source_recording_is_refused(tmp_path, monkeypatch):
    from fastapi import HTTPException
    import pytest
    from app import prayer_audio

    folder = tmp_path / 'prayer-audio'
    folder.mkdir()
    (folder / 'pater-noster-latin.ogg').write_bytes(b'not the pinned recording')
    monkeypatch.setattr(prayer_audio, 'DATA', tmp_path)
    with pytest.raises(HTTPException) as error:
        prayer_audio.candidate_file('pater-noster-latin')
    assert error.value.status_code == 409
