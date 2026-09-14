import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from setout.config import get_settings
from setout.models.currency import Currency
from setout.models.user import Session, User
from setout.services.auth import read_session_id, sign_session_id


@pytest.fixture(autouse=True)
def _no_waiting(monkeypatch: pytest.MonkeyPatch) -> None:
    """No waiting, so the suite stays quick. The ceiling is a count, not a duration."""
    monkeypatch.setenv("SETOUT_LOGIN_DELAY_SECONDS", "0")
    get_settings.cache_clear()


async def _setup(client: AsyncClient, password: str = "password123") -> None:
    resp = await client.post("/api/auth/setup", json={"name": "Admin", "password": password})
    assert resp.status_code == 200, resp.text


async def _wrong(client: AsyncClient, times: int = 1) -> int:
    status = 0
    for _ in range(times):
        resp = await client.post("/api/auth/login", json={"password": "nope"})
        status = resp.status_code
    return status


@pytest.mark.asyncio
@pytest.mark.integration
async def test_auth_flow(client: AsyncClient) -> None:
    # 1. Initially status should be not setup
    resp = await client.get("/api/auth/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_setup"] is False
    assert data["is_authenticated"] is False

    # 2. Setup the admin
    resp = await client.post(
        "/api/auth/setup",
        json={"name": "Admin", "email": "admin@example.com", "password": "password123"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Admin"
    assert data["email"] == "admin@example.com"
    assert "id" in data

    # 3. Status should now be setup and authenticated (cookie set)
    resp = await client.get("/api/auth/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_setup"] is True
    assert data["is_authenticated"] is True
    assert data["user"]["name"] == "Admin"

    # 4. Attempting to setup again should fail
    resp = await client.post(
        "/api/auth/setup",
        json={"name": "Admin2", "password": "password123"},
    )
    assert resp.status_code == 409

    # 5. Logout
    resp = await client.post("/api/auth/logout")
    assert resp.status_code == 204

    # 6. Status should now be setup but NOT authenticated
    resp = await client.get("/api/auth/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_setup"] is True
    assert data["is_authenticated"] is False

    # 7. Login with bad password
    resp = await client.post(
        "/api/auth/login",
        json={"password": "wrong"},
    )
    assert resp.status_code == 401

    # 8. Login successfully
    resp = await client.post(
        "/api/auth/login",
        json={"password": "password123"},
    )
    assert resp.status_code == 200

    # 9. Verify authentication
    resp = await client.get("/api/auth/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_authenticated"] is True

    # 10. The signed cookie is required; a raw session id is not enough
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
async def test_a_tampered_signature_is_rejected(client: AsyncClient) -> None:
    await client.post(
        "/api/auth/setup",
        json={"name": "Admin", "password": "password123"},
    )

    client.cookies.set("setout_session", sign_session_id("not-a-real-session"))
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


def test_read_session_id_rejects_a_bad_signature() -> None:
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
        json={"name": "Admin", "password": "password123"},
    )
    assert resp.status_code == 200
    assert resp.json()["email"] is None


@pytest.mark.asyncio
@pytest.mark.integration
async def test_setup_rejects_an_invalid_email(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/auth/setup",
        json={"name": "Admin", "email": "not-an-address", "password": "password123"},
    )
    assert resp.status_code == 422


async def test_the_account_name_can_be_changed(client: AsyncClient) -> None:
    await client.post("/api/auth/setup", json={"name": "Admin", "password": "password123"})

    resp = await client.patch("/api/auth/me", json={"name": "Vee"})

    assert resp.status_code == 200
    assert resp.json()["name"] == "Vee"
    assert (await client.get("/api/auth/me")).json()["name"] == "Vee"


async def test_changing_the_account_needs_a_session(client: AsyncClient) -> None:
    assert (await client.patch("/api/auth/me", json={"name": "Vee"})).status_code == 401


async def test_the_passphrase_can_be_changed_and_is_then_the_one_that_works(
    client: AsyncClient,
) -> None:
    await client.post("/api/auth/setup", json={"name": "Admin", "password": "password123"})

    resp = await client.post(
        "/api/auth/password",
        json={"current_password": "password123", "new_password": "a longer secret"},
    )
    assert resp.status_code == 204

    await client.post("/api/auth/logout")
    old = await client.post("/api/auth/login", json={"password": "password123"})
    new = await client.post("/api/auth/login", json={"password": "a longer secret"})
    assert old.status_code == 401
    assert new.status_code == 200


async def test_the_wrong_current_passphrase_changes_nothing(client: AsyncClient) -> None:
    await client.post("/api/auth/setup", json={"name": "Admin", "password": "password123"})

    resp = await client.post(
        "/api/auth/password",
        json={"current_password": "not it", "new_password": "a longer secret"},
    )

    assert resp.status_code == 403
    assert resp.json()["detail"] == "That is not the current passphrase"
    await client.post("/api/auth/logout")
    still = await client.post("/api/auth/login", json={"password": "password123"})
    assert still.status_code == 200


async def test_a_short_new_passphrase_is_refused(client: AsyncClient) -> None:
    await client.post("/api/auth/setup", json={"name": "Admin", "password": "password123"})

    resp = await client.post(
        "/api/auth/password",
        json={"current_password": "password123", "new_password": "short"},
    )

    assert resp.status_code == 422


async def test_changing_the_passphrase_keeps_this_device_signed_in(client: AsyncClient) -> None:
    await client.post("/api/auth/setup", json={"name": "Admin", "password": "password123"})

    await client.post(
        "/api/auth/password",
        json={"current_password": "password123", "new_password": "a longer secret"},
    )

    assert (await client.get("/api/auth/me")).status_code == 200


async def test_the_account_can_choose_which_currency_home_opens_on(client: AsyncClient) -> None:
    await Currency.create(code="NGN", name="Nigerian naira", exponent=2)
    await client.post("/api/auth/setup", json={"name": "Admin", "password": "password123"})

    resp = await client.patch("/api/auth/me", json={"base_currency": "ngn"})

    assert resp.status_code == 200, resp.text
    assert resp.json()["base_currency"] == "NGN"


async def test_it_refuses_a_base_currency_it_does_not_know(client: AsyncClient) -> None:
    await client.post("/api/auth/setup", json={"name": "Admin", "password": "password123"})

    resp = await client.patch("/api/auth/me", json={"base_currency": "ZZZ"})

    assert resp.status_code == 422
    assert "Unknown currency" in resp.text


@pytest.mark.asyncio
@pytest.mark.integration
async def test_a_burst_of_wrong_passphrases_is_refused_rather_than_answered(
    client: AsyncClient,
) -> None:
    await _setup(client)
    settings = get_settings()

    assert await _wrong(client, settings.login_max_attempts) == 401

    refused = await client.post("/api/auth/login", json={"password": "nope"})
    assert refused.status_code == 429
    assert refused.headers["Retry-After"] == str(settings.login_retry_after_seconds)

    # The ceiling applies to the right passphrase too.
    assert (
        await client.post("/api/auth/login", json={"password": "password123"})
    ).status_code == 429


@pytest.mark.asyncio
@pytest.mark.integration
async def test_the_wait_doubles_before_the_refusal_arrives(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _setup(client)
    monkeypatch.setenv("SETOUT_LOGIN_DELAY_SECONDS", "1")
    get_settings.cache_clear()

    waited: list[float] = []

    async def _record(seconds: float) -> None:
        waited.append(seconds)

    monkeypatch.setattr(asyncio, "sleep", _record)

    await _wrong(client, 6)
    assert waited == [1.0, 2.0, 4.0]


@pytest.mark.asyncio
@pytest.mark.integration
async def test_the_right_passphrase_clears_what_the_wrong_ones_counted(
    client: AsyncClient,
) -> None:
    await _setup(client)
    await _wrong(client, 4)
    assert (await User.first()).failed_logins == 4

    assert (
        await client.post("/api/auth/login", json={"password": "password123"})
    ).status_code == 200

    user = await User.first()
    assert user is not None
    assert user.failed_logins == 0
    assert user.last_failed_at is None


@pytest.mark.asyncio
@pytest.mark.integration
async def test_failures_are_forgotten_once_the_window_has_passed(client: AsyncClient) -> None:
    await _setup(client)
    await _wrong(client, get_settings().login_max_attempts)
    assert await _wrong(client) == 429

    user = await User.first()
    assert user is not None
    user.last_failed_at = datetime.now(UTC) - timedelta(
        seconds=get_settings().login_retry_after_seconds + 60
    )
    await user.save()

    assert await _wrong(client) == 401


@pytest.mark.asyncio
@pytest.mark.integration
async def test_an_expired_session_is_swept_when_somebody_signs_in(client: AsyncClient) -> None:
    await _setup(client)
    user = await User.first()
    assert user is not None
    await Session.create(id="stale", user=user, expires_at=datetime.now(UTC) - timedelta(days=1))

    await client.post("/api/auth/login", json={"password": "password123"})

    assert await Session.get_or_none(id="stale") is None


@pytest.mark.asyncio
@pytest.mark.integration
async def test_a_session_past_half_its_window_is_pushed_out(client: AsyncClient) -> None:
    await _setup(client)
    session = await Session.all().first()
    assert session is not None
    nearly_gone = datetime.now(UTC) + timedelta(days=2)
    session.expires_at = nearly_gone
    await session.save()

    resp = await client.get("/api/auth/me")
    assert resp.status_code == 200
    assert "setout_session" in resp.headers.get("set-cookie", "")

    again = await Session.get(id=session.id)
    assert again.expires_at > nearly_gone


@pytest.mark.asyncio
@pytest.mark.integration
async def test_a_fresh_session_is_left_where_it_is(client: AsyncClient) -> None:
    await _setup(client)
    session = await Session.all().first()
    assert session is not None
    before = session.expires_at

    resp = await client.get("/api/auth/me")
    assert resp.status_code == 200
    assert "set-cookie" not in resp.headers

    assert (await Session.get(id=session.id)).expires_at == before
