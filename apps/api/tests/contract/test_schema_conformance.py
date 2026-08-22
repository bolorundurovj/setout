"""Contract test: the API must match its published OpenAPI schema.

We use schemathesis to property test every endpoint against the schema, so no
response can drift from what it promises. schemathesis has no lifespan support,
and Tortoise 1.x binds connections to an event loop, so we run the app in a
real uvicorn server on an ephemeral port and point schemathesis at its URL. The
server owns its loop and runs the lifespan, so migrations apply and the
database is initialised exactly as in production.
"""

from __future__ import annotations

import socket
import threading
import time
from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest
import schemathesis
import uvicorn
from hypothesis import HealthCheck, settings

from setout import db as db_module
from setout.config import get_settings
from setout.main import create_app

pytestmark = pytest.mark.contract


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _wait_until_ready(base_url: str, timeout: float = 30.0) -> None:
    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            response = httpx.get(f"{base_url}/healthz", timeout=1.0)
            if response.status_code == 200:
                return
        except httpx.HTTPError as exc:
            last_error = exc
        time.sleep(0.1)
    raise RuntimeError(f"Server did not become ready: {last_error}")


@pytest.fixture
def app_schema(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Iterator[schemathesis.BaseSchema]:
    db_file = tmp_path / "contract.sqlite3"
    monkeypatch.setenv("SETOUT_DATABASE_URL", f"sqlite://{db_file.as_posix()}")
    get_settings.cache_clear()
    monkeypatch.setattr(db_module, "TORTOISE_ORM", db_module.build_tortoise_config())

    port = _free_port()
    base_url = f"http://127.0.0.1:{port}"
    config = uvicorn.Config(create_app(), host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    try:
        _wait_until_ready(base_url)
        yield schemathesis.openapi.from_url(f"{base_url}/openapi.json")
    finally:
        server.should_exit = True
        thread.join(timeout=10)
        get_settings.cache_clear()


schema = schemathesis.pytest.from_fixture("app_schema")


@schema.parametrize()
@settings(
    max_examples=15,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.filter_too_much,
    ],
)
def test_api_conforms_to_schema(case: schemathesis.Case) -> None:
    case.call_and_validate()
