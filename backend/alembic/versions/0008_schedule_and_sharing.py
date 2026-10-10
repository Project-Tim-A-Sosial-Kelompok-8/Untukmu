"""Schedule messages and store independently encrypted share envelopes."""
from alembic import op
import sqlalchemy as sa

revision = "0008_schedule_and_sharing"
down_revision = "0007_prd"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("messages", sa.Column("share_payload", sa.JSON(), nullable=True))
    op.add_column("messages", sa.Column("release_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_messages_release_at", "messages", ["release_at"])
    # Previous unlisted bodies remain intact for owner-side conversion. Old
    # links cannot provide client-side secrecy and must be regenerated.
    op.execute("UPDATE messages SET share_token_hash = NULL WHERE visibility = 'unlisted'")


def downgrade():
    op.drop_index("ix_messages_release_at", table_name="messages")
    op.drop_column("messages", "release_at")
    op.drop_column("messages", "share_payload")
