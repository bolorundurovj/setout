from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class CurrencyChoice(BaseModel):
    currency_code: str
    currency_exponent: int
    projects: int


class HomeAlert(BaseModel):
    kind: str
    title: str
    detail: str
    amount: int
    urgent: bool


class HomeSummary(BaseModel):
    """The figures for one currency. Nothing here is ever added across two."""

    projects: int = Field(..., description="Every project, whatever its currency")
    currencies: list[CurrencyChoice]
    currency_code: str | None
    currency_exponent: int | None
    currency_projects: int = Field(0, description="Projects kept in this currency")
    planned_amount: int
    spent_amount: int
    alerts: list[HomeAlert]


class HomeMonth(BaseModel):
    month: str = Field(..., description="Calendar month as YYYY-MM")
    amount: int


class HomeMonths(BaseModel):
    currency_code: str | None
    currency_exponent: int | None
    months: list[HomeMonth]
    busiest_month: str | None


class HomeProject(BaseModel):
    id: str
    name: str
    currency_code: str
    currency_exponent: int
    planned_amount: int
    spent_amount: int
    expense_count: int


class HomeProjects(BaseModel):
    rows: list[HomeProject]


class HomeSpend(BaseModel):
    id: str
    project_id: str
    project_name: str
    currency_code: str
    currency_exponent: int
    scope_name: str | None
    description: str
    amount: int
    spent_on: date


class HomeLatest(BaseModel):
    rows: list[HomeSpend]
