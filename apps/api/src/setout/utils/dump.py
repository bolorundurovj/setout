from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from tortoise import Tortoise

# Parents before children, so a restore can insert straight down the list and
# reverse it to clear the way first.
TABLES: tuple[str, ...] = (
    "currency",
    "country",
    "state",
    "scope_preset",
    "user",
    "land",
    "project",
    "scope",
    "budget_item",
    "item",
    "vendor",
    "person",
    "agreement",
    "expense",
    "advance",
    "delivery",
    "attachment",
    "land_document",
)

# Sessions are not carried: they belong to the browsers that were signed in when
# the copy was written, not to the record.
SKIPPED: tuple[str, ...] = ("session", "tortoise_migrations")

FORMAT = 1


def plain(value: Any) -> Any:
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace")
    return value


async def applied_migration() -> str | None:
    conn = Tortoise.get_connection("default")
    try:
        rows = await conn.execute_query_dict(
            "SELECT name FROM tortoise_migrations ORDER BY id DESC LIMIT 1"
        )
    except Exception:  # noqa: BLE001
        return None
    return str(rows[0]["name"]) if rows else None


async def read_all() -> dict[str, list[dict[str, Any]]]:
    conn = Tortoise.get_connection("default")
    tables: dict[str, list[dict[str, Any]]] = {}
    for table in TABLES:
        rows = await conn.execute_query_dict(f'SELECT * FROM "{table}"')
        tables[table] = [{key: plain(value) for key, value in row.items()} for row in rows]
    return tables


def columns_of(table: str) -> set[str]:
    for model in Tortoise.apps.get_models_iterable():
        if model._meta.db_table == table:
            return set(model._meta.fields_db_projection.values())
    return set()


async def write_all(tables: dict[str, list[dict[str, Any]]]) -> dict[str, int]:
    """Replace every row in the record with the rows given. Call in a transaction."""
    conn = Tortoise.get_connection("default")
    for table in reversed(TABLES + SKIPPED[:1]):
        await conn.execute_query(f'DELETE FROM "{table}"')

    written: dict[str, int] = {}
    for table in TABLES:
        rows = tables.get(table) or []
        written[table] = len(rows)
        known = columns_of(table)
        for row in rows:
            columns = list(row.keys())
            strange = [column for column in columns if column not in known]
            if strange:
                raise ValueError(f"{table} has no column {strange[0]}")
            marks = ", ".join("?" for _ in columns)
            names = ", ".join(f'"{column}"' for column in columns)
            await conn.execute_query(
                f'INSERT INTO "{table}" ({names}) VALUES ({marks})',
                [row[column] for column in columns],
            )
    return written
