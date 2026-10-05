"""Recovery verifier; no plaintext recovery code or vault key."""
from alembic import op
import sqlalchemy as sa
revision = "0004_recovery"
down_revision = "0003_prayers"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("recovery_auth_hash", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("users", "recovery_auth_hash")
