"""Attach an existing licensed recording to an identical, unreviewed draft.

Only an untouched default is eligible. Curator decisions and uploads survive.
"""

import json
from pathlib import Path

import sqlalchemy as sa

from alembic import op

revision = "0012_gayatri_reference_audio"
down_revision = "0011_non_denominational_prayer"
branch_labels = None
depends_on = None


def upgrade():
    if op.get_context().as_sql:
        # Content matching requires stored JSON. Offline schema upgrades keep
        # drafts unchanged; online upgrade supplies this optional reference.
        return
    entries = sa.table(
        "prayer_contents",
        sa.column("id", sa.String),
        sa.column("content", sa.JSON),
        sa.column("reviewed", sa.Boolean),
        sa.column("reviewed_by", sa.String),
        sa.column("reviewed_at", sa.DateTime),
        sa.column("audio_key", sa.String),
        sa.column("audio_meta", sa.JSON),
    )
    updates = json.loads(
        (Path(__file__).resolve().parents[1] / "catalog-draft-audio-v1.json").read_text(encoding="utf-8")
    )
    connection = op.get_bind()
    for update in updates:
        row = (
            connection.execute(sa.select(entries).where(entries.c.id == update["id"]).with_for_update())
            .mappings()
            .first()
        )
        if (
            row is None
            or row["reviewed"]
            or row["reviewed_by"]
            or row["reviewed_at"]
            or row["audio_key"]
            or row["audio_meta"]
            or row["content"] != update["before"]
        ):
            continue
        connection.execute(
            entries.update()
            .where(entries.c.id == update["id"])
            .values(content=update["content"], audio_key=update["audio_key"], audio_meta=update["audio_meta"])
        )


def downgrade():
    # Preserve reference audio and subsequent curator work during rollback.
    pass
