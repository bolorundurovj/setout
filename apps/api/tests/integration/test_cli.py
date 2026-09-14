"""Integration tests for the setout CLI passphrase recovery."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from httpx import AsyncClient

from setout import cli
from setout.models.user import Session, User
from setout.services.auth import hash_password, verify_password


@pytest.mark.asyncio
@pytest.mark.integration
async def test_reset_passphrase_updates_hash_and_clears_failures(client: AsyncClient) -> None:
    now = datetime.now(UTC)
    user = await User.create(
        name="Admin",
        password_hash=hash_password("old-passphrase-123"),
        failed_logins=4,
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
    assert verify_password("brand-new-passphrase", reloaded.password_hash) is True
    assert verify_password("old-passphrase-123", reloaded.password_hash) is False
    assert reloaded.failed_logins == 0
    assert reloaded.last_failed_at is None

    sessions_left = await Session.filter(user_id=user.id).count()
    assert sessions_left == 0


@pytest.mark.asyncio
@pytest.mark.integration
async def test_reset_passphrase_via_file_consumes_and_deletes(
    client: AsyncClient, tmp_path: Path
) -> None:
    user = await User.create(
        name="Admin",
        password_hash=hash_password("old-passphrase-123"),
    )
    rec_file = tmp_path / "reset-passphrase.txt"
    rec_file.write_text("file-provided-passphrase\n", encoding="utf-8")

    exit_code = await cli.reset_passphrase(file_path=rec_file)
    assert exit_code == 0

    reloaded = await User.get(id=user.id)
    assert verify_password("file-provided-passphrase", reloaded.password_hash) is True
    # The file must be consumed and removed so credentials do not linger on disk
    assert not rec_file.exists()


@pytest.mark.asyncio
@pytest.mark.integration
async def test_consume_recovery_file_on_startup(client: AsyncClient, tmp_path: Path) -> None:
    user = await User.create(
        name="Admin",
        password_hash=hash_password("old-passphrase-123"),
    )
    rec_file = tmp_path / "reset-passphrase.txt"
    rec_file.write_text("startup-consumed-passphrase\n", encoding="utf-8")

    consumed = await cli.consume_recovery_file(rec_file)
    assert consumed is True

    reloaded = await User.get(id=user.id)
    assert verify_password("startup-consumed-passphrase", reloaded.password_hash) is True
    assert not rec_file.exists()


@pytest.mark.asyncio
@pytest.mark.integration
async def test_reset_passphrase_specific_user(client: AsyncClient) -> None:
    user_a = await User.create(
        name="Alice",
        password_hash=hash_password("alice-old-passphrase"),
    )
    user_b = await User.create(
        name="Bob",
        password_hash=hash_password("bob-old-passphrase"),
    )

    exit_code = await cli.reset_passphrase(username="Bob", passphrase="bobs-new-passphrase")
    assert exit_code == 0

    reloaded_a = await User.get(id=user_a.id)
    reloaded_b = await User.get(id=user_b.id)

    assert verify_password("alice-old-passphrase", reloaded_a.password_hash) is True
    assert verify_password("bobs-new-passphrase", reloaded_b.password_hash) is True


@pytest.mark.asyncio
@pytest.mark.integration
async def test_reset_passphrase_user_not_found(client: AsyncClient) -> None:
    exit_code = await cli.reset_passphrase(username="Ghost", passphrase="some-passphrase-123")
    assert exit_code == 1


@pytest.mark.asyncio
@pytest.mark.integration
async def test_reset_passphrase_generate(client: AsyncClient) -> None:
    user = await User.create(
        name="Admin",
        password_hash=hash_password("old-passphrase-123"),
    )

    exit_code = await cli.reset_passphrase(generate=True)
    assert exit_code == 0

    reloaded = await User.get(id=user.id)
    assert verify_password("old-passphrase-123", reloaded.password_hash) is False
