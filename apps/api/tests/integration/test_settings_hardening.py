"""Tests for settings validation, logging configuration, cookie deletion and actor reset."""

from __future__ import annotations

import logging

import pytest
from httpx import AsyncClient
from pydantic import ValidationError

from setout.config import Settings, StorageBackend
from setout.main import configure_logging, warn_if_default_secret
from setout.services import changes


@pytest.mark.unit
def test_wildcard_cors_with_credentials_is_rejected() -> None:
    with pytest.raises(ValidationError, match="SETOUT_CORS_ORIGINS"):
        Settings(cors_origins="*")
    with pytest.raises(ValidationError, match="SETOUT_CORS_ORIGINS"):
        Settings(cors_origins="https://app.example, *")


@pytest.mark.unit
def test_storage_backend_is_a_validated_enum() -> None:
    assert Settings(storage_backend="local").storage_backend is StorageBackend.LOCAL
    assert Settings(storage_backend="s3").storage_backend is StorageBackend.S3
    with pytest.raises(ValidationError):
        Settings(storage_backend="s4")  # type: ignore[arg-type]


@pytest.mark.unit
def test_configure_logging_sets_setout_and_uvicorn_levels() -> None:
    configure_logging("warning")
    for name in ("setout", "uvicorn", "uvicorn.error", "uvicorn.access"):
        assert logging.getLogger(name).level == logging.WARNING
    configure_logging("info")


@pytest.mark.unit
def test_default_secret_warning_is_logged(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.WARNING, logger="setout"):
        warn_if_default_secret(Settings())
    assert any("SETOUT_SECRET_KEY" in record.getMessage() for record in caplog.records)


@pytest.mark.asyncio
@pytest.mark.integration
async def test_sign_out_cookie_attributes_and_actor_reset(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    setup = await client.post(
        "/api/auth/setup", json={"name": "Admin", "passphrase": "password123"}
    )
    assert setup.status_code == 200
    assert changes.actor.get() is None

    me = await client.get("/api/auth/me")
    assert me.status_code == 200
    # Middleware must reset changes.actor back to None after the request finishes.
    assert changes.actor.get() is None

    monkeypatch.setenv("SETOUT_COOKIE_SECURE", "true")
    from setout.config import get_settings

    get_settings.cache_clear()
    out = await client.post("/api/auth/sign-out")
    assert out.status_code == 204
    set_cookie = out.headers.get("set-cookie", "").lower()
    assert "setout_session=" in set_cookie
    assert "httponly" in set_cookie
    assert "samesite=lax" in set_cookie
    assert "secure" in set_cookie
