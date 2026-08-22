from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class CurrencyRead(BaseModel):
    code: str
    name: str
    exponent: int

    model_config = ConfigDict(from_attributes=True)
