"""Integration tests for the setout CLI passphrase recovery."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from httpx import AsyncClient

from setout import cli
from setout.models.user import Session, User
from setout.services.auth import hash_passphrase, verify_passphrase


@pytest.mark.asyncio
@pytest.mark.integration
async def test_reset_passphrase_updates_hash_and_clears_failures(client: AsyncClient) -> None:
    now = datetime.now(UTC)
    user = await User.create(
        name="Admin",
        passphrase_hash=hash_passphrase("old-passphrase-123"),
        failed_sign_ins=4,
        last_failed_at=now,
    )
    await Session.create(
        id="session-1",
        user=user,
        expires_at=now + timedelta(days=1),
    )
    await Session.create(
        id="session-2",
        user=user,
        expires_at=now + timedelta(days=2),
    )

    exit_code = await cli.reset_passphrase(passphrase="brand-new-passphrase")
    assert exit_code == 0

    reloaded = await User.get(id=user.id)
    assert verify_passphrase("brand-new-passphrase", reloaded.passphrase_hash) is True
    assert verify_passphrase("old-passphrase-123", reloaded.passphrase_hash) is False
    assert reloaded.failed_sign_ins == 0
    assert reloaded.last_failed_at is None

    sessions_left = await Session.filter(user_id=user.id).count()
    assert sessions_left == 0


@pytest.mark.asyncio
@pytest.mark.integration
async def test_reset_passphrase_from_file_deletes_the_file(
    client: AsyncClient, tmp_path: Path
) -> None:
    user = await User.create(
        name="Admin",
        passphrase_hash=hash_passphrase("old-passphrase-123"),
    )
    recovery_file = tmp_path / "reset-passphrase.txt"
    recovery_file.write_text("file-provided-passphrase\n", encoding="utf-8")

    exit_code = await cli.reset_passphrase(file_path=recovery_file)
    assert exit_code == 0

    reloaded = await User.get(id=user.id)
    assert verify_passphrase("file-provided-passphrase", reloaded.passphrase_hash) is True
    # The file is deleted so the passphrase does not stay on disk.
    assert not recovery_file.exists()


@pytest.mark.asyncio
@pytest.mark.integration
async def test_consume_recovery_file_on_startup(client: AsyncClient, tmp_path: Path) -> None:
    user = await User.create(
        name="Admin",
        passphrase_hash=hash_passphrase("old-passphrase-123"),
    )
    recovery_file = tmp_path / "reset-passphrase.txt"
    recovery_file.write_text("startup-consumed-passphrase\n", encoding="utf-8")

    consumed = await cli.consume_recovery_file(recovery_file)
    assert consumed is True

    reloaded = await User.get(id=user.id)
    assert verify_passphrase("startup-consumed-passphrase", reloaded.passphrase_hash) is True
    assert not recovery_file.exists()


@pytest.mark.asyncio
@pytest.mark.integration
async def test_reset_passphrase_for_named_account(client: AsyncClient) -> None:
    user_a = await User.create(
        name="Alice",
        passphrase_hash=hash_passphrase("alice-old-passphrase"),
    )
    user_b = await User.create(
        name="Bob",
        passphrase_hash=hash_passphrase("bob-old-passphrase"),
    )

    exit_code = await cli.reset_passphrase(account_name="Bob", passphrase="bobs-new-passphrase")
    assert exit_code == 0

    reloaded_a = await User.get(id=user_a.id)
    reloaded_b = await User.get(id=user_b.id)

    assert verify_passphrase("alice-old-passphrase", reloaded_a.passphrase_hash) is True
    assert verify_passphrase("bobs-new-passphrase", reloaded_b.passphrase_hash) is True


@pytest.mark.asyncio
@pytest.mark.integration
async def test_reset_passphrase_for_unknown_account_fails(client: AsyncClient) -> None:
    exit_code = await cli.reset_passphrase(account_name="Ghost", passphrase="some-passphrase-123")
    assert exit_code == 1


@pytest.mark.asyncio
@pytest.mark.integration
async def test_reset_passphrase_with_generate_replaces_hash(client: AsyncClient) -> None:
    user = await User.create(
        name="Admin",
        passphrase_hash=hash_passphrase("old-passphrase-123"),
    )

    exit_code = await cli.reset_passphrase(generate=True)
    assert exit_code == 0

    reloaded = await User.get(id=user.id)
    assert verify_passphrase("old-passphrase-123", reloaded.passphrase_hash) is False
