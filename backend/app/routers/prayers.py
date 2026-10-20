"""Curated public prayer content and durable, idempotent acknowledgements."""

import hashlib
import hmac
import json
import secrets
import time
from uuid import UUID, uuid4

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from starlette.concurrency import run_in_threadpool

from ..config import settings
from ..models import Message, Prayer, PrayerContent, now
from ..prayer_catalog import CATALOG
from ..prayer_recordings import PREFIX, ROOT, audio_url, recording
from ..schemas import PrayerAudioInput, PrayerContentInput, PrayerFinish, PrayerStart
from ..security import DB, AdminUser, OptionalUser, get_redis, throttle, verify_turnstile, visitor_identity
from .content import invalidate
from .social import readable_public
from .uploads import storage

router = APIRouter(tags=["Doa dan kurasi"])
CATALOG_ENTRIES = {f"{tr['id']}/{e['id']}": (tr, e) for tr in CATALOG for e in tr["entri"]}
CATALOG_IDS = set(CATALOG_ENTRIES)


def revision(row):
    return hashlib.sha256(
        json.dumps([row.content, row.audio_key, row.audio_meta, row.reviewed], sort_keys=True).encode()
    ).hexdigest()


def duration_seconds(row):
    if row.audio_key:
        return row.audio_meta.get("duration_seconds", 30)
    return row.content.get("detik", 30)


async def entry(db, identifier, lock=False):
    query = select(PrayerContent).where(PrayerContent.id == identifier)
    row = await db.scalar(query.with_for_update() if lock else query)
    if row is None:
        raise HTTPException(404, "Entri doa tidak ditemukan.")
    return row


async def playback_url(row):
    """Resolve only a catalogue recording, without creating a prayer session."""
    if not row.audio_key:
        raise HTTPException(409, "Audio doa belum tersedia.")
    if row.audio_key.startswith("bundled:"):
        raise HTTPException(409, "Rekaman lama telah dilepas. Pasang dan tinjau rekaman asli.")
    if row.audio_key.startswith(PREFIX):
        identifier = row.audio_key[len(PREFIX) :]
        metadata = recording(identifier)
        if not metadata or not (ROOT / metadata["file"]).is_file():
            raise HTTPException(503, "Rekaman doa belum tersedia. Coba lagi nanti.")
        return audio_url(row.audio_key)
    return await run_in_threadpool(
        storage(public=True).generate_presigned_url,
        "get_object",
        Params={"Bucket": settings().s3_bucket, "Key": row.audio_key},
        ExpiresIn=1200,
    )


def preview_url(row):
    return audio_url(row.audio_key) or f"/api/v1/prayers/{row.id}/audio/preview"


@router.get("/prayers/traditions")
async def catalog(db: DB):
    rows = {row.id: row for row in await db.scalars(select(PrayerContent))}
    return [
        {
            **tradition,
            "entri": [
                {
                    **e,
                    **rows[f"{tradition['id']}/{e['id']}"].content,
                    "reviewed": rows[f"{tradition['id']}/{e['id']}"].reviewed,
                    "audio": bool(rows[f"{tradition['id']}/{e['id']}"].audio_key),
                    "audio_preview_url": preview_url(rows[f"{tradition['id']}/{e['id']}"]),
                    "audio_attribution": rows[f"{tradition['id']}/{e['id']}"].audio_meta.get("attribution"),
                    "audio_license": rows[f"{tradition['id']}/{e['id']}"].audio_meta.get("license"),
                    "audio_license_url": rows[f"{tradition['id']}/{e['id']}"].audio_meta.get("license_url"),
                    "audio_source_url": rows[f"{tradition['id']}/{e['id']}"].audio_meta.get("page"),
                    "audio_language": rows[f"{tradition['id']}/{e['id']}"].audio_meta.get("language"),
                    "detik": duration_seconds(rows[f"{tradition['id']}/{e['id']}"]),
                }
                for e in tradition["entri"]
                if f"{tradition['id']}/{e['id']}" in rows
                and rows[f"{tradition['id']}/{e['id']}"].reviewed
                and rows[f"{tradition['id']}/{e['id']}"].audio_key
            ],
        }
        for tradition in CATALOG
    ]


@router.get("/prayers/audio/{identifier}")
async def original_recording(identifier: str):
    metadata = recording(identifier)
    if not metadata:
        raise HTTPException(404, "Rekaman doa tidak ditemukan.")
    path = ROOT / metadata["file"]
    if not path.is_file():
        raise HTTPException(503, "Berkas rekaman belum tersedia.")
    return FileResponse(path, media_type="audio/ogg" if path.suffix == ".ogg" else "audio/mpeg")


