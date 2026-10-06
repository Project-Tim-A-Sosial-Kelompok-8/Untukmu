import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from .conftest import account, galaxy, message_input


async def test_prayers_are_catalog_sessions_and_manual_creation_is_rejected(client):
    headers = await account(client)
    gid = await galaxy(client, headers)
    body = message_input(gid)
    assert (await client.post('/api/v1/messages', headers=headers,
                              json={**body, 'entry_type': 'prayer'})).status_code == 422
    body['tags'] = ['doa']
    created = await client.post('/api/v1/messages', headers=headers, json=body)
    assert created.status_code == 201
    assert created.json()['payload'] == body['payload']
    summary = (await client.get('/api/v1/dashboard/summary', headers=headers)).json()
    assert summary['messages'] == 1 and summary['prayers_received'] == 0
    assert 'written_prayers' not in summary


def test_migration_preserves_bodies_and_team_audio(tmp_path):
    path = Path(__file__).parents[1] / 'alembic/versions/0007_prd.py'
    spec = importlib.util.spec_from_file_location('prd_migration', path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine(f'sqlite:///{tmp_path}/migration.db')
    with engine.begin() as connection:
        connection.execute(sa.text('CREATE TABLE messages (id TEXT, entry_type TEXT, ciphertext TEXT, public_body TEXT)'))
        connection.execute(sa.text("INSERT INTO messages VALUES ('private', 'prayer', 'encrypted-original', NULL), ('public', 'prayer', NULL, 'original-public-body')"))
        connection.execute(sa.text('CREATE TABLE prayer_contents (id TEXT, audio_key TEXT, audio_meta JSON, reviewed BOOLEAN, reviewed_by TEXT, reviewed_at DATETIME)'))
        connection.execute(sa.text("INSERT INTO prayer_contents VALUES ('internet', 'bundled:gayatri', '{}', 1, 'curator', NULL), ('team', 'curated/team/audio', '{}', 1, 'curator', NULL)"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        assert connection.execute(sa.text('SELECT entry_type,ciphertext,public_body FROM messages ORDER BY id')).all() == [
            ('message', 'encrypted-original', None), ('message', None, 'original-public-body')]
        assert connection.execute(sa.text("SELECT audio_key,reviewed,reviewed_by FROM prayer_contents WHERE id='internet'")).one() == (None, 0, None)
        assert connection.execute(sa.text("SELECT audio_key,reviewed,reviewed_by FROM prayer_contents WHERE id='team'")).one() == ('curated/team/audio', 1, 'curator')
    engine.dispose()
