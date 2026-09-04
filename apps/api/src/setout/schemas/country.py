from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class CountryRead(BaseModel):
    code: str
    name: str

    model_config = ConfigDict(from_attributes=True)


class StateRead(BaseModel):
    code: str
    country_code: str
    name: str

    model_config = ConfigDict(from_attributes=True)
