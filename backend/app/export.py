from fastapi import APIRouter, Request
from sqlalchemy import select
from .auth import user_view
from .content import galaxy_view, message_views
from .models import Constellation, Message, Upload
from .security import CurrentUser, DB, throttle

router = APIRouter(tags=["Ekspor data milik pengguna"])


@router.get("/users/me/export")
async def export(user: CurrentUser, db: DB, request: Request):
    await throttle(request, "export", 3, user.id)
    galaxies = (await db.scalars(select(Constellation).where(Constellation.owner_id == user.id))).all()
    messages = (await db.scalars(select(Message).where(Message.author_id == user.id))).all()
    uploads = (await db.scalars(select(Upload).where(Upload.owner_id == user.id, Upload.complete.is_(True)))).all()
    return {"format": "untukmu-source-v1", "account": user_view(user),
            "constellations": [galaxy_view(g) for g in galaxies], "messages": await message_views(messages, db),
            "uploads": [{"id": u.id, "byte_size": u.byte_size, "encryption_meta": u.encryption_meta} for u in uploads]}
