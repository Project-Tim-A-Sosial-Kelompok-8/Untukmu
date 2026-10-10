import hmac
import secrets
from uuid import UUID
from fastapi import APIRouter, Header, HTTPException, Request
from sqlalchemy import or_, select
from .content import owned
from .models import Message, now
from .schemas import ShareInput
from .security import CurrentUser, DB, digest, throttle

router = APIRouter(tags=["Tautan terbatas"])


@router.post('/messages/{message_id}/share')
async def rotate(message_id: UUID, body: ShareInput, user: CurrentUser, db: DB, request: Request):
    await throttle(request, 'share', 10, user.id)
    row = await owned(db, Message, message_id, user.id)
    if row.visibility != 'unlisted':
        raise HTTPException(409, 'Tautan tersedia untuk pesan berstatus tautan terbatas.')
    if body.payload.aad != f'untukmu:share:v1:{row.id}':
        raise HTTPException(422, 'Konteks enkripsi tautan tidak cocok.')
    token = secrets.token_urlsafe(32)
    row.share_token_hash = digest(token)
    row.share_payload = body.payload.model_dump()
    await db.commit()
    return {'id': row.id, 'token': token}


@router.delete('/messages/{message_id}/share', status_code=204)
async def revoke(message_id: UUID, user: CurrentUser, db: DB, request: Request):
    await throttle(request, 'share', 10, user.id)
    row = await owned(db, Message, message_id, user.id)
    row.share_token_hash = None
    row.share_payload = None
    await db.commit()


@router.get('/shared/{message_id}')
async def read(message_id: UUID, db: DB, request: Request, x_share_token: str = Header(default='', max_length=100)):
    await throttle(request, 'shared-read', 60)
    row = await db.scalar(select(Message).where(Message.id == str(message_id), Message.visibility == 'unlisted',
                          or_(Message.release_at.is_(None), Message.release_at <= now())))
    if row is None or not row.share_token_hash or not row.share_payload or not hmac.compare_digest(row.share_token_hash, digest(x_share_token)):
        raise HTTPException(404, 'Tautan tidak berlaku atau pesan belum waktunya dibuka.')
    return {'id': row.id, 'payload': row.share_payload, 'created_at': row.created_at}
