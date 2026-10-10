"""Fill reference metadata and a sourced preview, preserving curated material."""
import json
from pathlib import Path

from alembic import op
import sqlalchemy as sa

revision = "0009_prayer_sources"
down_revision = "0008_schedule_and_sharing"
branch_labels = None
depends_on = None


def upgrade():
    if op.get_context().as_sql:
        # Reference metadata is nonessential to schema. Offline SQL preserves
        # stored content; the API also merges default reference metadata.
        return
    content = sa.table("prayer_contents", sa.column("id", sa.String), sa.column("content", sa.JSON), sa.column("reviewed", sa.Boolean))
    updates = json.loads((Path(__file__).resolve().parents[1] / "catalog-sources-v2.json").read_text(encoding="utf-8"))
    connection = op.get_bind()
    for row in connection.execute(sa.select(content)).mappings():
        if row["reviewed"] or row["id"] not in updates:
            continue
        previous = dict(row["content"])
        source = updates[row["id"]]
        if not previous.get("source_url"):
            previous["source_url"] = source["source_url"]
        if not previous.get("teks"):
            previous.update(source)
        connection.execute(content.update().where(content.c.id == row["id"]).values(content=previous))


def downgrade():
    # Reference additions are compatible with the previous schema.
    pass
