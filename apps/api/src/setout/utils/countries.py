from __future__ import annotations

from typing import Any

from tortoise import BaseDBAsyncClient

from setout.countries import COUNTRIES, STATES
from setout.utils.placeholders import bound

INSERT_COUNTRY = "INSERT INTO country (code, name) VALUES (?, ?)"
INSERT_STATE = "INSERT INTO state (code, country_id, name) VALUES (?, ?, ?)"


async def seed_countries(db: BaseDBAsyncClient) -> int:
    countries = await db.execute_query_dict("SELECT code FROM country")
    known_countries = {row["code"] for row in countries}
    pending_countries = [c for c in COUNTRIES if c[0] not in known_countries]
    query = bound(INSERT_COUNTRY, db)
    for code, name in pending_countries:
        await db.execute_query(query, [code, name])

    states = await db.execute_query_dict("SELECT code FROM state")
    known_states = {row["code"] for row in states}
    pending_states = [s for s in STATES if s[0] not in known_states]
    query = bound(INSERT_STATE, db)
    for code, country_code, name in pending_states:
        await db.execute_query(query, [code, country_code, name])

    return len(pending_countries) + len(pending_states)


async def seed_countries_migration(apps: Any, schema_editor: Any) -> None:
    await seed_countries(schema_editor.client)
