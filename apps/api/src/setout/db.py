"""Database configuration and lifecycle.

TORTOISE_ORM is the single source of truth for both the running app and the
built-in Tortoise migration CLI, which reads it through [tool.tortoise] in
pyproject.toml.
"""

from __future__ import annotations

import logging

from tortoise import Tortoise

from setout.config import get_settings

logger = logging.getLogger("setout.db")

# Models are listed here so both the app and the migration CLI see them.
MODEL_MODULES = ["setout.models"]


def build_tortoise_config() -> dict[str, object]:
    settings = get_settings()
    return {
        "connections": {"default": settings.resolved_database_url()},
        "apps": {
            "models": {
                "models": MODEL_MODULES,
                "default_connection": "default",
                "migrations": "setout.migrations",
            }
        },
        "use_tz": True,
    }


# The CLI imports this name via [tool.tortoise] tortoise_orm.
TORTOISE_ORM = build_tortoise_config()


async def apply_migrations() -> str:
    """Apply pending migrations on start.

    Uses the built-in Tortoise migration API. Returns a short status string and
    reports clearly when the database is behind. Must run before init_db, since
    the migration API manages its own connection.
    """
    from tortoise.migrations.api import migrate as run_migrate
    from tortoise.migrations.api import plan as migration_plan

    try:
        plan_lines = await migration_plan(config=TORTOISE_ORM)
    except Exception as exc:  # noqa: BLE001
        # No migration files yet. Create the schema directly as a fallback.
        logger.warning("Could not read migration plan (%s); generating schema", exc)
        await close_db()
        await init_db(generate_schemas=True)
        await close_db()
        return "schema-generated"
    finally:
        # The migration API opens its own connection; close it so the app and
        # any later step start from a clean state. SQLite otherwise deadlocks.
        await close_db()

    # plan output is a header line per connection plus one line per step.
    steps = [line for line in plan_lines if line.startswith(("+", "-"))]
    if not steps:
        return "up-to-date"

    logger.warning("Database is behind: applying %d migration(s)", len(steps))
    try:
        await run_migrate(config=TORTOISE_ORM)
    finally:
        await close_db()
    return f"migrated ({len(steps)} step(s))"


async def init_db(*, generate_schemas: bool = False, enable_global_fallback: bool = False) -> None:
    # Under FastAPI the lifespan runs in a different task than requests, so the
    # per-task context is invisible to handlers. The global fallback bridges
    # that gap; close_connections clears it, so repeated starts stay clean.
    await Tortoise.init(config=TORTOISE_ORM, _enable_global_fallback=enable_global_fallback)
    if generate_schemas:
        await Tortoise.generate_schemas(safe=True)


async def close_db() -> None:
    await Tortoise.close_connections()


async def db_status() -> str:
    """Report whether the default connection answers a trivial query."""
    try:
        conn = Tortoise.get_connection("default")
        await conn.execute_query("SELECT 1")
        return "ok"
    except Exception as exc:  # noqa: BLE001
        logger.error("Database check failed: %s", exc)
        return "error"
