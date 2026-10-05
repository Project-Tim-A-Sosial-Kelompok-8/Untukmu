import json
from pathlib import Path
from .models import PrayerContent

CATALOG = json.loads((Path(__file__).resolve().parents[1] / "data/prayers-v1.json").read_text(encoding="utf-8"))
SOURCES = json.loads((Path(__file__).resolve().parents[1] / "data/prayer-sources.json").read_text(encoding="utf-8"))


def initial_rows():
    return [{"id": f"{tradition['id']}/{entry['id']}", "tradition": tradition["id"],
             "content": entry, "reviewed": entry["reviewed"], "audio_meta": {}}
            for tradition in CATALOG for entry in tradition["entri"]]


async def seed_catalog(db):
    # Test/bootstrap helper; normal installations seed in the frozen migration.
    for row in initial_rows():
        if await db.get(PrayerContent, row["id"]) is None:
            db.add(PrayerContent(**row))
    await db.commit()
