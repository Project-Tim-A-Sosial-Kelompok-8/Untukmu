"""Separate written prayers from messages without changing encrypted content."""

from alembic import op
import sqlalchemy as sa

revision = "0005_written_prayers"
down_revision = "0004_recovery"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("messages", sa.Column(
        "entry_type", sa.String(20),
        sa.CheckConstraint("entry_type IN ('message','prayer')", name="message_entry_type"),
        nullable=False, server_default="message",
    ))
    # Earlier versions of the prayer form saved exactly these two tags.
    # Ordinary messages carrying a free-form #doa tag remain messages.
    if op.get_bind().dialect.name == "postgresql":
        condition = """jsonb_array_length(tags) = 2 AND tags @> '["doa"]'::jsonb
            AND tags ?| ARRAY['umum','islam','kristen','katolik','hindu','buddha','konghucu']"""
    else:
        condition = """json_array_length(tags) = 2
            AND EXISTS (SELECT 1 FROM json_each(tags) WHERE value = 'doa')
            AND EXISTS (SELECT 1 FROM json_each(tags)
                WHERE value IN ('umum','islam','kristen','katolik','hindu','buddha','konghucu'))"""
    op.execute(sa.text("UPDATE messages SET entry_type = 'prayer' WHERE " + condition))


def downgrade():
    op.drop_column("messages", "entry_type")
