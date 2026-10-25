"""Settings use the SETOUT_ prefix and are read from the environment or a .env file.

Data defaults to ./data, so local development needs no configuration.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# The API runs from apps/api, so the repository root .env is resolved by absolute path.
REPO_ROOT = Path(__file__).resolve().parents[4]


def _renamed(setting: str) -> AliasChoices:
    # An alias bypasses env_prefix, so both names carry it. SETOUT_LOGIN_* is the
    # earlier name, still read so existing deployments keep their settings.
    return AliasChoices(f"SETOUT_SIGN_IN_{setting.upper()}", f"SETOUT_LOGIN_{setting.upper()}")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="SETOUT_",
        env_file=(REPO_ROOT / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    port: int = 8474
    data_dir: Path = Path("./data")
    database_url: str = ""
    secret_key: str = "change-me"
    log_level: str = "info"
    # Directory of the built web app to serve. Set in the container image.
    static_dir: Path | None = None
    # Comma-separated. Only needed when the API and web app are on different origins.
    cors_origins: str = "http://localhost:4200"
    # Send the session cookie only over HTTPS. Enable when Setout is served beyond localhost.
    cookie_secure: bool = False

    # Session lifetime. The expiry is extended while the session is in use.
    session_days: int = 30
    # Failed sign-in attempts allowed before delays start.
    sign_in_free_attempts: int = Field(3, validation_alias=_renamed("free_attempts"))
    # Initial delay, doubled after each further failure. Zero disables delays.
    sign_in_delay_seconds: float = Field(1.0, validation_alias=_renamed("delay_seconds"))
    # Maximum delay.
    sign_in_delay_cap_seconds: float = Field(8.0, validation_alias=_renamed("delay_cap_seconds"))
    # After this many failures, attempts are rejected instead of delayed.
    sign_in_max_attempts: int = Field(7, validation_alias=_renamed("max_attempts"))
    # The Retry-After value, and how long a failure is counted.
    sign_in_retry_after_seconds: int = Field(30, validation_alias=_renamed("retry_after_seconds"))

    # Tile server for land maps. The OpenStreetMap default is for light use only.
    map_tile_url: str = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    map_attribution: str = "© OpenStreetMap"

    # Reverse geocoding service. Leave empty to disable geocoding.
    geocoder_url: str = "https://nominatim.openstreetmap.org"
    # Nominatim requires a contact email for anything beyond occasional use.
    geocoder_email: str = ""

    # Attachment storage: "local" for disk under data_dir, or "s3" for an S3-compatible bucket.
    storage_backend: str = "local"
    s3_bucket: str = ""
    # Leave empty for AWS. Set for RustFS, R2, B2, Spaces and other S3-compatible services.
    s3_endpoint_url: str = ""
    s3_region: str = ""
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    # Key prefix inside the bucket, so the bucket can be shared.
    s3_prefix: str = "attachments"
    # RustFS and some other services require path-style bucket addressing.
    s3_use_path_style: bool = False
    # Expiry of presigned bucket URLs, in seconds.
    s3_link_seconds: int = 300
    # The bucket URL browsers use. Leave empty to use s3_endpoint_url; set it when
    # the API reaches the bucket at an internal Docker address.
    s3_public_url: str = ""
    # Automatically create the target S3 bucket on startup if it does not exist.
    s3_auto_create_bucket: bool = True

    # Legacy storage migration: point to a directory or legacy S3 endpoint to automatically
    # migrate legacy MinIO/S3 attachments to the active storage on boot.
    legacy_storage_dir: Path | None = None
    legacy_s3_endpoint_url: str = ""
    legacy_s3_access_key_id: str = ""
    legacy_s3_secret_access_key: str = ""

    # Maximum attachment size, in bytes.
    max_attachment_bytes: int = 25_000_000
    # Maximum import size, in bytes. The file is read into memory to be parsed.
    max_import_bytes: int = 25_000_000

    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        self.data_dir.mkdir(parents=True, exist_ok=True)
        db_path = self.data_dir / "setout.sqlite3"
        return f"sqlite://{db_path.as_posix()}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
