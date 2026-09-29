"""Prayer catalogue and unique prayer acknowledgements."""
import json
from pathlib import Path
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
revision = "0003_prayers"
down_revision = "0002_social"
branch_labels = None
depends_on = None


def upgrade():
    json_type = sa.JSON().with_variant(JSONB(), "postgresql")
    table = op.create_table("prayer_contents", sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("tradition", sa.String(20), nullable=False), sa.Column("content", json_type, nullable=False),
        sa.Column("reviewed", sa.Boolean(), nullable=False),
        sa.Column("reviewed_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("audio_key", sa.String(250), nullable=True), sa.Column("audio_meta", json_type, nullable=False))
    op.create_index("ix_prayer_contents_tradition", "prayer_contents", ["tradition"])
    # Literal strings allow PostgreSQL --sql output without JSON literal-bind errors.
    data = json.loads((Path(__file__).parents[1] / "catalog-v1.json").read_text(encoding="utf-8"))
    for tradition in data:
        for entry in tradition["entri"]:
            values = {"id": f"{tradition['id']}/{entry['id']}", "tradition": tradition["id"],
                      "content": op.inline_literal(json.dumps(entry, ensure_ascii=False), type_=sa.Text()),
                      "reviewed": entry["reviewed"], "audio_meta": op.inline_literal("{}", type_=sa.Text())}
            op.bulk_insert(table, [values], multiinsert=False)
    op.create_index("unique_prayer_visitor", "prayers", ["message_id", "visitor_hash"], unique=True)


def downgrade():
    op.drop_index("unique_prayer_visitor", table_name="prayers")
    op.drop_table("prayer_contents")
