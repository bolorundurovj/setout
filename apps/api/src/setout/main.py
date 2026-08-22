"""FastAPI application factory and lifespan.

API routes live under /api. The built web app, when present, is served as
static files at /, so one container serves both with no configuration.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Any

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.staticfiles import StaticFiles

from setout import __version__
from setout.config import Settings, get_settings
from setout.db import apply_migrations, close_db, init_db
from setout.routers import (
    agreement,
    attachment,
    auth,
    counts,
    currency,
    delivery,
    expense,
    health,
    home,
    import_sheet,
    install,
    item,
    person,
    project,
    scope,
    search,
    vendor,
)

logger = logging.getLogger("setout")


def _install_openapi(app: FastAPI) -> Callable[[], dict[str, Any]]:
    """Return a custom OpenAPI builder.

    FastAPI answers 400 when a request body is not valid JSON, and 422 when a
    valid body fails validation. The generated schema documents only 422, so we
    add 400 to every operation that accepts a body. This keeps the published
    schema honest, which the contract tests enforce.
    """

    def openapi() -> dict[str, Any]:
        if app.openapi_schema:
            return app.openapi_schema
        schema = get_openapi(title=app.title, version=app.version, routes=app.routes)
        for path_item in schema.get("paths", {}).values():
            for operation in path_item.values():
                if not isinstance(operation, dict) or "requestBody" not in operation:
                    continue
                responses = operation.setdefault("responses", {})
                responses.setdefault(
                    "400",
                    {"description": "Bad Request: the body could not be parsed"},
                )
        app.openapi_schema = schema
        return schema

    return openapi


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    logging.basicConfig(level=settings.log_level.upper())
    # Apply migrations first; the migration API manages its own connection.
    status = await apply_migrations()
    logger.info("Database status on start: %s", status)
    # Open the connection the app serves requests with.
    await init_db(enable_global_fallback=True)

    try:
        yield
    finally:
        await close_db()


def create_app() -> FastAPI:
    settings = get_settings()
    if settings.secret_key == Settings.model_fields["secret_key"].default:
        logger.warning(
            "SETOUT_SECRET_KEY is still the default, so anyone can forge a session. "
            "Set it to a long random value."
        )

    app = FastAPI(
        title="Setout API",
        version=__version__,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Health lives at the root so orchestrators can reach it plainly.
    app.include_router(health.router)

    api = APIRouter(prefix="/api")
    api.include_router(auth.router)
    api.include_router(currency.router)
    api.include_router(counts.router)
    api.include_router(install.router)
    api.include_router(project.router)
    api.include_router(scope.router)
    api.include_router(expense.router)
    api.include_router(item.router)
    api.include_router(vendor.router)
    api.include_router(person.router)
    api.include_router(agreement.router)
    api.include_router(delivery.router)
    api.include_router(import_sheet.router)
    api.include_router(attachment.router)
    api.include_router(search.router)
    api.include_router(home.router)
    app.include_router(api)

    app.openapi = _install_openapi(app)  # type: ignore[method-assign]

    # Serve the built web app when it is present in the image.
    if settings.static_dir and settings.static_dir.is_dir():
        app.mount(
            "/",
            StaticFiles(directory=settings.static_dir, html=True),
            name="web",
        )

    return app


app = create_app()
