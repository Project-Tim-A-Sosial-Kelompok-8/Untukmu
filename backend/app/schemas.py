import base64
from datetime import date
from typing import Annotated, Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


def validate_b64(value: str, size: int | None = None):
    try:
        raw = base64.b64decode(value, validate=True)
    except Exception as exc:
        raise ValueError("Base64 tidak valid") from exc
    if size is not None and len(raw) != size:
        raise ValueError(f"Panjang wajib {size} byte")
    return value


class Wrapped(Strict):
    iv: str
    ct: str = Field(min_length=64, max_length=64)

    @field_validator("iv")
    @classmethod
    def iv_length(cls, value):
        return validate_b64(value, 12)

    @field_validator("ct")
    @classmethod
    def ct_length(cls, value):
        return validate_b64(value, 48)


class KeyRecord(Strict):
    v: Literal[2] = 2
    kdf: Literal["Argon2id"] = "Argon2id"
    memory: Literal[65536] = 65536
    iter: Literal[3] = 3
    parallelism: Literal[1] = 1
    salt: str
    wrapped: Wrapped
    wrappedRecovery: Wrapped

    @field_validator("salt")
    @classmethod
    def salt_length(cls, value):
        return validate_b64(value, 16)


class Register(Strict):
    recovery_verifier: str | None = Field(default=None, pattern=r"^[A-Za-z0-9+/]{43}=$")
    email: EmailStr
    password: str = Field(min_length=12, max_length=256)
    display_name: str = Field(default="Anonim", min_length=1, max_length=80)
    encryption_record: KeyRecord
    turnstile_token: str | None = Field(default=None, max_length=2048)


class Login(Strict):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class DeleteAccount(Strict):
    password: str = Field(min_length=1, max_length=256)
    content_action: Literal["keep", "delete"]


class GalaxyInput(Strict):
    target_kind: Literal["orang_tua", "saudara", "sahabat", "pasangan", "seseorang", "diri_sendiri", "custom"]
    target_label: str = Field(min_length=1, max_length=100)
    custom_category: str | None = Field(default=None, max_length=80)
    visual_type: Literal["photo", "light_symbol"] = "light_symbol"
    visual_ref: UUID | None = None
    kind: Literal["spiral", "ellipsoid", "irregular"] = "spiral"
    color: str = Field(default="#ffd9a0", pattern=r"^#[0-9a-fA-F]{6}$")
    radius: Literal[110, 140, 175] = 140
    particle_count: int = Field(default=8500, ge=1, le=10000)

    @model_validator(mode="after")
    def photo_reference(self):
        if self.visual_type == "photo" and self.visual_ref is None:
            raise ValueError("Foto wajib memiliki referensi unggahan terenkripsi")
        if self.visual_type == "light_symbol" and self.visual_ref is not None:
            raise ValueError("Simbol cahaya tidak memakai foto")
        if not self.target_label.strip():
            raise ValueError("Nama tujuan wajib diisi")
        return self


class Cipher(Strict):
    v: Literal[2] = 2
    alg: Literal["A256GCM"] = "A256GCM"
    mode: Literal["private"] = "private"
    iv: str
    ct: str = Field(min_length=24, max_length=100000)
    aad: str = Field(max_length=100)

    @field_validator("iv")
    @classmethod
    def iv_length(cls, value):
        return validate_b64(value, 12)

    @field_validator("ct")
    @classmethod
    def ciphertext(cls, value):
        validate_b64(value)
        if len(base64.b64decode(value)) < 17:
            raise ValueError("Ciphertext harus memuat isi dan tag GCM")
        return value


class MessageBase(Strict):
    id: UUID
    entry_type: Literal["message"] = "message"
    constellation_ids: list[UUID] = Field(min_length=1, max_length=10)

    @field_validator("constellation_ids")
    @classmethod
    def distinct_targets(cls, value):
        if len(value) != len(set(value)):
            raise ValueError("Tujuan tidak boleh berulang")
        return value
    mood: str | None = Field(default=None, max_length=40)
    tags: list[str] = Field(default_factory=list, max_length=5)
    date_label: date | None = None
    attachment_ids: list[UUID] = Field(default_factory=list, max_length=5)

    @field_validator("tags")
    @classmethod
    def valid_tags(cls, value):
        if any(not v.strip() or len(v) > 50 for v in value):
            raise ValueError("Tag wajib 1–50 karakter")
        return value


