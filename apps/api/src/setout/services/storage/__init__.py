"""Picking the place files are kept from the settings."""

from __future__ import annotations

from functools import lru_cache

from setout.config import Settings, get_settings
from setout.services.storage.base import Storage, checksum_of, key_for
from setout.services.storage.local import LocalStorage
from setout.services.storage.s3 import S3Storage

__all__ = [
    "LocalStorage",
    "S3Storage",
    "Storage",
    "build_storage",
    "checksum_of",
    "get_storage",
    "key_for",
]


def build_storage(settings: Settings) -> Storage:
    if settings.storage_backend == "s3":
        return S3Storage(
            settings.s3_bucket,
            prefix=settings.s3_prefix,
            endpoint_url=settings.s3_endpoint_url or None,
            region=settings.s3_region or None,
            access_key_id=settings.s3_access_key_id,
            secret_access_key=settings.s3_secret_access_key,
            use_path_style=settings.s3_use_path_style,
            link_seconds=settings.s3_link_seconds,
        )
    return LocalStorage(settings.data_dir / "attachments")


@lru_cache
def get_storage() -> Storage:
    return build_storage(get_settings())
