import pytest
from httpx import AsyncClient

from setout.models.currency import Currency
from setout.services.auth import read_session_id, sign_session_id


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
