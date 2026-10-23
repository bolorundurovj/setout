from __future__ import annotations

from tortoise import BaseDBAsyncClient


def bind(query: str, dialect: str) -> str:
    """Rewrite ? placeholders for the active driver.

    asyncpg requires $1, $2 rather than %s, and rejects other styles before the
    query reaches the database.
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
