"""Replace the silence option with a draft awaiting sourced text and recording.

Existing prayer acknowledgements and curator edits are retained.
"""

import json

import sqlalchemy as sa

from alembic import op

revision = "0011_non_denominational_prayer"
down_revision = "0010_original_recordings"
branch_labels = None
depends_on = None


def upgrade():
    entries = sa.table(
        "prayer_contents",
        sa.column("id", sa.String),
        sa.column("tradition", sa.String),
        sa.column("content", sa.JSON),
        sa.column("reviewed", sa.Boolean),
        sa.column("audio_key", sa.String),
        sa.column("audio_meta", sa.JSON),
    )
    content = {
        "id": "doa-umum",
        "nama": {"id": "Doa umum non-denominasi", "en": "Non-denominational prayer"},
        "teks": None,
        "arti": None,
        "sumber": "",
        "source_url": "",
        "reviewed": False,
        "audio": None,
        "detik": 30,
    }
    row = {
        "id": "umum/doa-umum",
        "tradition": "umum",
        "content": content,
        "reviewed": False,
        "audio_key": None,
        "audio_meta": {},
    }
    if op.get_context().as_sql:
        row["content"] = op.inline_literal(json.dumps(content, ensure_ascii=False), type_=sa.Text())
        row["audio_meta"] = op.inline_literal("{}", type_=sa.Text())
        op.execute(entries.insert().values(**row))
        return
    connection = op.get_bind()
    if not connection.scalar(sa.select(entries.c.id).where(entries.c.id == row["id"])):
        connection.execute(entries.insert().values(**row))


def downgrade():
    # Keep the reviewed content and prayer history if the application is rolled back.
    pass
