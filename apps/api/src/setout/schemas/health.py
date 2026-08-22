from __future__ import annotations

from pydantic import BaseModel


class Health(BaseModel):
    status: str
    version: str
    database: str
