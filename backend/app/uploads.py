from uuid import UUID

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from starlette.concurrency import run_in_threadpool

from .config import settings
from .content import owned
from .models import Upload
from .schemas import UploadInput
from .security import CurrentUser, DB, throttle

router = APIRouter(tags=["Unggahan terenkripsi"])


def storage(public=False):
    conf = settings()
    return boto3.client(
        "s3",
        endpoint_url=conf.s3_public_endpoint if public else conf.s3_endpoint,
        region_name=conf.s3_region,
        aws_access_key_id=conf.s3_access_key,
        aws_secret_access_key=conf.s3_secret_key,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


@router.post("/uploads/presign", status_code=201)
async def presign(body: UploadInput, user: CurrentUser, db: DB, request: Request):
    await throttle(request, "uploads", 10, user.id)
    if body.byte_size > settings().max_upload_bytes:
        raise HTTPException(413, "Ukuran unggahan melebihi batas.")
    storage_key = f"{user.id}/{body.id}.enc"
    row = Upload(
        id=str(body.id),
        owner_id=user.id,
        storage_key=storage_key,
        byte_size=body.byte_size,
        encryption_meta={"v": 2, "alg": "A256GCM", "iv": body.iv, "aad": body.aad},
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(409, "Identitas unggahan sudah dipakai.") from exc
    signed = await run_in_threadpool(
        storage(public=True).generate_presigned_post,
        settings().s3_bucket,
        storage_key,
        Fields={"Content-Type": "application/octet-stream"},
        Conditions=[
            ["content-length-range", body.byte_size, body.byte_size],
            {"Content-Type": "application/octet-stream"},
        ],
        ExpiresIn=300,
    )
    await db.commit()
    return {"id": row.id, "upload": signed, "expires_in": 300}


@router.post("/uploads/{upload_id}/complete")
async def complete(upload_id: UUID, user: CurrentUser, db: DB, request: Request):
    await throttle(request, "write", 60, user.id)
    row = await owned(db, Upload, upload_id, user.id)
    try:
        info = await run_in_threadpool(storage().head_object, Bucket=settings().s3_bucket, Key=row.storage_key)
    except (ClientError, BotoCoreError) as exc:
        raise HTTPException(409, "Objek unggahan belum tersedia.") from exc
    if info.get("ContentLength") != row.byte_size or info.get("ContentType") != "application/octet-stream":
        raise HTTPException(422, "Metadata unggahan tidak cocok.")
    row.complete = True
    await db.commit()
    return {"id": row.id, "complete": True}


@router.get("/uploads/{upload_id}")
async def download(upload_id: UUID, user: CurrentUser, db: DB):
    row = await owned(db, Upload, upload_id, user.id)
    if not row.complete:
        raise HTTPException(409, "Unggahan belum selesai.")
    url = await run_in_threadpool(
        storage(public=True).generate_presigned_url,
        "get_object",
        Params={"Bucket": settings().s3_bucket, "Key": row.storage_key},
        ExpiresIn=60,
    )
    return {"id": row.id, "url": url, "encryption_meta": row.encryption_meta}
