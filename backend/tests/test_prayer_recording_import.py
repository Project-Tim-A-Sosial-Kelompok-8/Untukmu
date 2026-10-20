"""A failed source import must not publish a partial catalog or corrupt cache."""

import hashlib
import importlib.util
import json
from pathlib import Path

import pytest


@pytest.fixture
def importer(tmp_path, monkeypatch):
    path = Path(__file__).resolve().parents[2] / "scripts/fetch_prayer_recordings.py"
    spec = importlib.util.spec_from_file_location("prayer_recording_import", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, "TARGET", tmp_path)
    return module


def source(data, filename):
    return {
        "url": "https://example.org/original/" + filename,
        "file": filename,
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def test_sha256_failure_keeps_previous_complete_manifest_and_does_not_cache_bad_audio(importer, tmp_path, monkeypatch):
    original_manifest = '{"previous": {"file": "original.mp3"}}\n'
    (tmp_path / "manifest.json").write_text(original_manifest, encoding="utf-8")
    first = b"ID3original first recording"
    expected_second = b"ID3original second recording"
    sources = {"first": source(first, "first.mp3"), "second": source(expected_second, "second.mp3")}
    monkeypatch.setattr(importer, "SOURCES", sources)
    monkeypatch.setattr(importer, "fetch", lambda url: first if url.endswith("first.mp3") else b"ID3wrong recording")
    with pytest.raises(RuntimeError, match="Recording checksum mismatch: second"):
        importer.main()
    assert (tmp_path / "first.mp3").read_bytes() == first
    assert not (tmp_path / "second.mp3").exists()
    assert (tmp_path / "manifest.json").read_text(encoding="utf-8") == original_manifest


def test_success_replaces_manifest_with_all_verified_sources(importer, tmp_path, monkeypatch):
    data = b"ID3original recording"
    sources = {"first": source(data, "first.mp3"), "second": source(data, "second.mp3")}
    monkeypatch.setattr(importer, "SOURCES", sources)
    monkeypatch.setattr(importer, "fetch", lambda url: data)
    importer.main()
    manifest = json.loads((tmp_path / "manifest.json").read_text(encoding="utf-8"))
    assert set(manifest) == set(sources)
    assert all(row["sha256"] == hashlib.sha256(data).hexdigest() for row in manifest.values())
    assert all(row["bytes"] == len(data) for row in manifest.values())
    assert not (tmp_path / "manifest.json.tmp").exists()
