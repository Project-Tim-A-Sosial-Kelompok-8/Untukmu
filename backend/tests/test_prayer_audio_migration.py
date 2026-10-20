"""Backfill reference audio without approving drafts or replacing curator work."""

import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models import PrayerContent
from app.prayer_recordings import RECORDINGS


@pytest.mark.parametrize("curation", ["untouched", "upload", "text", "reviewed", "review-history"])
@pytest.mark.parametrize(
    "identifier, recording, seconds", [("hindu/gayatri", "gayatri", 21), ("buddha/namo-tassa", "namo-tassa", 43)]
)
async def test_reference_audio_upgrade_preserves_curation(tmp_path, curation, identifier, recording, seconds):
    path = tmp_path / "prayer-upgrade.db"
    environment = {**os.environ, "ENVIRONMENT": "test", "DATABASE_URL": "sqlite+aiosqlite:///" + path.as_posix()}
    root = Path(__file__).resolve().parents[1]

    def upgrade(revision):
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", revision],
            cwd=root,
            env=environment,
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, result.stderr

    upgrade("0011_non_denominational_prayer")
    engine = create_async_engine(environment["DATABASE_URL"])
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        row = await db.get(PrayerContent, identifier)
        assert row.audio_key is None and not row.reviewed
        if curation == "upload":
            row.audio_key = "curator/recording.ogg"
            row.audio_meta = {"duration_seconds": 37, "attribution": "Curator recording", "license": "Permission"}
        elif curation == "text":
            row.content = {**row.content, "nama": {"id": "Mantram hasil kurasi"}}
        elif curation == "reviewed":
            row.reviewed = True
        elif curation == "review-history":
            row.reviewed_at = datetime.now(UTC)
        await db.commit()
        before = (row.content, row.audio_key, row.audio_meta, row.reviewed, row.reviewed_at)
    await engine.dispose()
    upgrade("head")
    async with factory() as db:
        row = await db.get(PrayerContent, identifier)
        if curation == "untouched":
            assert row.audio_key == "recording-v1:" + recording
            assert row.audio_meta == RECORDINGS[recording]
            assert row.content["recording_id"] == recording
            assert row.content["detik"] == seconds
            assert row.reviewed is False
            assert row.reviewed_at is None and row.reviewed_by is None
        else:
            after = (row.content, row.audio_key, row.audio_meta, row.reviewed, row.reviewed_at)
            # SQLite stores timezone-naive timestamps; compare this field by
            # wall-clock value when checking preservation across connections.
            assert after[:4] == before[:4]
            assert (after[4].replace(tzinfo=None) if after[4] else None) == (
                before[4].replace(tzinfo=None) if before[4] else None
            )
    await engine.dispose()
