"""Verify every original archive entry and every unpacked application asset."""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--archive-only', action='store_true', help='Verify the preserved archive without requiring edited working sources to be identical.')
parser.add_argument('--if-present', action='store_true', help='Report a skip if the optional original archive is not included in this checkout.')
args=parser.parse_args()
manifest=json.loads((root/'docs/referensi/manifest-asli.json').read_text())
archive=root/manifest['archive']
if not archive.is_file():
    if args.if_present:
        print(f"SKIP: optional original archive is absent: {manifest['archive']}")
        raise SystemExit(0)
    parser.error(f"Original archive is absent: {manifest['archive']}. Supply the archive or use --if-present for an optional check.")
assert hashlib.sha256(archive.read_bytes()).hexdigest()==manifest['archive_sha256'], 'Original ZIP changed'
with ZipFile(archive) as source:
    files=[i for i in source.infolist() if not i.is_dir()]
    assert len(files)==manifest['file_count']
    copied=0
    for entry in manifest['files']:
        data=source.read(entry['source'])
        assert len(data)==entry['bytes'] and hashlib.sha256(data).hexdigest()==entry['sha256'], entry['source']
        if entry['working_copy'] and not args.archive_only:
            target=root/entry['working_copy']
            assert target.read_bytes()==data, str(target)
            copied+=1
if args.archive_only:
    print(f"{len(files)} original archive entries verified. Edited working sources are excluded from this comparison.")
else:
    print(f"{len(files)} original entries verified; {copied} unpacked application files identical. Original ZIP includes repository history.")
