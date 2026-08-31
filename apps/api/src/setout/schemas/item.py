from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from setout.schemas.decimals import PlainDecimal


class ItemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    unit: str | None = Field(None, max_length=32, description="What the price is quoted in")
    notes: str | None = None


class ItemUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(None, min_length=1, max_length=255)
    unit: str | None = Field(None, max_length=32)
    notes: str | None = None


class ItemPriceSummary(BaseModel):
    currency_code: str
    currency_exponent: int
    count: int
    first_price: int
    first_paid_on: date
    last_price: int
    last_paid_on: date
    lowest_price: int
    highest_price: int
    change_percent: float | None = Field(
        ..., description="Null when there is only one price, so nothing to compare"
    )


class ItemRead(BaseModel):
    id: str
    name: str
    unit: str | None
    notes: str | None
    purchase_count: int
    prices: list[ItemPriceSummary] = Field(
        ..., description="One entry per currency. Prices are never compared across currencies"
    )
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class ItemPage(BaseModel):
    items: list[ItemRead]
    total: int
    limit: int
    offset: int


class ItemPricePoint(BaseModel):
    expense_id: str
    spent_on: date
    unit_rate: int = Field(..., description="Price for one unit, in minor units")
    quantity: PlainDecimal | None
    project_id: str
    project_name: str
    vendor_id: str | None
    vendor_name: str | None


class ItemPriceSeries(ItemPriceSummary):
    points: list[ItemPricePoint]


class ItemPrices(BaseModel):
    item_id: str
    name: str
    unit: str | None
    series: list[ItemPriceSeries] = Field(
        ..., description="One series per currency. Prices are never compared across currencies"
    )


class ItemLastPrice(BaseModel):
    item_id: str
    currency_code: str
    currency_exponent: int
    unit_rate: int
    spent_on: date
    project_id: str
    project_name: str
    vendor_id: str | None
    vendor_name: str | None


class ItemLastPriceResponse(BaseModel):
    item_id: str
    project_id: str
    last_price: ItemLastPrice | None = Field(
        ..., description="Null when nothing has been bought yet in this project's currency"
    )
