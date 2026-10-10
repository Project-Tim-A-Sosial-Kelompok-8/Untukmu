import base64
from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    environment: Literal["development", "test", "production"] = "development"
    database_url: str = "postgresql+asyncpg://untukmu:untukmu@localhost:5432/untukmu"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str
    public_content_key: str = ""
    app_origin: str = "http://localhost:3000"
    access_minutes: int = 10
    refresh_days: int = 30
    turnstile_secret: str = ""
    turnstile_hostname: str = ""
    s3_endpoint: str = "http://localhost:9000"
    s3_public_endpoint: str = "http://localhost:9000"
    s3_region: str = "us-east-1"
    s3_bucket: str = "untukmu-private"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    max_upload_bytes: int = 10 * 1024 * 1024
    sentry_dsn: str = ""
    metrics_token: str = ""

    @model_validator(mode="after")
    def secure_configuration(self):
        if self.metrics_token and len(self.metrics_token) < 32:
            raise ValueError("METRICS_TOKEN wajib minimal 32 karakter")
        if len(self.jwt_secret) < 32:
            raise ValueError("JWT_SECRET wajib acak dan minimal 32 karakter")
        if self.environment != "test" and not self.database_url.startswith("postgresql+asyncpg://"):
            raise ValueError("Lingkungan aplikasi wajib memakai PostgreSQL")
        if self.environment == "production":
            if not self.app_origin.startswith("https://"):
                raise ValueError("APP_ORIGIN produksi wajib HTTPS")
            if not self.s3_public_endpoint.startswith("https://"):
                raise ValueError("Alamat object storage publik wajib HTTPS pada produksi")
            if not self.turnstile_secret or not self.turnstile_hostname:
                raise ValueError("Turnstile wajib dikonfigurasi pada produksi")
            if not self.s3_access_key or not self.s3_secret_key:
                raise ValueError("Kredensial object storage wajib dikonfigurasi")
        if self.public_content_key:
            try:
                if len(base64.urlsafe_b64decode(self.public_content_key)) != 32:
                    raise ValueError("Panjang kunci tidak cocok")
            except Exception as exc:
                raise ValueError("PUBLIC_CONTENT_KEY wajib 32 byte base64url") from exc
        if self.environment == "production" and not self.public_content_key:
            raise ValueError("PUBLIC_CONTENT_KEY wajib disetel pada produksi")
        return self


@lru_cache
def settings() -> Settings:
    return Settings()
