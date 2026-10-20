"""Download original, licensed recordings; never synthesize prayer audio."""

import hashlib
import json
import re
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote, unquote, urljoin
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "backend/data/prayer-audio"
SOURCES = {
    "al-fatihah": {
        "page": "https://commons.wikimedia.org/wiki/File:AlF%C4%81tihatulKit%C4%81b.ogg",
        "file": "al-fatihah.ogg",
        "sha1": "671b6e324988d3752318d2e8be1fb9cc7db30e58",
        "duration_seconds": 93,
        "license": "CC0-1.0",
        "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
        "attribution": "Ibrahimmusa4 — AlFātihatulKitāb, Wikimedia Commons (rekaman asli, 2024)",
        "language": "Arab",
    },
    "pater-noster": {
        "page": "https://commons.wikimedia.org/wiki/File:Pater-Noster.ogg",
        "file": "pater-noster.ogg",
        "sha1": "b7550f7b09edd8dbc6e70b54332e127a0d3763f8",
        "duration_seconds": 29,
        "license": "CC0-1.0",
        "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
        "attribution": "Dan Palraz — Pater Noster dalam bahasa Latin, Wikimedia Commons (2024)",
        "language": "Latin",
    },
    "gayatri": {
        "page": "https://commons.wikimedia.org/wiki/File:Gayatri_mantra.ogg",
        "file": "gayatri.ogg",
        "sha1": "76843c1d09b7c69e6c364e0f9efe0574579f9d0a",
        "duration_seconds": 21,
        "license": "CC0-1.0",
        "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
        "attribution": "Wilfredor — Gayatri mantra, Wikimedia Commons (rekaman asli, 2013)",
        "language": "Sanskerta",
    },
    "karaniya-metta": {
        "page": "https://irc.audiodharma.org/talks/4293",
        "file": "karaniya-metta.mp3",
        "duration_seconds": 287,
        "sha256": "11fb5484130a48e198642c75f816115459da24814e589d96bf3daf3578290247",
        "license": "CC-BY-NC-ND-4.0",
        "license_url": "https://creativecommons.org/licenses/by-nc-nd/4.0/",
        "attribution": "Dawn Neal — Karaniya Metta Sutta, Insight Meditation Center / AudioDharma (2013); terjemahan Amaravati",
        "language": "Inggris",
    },
    "namo-tassa": {
        "page": "https://amaravati.org/audio/parittas-namo-tassa-page-27/",
        "url": "https://cdn.amaravati.org/wp-content/uploads/2014/10/11/02-Parittas-Namo-Tassa-page-27.mp3",
        "file": "namo-tassa.mp3",
        "duration_seconds": 43,
        "sha256": "63a29521ac0c84b247239aadb04f769c7c7bfab790635a7868feb8f98c069784",
        "license": "Amaravati Publications — free distribution (rekaman utuh tanpa perubahan)",
        "license_url": "https://amaravati.org/support/amaravati-publications/",
        "attribution": "Amaravati Publications — Parittas: Namo Tassa (halaman 27), Amaravati Buddhist Monastery (2014). Rekaman asli utuh; distribusi gratis.",
        "language": "Pali",
    },
}


def fetch(url):
    request = Request(
        url, headers={"User-Agent": "Untukmu/1.0 (licensed prayer recording import)"}
    )
    for attempt in range(3):
        try:
            with urlopen(request, timeout=45) as response:
                return response.read()
        except HTTPError as error:
            if error.code != 429 or attempt == 2:
                raise
            delay = max(15, int(error.headers.get("Retry-After", "15")))
            print(f"Source requested a pause: {delay}s", flush=True)
            time.sleep(delay)


def main():
    TARGET.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for identifier, source in SOURCES.items():
        destination = TARGET / source["file"]
        if destination.exists():
            data = destination.read_bytes()
        else:
            if source.get("url"):
                url = source["url"]
            elif source["file"].endswith(".ogg"):
                filename = unquote(source["page"].split("File:", 1)[1])
                location = hashlib.md5(filename.encode()).hexdigest()
                url = f"https://upload.wikimedia.org/wikipedia/commons/{location[0]}/{location[:2]}/{quote(filename)}"
            else:
                html = fetch(source["page"]).decode("utf-8")
                links = re.findall(r'href=["\']([^"\']+)["\']', html)
                candidates = [
                    link for link in links if ".mp3" in link and "download" not in link
                ]
                if not candidates:
                    candidates = re.findall(r'https?://[^"\'\s<>]+\.mp3', html)
                if not candidates:
                    raise RuntimeError(
                        f"Original recording link missing: {source['page']}"
                    )
                url = urljoin(source["page"], candidates[0].replace("&amp;", "&"))
            data = fetch(url)
        if not data.startswith((b"OggS", b"ID3", b"\xff")):
            raise RuntimeError(f"Expected an audio file for {identifier}")
        if source.get("sha1") and hashlib.sha1(data).hexdigest() != source["sha1"]:
            raise RuntimeError(f"Cached recording checksum mismatch: {identifier}")
        if (
            source.get("sha256")
            and hashlib.sha256(data).hexdigest() != source["sha256"]
        ):
            raise RuntimeError(f"Recording checksum mismatch: {identifier}")
        # Check every pinned digest before writing a downloaded file. A bad
        # response must not become a cached recording for the next run.
        if not destination.exists():
            temporary = destination.with_suffix(destination.suffix + ".tmp")
            temporary.write_bytes(data)
            temporary.replace(destination)
        manifest[identifier] = {
            **source,
            "sha256": hashlib.sha256(data).hexdigest(),
            "bytes": len(data),
        }
        print(f"{identifier}: original recording, {len(data)} bytes")
    # Publish once after every source passes, preserving a complete manifest
    # if a later download or checksum validation fails.
    temporary_manifest = TARGET / "manifest.json.tmp"
    temporary_manifest.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    temporary_manifest.replace(TARGET / "manifest.json")


if __name__ == "__main__":
    main()
