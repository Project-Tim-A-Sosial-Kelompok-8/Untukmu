"""Download the pinned, openly licensed audio candidates for curator review."""
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "apps/api/data/prayer-audio"

if __name__ == "__main__":
    DESTINATION.mkdir(exist_ok=True)
    manifest = ROOT / "apps/api/data/prayer-audio-candidates.json"
    pinned = json.loads(manifest.read_text(encoding="utf-8"))
    for expected in pinned:
        name, url = expected["file"], expected["download_url"]
        target = (DESTINATION / name).resolve()
        if target.parent != DESTINATION.resolve():
            raise ValueError("Audio path must stay within the candidate folder")
        if target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest() == expected["sha256"]:
            print("Already verified: " + name)
            continue
        data = urlopen(Request(url, headers={"User-Agent": "Untukmu-source-review/1.0"}), timeout=30).read(expected["byte_size"] + 1)
        digest = hashlib.sha256(data).hexdigest()
        if len(data) != expected["byte_size"] or digest != expected["sha256"]:
            raise ValueError("Upstream file changed; review before replacing: " + name)
        target.write_bytes(data)
        print(json.dumps({"file": name, "bytes": len(data), "sha256": digest}))
