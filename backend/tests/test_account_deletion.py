from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models import Constellation, Message, ModerationDecision, Session, StorageDeletion, Upload, User
from .conftest import account, galaxy, message_input
from .test_social import admin_account, approve, public_message

CREDENTIAL = 'test-credential-derived-client-side'


@pytest.mark.parametrize('action', ['keep', 'delete'])
async def test_delete_account_detaches_or_deletes_only_owned_content(client, database, action):
    owner = await account(client)
    gid = await galaxy(client, owner)
    private = message_input(gid)
    private['entry_type'] = 'message'
    assert (await client.post('/api/v1/messages', headers=owner, json=private)).status_code == 201
    public = await public_message(client, owner, gid)
    written_public = {**public, 'id': str(uuid4()), 'entry_type': 'message', 'public_body': 'Doa publik yang dipertahankan'}
    assert (await client.post('/api/v1/messages', headers=owner, json=written_public)).status_code == 201
    pending = await public_message(client, owner, gid)
    admin = await admin_account(client, database)
    await approve(client, admin, public['id'])
    await approve(client, admin, written_public['id'])
    other = await account(client, 'other@example.com')
    foreign = await public_message(client, other, await galaxy(client, other))
    await approve(client, admin, foreign['id'])
    # Warm both per-account summaries and the shared feed before deletion.
    await client.get('/api/v1/dashboard/summary', headers=owner)
    await client.get('/api/v1/explore', headers=other)
    response = await client.request(
        'DELETE', '/api/v1/users/me', headers=owner, json={'password': CREDENTIAL, 'content_action': action})
    assert response.status_code == 204, response.text
    assert (await client.get('/api/v1/users/me', headers=owner)).status_code == 401
    assert (await client.post('/api/v1/auth/login', json={'email': 'first@example.com', 'password': CREDENTIAL})).status_code == 401
    feed = (await client.get('/api/v1/explore', headers=other)).json()
    assert foreign['id'] in {row['id'] for row in feed}
    assert pending['id'] not in {row['id'] for row in feed}
    assert private['id'] not in {row['id'] for row in feed}
    async with database() as db:
        assert await db.scalar(select(User).where(User.email == 'first@example.com')) is None
        if action == 'keep':
            kept = await db.get(Message, private['id'])
            assert kept.author_id is None and kept.ciphertext == private['payload']['ct']
            assert kept.visibility == 'private' and kept.entry_type == 'message'
            assert (await db.get(Constellation, gid)).owner_id is None
            visible = next(row for row in feed if row['id'] == public['id'])
            assert visible['author_deleted'] is True and visible['public_body'] == public['public_body']
            assert next(row for row in feed if row['id'] == written_public['id'])['entry_type'] == 'message'
        else:
            assert await db.get(Message, private['id']) is None
            assert await db.get(Message, public['id']) is None
            assert await db.get(Message, written_public['id']) is None
            assert await db.get(Constellation, gid) is None
            assert public['id'] not in {row['id'] for row in feed}
    # A newly registered account using the same email cannot claim old records.
    replacement = await account(client)
    assert (await client.get('/api/v1/dashboard/messages', headers=replacement)).json() == []
    assert (await client.get(f"/api/v1/messages/{private['id']}", headers=replacement)).status_code == 404
    assert (await client.get(f'/api/v1/constellations/{gid}', headers=replacement)).status_code == 404


async def test_delete_requires_explicit_choice_and_correct_credential(client, database):
    owner = await account(client)
    gid = await galaxy(client, owner)
    for body, expected in [({'password': CREDENTIAL}, 422),
                           ({'password': CREDENTIAL, 'content_action': 'invalid'}, 422),
                           ({'password': 'incorrect', 'content_action': 'delete'}, 403)]:
        assert (await client.request('DELETE', '/api/v1/users/me', headers=owner, json=body)).status_code == expected
    assert (await client.get('/api/v1/users/me', headers=owner)).status_code == 200
    assert (await client.get(f'/api/v1/constellations/{gid}', headers=owner)).status_code == 200
    assert (await client.request('DELETE', '/api/v1/users/me', json={'password': CREDENTIAL, 'content_action': 'delete'})).status_code == 401


