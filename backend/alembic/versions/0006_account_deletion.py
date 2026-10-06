"""Detach retained content from deleted accounts and queue object cleanup."""
from alembic import op
import sqlalchemy as sa

revision = "0006_account_deletion"
down_revision = "0005_written_prayers"
branch_labels = None
depends_on = None

REFERENCES = [("messages", "author_id"), ("constellations", "owner_id"),
              ("uploads", "owner_id"), ("moderation_decisions", "reviewer_id")]
NAMING = {"fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"}


def upgrade():
    for table, column in REFERENCES:
        name = f"{table}_{column}_fkey"
        if not op.get_context().as_sql:
            keys = sa.inspect(op.get_bind()).get_foreign_keys(table)
            key = next(key for key in keys if key["constrained_columns"] == [column])
            name = key["name"] or f"fk_{table}_{column}_users"
        with op.batch_alter_table(table, naming_convention=NAMING) as batch:
            batch.drop_constraint(name, type_="foreignkey")
            batch.alter_column(column, existing_type=sa.String(36), nullable=True)
            batch.create_foreign_key(f"{table}_{column}_fkey", "users", [column], ["id"], ondelete="SET NULL")
    op.create_table("storage_deletions",
                    sa.Column("id", sa.String(36), primary_key=True),
                    sa.Column("storage_key", sa.String(200), nullable=False, unique=True),
                    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))


def downgrade():
    # The previous schema cannot represent retained content. Never discard it
    # or an unfinished storage cleanup merely to roll back the schema.
    if op.get_context().as_sql:
        raise RuntimeError("Downgrade memerlukan pemeriksaan data secara online.")
    for table, column in REFERENCES:
        if op.get_bind().execute(sa.text(f"SELECT COUNT(*) FROM {table} WHERE {column} IS NULL")).scalar():
            raise RuntimeError("Pindahkan data tanpa pemilik sebelum menurunkan migrasi penghapusan akun.")
    if op.get_bind().execute(sa.text("SELECT COUNT(*) FROM storage_deletions")).scalar():
        raise RuntimeError("Selesaikan antrean pembersihan penyimpanan sebelum downgrade.")
    for table, column in REFERENCES:
        with op.batch_alter_table(table, naming_convention=NAMING) as batch:
            batch.drop_constraint(f"{table}_{column}_fkey", type_="foreignkey")
            batch.alter_column(column, existing_type=sa.String(36), nullable=False)
            batch.create_foreign_key(f"{table}_{column}_fkey", "users", [column], ["id"],
                                     ondelete="RESTRICT" if table == "moderation_decisions" else "CASCADE")
    op.drop_table("storage_deletions")
