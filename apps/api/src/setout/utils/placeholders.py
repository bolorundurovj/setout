from __future__ import annotations

from tortoise import BaseDBAsyncClient


def bind(query: str, dialect: str) -> str:
    """Rewrite ? placeholders for the driver in front of us.

    asyncpg speaks $1, $2, not the %s of psycopg, and rejects anything else
    before it reaches the database.
    """
    if dialect == "sqlite":
        return query
    out: list[str] = []
    position = 0
    for char in query:
        if char == "?":
            position += 1
            out.append(f"${position}")
        else:
            out.append(char)
    return "".join(out)


def bound(query: str, db: BaseDBAsyncClient) -> str:
    return bind(query, db.capabilities.dialect)
