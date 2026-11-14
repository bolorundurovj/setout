from __future__ import annotations

import pytest
from fastapi.routing import APIRoute
from httpx import AsyncClient

from setout.config import get_settings
from setout.main import create_app
from setout.routers.auth import router as auth_router

pytestmark = pytest.mark.contract


@pytest.mark.parametrize(
    "path,method,operation,statuses",
    [
        ("/api/auth/setup", "post", "setupAdmin", {"200", "409", "422"}),
        ("/api/auth/sign-in", "post", "signIn", {"200", "401", "429", "422"}),
        ("/api/auth/me", "patch", "updateAccount", {"200", "401", "422"}),
        ("/api/auth/passphrase", "post", "changePassphrase", {"204", "401", "403", "422"}),
    ],
)
def test_authentication_operations_preserve_response_contract(path, method, operation, statuses):
    endpoint = create_app().openapi()["paths"][path][method]
    assert endpoint["operationId"] == operation
    assert statuses <= endpoint["responses"].keys()


@pytest.mark.parametrize("path", ["/setup", "/passphrase"])
def test_authentication_transactions_finish_before_responses(path: str) -> None:
    route = next(
        route
        for route in auth_router.routes
        if isinstance(route, APIRoute) and route.path == f"/auth{path}"
    )

    assert route.dependencies
    assert all(dependency.scope == "function" for dependency in route.dependencies)


async def test_null_name_returns_documented_validation_status(client: AsyncClient) -> None:
    setup = await client.post(
        "/api/auth/setup", json={"name": "Admin", "passphrase": "password123"}
    )
    assert setup.status_code == 200
    response = await client.patch("/api/auth/me", json={"name": None})
    endpoint = create_app().openapi()["paths"]["/api/auth/me"]["patch"]
    assert str(response.status_code) in endpoint["responses"]
    assert response.status_code == 422
    assert response.json() == {"detail": "Account name cannot be null"}


async def test_setup_conflict_and_sign_in_throttle_match_documented_contract(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "sign_in_max_attempts", 2)
    monkeypatch.setattr(settings, "sign_in_delay_seconds", 0)
    body = {"name": "Admin", "passphrase": "password123"}
    setup = await client.post("/api/auth/setup", json=body)
    assert setup.status_code == 200
    cookie = setup.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    conflict = await client.post("/api/auth/setup", json=body)
    assert conflict.status_code == 409
    assert conflict.json() == {"detail": "This server is already set up"}
    for _ in range(2):
        response = await client.post("/api/auth/sign-in", json={"passphrase": "wrong"})
        assert response.status_code == 401
    response = await client.post("/api/auth/sign-in", json={"passphrase": "password123"})
    assert response.status_code == 429
    assert response.headers["retry-after"] == str(settings.sign_in_retry_after_seconds)
    assert response.json() == {"detail": "Too many failed sign-in attempts. Try again later"}
