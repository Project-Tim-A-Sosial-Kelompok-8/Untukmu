from uuid import uuid4
from sqlalchemy import select
from app.models import Upload
from .conftest import account, galaxy, message_input


async def test_clear_requires_current_credential_and_is_owner_scoped(client):
    owner = await account(client)
    body = message_input(await galaxy(client, owner))
    await client.post('/api/v1/messages', headers=owner, json=body)
    other = await account(client,'second@example.com')
    foreign = message_input(await galaxy(client,other))
    await client.post('/api/v1/messages',headers=other,json=foreign)
    assert (await client.post('/api/v1/users/me/clear',headers=owner,json={'password':'incorrect'})).status_code == 401
    assert (await client.post('/api/v1/users/me/clear',headers=owner,json={'password':'test-credential-derived-client-side'})).status_code == 204
    assert (await client.get('/api/v1/dashboard/messages',headers=owner)).json() == []
    assert len((await client.get('/api/v1/dashboard/messages',headers=other)).json()) == 1


async def test_private_upload_contract_does_not_expose_object_without_completion(client,database,monkeypatch):
    from app import uploads
    owner=await account(client)
    identifier=str(uuid4())
    class Bucket:
        def generate_presigned_post(self,bucket,key,**kwargs):
            assert kwargs['Conditions'][0] == ['content-length-range',40,40]
            assert kwargs['Fields']['Content-Type']=='application/octet-stream'
            return {'url':'https://storage.example.invalid','fields':{'key':key}}
        def head_object(self,**kwargs):
            return {'ContentLength':41,'ContentType':'application/octet-stream'}
    monkeypatch.setattr(uploads,'storage',lambda **kwargs:Bucket())
    result=await client.post('/api/v1/uploads/presign',headers=owner,json={'id':identifier,'byte_size':40,'iv':'AAAAAAAAAAAAAAAA','aad':f'untukmu:upload:v2:{identifier}'})
    assert result.status_code == 201
    assert (await client.get(f'/api/v1/uploads/{identifier}',headers=owner)).status_code == 409
    assert (await client.post(f'/api/v1/uploads/{identifier}/complete',headers=owner)).status_code == 422
    other=await account(client,'other@example.com')
    assert (await client.get(f'/api/v1/uploads/{identifier}',headers=other)).status_code == 404
    async with database() as db:
        row=await db.scalar(select(Upload).where(Upload.id==identifier))
        assert row.complete is False


async def test_api_no_store_and_validation_no_echo(client):
    response=await client.get('/api/v1/prayers/traditions')
    assert response.headers['cache-control']=='no-store'
    assert response.headers['referrer-policy']=='no-referrer'
    secret='PRIVATE-CONTENT-MUST-NOT-BE-ECHOED'
    result=await client.post('/api/v1/auth/recovery/begin',json={'email':'not-email','recovery_verifier':secret})
    assert result.status_code==422 and secret not in result.text