class MessageInput(MessageBase):
    visibility: Literal["private"] = "private"
    payload: Cipher

    @model_validator(mode="after")
    def valid_context(self):
        if self.payload.aad != f"untukmu:message:v2:{self.id}:private":
            raise ValueError("AAD tidak cocok dengan identitas pesan")
        return self


class PublicMessageInput(MessageBase):
    visibility: Literal["public_anon"]
    public_body: str = Field(min_length=1, max_length=40000)
    turnstile_token: str | None = Field(default=None, max_length=2048)

    @field_validator("public_body")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("Pesan tidak boleh kosong")
        return value


class UnlistedMessageInput(PublicMessageInput):
    visibility: Literal["unlisted"]


AnyMessageInput = Annotated[MessageInput | PublicMessageInput | UnlistedMessageInput, Field(discriminator="visibility")]


class UserSettings(Strict):
    default_message_visibility: Literal["private", "public_anon", "unlisted"] = "private"
    profile_visibility: Literal["private", "public"] = "private"


class UploadInput(Strict):
    id: UUID
    byte_size: int = Field(ge=17, le=10 * 1024 * 1024)
    iv: str
    aad: str = Field(max_length=100)

    @field_validator("iv")
    @classmethod
    def iv_length(cls, value):
        return validate_b64(value, 12)

    @model_validator(mode="after")
    def upload_context(self):
        if self.aad != f"untukmu:upload:v2:{self.id}":
            raise ValueError("AAD unggahan tidak sesuai")
        return self


class PublicAction(Strict):
    turnstile_token: str | None = Field(default=None, max_length=2048)


class ReportInput(PublicAction):
    message_id: UUID
    reason: str = Field(min_length=3, max_length=1000)


class BlockInput(Strict):
    message_id: UUID


class DecisionInput(Strict):
    decision: Literal["approve", "reject", "remove"]
    reason: str = Field(default="", max_length=1000)
    review_token: str = Field(pattern=r"^[a-f0-9]{64}$")


class PrayerStart(PublicAction):
    catalog_id: str = Field(min_length=3, max_length=100)


class PrayerFinish(Strict):
    playback_token: str = Field(min_length=40, max_length=80)


class PrayerContentInput(Strict):
    title: str = Field(min_length=1, max_length=120)
    text: str | None = Field(default=None, max_length=10000)
    translation: str | None = Field(default=None, max_length=10000)
    source_attribution: str = Field(min_length=3, max_length=1000)
    source_url: str = Field(default="", max_length=1000)
    review_note: str = Field(default="", max_length=1000)
    reviewed: bool = False
    duration_seconds: int = Field(ge=5, le=900)

    @model_validator(mode="after")
    def curation(self):
        if self.source_url and not self.source_url.startswith("https://"):
            raise ValueError("Tautan sumber wajib HTTPS")
        if self.reviewed and (not self.text or len(self.review_note.strip()) < 3 or not self.source_url):
            raise ValueError("Kurasi memerlukan teks, tautan sumber, dan catatan peninjauan")
        return self


class PrayerAudioInput(Strict):
    byte_size: int = Field(ge=100, le=30 * 1024 * 1024)
    content_type: Literal["audio/mpeg", "audio/ogg", "audio/wav", "audio/mp4"]
    license: str = Field(min_length=3, max_length=500)
    attribution: str = Field(min_length=3, max_length=1000)
    duration_seconds: int = Field(ge=5, le=900)


class RecoveryBegin(Strict):
    email: EmailStr
    recovery_verifier: str = Field(pattern=r"^[A-Za-z0-9+/]{43}=$")
    turnstile_token: str | None = Field(default=None, max_length=2048)


class RecoveryFinish(Strict):
    challenge: str = Field(pattern=r"^[A-Za-z0-9_-]{43}$")
    password: str = Field(min_length=12, max_length=256)
    encryption_record: KeyRecord
    recovery_verifier: str = Field(pattern=r"^[A-Za-z0-9+/]{43}=$")


class ConfirmCredential(Strict):
    password: str = Field(min_length=1, max_length=256)


class EnableRecovery(ConfirmCredential):
    recovery_verifier: str = Field(pattern=r"^[A-Za-z0-9+/]{43}=$")
