from __future__ import annotations

from typing import Any

from tortoise import BaseDBAsyncClient

from setout.currencies import CURRENCIES
from setout.utils.placeholders import bound

INSERT = "INSERT INTO currency (code, name, exponent) VALUES (?, ?, ?)"


async def seed_currencies(db: BaseDBAsyncClient) -> int:
    rows = await db.execute_query_dict("SELECT code FROM currency")
    known = {row["code"] for row in rows}
    pending = [c for c in CURRENCIES if c[0] not in known]
    query = bound(INSERT, db)
    for code, name, exponent in pending:
        await db.execute_query(query, [code, name, exponent])
    return len(pending)


async def seed_currencies_migration(apps: Any, schema_editor: Any) -> None:
    await seed_currencies(schema_editor.client)
