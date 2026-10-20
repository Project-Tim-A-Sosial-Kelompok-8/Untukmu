from app.models import PrayerContent
from app.prayer_catalog import CATALOG

from .test_social import admin_account


async def test_admin_catalog_groups_all_current_json_entries_and_excludes_legacy(client, database):
    admin = await admin_account(client, database)
    async with database() as db:
        db.add(
            PrayerContent(
                id="umum/hening",
                tradition="umum",
                content={"nama": {"id": "Entri lama"}, "detik": 30},
                audio_meta={},
                reviewed=False,
            )
        )
        await db.commit()

    response = await client.get("/api/v1/admin/prayers", headers=admin)
    assert response.status_code == 200
    rows = response.json()
    expected = [(tradition, entry) for tradition in CATALOG for entry in tradition["entri"]]
    assert [row["id"] for row in rows] == [f"{tradition['id']}/{entry['id']}" for tradition, entry in expected]
    for row, (tradition, entry) in zip(rows, expected, strict=True):
        assert row["tradition"] == tradition["id"]
        assert row["tradition_label"] == tradition["label"]["id"]
        assert row["catalog_title"] == entry["nama"]["id"]
        assert row["content"]["nama"]["id"] == entry["nama"]["id"]
        assert row["publicly_available"] is (row["reviewed"] and row["has_audio"])
    draft = next(row for row in rows if row["id"] == "umum/doa-umum")
    assert draft["has_audio"] is False
    assert draft["publicly_available"] is False


async def test_admin_catalog_retains_saved_curation_and_nulls_with_json_fallback(client, database):
    admin = await admin_account(client, database)
    identifier = "katolik/bapa-kami-latin"
    async with database() as db:
        row = await db.get(PrayerContent, identifier)
        row.content = {"nama": {"id": "Judul hasil kurasi tim"}, "teks": None, "review_note": "Draf revisi tim"}
        row.reviewed = False
        row.audio_meta = {"duration_seconds": 67, "license": "Izin tim", "attribution": "Rekaman tim"}
        await db.commit()

    rows = (await client.get("/api/v1/admin/prayers", headers=admin)).json()
    result = next(row for row in rows if row["id"] == identifier)
    original = next(tradition for tradition in CATALOG if tradition["id"] == "katolik")["entri"][0]
    assert result["catalog_title"] == original["nama"]["id"]
    assert result["content"]["nama"]["id"] == "Judul hasil kurasi tim"
    assert result["content"]["teks"] is None
    assert result["content"]["review_note"] == "Draf revisi tim"
    assert result["content"]["sumber"] == original["sumber"]
    assert result["content"]["detik"] == 67
    assert result["has_audio"] is True
    assert result["publicly_available"] is False
