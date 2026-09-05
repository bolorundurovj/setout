"""Application settings.

All variables use the SETOUT_ prefix and can be set in the environment or a
.env file. Local development defaults to ./data so the app runs with no
configuration.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# The API is started from apps/api, so a .env at the repository root would be
# missed if it were looked for relative to the working directory.
REPO_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="SETOUT_",
        env_file=(REPO_ROOT / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    port: int = 8474
    data_dir: Path = Path("./data")
    database_url: str = ""
    secret_key: str = "change-me"
    log_level: str = "info"
    # Directory of the built web app to serve. Set in the container image.
    static_dir: Path | None = None
    # Comma separated. The single container serves the web app from the same
    # origin, so this only matters when the API and the web app are split.
    cors_origins: str = "http://localhost:4200"
    # Send the session cookie only over HTTPS. Turn this on when Setout is
    # reachable over anything other than localhost.
    cookie_secure: bool = False

    # Tiles for the map on a plot of land. The default is OpenStreetMap's own
    # server; point this at your own if you run Setout for more than a household.
    map_tile_url: str = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    map_attribution: str = "© OpenStreetMap"

    # Turning a pin into an address. Empty turns the check off entirely.
    geocoder_url: str = "https://nominatim.openstreetmap.org"
    # Nominatim asks for a contact address on anything beyond occasional use.
    geocoder_email: str = ""

    # Where attached files are kept: "local" for the disk under data_dir, or
    # "s3" for any S3 compatible bucket.
    storage_backend: str = "local"
    s3_bucket: str = ""
    # Leave empty for Amazon. Set it for MinIO, R2, B2, Spaces and the rest.
    s3_endpoint_url: str = ""
    s3_region: str = ""
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    # A folder inside the bucket, so one bucket can hold more than Setout.
    s3_prefix: str = "attachments"
    # MinIO and some others need the bucket in the path rather than the host.
    s3_use_path_style: bool = False
    # How long a link straight to the bucket stays good for.
    s3_link_seconds: int = 300

    # The largest file that can be attached. A photograph of a receipt from a
    # phone is a few megabytes.
    max_attachment_bytes: int = 25 * 1024 * 1024
    # The largest spreadsheet that can be imported. It is read whole to be parsed.
    max_import_bytes: int = 25 * 1024 * 1024

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
