"""Integration tests for the zero-intervention legacy storage migration."""

from __future__ import annotations

import datetime
import hashlib
import io
from pathlib import Path
from typing import Any

import pytest
from botocore.exceptions import ClientError
from httpx import AsyncClient

from setout.config import Settings
from setout.currencies import CURRENCIES
from setout.models.attachment import Attachment
from setout.models.currency import Currency
from setout.models.expense import Expense
from setout.models.land import Land
from setout.models.land_document import LandDocument, LandDocumentKind
from setout.models.project import Project
from setout.services.storage.local import LocalStorage
from setout.services.storage.migrate import MARKER_FILENAME, auto_migrate_legacy_storage

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def test_migration_skips_when_marker_exists(tmp_path: Path, client: AsyncClient) -> None:
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True)
    marker = data_dir / MARKER_FILENAME
    marker.write_text("migrated=5,total=5\n", encoding="utf-8")

    settings = Settings(data_dir=data_dir)
    storage = LocalStorage(tmp_path / "storage")

    await auto_migrate_legacy_storage(storage, settings)

    assert marker.read_text(encoding="utf-8") == "migrated=5,total=5\n"


async def test_migration_does_not_create_marker_when_no_legacy_source(
    tmp_path: Path, client: AsyncClient
) -> None:
    data_dir = tmp_path / "data"
    settings = Settings(data_dir=data_dir, legacy_storage_dir=None, legacy_s3_endpoint_url="")
    storage = LocalStorage(tmp_path / "storage")

    await auto_migrate_legacy_storage(storage, settings)

    marker = data_dir / MARKER_FILENAME
    assert not marker.exists()


async def test_migration_does_not_create_marker_when_no_assets_in_database(
    tmp_path: Path, client: AsyncClient
) -> None:
    data_dir = tmp_path / "data"
    legacy_dir = tmp_path / "legacy"
    legacy_dir.mkdir(parents=True)

    settings = Settings(data_dir=data_dir, legacy_storage_dir=legacy_dir)
    storage = LocalStorage(tmp_path / "storage")

    await auto_migrate_legacy_storage(storage, settings)

    marker = data_dir / MARKER_FILENAME
    assert not marker.exists()


async def test_migration_transfers_assets_and_verifies_checksums(
    tmp_path: Path, client: AsyncClient
) -> None:
    data_dir = tmp_path / "data"
    legacy_dir = tmp_path / "legacy"
    target_storage_dir = tmp_path / "target_storage"

    settings = Settings(data_dir=data_dir, legacy_storage_dir=legacy_dir)
    storage = LocalStorage(target_storage_dir)

    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] == "NGN"]
    )
    project = await Project.create(name="Migration Project", currency_id="NGN")
    expense = await Expense.create(
        project=project,
        spent_on=datetime.date(2026, 10, 23),
        description="Cement",
        amount=50000,
    )

    # 1. Attachment asset
    att_bytes = b"receipt attachment content 12345"
    att_checksum = hashlib.sha256(att_bytes).hexdigest()
    att_key = f"{att_checksum[:2]}/{att_checksum[2:4]}/{att_checksum}.jpg"

    await Attachment.create(
        project=project,
        expense=expense,
        filename="receipt.jpg",
        content_type="image/jpeg",
        byte_size=len(att_bytes),
        checksum=att_checksum,
        storage_key=att_key,
    )

    # Place in legacy directory
    att_legacy_path = legacy_dir / att_key
    att_legacy_path.parent.mkdir(parents=True)
    att_legacy_path.write_bytes(att_bytes)

    # 2. LandDocument asset
    land = await Land.create(name="Migration Land")
    doc_bytes = b"%PDF-1.4 land document sample"
    doc_checksum = hashlib.sha256(doc_bytes).hexdigest()
    doc_key = f"{doc_checksum[:2]}/{doc_checksum[2:4]}/{doc_checksum}.pdf"

    await LandDocument.create(
        land=land,
        kind=LandDocumentKind.DEED,
        filename="deed.pdf",
        content_type="application/pdf",
        byte_size=len(doc_bytes),
        checksum=doc_checksum,
        storage_key=doc_key,
    )

    # Place in legacy directory using MinIO part.1 style
    doc_legacy_part = legacy_dir / doc_key / "part.1"
    doc_legacy_part.parent.mkdir(parents=True)
    doc_legacy_part.write_bytes(doc_bytes)

    # Run migration
    await auto_migrate_legacy_storage(storage, settings)

    # Assert both exist in target storage
    assert await storage.exists(att_key) is True
    assert await storage.get(att_key) == att_bytes

    assert await storage.exists(doc_key) is True
    assert await storage.get(doc_key) == doc_bytes

    # Assert completion marker written
    marker = data_dir / MARKER_FILENAME
    assert marker.exists()
    assert "migrated=2,total=2" in marker.read_text(encoding="utf-8")


