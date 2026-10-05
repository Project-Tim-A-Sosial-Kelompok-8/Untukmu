"""Create public demonstration data only in the temporary UI export database."""
import asyncio
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

if os.environ.get("UNTUKMU_BROWSER_TEST") != "1":
    raise SystemExit("UI export requires the isolated browser harness.")
database = Path(os.environ["UNTUKMU_BROWSER_DATABASE"]).resolve()
if not database.is_file() or database.name != "browser-test.db" or not database.parent.name.startswith("untukmu-browser-"):
    raise SystemExit("Expected the temporary browser export database.")
os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///" + str(database)
os.environ["JWT_SECRET"] = "browser-test-secret-not-for-production-0123456789"

async def main(email):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from sqlalchemy import select
    from app.db import SessionFactory, engine
    from app.models import Constellation, Message, MessageConstellation, User
    from app.public_content import seal_public

    async with SessionFactory() as db:
        owner = await db.scalar(select(User).where(User.email == email))
        if owner is None:
            raise SystemExit("The demonstration account must be registered first.")
        owner.role = "admin"
        author = await db.scalar(select(User).where(User.email == "contoh-publik-uiux@example.com"))
        if author is None:
            author = User(email="contoh-publik-uiux@example.com", password_hash="disabled-demo-account", display_name="Contoh anonim")
            db.add(author)
            await db.flush()
            galaxy = Constellation(owner_id=author.id, target_kind="sahabat", target_label="Sahabat — data contoh")
            db.add(galaxy)
            await db.flush()
            for index in range(35):
                message = Message(author_id=author.id, visibility="public_anon", moderation_status="approved",
                                  public_body="temporary", mood="syukur" if index % 2 == 0 else "rindu",
                                  tags=["keluarga" if index % 2 == 0 else "kenangan"],
                                  prayer_count=index % 6, empathy_count=index % 3,
                                  created_at=datetime(2026, 9, 1, tzinfo=timezone.utc) + timedelta(hours=index))
                db.add(message)
                await db.flush()
                message.public_body = seal_public(message.id, f"Ucapan contoh {index + 1:02d}. Terima kasih sudah hadir. Semoga hari-harimu dipenuhi ketenangan dan harapan baik.")
                db.add(MessageConstellation(message_id=message.id, constellation_id=galaxy.id))
        await db.commit()
        message = await db.scalar(select(Message).where(Message.author_id == author.id).order_by(Message.created_at.desc()))
        link = await db.scalar(select(MessageConstellation).where(MessageConstellation.message_id == message.id))
        print(json.dumps({"public_id": message.id, "public_galaxy": link.constellation_id}))
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
