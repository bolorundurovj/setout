import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from setout.config import get_settings
from setout.models.currency import Currency
from setout.models.user import Session, User
from setout.services.auth import read_session_id, sign_session_id


@pytest.fixture(autouse=True)
def _disable_sign_in_delay(monkeypatch: pytest.MonkeyPatch) -> None:
    """Sets the sign-in delay to 0; the attempt limit is count-based and still applies."""
    monkeypatch.setenv("SETOUT_SIGN_IN_DELAY_SECONDS", "0")
    get_settings.cache_clear()


async def _setup(client: AsyncClient, passphrase: str = "password123") -> None:
    resp = await client.post("/api/auth/setup", json={"name": "Admin", "passphrase": passphrase})
    assert resp.status_code == 200, resp.text


async def _fail_sign_in(client: AsyncClient, times: int = 1) -> int:
    status = 0
    for _ in range(times):
        resp = await client.post("/api/auth/sign-in", json={"passphrase": "nope"})
        status = resp.status_code
    return status


@pytest.mark.asyncio
@pytest.mark.integration
async def test_setup_sign_out_and_sign_in(client: AsyncClient) -> None:
    resp = await client.get("/api/auth/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_setup"] is False
    assert data["is_authenticated"] is False

    resp = await client.post(
        "/api/auth/setup",
        json={"name": "Admin", "email": "admin@example.com", "passphrase": "password123"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Admin"
    assert data["email"] == "admin@example.com"
    assert "id" in data

    resp = await client.get("/api/auth/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_setup"] is True
    assert data["is_authenticated"] is True
    assert data["user"]["name"] == "Admin"

    resp = await client.post(
        "/api/auth/setup",
        json={"name": "Admin2", "passphrase": "password123"},
    )
    assert resp.status_code == 409

    resp = await client.post("/api/auth/sign-out")
    assert resp.status_code == 204

    resp = await client.get("/api/auth/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_setup"] is True
    assert data["is_authenticated"] is False

    resp = await client.post(
        "/api/auth/sign-in",
        json={"passphrase": "wrong"},
    )
    assert resp.status_code == 401

    resp = await client.post(
        "/api/auth/sign-in",
        json={"passphrase": "password123"},
    )
    assert resp.status_code == 200

    resp = await client.get("/api/auth/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_authenticated"] is True

    # The signed cookie is required; a raw session id is not enough.
    signed = client.cookies["setout_session"]
    session_id = read_session_id(signed)
    assert session_id is not None

    client.cookies.set("setout_session", session_id)
    resp = await client.get("/api/auth/status")
    assert resp.json()["is_authenticated"] is False

    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
@pytest.mark.integration
async def test_me_requires_authentication(client: AsyncClient) -> None:
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
@pytest.mark.integration
async def test_tampered_session_signature_is_rejected(client: AsyncClient) -> None:
    await client.post(
        "/api/auth/setup",
        json={"name": "Admin", "passphrase": "password123"},
    )

    client.cookies.set("setout_session", sign_session_id("not-a-real-session"))
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


def test_read_session_id_rejects_an_invalid_signature() -> None:
    assert read_session_id(sign_session_id("abc")) == "abc"
    assert read_session_id("abc.deadbeef") is None
    assert read_session_id("no-separator") is None
    assert read_session_id("") is None


def test_read_session_id_handles_a_non_ascii_cookie() -> None:
    # A non-ASCII cookie used to raise from hmac.compare_digest, which surfaced
    # as a 500 on every authenticated route.
    assert read_session_id("abc.déf") is None
    assert read_session_id("dé.dé") is None


@pytest.mark.asyncio
@pytest.mark.integration
async def test_setup_accepts_no_email(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/auth/setup",
        json={"name": "Admin", "passphrase": "password123"},
    )
    assert resp.status_code == 200
    assert resp.json()["email"] is None


@pytest.mark.asyncio
@pytest.mark.integration
async def test_setup_rejects_an_invalid_email(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/auth/setup",
        json={"name": "Admin", "email": "not-an-address", "passphrase": "password123"},
    )
    assert resp.status_code == 422


async def test_account_name_can_be_changed(client: AsyncClient) -> None:
    await client.post("/api/auth/setup", json={"name": "Admin", "passphrase": "password123"})

    resp = await client.patch("/api/auth/me", json={"name": "Vee"})

    assert resp.status_code == 200
    assert resp.json()["name"] == "Vee"
    assert (await client.get("/api/auth/me")).json()["name"] == "Vee"


async def test_account_update_requires_authentication(client: AsyncClient) -> None:
    assert (await client.patch("/api/auth/me", json={"name": "Vee"})).status_code == 401


async def test_changed_passphrase_replaces_the_old_one(
    client: AsyncClient,
) -> None:
    await client.post("/api/auth/setup", json={"name": "Admin", "passphrase": "password123"})

    resp = await client.post(
        "/api/auth/passphrase",
        json={"current_passphrase": "password123", "new_passphrase": "a longer secret"},
    )
    assert resp.status_code == 204

    await client.post("/api/auth/sign-out")
    old = await client.post("/api/auth/sign-in", json={"passphrase": "password123"})
    new = await client.post("/api/auth/sign-in", json={"passphrase": "a longer secret"})
    assert old.status_code == 401
    assert new.status_code == 200


async def test_incorrect_current_passphrase_is_rejected_and_changes_nothing(
    client: AsyncClient,
) -> None:
    await client.post("/api/auth/setup", json={"name": "Admin", "passphrase": "password123"})

    resp = await client.post(
        "/api/auth/passphrase",
        json={"current_passphrase": "not it", "new_passphrase": "a longer secret"},
    )

    assert resp.status_code == 403
    assert resp.json()["detail"] == "The current passphrase is incorrect"
    await client.post("/api/auth/sign-out")
    still = await client.post("/api/auth/sign-in", json={"passphrase": "password123"})
    assert still.status_code == 200


async def test_short_new_passphrase_is_rejected(client: AsyncClient) -> None:
    await client.post("/api/auth/setup", json={"name": "Admin", "passphrase": "password123"})

    resp = await client.post(
        "/api/auth/passphrase",
        json={"current_passphrase": "password123", "new_passphrase": "short"},
    )

    assert resp.status_code == 422


async def test_changing_the_passphrase_keeps_the_current_session(client: AsyncClient) -> None:
    await client.post("/api/auth/setup", json={"name": "Admin", "passphrase": "password123"})

    await client.post(
        "/api/auth/passphrase",
        json={"current_passphrase": "password123", "new_passphrase": "a longer secret"},
    )

    assert (await client.get("/api/auth/me")).status_code == 200


async def test_account_base_currency_can_be_set(client: AsyncClient) -> None:
    await Currency.create(code="NGN", name="Nigerian naira", exponent=2)
    await client.post("/api/auth/setup", json={"name": "Admin", "passphrase": "password123"})

    resp = await client.patch("/api/auth/me", json={"base_currency": "ngn"})

    assert resp.status_code == 200, resp.text
    assert resp.json()["base_currency"] == "NGN"


async def test_unknown_base_currency_is_rejected(client: AsyncClient) -> None:
    await client.post("/api/auth/setup", json={"name": "Admin", "passphrase": "password123"})

    resp = await client.patch("/api/auth/me", json={"base_currency": "ZZZ"})

    assert resp.status_code == 422
    assert "Unknown currency" in resp.text


@pytest.mark.asyncio
@pytest.mark.integration
async def test_sign_in_returns_429_after_max_attempts(
    client: AsyncClient,
) -> None:
    await _setup(client)
    settings = get_settings()

    assert await _fail_sign_in(client, settings.sign_in_max_attempts) == 401

    refused = await client.post("/api/auth/sign-in", json={"passphrase": "nope"})
    assert refused.status_code == 429
    assert refused.headers["Retry-After"] == str(settings.sign_in_retry_after_seconds)

    # The limit also blocks a correct passphrase.
    assert (
        await client.post("/api/auth/sign-in", json={"passphrase": "password123"})
    ).status_code == 429


@pytest.mark.asyncio
@pytest.mark.integration
async def test_sign_in_delay_doubles_per_failure(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _setup(client)
    monkeypatch.setenv("SETOUT_SIGN_IN_DELAY_SECONDS", "1")
    get_settings.cache_clear()

    waited: list[float] = []

    async def _capture_sleep(seconds: float) -> None:
        waited.append(seconds)

    monkeypatch.setattr(asyncio, "sleep", _capture_sleep)

    await _fail_sign_in(client, 6)
    assert waited == [1.0, 2.0, 4.0]


@pytest.mark.asyncio
@pytest.mark.integration
async def test_successful_sign_in_resets_failure_count(
    client: AsyncClient,
) -> None:
    await _setup(client)
    await _fail_sign_in(client, 4)
    assert (await User.first()).failed_sign_ins == 4

    assert (
        await client.post("/api/auth/sign-in", json={"passphrase": "password123"})
    ).status_code == 200

    user = await User.first()
    assert user is not None
    assert user.failed_sign_ins == 0
    assert user.last_failed_at is None


@pytest.mark.asyncio
@pytest.mark.integration
async def test_failure_count_resets_after_retry_window(client: AsyncClient) -> None:
    await _setup(client)
    await _fail_sign_in(client, get_settings().sign_in_max_attempts)
    assert await _fail_sign_in(client) == 429

    user = await User.first()
    assert user is not None
    user.last_failed_at = datetime.now(UTC) - timedelta(
        seconds=get_settings().sign_in_retry_after_seconds + 60
    )
    await user.save()

    assert await _fail_sign_in(client) == 401


@pytest.mark.asyncio
@pytest.mark.integration
async def test_expired_sessions_are_purged_on_sign_in(client: AsyncClient) -> None:
    await _setup(client)
    user = await User.first()
    assert user is not None
    await Session.create(id="stale", user=user, expires_at=datetime.now(UTC) - timedelta(days=1))

    await client.post("/api/auth/sign-in", json={"passphrase": "password123"})

    assert await Session.get_or_none(id="stale") is None


@pytest.mark.asyncio
@pytest.mark.integration
async def test_session_past_half_its_lifetime_is_extended(client: AsyncClient) -> None:
    await _setup(client)
    session = await Session.all().first()
    assert session is not None
    expires_soon = datetime.now(UTC) + timedelta(days=2)
    session.expires_at = expires_soon
    await session.save()

    resp = await client.get("/api/auth/me")
    assert resp.status_code == 200
    assert "setout_session" in resp.headers.get("set-cookie", "")

    again = await Session.get(id=session.id)
    assert again.expires_at > expires_soon


@pytest.mark.asyncio
@pytest.mark.integration
async def test_fresh_session_is_not_extended(client: AsyncClient) -> None:
    await _setup(client)
    session = await Session.all().first()
    assert session is not None
    before = session.expires_at

    resp = await client.get("/api/auth/me")
    assert resp.status_code == 200
    assert "set-cookie" not in resp.headers

    assert (await Session.get(id=session.id)).expires_at == before