async def test_migration_does_not_mark_complete_if_corrupted_or_missing(
    tmp_path: Path, client: AsyncClient
) -> None:
    data_dir = tmp_path / "data"
    legacy_dir = tmp_path / "legacy"
    target_storage_dir = tmp_path / "target_storage"

    settings = Settings(data_dir=data_dir, legacy_storage_dir=legacy_dir)
    storage = LocalStorage(target_storage_dir)

    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] == "USD"]
    )
    project = await Project.create(name="Corrupted Project", currency_id="USD")
    expense = await Expense.create(
        project=project,
        spent_on=datetime.date(2026, 10, 23),
        description="Wood",
        amount=1000,
    )

    real_bytes = b"original content"
    real_checksum = hashlib.sha256(real_bytes).hexdigest()
    key = f"{real_checksum[:2]}/{real_checksum[2:4]}/{real_checksum}.txt"

    await Attachment.create(
        project=project,
        expense=expense,
        filename="note.txt",
        content_type="text/plain",
        byte_size=len(real_bytes),
        checksum=real_checksum,
        storage_key=key,
    )

    # Corrupt the bytes on disk
    corrupted_path = legacy_dir / key
    corrupted_path.parent.mkdir(parents=True)
    corrupted_path.write_bytes(b"corrupted bytes different hash")

    # Run migration
    await auto_migrate_legacy_storage(storage, settings)

    # Marker must NOT be written so subsequent restarts retry
    marker = data_dir / MARKER_FILENAME
    assert not marker.exists()


async def test_migration_reads_legacy_s3_source_settings_instead_of_target(
    tmp_path: Path, client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    data_dir = tmp_path / "data"
    storage = LocalStorage(tmp_path / "target_storage")

    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] == "NGN"]
    )
    project = await Project.create(name="S3 Migration Project", currency_id="NGN")
    expense = await Expense.create(
        project=project,
        spent_on=datetime.date(2026, 10, 23),
        description="Blocks",
        amount=25000,
    )

    payload = b"legacy s3 receipt bytes"
    checksum = hashlib.sha256(payload).hexdigest()
    key = f"{checksum[:2]}/{checksum[2:4]}/{checksum}.jpg"
    await Attachment.create(
        project=project,
        expense=expense,
        filename="receipt.jpg",
        content_type="image/jpeg",
        byte_size=len(payload),
        checksum=checksum,
        storage_key=key,
    )

    client_kwargs: dict[str, Any] = {}
    s3_calls: list[tuple[str, str]] = []

    class FakeLegacyS3:
        def get_object(self, *, Bucket: str, Key: str) -> dict[str, Any]:
            s3_calls.append((Bucket, Key))
            if Bucket == "legacy-bucket" and Key == f"legacy-prefix/{key}":
                return {"Body": io.BytesIO(payload)}
            raise ClientError({"Error": {"Code": "NoSuchKey", "Message": "Not Found"}}, "GetObject")

    def fake_boto3_client(service: str, **kwargs: Any) -> FakeLegacyS3:
        assert service == "s3"
        client_kwargs.update(kwargs)
        return FakeLegacyS3()

    monkeypatch.setattr("setout.services.storage.migrate.boto3.client", fake_boto3_client)

    # First boot without legacy source does not lock out a later migration.
    await auto_migrate_legacy_storage(
        storage, Settings(data_dir=data_dir, s3_bucket="target-bucket", s3_prefix="target-prefix")
    )
    assert not (data_dir / MARKER_FILENAME).exists()

    # Second boot with legacy source configured reads legacy bucket/prefix/region, not target.
    settings = Settings(
        data_dir=data_dir,
        s3_bucket="target-bucket",
        s3_prefix="target-prefix",
        legacy_s3_endpoint_url="http://legacy-minio:9000",
        legacy_s3_bucket="legacy-bucket",
        legacy_s3_prefix="legacy-prefix",
        legacy_s3_region="eu-central-1",
    )
    await auto_migrate_legacy_storage(storage, settings)

    assert client_kwargs["endpoint_url"] == "http://legacy-minio:9000"
    assert client_kwargs["region_name"] == "eu-central-1"
    assert s3_calls == [("legacy-bucket", f"legacy-prefix/{key}")]
    assert await storage.get(key) == payload
    assert (data_dir / MARKER_FILENAME).exists()


async def test_migration_respects_explicit_empty_legacy_prefix(
    tmp_path: Path, client: AsyncClient
) -> None:
    data_dir = tmp_path / "data"
    legacy_dir = tmp_path / "legacy"
    storage = LocalStorage(tmp_path / "target_storage")

    await Currency.bulk_create(
        [Currency(code=c[0], name=c[1], exponent=c[2]) for c in CURRENCIES if c[0] == "NGN"]
    )
    project = await Project.create(name="Root Prefix Project", currency_id="NGN")
    expense = await Expense.create(
        project=project,
        spent_on=datetime.date(2026, 10, 23),
        description="Sand",
        amount=15000,
    )

    payload = b"legacy root bucket file"
    checksum = hashlib.sha256(payload).hexdigest()
    key = f"{checksum[:2]}/{checksum[2:4]}/{checksum}.jpg"
    await Attachment.create(
        project=project,
        expense=expense,
        filename="sand.jpg",
        content_type="image/jpeg",
        byte_size=len(payload),
        checksum=checksum,
        storage_key=key,
    )

    legacy_file = legacy_dir / "old-bucket" / key
    legacy_file.parent.mkdir(parents=True)
    legacy_file.write_bytes(payload)

    settings = Settings(
        data_dir=data_dir,
        s3_bucket="new-bucket",
        s3_prefix="new-prefix",
        legacy_storage_dir=legacy_dir,
        legacy_s3_bucket="old-bucket",
        legacy_s3_prefix="",
    )
    await auto_migrate_legacy_storage(storage, settings)

    assert await storage.get(key) == payload
    assert (data_dir / MARKER_FILENAME).exists()