@router.get("/prayers/{tradition}/{prayer_id}/audio/preview")
async def public_preview(tradition: str, prayer_id: str, db: DB, request: Request):
    identifier = f"{tradition}/{prayer_id}"
    if identifier not in CATALOG_IDS:
        raise HTTPException(404, "Rekaman doa tidak ditemukan.")
    row = await entry(db, identifier)
    if not row.reviewed or not row.audio_key:
        raise HTTPException(404, "Rekaman doa tidak ditemukan.")
    await throttle(request, "prayer-preview", 30, visitor_identity(request, None))
    return RedirectResponse(await playback_url(row), status_code=307)


@router.get("/admin/prayers/{tradition}/{prayer_id}/audio/preview")
async def admin_preview(tradition: str, prayer_id: str, admin: AdminUser, db: DB, request: Request):
    identifier = f"{tradition}/{prayer_id}"
    if identifier not in CATALOG_IDS:
        raise HTTPException(404, "Entri doa tidak ditemukan.")
    await throttle(request, "curation-preview", 30, admin.id)
    row = await entry(db, identifier)
    return {"audio_url": await playback_url(row), "seconds": duration_seconds(row)}


@router.get("/admin/prayers")
async def admin_catalog(admin: AdminUser, db: DB):
    rows = {row.id: row for row in await db.scalars(select(PrayerContent))}
    return [
        {
            "id": identifier,
            "tradition": tradition["id"],
            "tradition_label": tradition["label"]["id"],
            "catalog_title": original["nama"]["id"],
            # Curator edits, including intentional null text, take precedence over defaults.
            "content": {**original, **rows[identifier].content, "detik": duration_seconds(rows[identifier])},
            "reviewed": rows[identifier].reviewed,
            "audio_meta": rows[identifier].audio_meta,
            "has_audio": bool(rows[identifier].audio_key),
            "publicly_available": rows[identifier].reviewed and bool(rows[identifier].audio_key),
            "audio_preview_url": audio_url(rows[identifier].audio_key),
            "reviewed_at": rows[identifier].reviewed_at,
        }
        for identifier, (tradition, original) in CATALOG_ENTRIES.items()
        if identifier in rows
    ]


@router.put("/admin/prayers/{tradition}/{prayer_id}")
async def curate(tradition: str, prayer_id: str, body: PrayerContentInput, admin: AdminUser, db: DB, request: Request):
    await throttle(request, "curation", 30, admin.id)
    row = await entry(db, f"{tradition}/{prayer_id}", True)
    if body.reviewed and not row.audio_key:
        raise HTTPException(409, "Pasang rekaman doa sebelum menyetujui kurasi.")
    row.content = {
        "id": prayer_id,
        "nama": {"id": body.title},
        "teks": {"id": body.text} if body.text else None,
        "arti": {"id": body.translation} if body.translation else None,
        "sumber": body.source_attribution,
        "source_url": body.source_url,
        "review_note": body.review_note,
        "detik": row.audio_meta.get("duration_seconds", body.duration_seconds)
        if row.audio_key
        else body.duration_seconds,
    }
    row.reviewed, row.reviewed_by, row.reviewed_at = body.reviewed, admin.id, now()
    await db.commit()
    return {"id": row.id, "reviewed": row.reviewed}


@router.post("/admin/prayers/{tradition}/{prayer_id}/audio/presign")
async def audio_presign(
    tradition: str, prayer_id: str, body: PrayerAudioInput, admin: AdminUser, db: DB, request: Request
):
    await throttle(request, "curation-audio-presign", 10, admin.id)
    row = await entry(db, f"{tradition}/{prayer_id}", True)
    key = f"curated/{row.id}/{uuid4()}"
    signed = await run_in_threadpool(
        storage(public=True).generate_presigned_post,
        settings().s3_bucket,
        key,
        Fields={"Content-Type": body.content_type},
        Conditions=[["content-length-range", body.byte_size, body.byte_size], {"Content-Type": body.content_type}],
        ExpiresIn=300,
    )
    row.audio_meta = {**row.audio_meta, "pending": {**body.model_dump(), "key": key}}
    await db.commit()
    return {"upload": signed}


