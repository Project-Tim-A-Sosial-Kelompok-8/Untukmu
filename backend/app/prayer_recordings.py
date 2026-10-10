"""Pinned, original recordings with explicit source and license metadata."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "data/prayer-audio"
RECORDINGS = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
PREFIX = "recording-v1:"


def recording(identifier):
    return RECORDINGS.get(identifier)


def audio_url(key):
    if key and key.startswith(PREFIX):
        identifier = key[len(PREFIX):]
        if recording(identifier):
            return f"/api/v1/prayers/audio/{identifier}"
    return None
