from __future__ import annotations

import json
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from decimal import Decimal
from itertools import groupby
from typing import Any

from tortoise import Tortoise
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.fields import DateField, DatetimeField, DecimalField, Field, JSONField

from setout.utils.placeholders import bound

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

# The migration number that created each table, so a backup from an older schema only
# needs the tables that existed then.
TABLE_SINCE: dict[str, int] = {
    "currency": 1,
    "category_preset": 1,
    "user": 2,
    "project": 3,
    "category": 4,
    "budget_item": 4,
    "item": 5,
    "person": 5,
    "vendor": 5,
    "expense": 5,
    "advance": 6,
    "agreement": 6,
    "delivery": 7,
    "attachment": 8,
    "land": 9,
    "land_document": 9,
    "country": 11,
    "state": 11,
    "land_valuation": 12,
    "change": 20,
}

# Self-referencing tables and the column that holds the parent.
SELF_REFERENCES: dict[str, str] = {"category": "parent_id"}

# Sessions are excluded: they belong to the browsers signed in at export time.
EXCLUDED_TABLES: tuple[str, ...] = ("session", "tortoise_migrations")

FORMAT = 3

Rows = dict[str, list[dict[str, Any]]]


class BackupError(ValueError):
    """A problem with a backup's contents, with a message that can be shown to the user."""


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


def forward_counts(counts: dict[str, int], format: int) -> dict[str, int]:
    """Rename the tables in an older backup's row counts to their current names."""
    for target in range(format + 1, FORMAT + 1):
        renames = UPGRADES[target].tables
        counts = {renames.get(name, name): count for name, count in counts.items()}
    return counts


def required_tables(migration: str | None) -> set[str]:
    """The tables a backup taken at this migration must contain."""
    number = migration.split("_", 1)[0] if migration else ""
    if not number.isdigit():
        return set(TABLES)
    return {table for table in TABLES if TABLE_SINCE[table] <= int(number)}


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


def parents_first(rows: list[dict[str, Any]], parent_column: str) -> list[dict[str, Any]]:
    """Order rows so each parent comes before its children. Rows in a cycle keep their order."""
    by_id = {row["id"]: row for row in rows}
    ordered: list[dict[str, Any]] = []
    placed: set[Any] = set()
    for row in rows:
        chain: list[dict[str, Any]] = []
        in_chain: set[Any] = set()
        current: dict[str, Any] | None = row
        while current is not None and current["id"] not in placed | in_chain:
            chain.append(current)
            in_chain.add(current["id"])
            current = by_id.get(current.get(parent_column))
        for ancestor in reversed(chain):
            placed.add(ancestor["id"])
            ordered.append(ancestor)
    return ordered


async def export_pages(conn: BaseDBAsyncClient, table: str) -> AsyncIterator[list[dict[str, Any]]]:
    primary_key = next(name for name, field in fields_of(table).items() if field.pk)
    cursor = None
    while True:
        where = bound(f'WHERE "{primary_key}" > ?', conn) if cursor is not None else ""
        rows = await conn.execute_query_dict(
            f'SELECT * FROM "{table}" {where} ORDER BY "{primary_key}" LIMIT 256',
            [cursor] if cursor is not None else [],
        )
        if not rows:
            break
        yield [{key: to_json_value(value) for key, value in row.items()} for row in rows]
        cursor = rows[-1][primary_key]


async def read_all() -> dict[str, list[dict[str, Any]]]:
    conn = Tortoise.get_connection("default")
    tables: dict[str, list[dict[str, Any]]] = {}
    for table in TABLES:
        rows = await conn.execute_query_dict(f'SELECT * FROM "{table}"')
        tables[table] = [{key: to_json_value(value) for key, value in row.items()} for row in rows]
        if table in SELF_REFERENCES:
            tables[table] = parents_first(tables[table], SELF_REFERENCES[table])
    return tables


def fields_of(table: str) -> dict[str, Field[Any]]:
    """The model field behind each column of a table, keyed by column name."""
    for model in Tortoise.apps.get_models_iterable():
        if model._meta.db_table == table:
            meta = model._meta
            return {
                column: meta.fields_map[name] for name, column in meta.fields_db_projection.items()
            }
    return {}


def to_db_value(field: Field[Any], value: Any) -> Any:
    """Turn a JSON backup value back into the type asyncpg expects for the column."""
    if value is None:
        return None
    if isinstance(field, DatetimeField):
        moment = value if isinstance(value, datetime) else datetime.fromisoformat(str(value))
        return moment if moment.tzinfo else moment.replace(tzinfo=UTC)
    if isinstance(field, DateField):
        return value if isinstance(value, date) else date.fromisoformat(str(value))
    if isinstance(field, DecimalField):
        return Decimal(str(value))
    if isinstance(field, JSONField):
        return value if isinstance(value, str) else json.dumps(value)
    return value


async def write_all(tables: dict[str, list[dict[str, Any]]]) -> dict[str, int]:
    """Replace every row in the database with the given rows. Call in a transaction."""
    conn = Tortoise.get_connection("default")
    convert = conn.capabilities.dialect != "sqlite"
    for table in reversed(TABLES + EXCLUDED_TABLES[:1]):
        await conn.execute_query(f'DELETE FROM "{table}"')

    written: dict[str, int] = {}
    for table in TABLES:
        rows = tables.get(table) or []
        written[table] = len(rows)
        fields = fields_of(table)
        parent_column = SELF_REFERENCES.get(table)
        links: list[list[Any]] = []
        prepared: list[tuple[tuple[str, ...], list[Any]]] = []
        for row in rows:
            if table == "delivery" and "expected" in row and row["expected"] is not None:
                try:
                    date.fromisoformat(str(row["expected"]))
                except ValueError:
                    row["expected"] = None
            columns = tuple(row.keys())
            unknown_columns = [column for column in columns if column not in fields]
            if unknown_columns:
                raise BackupError(f"{table} has no column {unknown_columns[0]}")
            values = [
                to_db_value(fields[column], row[column]) if convert else row[column]
                for column in columns
            ]
            # Parents are set after all rows are inserted, so row order in a backup does not matter.
            if parent_column in columns and row[parent_column] is not None:
                index = columns.index(parent_column)
                links.append([values[index], row["id"]])
                values[index] = None
            prepared.append((columns, values))

        # Consecutive rows with the same columns go in one batch, so insert order is kept.
        for columns, batch in groupby(prepared, key=lambda item: item[0]):
            placeholders = ", ".join("?" for _ in columns)
            names = ", ".join(f'"{column}"' for column in columns)
            await conn.execute_many(
                bound(f'INSERT INTO "{table}" ({names}) VALUES ({placeholders})', conn),
                [values for _, values in batch],
            )
        if links:
            await conn.execute_many(
                bound(f'UPDATE "{table}" SET "{parent_column}" = ? WHERE "id" = ?', conn),
                links,
            )
    return written
