import importlib.util
import json
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from .conftest import account, galaxy, message_input


async def test_written_prayers_have_separate_counts_and_keep_type_when_edited(client):
    headers = await account(client)
    target = await galaxy(client, headers)
    normal = message_input(target)
    # A free-form tag must not turn an ordinary message into a prayer.
    normal["tags"] = ["doa", "islam"]
    prayer = {**message_input(target), "entry_type": "prayer", "tags": ["doa", "islam"]}
    assert (await client.post("/api/v1/messages", headers=headers, json=normal)).json()["entry_type"] == "message"
    created = await client.post("/api/v1/messages", headers=headers, json=prayer)
    assert created.status_code == 201, created.text
    assert created.json()["entry_type"] == "prayer"
    assert created.json()["payload"] == prayer["payload"]
    summary = (await client.get("/api/v1/dashboard/summary", headers=headers)).json()
    assert {key: summary[key] for key in ("messages", "written_prayers", "entries", "prayers_received", "prayers_given")} == {
        "messages": 1, "written_prayers": 1, "entries": 2, "prayers_received": 0, "prayers_given": 0,
    }
    assert summary["by_visibility"] == {"private": 2}
    prayer.pop("entry_type")
    prayer["tags"] = ["diperbarui"]
    edited = await client.patch(f"/api/v1/messages/{prayer['id']}", headers=headers, json=prayer)
    assert edited.status_code == 200, edited.text
    assert edited.json()["entry_type"] == "prayer"
    rows = (await client.get("/api/v1/dashboard/messages", headers=headers)).json()
    assert {row["entry_type"] for row in rows} == {"message", "prayer"}
    exported = (await client.get("/api/v1/users/me/export", headers=headers)).json()
    assert {row["entry_type"] for row in exported["messages"]} == {"message", "prayer"}
    assert (await client.delete(f"/api/v1/messages/{prayer['id']}", headers=headers)).status_code == 204
    summary = (await client.get("/api/v1/dashboard/summary", headers=headers)).json()
    assert summary["written_prayers"] == 0 and summary["messages"] == 1


def test_migration_classifies_legacy_prayers_without_changing_ciphertext(tmp_path):
    spec = importlib.util.spec_from_file_location("written_prayers_migration", Path(__file__).parents[1] / "alembic/versions/0005_written_prayers.py")
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine(f"sqlite:///{tmp_path}/migration.db")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE messages (id TEXT PRIMARY KEY, tags JSON NOT NULL, ciphertext TEXT NOT NULL)"))
        connection.execute(sa.text("INSERT INTO messages (id,tags,ciphertext) VALUES (:id,:tags,:ciphertext)"), [
            {"id": "prayer", "tags": json.dumps(["doa", "buddha"]), "ciphertext": "private-encrypted-content"},
            {"id": "message", "tags": json.dumps(["doa"]), "ciphertext": "another-ciphertext"},
        ])
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        rows = connection.execute(sa.text("SELECT id,entry_type,ciphertext FROM messages ORDER BY id")).all()
        assert rows == [("message", "message", "another-ciphertext"), ("prayer", "prayer", "private-encrypted-content")]
        with pytest.raises(sa.exc.IntegrityError):
            connection.execute(sa.text("UPDATE messages SET entry_type='invalid' WHERE id='message'"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
        assert connection.execute(sa.text("SELECT ciphertext FROM messages WHERE id='prayer'")).scalar() == "private-encrypted-content"
    engine.dispose()
