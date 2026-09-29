"""Verify every original archive entry and every unpacked application asset."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'docs/manifest-asli.json').read_text())
archive=root/manifest['archive']
assert hashlib.sha256(archive.read_bytes()).hexdigest()==manifest['archive_sha256'], 'Original ZIP changed'
with ZipFile(archive) as source:
    files=[i for i in source.infolist() if not i.is_dir()]
    assert len(files)==manifest['file_count']
    copied=0
    for entry in manifest['files']:
        data=source.read(entry['source'])
        assert len(data)==entry['bytes'] and hashlib.sha256(data).hexdigest()==entry['sha256'], entry['source']
        if entry['working_copy']:
            target=root/entry['working_copy']
            assert target.read_bytes()==data, str(target)
            copied+=1
print(f"{len(files)} original entries verified; {copied} unpacked application files identical. Original ZIP includes repository history.")
