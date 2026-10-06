"""Migrate an existing database without losing messages, links, or review history."""
import os
from pathlib import Path
import subprocess
import sys

from sqlalchemy import delete, event, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models import Constellation, Message, MessageConstellation, ModerationDecision, User
from app.public_content import seal_public
from .conftest import key_record


async def test_upgrade_existing_content_survives_detaching_deleted_owner(tmp_path):
    path = tmp_path / 'migration.db'
    environment = {**os.environ, 'ENVIRONMENT': 'test', 'DATABASE_URL': 'sqlite+aiosqlite:///' + path.as_posix()}
    root = Path(__file__).resolve().parents[1]

    def upgrade(revision):
        result = subprocess.run([sys.executable, '-m', 'alembic', 'upgrade', revision], cwd=root,
                                env=environment, capture_output=True, text=True)
        assert result.returncode == 0, result.stderr

    upgrade('0005_written_prayers')
    engine = create_async_engine(environment['DATABASE_URL'])

    @event.listens_for(engine.sync_engine, 'connect')
    def foreign_keys(connection, record):
        connection.execute('PRAGMA foreign_keys=ON')

    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        user = User(email='old-schema@example.com', password_hash='old-hash', encryption_record=key_record())
        db.add(user)
        await db.flush()
        gid = Constellation(owner_id=user.id, target_kind='sahabat', target_label='Galaksi lama')
        db.add(gid)
        await db.flush()
        message = Message(author_id=user.id, public_body='temporary', visibility='public_anon',
                          moderation_status='approved', entry_type='prayer')
        db.add(message)
        await db.flush()
        message.public_body = seal_public(message.id, 'Doa dari database lama')
        db.add_all([MessageConstellation(message_id=message.id, constellation_id=gid.id),
                    ModerationDecision(message_id=message.id, reviewer_id=user.id, decision='approve')])
        await db.commit()
        user_id, message_id, galaxy_id = user.id, message.id, gid.id
    await engine.dispose()
    upgrade('head')
    async with factory() as db:
        before = await db.get(Message, message_id)
        assert before.entry_type == 'prayer' and before.author_id == user_id
        assert (await db.get(Constellation, galaxy_id)).target_label == 'Galaksi lama'
        await db.execute(delete(User).where(User.id == user_id))
        await db.commit()
    async with factory() as db:
        assert (await db.get(Message, message_id)).author_id is None
        assert (await db.get(Constellation, galaxy_id)).owner_id is None
        assert (await db.scalar(select(ModerationDecision))).reviewer_id is None
        assert await db.get(MessageConstellation, (message_id, galaxy_id)) is not None
    await engine.dispose()
    downgrade = subprocess.run([sys.executable, '-m', 'alembic', 'downgrade', '0005_written_prayers'], cwd=root,
                               env=environment, capture_output=True, text=True)
    assert downgrade.returncode != 0 and 'Pindahkan data tanpa pemilik' in downgrade.stderr
