import base64
import os
from .conftest import account, galaxy, key_record, message_input


def verifier():
    return base64.b64encode(os.urandom(32)).decode()


async def test_multi_target_ownership_unique_and_export(client):
    owner = await account(client)
    a, b = await galaxy(client, owner), await galaxy(client, owner)
    body = message_input(a)
    body['constellation_ids'] = [a, b]
    result = await client.post('/api/v1/messages', headers=owner, json=body)
    assert result.status_code == 201, result.text
    for gid in (a, b):
        assert len((await client.get(f'/api/v1/constellations/{gid}/messages', headers=owner)).json()) == 1
    exported = (await client.get('/api/v1/users/me/export', headers=owner)).json()
    assert len(exported['messages']) == 1 and len(exported['constellations']) == 2
    assert exported['messages'][0]['payload'] == body['payload']
    other = await account(client, 'other@example.com')
    foreign = await galaxy(client, other)
    body['constellation_ids'] = [a, foreign]
    assert (await client.patch(f"/api/v1/messages/{body['id']}", headers=owner, json=body)).status_code == 404
    body['constellation_ids'] = [a, a]
    assert (await client.patch(f"/api/v1/messages/{body['id']}", headers=owner, json=body)).status_code == 422
    assert (await client.get('/api/v1/users/me/export', headers=other)).json()['messages'] == []


async def test_changing_message_galaxy_updates_both_galaxy_lists(client):
    owner = await account(client)
    first, second = await galaxy(client, owner), await galaxy(client, owner)
    body = message_input(first)
    assert (await client.post('/api/v1/messages', headers=owner, json=body)).status_code == 201
    body['constellation_ids'] = [second]
    moved = await client.patch(f"/api/v1/messages/{body['id']}", headers=owner, json=body)
    assert moved.status_code == 200, moved.text
    assert moved.json()['constellation_ids'] == [second]
    assert (await client.get(f'/api/v1/constellations/{first}/messages', headers=owner)).json() == []
    messages = (await client.get(f'/api/v1/constellations/{second}/messages', headers=owner)).json()
    assert [message['id'] for message in messages] == [body['id']]
    assert (await client.delete(f'/api/v1/constellations/{first}', headers=owner)).status_code == 204
    assert (await client.delete(f'/api/v1/constellations/{second}', headers=owner)).status_code == 409


async def test_recovery_rotates_code_revokes_sessions_and_preserves_ciphertext(client):
    old = verifier()
    registered = await client.post('/api/v1/auth/register',json={'email':'recover@example.com','password':'old-client-verifier','encryption_record':key_record(),'recovery_verifier':old})
    assert registered.status_code == 201
    headers = {'Authorization':'Bearer '+registered.json()['access_token']}
    body = message_input(await galaxy(client,headers))
    await client.post('/api/v1/messages',headers=headers,json=body)
    wrong = await client.post('/api/v1/auth/recovery/begin',json={'email':'recover@example.com','recovery_verifier':verifier()})
    assert wrong.status_code == 401
    started = await client.post('/api/v1/auth/recovery/begin',json={'email':'recover@example.com','recovery_verifier':old})
    assert started.status_code == 200
    fresh = verifier()
    finish = {'challenge':started.json()['challenge'],'password':'new-client-verifier','encryption_record':key_record(),'recovery_verifier':fresh}
    completed = await client.post('/api/v1/auth/recovery/finish',json=finish)
    assert completed.status_code == 200, completed.text
    assert (await client.get('/api/v1/users/me',headers=headers)).status_code == 401
    assert (await client.post('/api/v1/auth/recovery/finish',json=finish)).status_code == 401
    assert (await client.post('/api/v1/auth/recovery/begin',json={'email':'recover@example.com','recovery_verifier':old})).status_code == 401
    newheaders={'Authorization':'Bearer '+completed.json()['access_token']}
    assert (await client.get(f"/api/v1/messages/{body['id']}",headers=newheaders)).json()['payload'] == body['payload']
    assert (await client.post('/api/v1/auth/login',json={'email':'recover@example.com','password':'old-client-verifier'})).status_code == 401
    assert (await client.post('/api/v1/auth/login',json={'email':'recover@example.com','password':'new-client-verifier'})).status_code == 200


async def test_unlisted_requires_token_review_and_can_be_revoked(client, database):
    from uuid import uuid4
    from .test_social import admin_account, approve
    owner = await account(client)
    body = {'id':str(uuid4()),'constellation_ids':[await galaxy(client,owner)],'visibility':'unlisted','public_body':'Pesan lewat tautan terbatas'}
    created = await client.post('/api/v1/messages',headers=owner,json=body)
    assert created.status_code == 201, created.text
    link = (await client.post(f"/api/v1/messages/{body['id']}/share",headers=owner)).json()
    token = {'X-Share-Token':link['token']}
    url = f"/api/v1/shared/{body['id']}"
    assert (await client.get(url,headers=token)).status_code == 404
    admin = await admin_account(client,database)
    await approve(client,admin,body['id'])
    assert (await client.get(url)).status_code == 404
    assert (await client.get(url,headers=token)).json()['public_body'] == body['public_body']
    assert (await client.get('/api/v1/explore')).json() == []
    await client.delete(f"/api/v1/messages/{body['id']}/share",headers=owner)
    assert (await client.get(url,headers=token)).status_code == 404
