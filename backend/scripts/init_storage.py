"""Provision the private bucket; run as a one-shot infrastructure task."""
import sys
import time
from botocore.exceptions import ClientError, EndpointConnectionError
from app.config import settings
from app.uploads import storage

client = storage()
for attempt in range(30):
    try:
        client.head_bucket(Bucket=settings().s3_bucket)
        print("Bucket privat sudah tersedia.")
        sys.exit(0)
    except ClientError as error:
        if error.response["Error"]["Code"] in ("404", "NoSuchBucket"):
            client.create_bucket(Bucket=settings().s3_bucket)
            print("Bucket privat dibuat; tanpa kebijakan baca publik.")
            sys.exit(0)
        raise
    except EndpointConnectionError:
        time.sleep(1)
raise SystemExit("Penyimpanan objek belum siap.")
