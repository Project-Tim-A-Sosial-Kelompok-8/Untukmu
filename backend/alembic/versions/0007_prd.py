"""Keep authored content as messages and retire removed bundled recordings."""
from alembic import op
import sqlalchemy as sa

revision = "0007_prd"
down_revision = "0006_account_deletion"
branch_labels = None
depends_on = None


def upgrade():
    # Classification changes only: encrypted bodies, attachments and links remain.
    op.execute("UPDATE messages SET entry_type = 'message' WHERE entry_type = 'prayer'")
    content = sa.table("prayer_contents", sa.column("audio_key", sa.String),
                       sa.column("audio_meta", sa.JSON), sa.column("reviewed", sa.Boolean),
                       sa.column("reviewed_by", sa.String), sa.column("reviewed_at", sa.DateTime))
    op.execute(content.update().where(content.c.audio_key.in_([
        "bundled:pater-noster-latin", "bundled:gayatri", "bundled:karaniya-metta",
    ])).values(audio_key=None, audio_meta=op.inline_literal("{}", type_=sa.Text()),
               reviewed=False, reviewed_by=None, reviewed_at=None))


def downgrade():
    # Messages are valid in the previous schema. Removed recordings must not be
    # restored as approved content, and the old classification cannot be inferred.
    pass
