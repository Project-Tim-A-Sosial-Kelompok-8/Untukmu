"""Explicit operator command: python -m scripts.make_admin EMAIL."""
import asyncio
import sys
from sqlalchemy import select
from app.db import SessionFactory
from app.models import User


async def main(email):
    async with SessionFactory() as db:
        user = await db.scalar(select(User).where(User.email == email.strip().lower()))
        if user is None:
            raise SystemExit("Akun belum terdaftar. Buat akun di aplikasi terlebih dahulu.")
        user.role = "admin"
        await db.commit()
        print("Peran administrator berhasil diberikan.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Pemakaian: python -m scripts.make_admin EMAIL")
    asyncio.run(main(sys.argv[1]))