@router.post("/admin/prayers/{tradition}/{prayer_id}/audio/complete")
async def audio_complete(tradition: str, prayer_id: str, admin: AdminUser, db: DB, request: Request):
    await throttle(request, "curation-audio-complete", 10, admin.id)
    row = await entry(db, f"{tradition}/{prayer_id}", True)
    pending = row.audio_meta.get("pending")
    if not pending:
        raise HTTPException(409, "Tidak ada unggahan yang menunggu pemeriksaan.")
    try:
        info = await run_in_threadpool(storage().head_object, Bucket=settings().s3_bucket, Key=pending["key"])
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(409, "Unggahan audio belum tersedia.") from exc
    if info.get("ContentLength") != pending["byte_size"] or info.get("ContentType") != pending["content_type"]:
        raise HTTPException(422, "Metadata audio tidak cocok.")
    row.audio_key, row.audio_meta = pending["key"], {k: v for k, v in pending.items() if k != "key"}
    row.reviewed = False
    row.reviewed_by, row.reviewed_at = None, None
    await db.commit()
    return {"id": row.id, "reviewed": False}


def token_key(token):
    return "prayer-session:" + hashlib.sha256(token.encode()).hexdigest()


@router.post("/messages/{message_id}/prayers/start")
async def start(message_id: UUID, body: PrayerStart, user: OptionalUser, db: DB, request: Request):
    identity = visitor_identity(request, user)
    await throttle(request, "prayer-start", 10, identity)
    if not user:
        await verify_turnstile(request, body.turnstile_token, "prayer")
    message = await readable_public(db, message_id, user)
    if body.catalog_id not in CATALOG_IDS:
        raise HTTPException(409, "Pilihan doa ini sudah tidak digunakan. Pilih doa dari katalog terbaru.")
    row = await entry(db, body.catalog_id)
    if not row.reviewed:
        raise HTTPException(409, "Entri ini menunggu kurasi.")
    if not row.audio_key:
        raise HTTPException(409, "Audio doa belum tersedia. Pilih doa yang memiliki rekaman terkurasi.")
    token = secrets.token_urlsafe(32)
    seconds = duration_seconds(row)
    resolved_audio_url = await playback_url(row)
    state = {
        "message_id": message.id,
        "identity": identity,
        "catalog_id": row.id,
        "started": time.time(),
        "seconds": seconds,
        "revision": revision(row),
    }
    await get_redis(request).set(token_key(token), json.dumps(state), ex=int(seconds) + 300)
    return {
        "playback_token": token,
        "seconds": seconds,
        "audio_url": resolved_audio_url,
        "source_attribution": row.content.get("sumber", ""),
        "audio_attribution": row.audio_meta.get("attribution"),
    }


@router.post("/messages/{message_id}/prayers")
async def finish(message_id: UUID, body: PrayerFinish, user: OptionalUser, db: DB, request: Request):
    identity = visitor_identity(request, user)
    await throttle(request, "prayer-finish", 20, identity)
    message = await readable_public(db, message_id, user)
    state = await get_redis(request).get(token_key(body.playback_token))
    if not state:
        raise HTTPException(409, "Sesi doa kedaluwarsa. Mulai kembali.")
    state = json.loads(state)
    if state["message_id"] != message.id or not hmac.compare_digest(state["identity"], identity):
        raise HTTPException(403, "Sesi doa tidak cocok.")
    if time.time() - state["started"] < state["seconds"]:
        raise HTTPException(409, "Waktu doa belum selesai.")
    row = await entry(db, state["catalog_id"])
    if (
        not row.reviewed
        or not row.audio_key
        or row.id not in CATALOG_IDS
        or not hmac.compare_digest(state["revision"], revision(row))
    ):
        raise HTTPException(409, "Isi doa berubah. Mulai kembali.")
    added = False
    try:
        async with db.begin_nested():
            db.add(
                Prayer(
                    message_id=message.id,
                    visitor_hash=identity,
                    tradition=row.tradition,
                    prayer_type=row.id.split("/", 1)[1],
                    played_audio_ref=row.audio_key,
                    source_attribution=row.content.get("sumber", "")
                    + (" · " + row.audio_meta.get("attribution", "") if row.audio_key else ""),
                )
            )
            await db.flush()
        added = True
    except IntegrityError:
        pass
    if added:
        await db.execute(update(Message).where(Message.id == message.id).values(prayer_count=Message.prayer_count + 1))
    await db.commit()
    await db.refresh(message)
    await invalidate(request, message.author_id)
    if user and user.id != message.author_id:
        await get_redis(request).delete(f"summary:{user.id}")
    # Retain the bounded session until expiry so retries after a lost response are idempotent.
    return {"added": added, "prayer_count": message.prayer_count}
