import hmac
import secrets
from uuid import UUID
from fastapi import APIRouter, Header, HTTPException, Request
from sqlalchemy import select
from .content import owned
from .models import Message
from .public_content import open_public
from .security import CurrentUser, DB, digest, throttle

router = APIRouter(tags=["Tautan terbatas"])


@router.post('/messages/{message_id}/share')
async def rotate(message_id: UUID, user: CurrentUser, db: DB, request: Request):
    await throttle(request, 'share', 10, user.id)
    row = await owned(db, Message, message_id, user.id)
    if row.visibility != 'unlisted':
        raise HTTPException(409, 'Tautan tersedia untuk pesan berstatus tautan terbatas.')
    token = secrets.token_urlsafe(32)
    row.share_token_hash = digest(token)
    await db.commit()
    return {'id': row.id, 'token': token}


@router.delete('/messages/{message_id}/share', status_code=204)
async def revoke(message_id: UUID, user: CurrentUser, db: DB, request: Request):
    await throttle(request, 'share', 10, user.id)
    row = await owned(db, Message, message_id, user.id)
    row.share_token_hash = None
    await db.commit()


@router.get('/shared/{message_id}')
async def read(message_id: UUID, db: DB, request: Request, x_share_token: str = Header(default='', max_length=100)):
    await throttle(request, 'shared-read', 60)
    row = await db.scalar(select(Message).where(Message.id == str(message_id), Message.visibility == 'unlisted', Message.moderation_status == 'approved'))
    if row is None or not row.share_token_hash or not hmac.compare_digest(row.share_token_hash, digest(x_share_token)):
        raise HTTPException(404, 'Tautan tidak berlaku atau pesan belum disetujui.')
    return {'id': row.id, 'public_body': open_public(row.id, row.ciphertext), 'created_at': row.created_at}
