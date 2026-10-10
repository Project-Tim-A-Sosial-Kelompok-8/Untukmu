"""Create local secrets without overwriting an existing environment file."""
import os
import secrets
import base64
from pathlib import Path

root = Path(__file__).resolve().parents[1]
target = root / ".env"
if target.exists():
    raise SystemExit(".env sudah ada; tidak diubah.")
password = secrets.token_hex(24)
text = (root / ".env.example").read_text()
values = {
    "POSTGRES_PASSWORD": password,
    "DATABASE_URL": f"postgresql+asyncpg://untukmu:{password}@localhost:5432/untukmu",
    "JWT_SECRET": secrets.token_hex(48),
    "PUBLIC_CONTENT_KEY": base64.urlsafe_b64encode(secrets.token_bytes(32)).decode(),
    "S3_ACCESS_KEY": "um" + secrets.token_hex(9),
    "S3_SECRET_KEY": secrets.token_hex(32),
    "METRICS_TOKEN": secrets.token_hex(32),
    "GRAFANA_ADMIN_PASSWORD": secrets.token_urlsafe(32),
}
lines = []
for line in text.splitlines():
    key = line.split("=", 1)[0]
    lines.append(f"{key}={values[key]}" if key in values else line)
target.write_text("\n".join(lines) + "\n")
os.chmod(target, 0o600)
print(".env lokal berhasil dibuat. Jangan masukkan ke repositori.")
