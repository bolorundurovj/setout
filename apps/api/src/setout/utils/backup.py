from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from tortoise import Tortoise

# Parents before children: a restore inserts in this order and deletes in reverse.
TABLES: tuple[str, ...] = (
    "currency",
    "country",
    "state",
    "category_preset",
    "user",
    "change",
    "land",
    "project",
    "category",
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
    "land_valuation",
)

# Sessions are excluded: they belong to the browsers signed in at export time.
EXCLUDED_TABLES: tuple[str, ...] = ("session", "tortoise_migrations")

FORMAT = 3

Rows = dict[str, list[dict[str, Any]]]


@dataclass(frozen=True)
class Renames:
    """What changed between one backup format and the next. "*" in columns means every table."""

    tables: dict[str, str] = field(default_factory=dict)
    columns: dict[str, dict[str, str]] = field(default_factory=dict)
    values: dict[tuple[str, str], dict[Any, Any]] = field(default_factory=dict)


# Keyed by the format each entry upgrades to.
UPGRADES: dict[int, Renames] = {
    2: Renames(
        tables={"scope": "category", "scope_preset": "category_preset"},
        columns={
            "budget_item": {"scope_id": "category_id", "planned_amount": "budgeted_amount"},
            "expense": {"scope_id": "category_id"},
        },
    ),
    3: Renames(
        columns={
            "*": {"deleted_at": "archived_at"},
            "delivery": {"promised": "expected"},
            "user": {"password_hash": "passphrase_hash", "failed_logins": "failed_sign_ins"},
            "land_document": {"note": "notes"},
            "land_valuation": {"note": "notes"},
        },
        values={("project", "status"): {"archived": "closed"}},
    ),
}


def _upgrade(tables: Rows, renames: Renames) -> Rows:
    renamed = {renames.tables.get(name, name): rows for name, rows in tables.items()}
    for table, rows in renamed.items():
        columns = {**renames.columns.get("*", {}), **renames.columns.get(table, {})}
        for row in rows:
            for old, new in columns.items():
                if old in row:
                    row[new] = row.pop(old)
    for (table, column), values in renames.values.items():
        for row in renamed.get(table, []):
            if row.get(column) in values:
                row[column] = values[row[column]]
    return renamed


def forward(tables: Rows, format: int) -> Rows:
    """Rename tables, columns and values in an older backup to their current names."""
    for target in range(format + 1, FORMAT + 1):
        tables = _upgrade(tables, UPGRADES[target])
    return tables


def to_json_value(value: Any) -> Any:
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
        tables[table] = [{key: to_json_value(value) for key, value in row.items()} for row in rows]
    return tables


def columns_of(table: str) -> set[str]:
    for model in Tortoise.apps.get_models_iterable():
        if model._meta.db_table == table:
            return set(model._meta.fields_db_projection.values())
    return set()


async def write_all(tables: dict[str, list[dict[str, Any]]]) -> dict[str, int]:
    """Replace every row in the database with the given rows. Call in a transaction."""
    conn = Tortoise.get_connection("default")
    for table in reversed(TABLES + EXCLUDED_TABLES[:1]):
        await conn.execute_query(f'DELETE FROM "{table}"')

    written: dict[str, int] = {}
    for table in TABLES:
        rows = tables.get(table) or []
        written[table] = len(rows)
        known = columns_of(table)
        for row in rows:
            if table == "delivery" and "expected" in row and row["expected"] is not None:
                try:
                    date.fromisoformat(str(row["expected"]))
                except ValueError:
                    row["expected"] = None
            columns = list(row.keys())
            unknown_columns = [column for column in columns if column not in known]
            if unknown_columns:
                raise ValueError(f"{table} has no column {unknown_columns[0]}")
            placeholders = ", ".join("?" for _ in columns)
            names = ", ".join(f'"{column}"' for column in columns)
            await conn.execute_query(
                f'INSERT INTO "{table}" ({names}) VALUES ({placeholders})',
                [row[column] for column in columns],
            )
    return written
