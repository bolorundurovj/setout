from datetime import date
from typing import Any

from tortoise import fields, migrations
from tortoise.migrations import operations as ops


async def _clean_expected_dates(apps: Any, schema_editor: Any) -> None:
    db = schema_editor.client
    rows = await db.execute_query_dict('SELECT id, expected FROM "delivery" WHERE expected IS NOT NULL')
    for row in rows:
        val = row.get("expected")
        if val is not None:
            is_valid = False
            if isinstance(val, str) and len(val) == 10:
                try:
                    date.fromisoformat(val)
                    is_valid = True
                except ValueError:
                    is_valid = False
            if not is_valid:
                param = "?" if db.capabilities.dialect == "sqlite" else "$1"
                await db.execute_query(f'UPDATE "delivery" SET expected = NULL WHERE id = {param}', [row["id"]])


class AlterFieldManual(ops.AlterField):
    """An AlterField that manually handles field type alteration across dialects.

    Tortoise's BaseSchemaEditor.alter_field rejects changes where old_field.field_type != new_field.field_type
    with 'Automatic field type altering is not supported yet. Please use AlterFieldManual'.
    We update Tortoise's in-memory model state via super().state_forward, but handle the database schema
    directly per dialect:
      - SQLite: column types are affinities; text dates and NULLs are stored cleanly without rebuilding tables.
      - PostgreSQL: ALTER TABLE "delivery" ALTER COLUMN "expected" TYPE DATE USING expected::date;
    """

    async def database_forward(
        self,
        app_label: str,
        old_state: Any,
        new_state: Any,
        state_editor: Any = None,
    ) -> None:
        if state_editor is None:
            return
        dialect = getattr(state_editor.client.capabilities, "dialect", None)
        if dialect in ("postgres", "postgresql", "asyncpg", "psycopg"):
            await state_editor.client.execute_query(
                'ALTER TABLE "delivery" ALTER COLUMN "expected" TYPE DATE USING expected::date;'
            )

    async def database_backward(
        self,
        app_label: str,
        old_state: Any,
        new_state: Any,
        state_editor: Any = None,
    ) -> None:
        if state_editor is None:
            return
        dialect = getattr(state_editor.client.capabilities, "dialect", None)
        if dialect in ("postgres", "postgresql", "asyncpg", "psycopg"):
            await state_editor.client.execute_query(
                'ALTER TABLE "delivery" ALTER COLUMN "expected" TYPE VARCHAR(255);'
            )


class Migration(migrations.Migration):
    dependencies = [('models', '0017_terminology')]

    initial = False

    operations = [
        ops.RunPython(_clean_expected_dates, ops.RunPython.noop),
        AlterFieldManual(
            model_name='Delivery',
            name='expected',
            field=fields.DateField(null=True, default=None),
        ),
    ]
