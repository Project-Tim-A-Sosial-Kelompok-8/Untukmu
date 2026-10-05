"""Pinned recordings offered to curators, never auto-approved as prayer content."""
import hashlib
import json
from pathlib import Path

from fastapi import HTTPException

DATA = Path(__file__).resolve().parents[1] / "data"
CANDIDATES = {item["id"]: item for item in json.loads((DATA / "prayer-audio-candidates.json").read_text(encoding="utf-8"))}


def candidate_file(identifier):
    item = CANDIDATES.get(identifier)
    if item is None:
        raise HTTPException(404, "Rekaman sumber tidak ditemukan.")
    folder = (DATA / "prayer-audio").resolve()
    path = (folder / item["file"]).resolve()
    if path.parent != folder or not path.is_file():
        raise HTTPException(409, "Berkas rekaman sumber belum tersedia.")
    content = path.read_bytes()
    if len(content) != item["byte_size"] or hashlib.sha256(content).hexdigest() != item["sha256"]:
        raise HTTPException(409, "Berkas rekaman berubah dan perlu diperiksa kembali.")
    return item, path


def candidate_summary(item):
    return {**item, "audio_url": f"/api/v1/prayers/audio-candidates/{item['id']}"}
