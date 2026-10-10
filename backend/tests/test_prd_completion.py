"""Security and publication boundaries added during the PRD review."""
import json
from datetime import timedelta

from sqlalchemy import select

from app.config import settings
from app.models import Message, now
from app.monitoring import scrub_event
from .conftest import account, galaxy, message_input
from .test_social import admin_account, approve


async def test_scheduled_public_message_stays_hidden_and_cannot_receive_support(client, database):
    from uuid import uuid4
    owner = await account(client)
    body = {'id': str(uuid4()), 'constellation_ids': [await galaxy(client, owner)], 'visibility': 'public_anon',
            'public_body': 'Pesan yang belum waktunya terbit', 'release_at': (now() + timedelta(days=1)).isoformat()}
    assert (await client.post('/api/v1/messages', headers=owner, json=body)).status_code == 201
    admin = await admin_account(client, database)
    await approve(client, admin, body['id'])
    assert (await client.get('/api/v1/explore')).json() == []
    assert (await client.get(f"/api/v1/messages/{body['id']}")).status_code == 404
    assert (await client.post(f"/api/v1/messages/{body['id']}/empathy", json={})).status_code == 404
    async with database() as db:
        row = await db.get(Message, body['id'])
        row.release_at = now() - timedelta(minutes=1)
        await db.commit()
    await client.post(f"/api/v1/messages/{body['id']}/empathy", json={})
    assert (await client.get('/api/v1/explore')).json()[0]['public_body'] == body['public_body']


async def test_unlisted_never_reaches_moderation_and_scheduled_share_is_gated(client, database):
    owner = await account(client)
    body = message_input(await galaxy(client, owner))
    body['visibility'] = 'unlisted'
    body['payload']['aad'] = f"untukmu:message:v2:{body['id']}:unlisted"
    body['release_at'] = (now() + timedelta(days=1)).isoformat()
    result = await client.post('/api/v1/messages', headers=owner, json=body)
    assert result.status_code == 201 and result.json()['public_body'] is None
    assert result.json()['payload'] == body['payload']
    from datetime import datetime
    loaded = (await client.get(f"/api/v1/messages/{body['id']}", headers=owner)).json()
    assert datetime.fromisoformat(loaded['release_at']) == datetime.fromisoformat(body['release_at'])
    admin = await admin_account(client, database)
    assert (await client.get('/api/v1/admin/moderation/queue', headers=admin)).json() == []
    shared = {**body['payload'], 'aad': f"untukmu:share:v1:{body['id']}"}
    link = (await client.post(f"/api/v1/messages/{body['id']}/share", headers=owner, json={'payload': shared})).json()
    assert (await client.get(f"/api/v1/shared/{body['id']}", headers={'X-Share-Token': link['token']})).status_code == 404
    async with database() as db:
        stored = await db.scalar(select(Message).where(Message.id == body['id']))
        assert stored.ciphertext == body['payload']['ct'] and stored.public_body is None


async def test_admin_product_metrics_are_aggregates_and_no_data_is_not_zero_success(client, database):
    owner = await account(client)
    assert (await client.get('/api/v1/admin/metrics', headers=owner)).status_code == 403
    admin = await admin_account(client, database)
    result = (await client.get('/api/v1/admin/metrics', headers=admin)).json()
    assert result['registered_users'] == 2
    assert result['prayer_support_ratio'] is None and result['retention_7d_ratio'] is None
    assert 'email' not in json.dumps(result)


async def test_operational_metrics_require_token_and_never_use_actual_message_id(client):
    config = settings()
    previous = config.metrics_token
    config.metrics_token = 'test-metrics-token-with-at-least-32-characters'
    try:
        identifier = '184823c0-1747-40ef-b39d-62cefb40d306'
        await client.get('/api/v1/messages/' + identifier)
        assert (await client.get('/metrics')).status_code == 401
        response = await client.get('/metrics', headers={'Authorization': 'Bearer ' + config.metrics_token})
        assert response.status_code == 200 and 'untukmu_http_requests_total' in response.text
        assert 'route="/messages/{message_id}"' in response.text
        assert identifier not in response.text
        assert 'application/json' not in response.headers['content-type']
    finally:
        config.metrics_token = previous


def test_sentry_event_cannot_contain_credentials_message_or_request():
    secret = 'never-publish-this-secret'
    original = {'request': {'data': secret}, 'user': {'email': secret}, 'breadcrumbs': [secret], 'message': secret,
                'exception': {'values': [{'type': 'ValueError', 'value': secret, 'stacktrace': {'frames': [{'vars': {'key': secret}}]}}]}}
    result = scrub_event(original, {})
    assert secret not in json.dumps(result)
    assert result['exception']['values'] == [{'type': 'ValueError', 'value': 'Application error'}]
