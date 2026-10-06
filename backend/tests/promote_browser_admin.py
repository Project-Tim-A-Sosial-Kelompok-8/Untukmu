"""Test-only fixture. Targets only the dedicated browser-test.db."""
import os
import sqlite3
import sys
from pathlib import Path
if os.environ.get("UNTUKMU_BROWSER_TEST") != "1":
    raise SystemExit("This fixture requires the isolated browser harness.")
path = Path(os.environ.get("UNTUKMU_BROWSER_DATABASE", str(Path(__file__).resolve().parents[1] / "browser-test.db")))
if not path.exists():
    raise SystemExit("Dedicated browser test database does not exist.")
with sqlite3.connect(path) as db:
    changed = db.execute("UPDATE users SET role='admin' WHERE email=?", (sys.argv[1],)).rowcount
    if changed != 1:
        raise SystemExit("Expected exactly one test account.")
