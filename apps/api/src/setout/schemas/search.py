from __future__ import annotations

from datetime import date
from enum import StrEnum

from pydantic import BaseModel, Field


class SearchKind(StrEnum):
    PROJECTS = "projects"
    EXPENSES = "expenses"
    VENDORS = "vendors"
    PEOPLE = "people"
    ITEMS = "items"
    LANDS = "lands"


class Hit(BaseModel):
    id: str
    title: str
    detail: str
    project_id: str | None = None
    amount: int | None = None
    currency_code: str | None = None
    currency_exponent: int | None = None
    spent_on: date | None = None


class HitGroup(BaseModel):
    kind: SearchKind
    total: int = Field(..., description="Everything that matched, not only what is listed")
    hits: list[Hit]


class SearchResults(BaseModel):
    query: str
    total: int
    groups: list[HitGroup]
