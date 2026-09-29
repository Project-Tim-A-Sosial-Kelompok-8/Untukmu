"""Package source, documentation, and every original asset; omit local secrets/builds."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile

root = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, str(root / "scripts/verify_original.py")], check=True)
excluded = {"node_modules", ".next", ".git", "__pycache__", ".pytest_cache", ".ruff_cache", "test-results", "playwright-report", ".venv"}
files = []
for path in sorted(root.rglob("*")):
    relative = path.relative_to(root)
    if not path.is_file() or set(relative.parts) & excluded:
        continue
    if relative.parts[:4] == ("apps", "web", "public", "engine"):
        continue
    if path.name == ".env" or path.suffix in (".db", ".pyc", ".tsbuildinfo", ".log"):
        continue
    if relative.as_posix() == "docs/release-manifest.json":
        continue
    files.append(path)
manifest = {
    "description": "SHA-256 of packaged files, excluding this manifest itself",
    "files": [{"path": p.relative_to(root).as_posix(), "bytes": p.stat().st_size,
               "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in files],
}
manifest_path = root / "docs/release-manifest.json"
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
files.append(manifest_path)
output = Path(sys.argv[1]).resolve()
with ZipFile(output, "w", ZIP_DEFLATED, compresslevel=6) as archive:
    for path in files:
        archive.write(path, "Untukmu-Fullstack/" + path.relative_to(root).as_posix(),
                      compress_type=ZIP_STORED if path.suffix == ".zip" else ZIP_DEFLATED)
with ZipFile(output) as archive:
    assert archive.testzip() is None
print(json.dumps({"path": str(output), "files": len(files), "bytes": output.stat().st_size,
                  "sha256": hashlib.sha256(output.read_bytes()).hexdigest()}))
