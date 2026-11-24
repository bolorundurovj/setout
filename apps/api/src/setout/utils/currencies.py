from __future__ import annotations

from typing import Any

from tortoise import BaseDBAsyncClient

from setout.currencies import CURRENCIES
from setout.models.currency import Currency
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


async def currency_exponents(codes: set[str]) -> dict[str, int]:
    """Minor-unit exponent per currency code, for display alongside grouped totals."""
    if not codes:
        return {}
    rows = await Currency.filter(code__in=list(codes)).values("code", "exponent")
    return {str(row["code"]): int(row["exponent"]) for row in rows}
