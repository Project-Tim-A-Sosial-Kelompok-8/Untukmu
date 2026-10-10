import json
from pathlib import Path
from .models import PrayerContent
from .prayer_recordings import PREFIX, RECORDINGS

CATALOG = json.loads((Path(__file__).resolve().parents[1] / "data/prayers-v1.json").read_text(encoding="utf-8"))


def initial_rows():
    rows = []
    for tradition in CATALOG:
        for entry in tradition["entri"]:
            asset = entry.get("recording_id")
            metadata = RECORDINGS.get(asset, {})
            rows.append({"id": f"{tradition['id']}/{entry['id']}", "tradition": tradition["id"],
                         "content": entry, "reviewed": entry["reviewed"],
                         "audio_key": PREFIX + asset if metadata else None, "audio_meta": metadata})
    return rows


async def seed_catalog(db):
    # Test/bootstrap helper; normal installations seed in the frozen migration.
    for row in initial_rows():
        if await db.get(PrayerContent, row["id"]) is None:
            db.add(PrayerContent(**row))
    await db.commit()
