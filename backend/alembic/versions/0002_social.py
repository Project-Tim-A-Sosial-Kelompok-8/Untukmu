"""Social interactions and public-only moderation."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
revision = "0002_social"
down_revision = "0001_foundation"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("messages", sa.Column("moderation_flags", sa.JSON().with_variant(JSONB(), "postgresql"), nullable=False, server_default="[]"))
    op.add_column("messages", sa.Column("moderation_checked_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table("empathies", sa.Column("id", sa.String(36), primary_key=True),
                    sa.Column("message_id", sa.String(36), sa.ForeignKey("messages.id", ondelete="CASCADE"), nullable=False),
                    sa.Column("visitor_hash", sa.String(64), nullable=False),
                    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
                    sa.UniqueConstraint("message_id", "visitor_hash", name="unique_empathy"))
    op.create_index("ix_empathies_message_id", "empathies", ["message_id"])
    op.create_table("moderation_decisions", sa.Column("id", sa.String(36), primary_key=True),
                    sa.Column("message_id", sa.String(36), sa.ForeignKey("messages.id", ondelete="CASCADE"), nullable=False),
                    sa.Column("reviewer_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
                    sa.Column("decision", sa.String(20), nullable=False),
                    sa.Column("reason", sa.String(1000), nullable=False),
                    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_moderation_decisions_message_id", "moderation_decisions", ["message_id"])


def downgrade():
    op.drop_table("moderation_decisions")
    op.drop_table("empathies")
    op.drop_column("messages", "moderation_checked_at")
    op.drop_column("messages", "moderation_flags")
