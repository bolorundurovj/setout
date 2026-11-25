"""API routes are under /api. The built web app, when present, is served as static files at /."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Any

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response
from starlette.types import ASGIApp, Receive, Scope, Send

from setout import __version__
from setout.cli import consume_recovery_file
from setout.config import Settings, get_settings
from setout.db import apply_migrations, close_db, init_db
from setout.routers import (
    agreement,
    attachment,
    auth,
    category,
    change,
    country,
    counts,
    currency,
    delivery,
    expense,
    geocode,
    health,
    home,
    import_sheet,
    install,
    item,
    land,
    map,
    person,
    project,
    report,
    search,
    vendor,
)
from setout.services import changes
from setout.services.storage import S3Storage, auto_migrate_legacy_storage, get_storage
from setout.utils.body_limit import BodyLimit
from setout.utils.security_headers import SecurityHeaders

logger = logging.getLogger("setout")

SERVER_PREFIXES = ("api", "docs", "redoc", "openapi.json", "healthz")


class ResetActorMiddleware:
    """Resets the change-log actor ContextVar after every request."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        token = changes.actor.set(None)
        try:
            await self.app(scope, receive, send)
        finally:
            changes.actor.reset(token)


def configure_logging(level_name: str) -> None:
    """Apply SETOUT_LOG_LEVEL to Setout and Uvicorn loggers."""
    level = getattr(logging, level_name.upper(), logging.INFO)
    if not isinstance(level, int):
        level = logging.INFO
    logging.basicConfig(level=level)
    for name in ("setout", "uvicorn", "uvicorn.error", "uvicorn.access"):
        logging.getLogger(name).setLevel(level)


def warn_if_default_secret(settings: Settings) -> None:
    if settings.secret_key == Settings.model_fields["secret_key"].default:
        logger.warning(
            "SETOUT_SECRET_KEY is still the default, so anyone can forge a session. "
            "Set it to a long random value."
        )


class SPAStaticFiles(StaticFiles):
    """Serves index.html for unknown paths, so client-side routes such as /people/new
    load on refresh or direct link. Server paths keep their 404.
    """

    async def get_response(self, path: str, scope: Scope) -> Response:
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code != 404 or self._is_server_path(scope):
                raise
            return await super().get_response("index.html", scope)

    @staticmethod
    def _is_server_path(scope: Scope) -> bool:
        head = str(scope.get("path", "")).lstrip("/").split("/")[0]
        return head in SERVER_PREFIXES


def _install_openapi(app: FastAPI) -> Callable[[], dict[str, Any]]:
    """FastAPI returns 400 for an unparseable body and 422 for a failed validation, but
    the generated schema lists only 422. Adds 400 to every operation with a body, as
    the contract tests require.
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
    configure_logging(settings.log_level)
    warn_if_default_secret(settings)
    status = await apply_migrations()
    logger.info("Database status on start: %s", status)
    await init_db(enable_global_fallback=True)
    await consume_recovery_file()

    storage = get_storage()
    if isinstance(storage, S3Storage) and settings.s3_auto_create_bucket:
        try:
            await storage.ensure_bucket()
        except Exception as e:
            logger.warning("Could not auto-create S3 bucket %s: %s", storage.bucket, e)

    try:
        await auto_migrate_legacy_storage(storage, settings)
    except Exception as e:
        logger.warning("Storage migration encountered an error: %s", e)

    try:
        yield
    finally:
        await close_db()


def create_app() -> FastAPI:
    changes.register()
    settings = get_settings()
    configure_logging(settings.log_level)
    warn_if_default_secret(settings)

    app = FastAPI(
        title="Setout API",
        version=__version__,
        lifespan=lifespan,
    )

    app.add_middleware(ResetActorMiddleware)
    app.add_middleware(
        BodyLimit,
        path="/api/install/restore",
        limit=lambda: get_settings().max_restore_bytes,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.add_middleware(SecurityHeaders, static_dir=settings.static_dir)

    # Health is at the root, outside /api, for orchestrator probes.
    app.include_router(health.router)

    api = APIRouter(prefix="/api")
    api.include_router(auth.router)
    api.include_router(currency.router)
    api.include_router(country.router)
    api.include_router(counts.router)
    api.include_router(install.router)
    api.include_router(project.router)
    api.include_router(category.router)
    api.include_router(change.router)
    api.include_router(expense.router)
    api.include_router(item.router)
    api.include_router(land.router)
    api.include_router(map.router)
    api.include_router(geocode.router)
    api.include_router(vendor.router)
    api.include_router(person.router)
    api.include_router(agreement.router)
    api.include_router(delivery.router)
    api.include_router(import_sheet.router)
    api.include_router(report.router)
    api.include_router(attachment.router)
    api.include_router(search.router)
    api.include_router(home.router)
    app.include_router(api)

    app.openapi = _install_openapi(app)  # type: ignore[method-assign]

    if settings.static_dir and settings.static_dir.is_dir():
        app.mount(
            "/",
            SPAStaticFiles(directory=settings.static_dir, html=True),
            name="web",
        )

    return app


app = create_app()
