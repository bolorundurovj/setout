from typing import Any

from tortoise import migrations
from tortoise.migrations import operations as ops

from setout.utils.placeholders import bound

# Applies only to databases created before 0004 and 0005 were rewritten.
RENAMED_TABLES = (("scope", "category"), ("scope_preset", "category_preset"))
RENAMED_COLUMNS = (
    ("budget_item", "scope_id", "category_id"),
    ("budget_item", "planned_amount", "budgeted_amount"),
    ("expense", "scope_id", "category_id"),
)


async def _tables(db: Any) -> set[str]:
    if db.capabilities.dialect == "sqlite":
        rows = await db.execute_query_dict("SELECT name FROM sqlite_master WHERE type = 'table'")
    else:
        rows = await db.execute_query_dict(
            "SELECT table_name AS name FROM information_schema.tables"
            " WHERE table_schema = current_schema()"
        )
    return {row["name"] for row in rows}


async def _columns(db: Any, table: str) -> set[str]:
    if db.capabilities.dialect == "sqlite":
        rows = await db.execute_query_dict(f'PRAGMA table_info("{table}")')
        return {row["name"] for row in rows}
    rows = await db.execute_query_dict(
        bound(
            "SELECT column_name AS name FROM information_schema.columns"
            " WHERE table_schema = current_schema() AND table_name = ?",
            db,
        ),
        [table],
    )
    return {row["name"] for row in rows}


async def _rename_what_is_left(apps: Any, schema_editor: Any) -> None:
    db = schema_editor.client
    tables = await _tables(db)

    for old, new in RENAMED_TABLES:
        if old in tables and new not in tables:
            await db.execute_script(f'ALTER TABLE "{old}" RENAME TO "{new}"')

    present = await _tables(db)
    for table, old, new in RENAMED_COLUMNS:
        if table not in present:
            continue
        columns = await _columns(db, table)
        if old in columns and new not in columns:
            await db.execute_script(f'ALTER TABLE "{table}" RENAME COLUMN "{old}" TO "{new}"')


class Migration(migrations.Migration):
    dependencies = [("models", "0014_land_geocoded_address")]

    initial = False

    operations = [ops.RunPython(_rename_what_is_left, ops.RunPython.noop)]
