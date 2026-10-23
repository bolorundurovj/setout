from __future__ import annotations

from pydantic import BaseModel, Field


class Counts(BaseModel):
    projects: int = Field(..., description="Excludes archived projects")
    vendors: int = Field(..., description="Excludes archived records")
    items: int = Field(..., description="Excludes archived records")
    people: int = Field(..., description="Excludes archived records")
    lands: int = Field(..., description="Excludes archived records")
