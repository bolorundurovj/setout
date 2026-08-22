from __future__ import annotations

from pydantic import BaseModel, Field


class Counts(BaseModel):
    projects: int = Field(..., description="Not counting deleted ones")
    vendors: int = Field(..., description="Not counting archived ones")
    items: int = Field(..., description="Not counting archived ones")
    people: int = Field(..., description="Not counting archived ones")