async def test_deleting_moderator_keeps_review_history_and_revokes_all_sessions(client, database):
    owner = await account(client)
    body = await public_message(client, owner, await galaxy(client, owner))
    admin = await admin_account(client, database)
    await approve(client, admin, body['id'])
    second = await client.post('/api/v1/auth/login', json={'email': 'moderator@example.com', 'password': CREDENTIAL})
    second_headers = {'Authorization': 'Bearer ' + second.json()['access_token']}
    assert (await client.request('DELETE', '/api/v1/users/me', headers=admin,
                                json={'password': CREDENTIAL, 'content_action': 'keep'})).status_code == 204
    assert (await client.get('/api/v1/users/me', headers=second_headers)).status_code == 401
    assert (await client.post('/api/v1/auth/refresh')).status_code == 401
    async with database() as db:
        review = await db.scalar(select(ModerationDecision).where(ModerationDecision.message_id == body['id']))
        assert review.reviewer_id is None and review.decision == 'approve'
        assert len((await db.scalars(select(Session))).all()) == 1
    assert (await client.get('/api/v1/explore')).json()[0]['id'] == body['id']


@pytest.mark.parametrize('action', ['keep', 'delete'])
async def test_attachment_cleanup_is_durable_and_retained_uploads_cannot_be_claimed(client, database, monkeypatch, action):
    owner = await account(client)
    async with database() as db:
        user = await db.scalar(select(User).where(User.email == 'first@example.com'))
        identifier = str(uuid4())
        key = f'{user.id}/{identifier}.enc'
        db.add(Upload(id=identifier, owner_id=user.id, storage_key=key, byte_size=32, encryption_meta={}, complete=True))
        await db.commit()
    assert (await client.request('DELETE', '/api/v1/users/me', headers=owner,
                                json={'password': CREDENTIAL, 'content_action': action})).status_code == 204
    from app import worker
    deleted = []

    class Bucket:
        def delete_object(self, **params):
            deleted.append(params['Key'])

    monkeypatch.setattr(worker, 'storage', Bucket)
    async with database() as db:
        if action == 'keep':
            assert (await db.get(Upload, identifier)).owner_id is None
            assert await worker.clean_deleted_uploads(db) == 0
        else:
            assert await db.get(Upload, identifier) is None
            assert (await db.scalar(select(StorageDeletion))).storage_key == key
            assert await worker.clean_deleted_uploads(db) == 1
            assert deleted == [key]
            assert await db.scalar(select(StorageDeletion)) is None
    replacement = await account(client)
    assert (await client.get(f'/api/v1/uploads/{identifier}', headers=replacement)).status_code == 404


async def test_blocking_retained_content_offers_reporting_instead(client, database):
    owner = await account(client)
    public = await public_message(client, owner, await galaxy(client, owner))
    admin = await admin_account(client, database)
    await approve(client, admin, public['id'])
    await client.request('DELETE', '/api/v1/users/me', headers=owner, json={'password': CREDENTIAL, 'content_action': 'keep'})
    blocked = await client.post('/api/v1/users/blocks', headers=admin, json={'message_id': public['id']})
    assert blocked.status_code == 409
    assert (await client.post('/api/v1/reports', headers=admin,
                              json={'message_id': public['id'], 'reason': 'Periksa konten yang dipertahankan'})).status_code == 201


async def test_storage_cleanup_failure_remains_queued_for_retry(database, monkeypatch):
    from app import worker
    async with database() as db:
        db.add(StorageDeletion(storage_key='deleted-account/file.enc'))
        await db.commit()

    class UnavailableBucket:
        def delete_object(self, **params):
            raise RuntimeError('isolated storage outage')

    monkeypatch.setattr(worker, 'storage', UnavailableBucket)
    async with database() as db:
        with pytest.raises(RuntimeError, match='storage outage'):
            await worker.clean_deleted_uploads(db)
    async with database() as db:
        assert (await db.scalar(select(StorageDeletion))).storage_key == 'deleted-account/file.enc'


async def test_cache_outage_after_commit_does_not_report_account_as_undeleted(client, monkeypatch):
    from app import content
    from redis.exceptions import ConnectionError
    owner = await account(client)

    async def unavailable(*args):
        raise ConnectionError('isolated cache outage')

    monkeypatch.setattr(content, 'invalidate', unavailable)
    response = await client.request('DELETE', '/api/v1/users/me', headers=owner,
                                     json={'password': CREDENTIAL, 'content_action': 'keep'})
    assert response.status_code == 204
    assert (await client.get('/api/v1/users/me', headers=owner)).status_code == 401
