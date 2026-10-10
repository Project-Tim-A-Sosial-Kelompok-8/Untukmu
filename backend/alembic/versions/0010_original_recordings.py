"""Add a source-checked recording selection, preserving all existing entries."""
import json
from pathlib import Path

from alembic import op
import sqlalchemy as sa

revision = "0010_original_recordings"
down_revision = "0009_prayer_sources"
branch_labels = None
depends_on = None


def upgrade():
    entries = sa.table("prayer_contents", sa.column("id", sa.String), sa.column("tradition", sa.String),
                       sa.column("content", sa.JSON), sa.column("reviewed", sa.Boolean),
                       sa.column("audio_key", sa.String), sa.column("audio_meta", sa.JSON))
    rows = json.loads((Path(__file__).resolve().parents[1] / "catalog-recordings-v1.json").read_text(encoding="utf-8"))
    if op.get_context().as_sql:
        for row in rows:
            values = {**row, "content": op.inline_literal(json.dumps(row["content"], ensure_ascii=False), type_=sa.Text()),
                      "audio_meta": op.inline_literal(json.dumps(row["audio_meta"], ensure_ascii=False), type_=sa.Text())}
            op.execute(entries.insert().values(**values))
        return
    connection = op.get_bind()
    for row in rows:
        if not connection.scalar(sa.select(entries.c.id).where(entries.c.id == row["id"])):
            connection.execute(entries.insert().values(**row))


def downgrade():
    # Recordings and reviewed content are compatible with the previous schema.
    pass
