from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def now():
    return datetime.now(timezone.utc)


def uid():
    return str(uuid4())


class Base(DeclarativeBase):
    pass


Json = JSON().with_variant(JSONB(), "postgresql")


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    recovery_auth_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    display_name: Mapped[str] = mapped_column(String(80), default="Anonim")
    role: Mapped[str] = mapped_column(String(10), default="user")
    encryption_record: Mapped[dict | None] = mapped_column(Json, nullable=True)
    default_message_visibility: Mapped[str] = mapped_column(String(20), default="private")
    profile_visibility: Mapped[str] = mapped_column(String(20), default="private")
    preferences: Mapped[dict] = mapped_column(Json, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    __table_args__ = (CheckConstraint("role IN ('user','admin')", name="user_role"),)


class Session(Base):
    __tablename__ = "sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    refresh_token_hash: Mapped[str] = mapped_column(String(64))
    user_agent: Mapped[str] = mapped_column(String(400), default="")
    ip_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Constellation(Base):
    __tablename__ = "constellations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    target_kind: Mapped[str] = mapped_column(String(30))
    target_label: Mapped[str] = mapped_column(String(100))
    custom_category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    visual_type: Mapped[str] = mapped_column(String(20), default="light_symbol")
    visual_ref: Mapped[str | None] = mapped_column(ForeignKey("uploads.id", ondelete="SET NULL"), nullable=True)
    kind: Mapped[str] = mapped_column(String(20), default="spiral")
    color: Mapped[str] = mapped_column(String(7), default="#ffd9a0")
    radius: Mapped[int] = mapped_column(Integer, default=140)
    particle_count: Mapped[int] = mapped_column(Integer, default=8500)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    author_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    entry_type: Mapped[str] = mapped_column(String(20), default="message", server_default="message")
    ciphertext: Mapped[str | None] = mapped_column(Text, nullable=True)
    iv: Mapped[str | None] = mapped_column(String(24), nullable=True)
    kdf_salt: Mapped[str | None] = mapped_column(String(64), nullable=True)
    encryption_meta: Mapped[dict | None] = mapped_column(Json, nullable=True)
    public_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    share_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    share_payload: Mapped[dict | None] = mapped_column(Json, nullable=True)
    release_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    visibility: Mapped[str] = mapped_column(String(20), default="private")
    moderation_status: Mapped[str] = mapped_column(String(20), default="not_applicable")
    moderation_flags: Mapped[list] = mapped_column(Json, default=list)
    moderation_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    mood: Mapped[str | None] = mapped_column(String(40), nullable=True)
    tags: Mapped[list] = mapped_column(Json, default=list)
    date_label: Mapped[object | None] = mapped_column(Date, nullable=True)
    prayer_count: Mapped[int] = mapped_column(Integer, default=0)
    empathy_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    __table_args__ = (
        CheckConstraint("visibility IN ('private','public_anon','unlisted')", name="message_visibility"),
        CheckConstraint("entry_type IN ('message','prayer')", name="message_entry_type"),
        CheckConstraint(
            "(visibility = 'public_anon' AND public_body IS NOT NULL AND ciphertext IS NULL) OR (visibility IN ('private','unlisted') AND public_body IS NULL AND ciphertext IS NOT NULL AND iv IS NOT NULL)",
            name="message_privacy_boundary",
        ),
        Index("ix_messages_explore", "visibility", "moderation_status", "created_at", "id"),
    )


class MessageConstellation(Base):
    __tablename__ = "message_constellations"
    message_id: Mapped[str] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"), primary_key=True)
    constellation_id: Mapped[str] = mapped_column(
        ForeignKey("constellations.id", ondelete="CASCADE"), primary_key=True, index=True
    )


class Upload(Base):
    __tablename__ = "uploads"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    storage_key: Mapped[str] = mapped_column(String(200), unique=True)
    byte_size: Mapped[int] = mapped_column(Integer)
    encryption_meta: Mapped[dict] = mapped_column(Json)
    complete: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class StorageDeletion(Base):
    __tablename__ = "storage_deletions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    storage_key: Mapped[str] = mapped_column(String(200), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class MessageAttachment(Base):
    __tablename__ = "message_attachments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    message_id: Mapped[str] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"), index=True)
    upload_id: Mapped[str] = mapped_column(ForeignKey("uploads.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Prayer(Base):
    __tablename__ = "prayers"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    message_id: Mapped[str] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"), index=True)
    visitor_hash: Mapped[str] = mapped_column(String(64))
    tradition: Mapped[str] = mapped_column(String(20))
    prayer_type: Mapped[str] = mapped_column(String(80))
    played_audio_ref: Mapped[str | None] = mapped_column(String(300), nullable=True)
    source_attribution: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    __table_args__ = (Index("unique_prayer_visitor", "message_id", "visitor_hash", unique=True),)


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    message_id: Mapped[str] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"), index=True)
    reporter_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reason: Mapped[str] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(String(20), default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Block(Base):
    __tablename__ = "blocks"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    blocker_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    blocked_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    __table_args__ = (
        UniqueConstraint("blocker_id", "blocked_id"),
        CheckConstraint("blocker_id <> blocked_id", name="block_other_user"),
    )


class Empathy(Base):
    __tablename__ = "empathies"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    message_id: Mapped[str] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"), index=True)
    visitor_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    __table_args__ = (UniqueConstraint("message_id", "visitor_hash", name="unique_empathy"),)


class ModerationDecision(Base):
    __tablename__ = "moderation_decisions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    message_id: Mapped[str] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"), index=True)
    reviewer_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    decision: Mapped[str] = mapped_column(String(20))
    reason: Mapped[str] = mapped_column(String(1000), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class PrayerContent(Base):
    __tablename__ = "prayer_contents"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    tradition: Mapped[str] = mapped_column(String(20), index=True)
    content: Mapped[dict] = mapped_column(Json)
    reviewed: Mapped[bool] = mapped_column(Boolean, default=False)
    reviewed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    audio_key: Mapped[str | None] = mapped_column(String(250), nullable=True)
    audio_meta: Mapped[dict] = mapped_column(Json, default=dict)
