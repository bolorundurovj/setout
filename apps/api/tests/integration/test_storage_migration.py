"""Integration tests for the zero-intervention legacy storage migration."""

from __future__ import annotations

import datetime
import hashlib
from pathlib import Path

import pytest
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


async def test_migration_creates_marker_when_no_legacy_source(
    tmp_path: Path, client: AsyncClient
) -> None:
    data_dir = tmp_path / "data"
    settings = Settings(data_dir=data_dir, legacy_storage_dir=None, legacy_s3_endpoint_url="")
    storage = LocalStorage(tmp_path / "storage")

    await auto_migrate_legacy_storage(storage, settings)

    marker = data_dir / MARKER_FILENAME
    assert marker.exists()
    assert marker.read_text(encoding="utf-8") == "no-legacy-source\n"


async def test_migration_creates_marker_when_no_assets_in_database(
    tmp_path: Path, client: AsyncClient
) -> None:
    data_dir = tmp_path / "data"
    legacy_dir = tmp_path / "legacy"
    legacy_dir.mkdir(parents=True)

    settings = Settings(data_dir=data_dir, legacy_storage_dir=legacy_dir)
    storage = LocalStorage(tmp_path / "storage")

    await auto_migrate_legacy_storage(storage, settings)

    marker = data_dir / MARKER_FILENAME
    assert marker.exists()
    assert marker.read_text(encoding="utf-8") == "no-assets\n"


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
