from __future__ import annotations

import asyncio
import hashlib
import logging
from pathlib import Path
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from setout.config import Settings
from setout.models.attachment import Attachment
from setout.models.land_document import LandDocument
from setout.services.storage.base import Storage

logger = logging.getLogger("setout.storage.migrate")

MARKER_FILENAME = ".storage_migration_complete"


def _read_legacy_file_from_dir(
    base_dir: Path,
    storage_key: str,
    *,
    bucket: str | None = None,
    prefix: str = "",
) -> bytes | None:
    """Attempts to read an object from a local directory, supporting both raw
    files, bucket/prefix subdirectories, and MinIO's part.1 layout.
    """
    candidates: list[Path] = []
    clean_prefix = prefix.strip("/")

    if bucket and clean_prefix:
        candidates.append(base_dir / bucket / clean_prefix / storage_key)
    if bucket:
        candidates.append(base_dir / bucket / storage_key)
    if clean_prefix:
        candidates.append(base_dir / clean_prefix / storage_key)
    candidates.append(base_dir / storage_key)

    for path in candidates:
        if path.is_file():
            return path.read_bytes()
        part_path = path / "part.1"
        if part_path.is_file():
            return part_path.read_bytes()

    return None


def _read_legacy_file_from_s3(
    client: Any, bucket: str, prefix: str, storage_key: str
) -> bytes | None:
    object_key = f"{prefix}/{storage_key}" if prefix else storage_key
    try:
        response = client.get_object(Bucket=bucket, Key=object_key)
        data: bytes = response["Body"].read()
        return data
    except ClientError as e:
        code = str(e.response.get("Error", {}).get("Code", ""))
        if code in ("404", "NoSuchKey", "NotFound"):
            return None
        raise


async def auto_migrate_legacy_storage(storage: Storage, settings: Settings) -> None:
    """Migrates legacy MinIO attachments and land documents to the active storage.

    Runs automatically during app startup with zero user intervention. Verifies
    100% of assets before writing the completion marker.
    """
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    marker_path = settings.data_dir / MARKER_FILENAME
    if marker_path.exists():
        return

    legacy_dir = settings.legacy_storage_dir
    legacy_s3_url = settings.legacy_s3_endpoint_url

    has_legacy_dir = legacy_dir is not None and legacy_dir.is_dir()
    has_legacy_s3 = bool(legacy_s3_url)

    if not has_legacy_dir and not has_legacy_s3:
        # No legacy source detected; mark complete so future boots skip immediately.
        marker_path.write_text("no-legacy-source\n", encoding="utf-8")
        return

    logger.info("[Storage Migration] Checking for legacy assets to migrate...")

    # Collect all assets recorded in the database
    distinct_assets: dict[str, tuple[str, str]] = {}  # storage_key -> (checksum, content_type)

    attachments = await Attachment.all().values("storage_key", "checksum", "content_type")
    for row in attachments:
        distinct_assets[row["storage_key"]] = (row["checksum"], row["content_type"])

    documents = await LandDocument.all().values("storage_key", "checksum", "content_type")
    for row in documents:
        distinct_assets[row["storage_key"]] = (row["checksum"], row["content_type"])

    total = len(distinct_assets)
    if total == 0:
        marker_path.write_text("no-assets\n", encoding="utf-8")
        logger.info("[Storage Migration] No assets found in database. Migration marked complete.")
        return

    legacy_s3_client: Any | None = None
    if has_legacy_s3:
        legacy_s3_client = boto3.client(
            "s3",
            endpoint_url=legacy_s3_url,
            aws_access_key_id=settings.legacy_s3_access_key_id or None,
            aws_secret_access_key=settings.legacy_s3_secret_access_key or None,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )

    verified = 0
    migrated = 0
    failed = 0

    for key, (checksum, content_type) in distinct_assets.items():
        if await storage.exists(key):
            verified += 1
            continue

        data: bytes | None = None
        if has_legacy_dir and legacy_dir is not None:
            data = await asyncio.to_thread(
                _read_legacy_file_from_dir,
                legacy_dir,
                key,
                bucket=settings.s3_bucket,
                prefix=settings.s3_prefix,
            )

        if data is None and legacy_s3_client is not None:
            data = await asyncio.to_thread(
                _read_legacy_file_from_s3,
                legacy_s3_client,
                settings.s3_bucket,
                settings.s3_prefix,
                key,
            )

        if data is None:
            logger.warning("[Storage Migration] Missing legacy asset for key %s", key)
            failed += 1
            continue

        actual_hash = hashlib.sha256(data).hexdigest()
        if actual_hash != checksum:
            logger.error(
                "[Storage Migration] Checksum mismatch for key %s: expected %s, got %s",
                key,
                checksum,
                actual_hash,
            )
            failed += 1
            continue

        await storage.put(key, data, content_type=content_type)
        if await storage.exists(key):
            verified += 1
            migrated += 1
        else:
            failed += 1

    if failed == 0 and verified == total:
        marker_path.write_text(f"migrated={migrated},total={total}\n", encoding="utf-8")
        logger.info(
            "[Storage Migration] 100%% of assets verified (%d/%d, %d newly migrated). "
            "Legacy MinIO storage can now be safely removed.",
            verified,
            total,
            migrated,
        )
    else:
        logger.warning(
            "[Storage Migration] Incomplete migration: %d verified, %d failed out of %d total. "
            "Leaving legacy source intact for retry on next boot.",
            verified,
            failed,
            total,
        )
