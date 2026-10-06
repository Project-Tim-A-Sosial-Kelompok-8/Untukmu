"""Server-only encryption for intentionally public text. Never handles private payloads."""
import base64
import hashlib
import hmac
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from .config import settings


def content_key():
    conf = settings()
    if conf.public_content_key:
        key = base64.urlsafe_b64decode(conf.public_content_key)
        if len(key) != 32:
            raise ValueError("PUBLIC_CONTENT_KEY wajib base64url dari 32 byte")
        return key
    return hmac.new(conf.jwt_secret.encode(), b"untukmu:public-at-rest:v1", hashlib.sha256).digest()


def seal_public(identifier, text):
    iv = os.urandom(12)
    ct = AESGCM(content_key()).encrypt(iv, text.encode(), f"public:{identifier}".encode())
    return "v1:" + base64.urlsafe_b64encode(iv + ct).decode()


def open_public(identifier, envelope):
    if not envelope.startswith("v1:"):
        raise ValueError("Format konten publik tidak dikenal")
    raw = base64.urlsafe_b64decode(envelope[3:])
    return AESGCM(content_key()).decrypt(raw[:12], raw[12:], f"public:{identifier}".encode()).decode()
