from __future__ import annotations

from typing import Any

from tortoise import BaseDBAsyncClient

from setout.utils.ids import short_id
from setout.utils.placeholders import bound

# The usual scopes of a house build, roughly in the order they happen.
SCOPE_PRESETS: list[str] = [
    "Administrative expenses",
    "Land and site preparation",
    "Equipment rentals",
    "Concrete foundation",
    "Structure and exterior",
    "Roofing",
    "Doors and windows",
    "Plumbing",
    "Electrical",
    "Plastering and screeding",
    "Interior work",
    "Tiling",
    "Ceiling",
    "Painting",
    "Fittings and fixtures",
    "External works and drainage",
    "Landscaping",
    "Finalization and inspections",
]

INSERT = "INSERT INTO scope_preset (id, name, sort_order) VALUES (?, ?, ?)"


async def seed_scope_presets(db: BaseDBAsyncClient) -> int:
    rows = await db.execute_query_dict("SELECT name FROM scope_preset")
    known = {row["name"] for row in rows}
    pending = [(name, order) for order, name in enumerate(SCOPE_PRESETS) if name not in known]
    query = bound(INSERT, db)
    for name, order in pending:
        await db.execute_query(query, [short_id(), name, order])
    return len(pending)


async def seed_scope_presets_migration(apps: Any, schema_editor: Any) -> None:
    await seed_scope_presets(schema_editor.client)
