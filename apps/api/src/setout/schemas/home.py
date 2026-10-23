from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class CurrencyChoice(BaseModel):
    currency_code: str
    currency_exponent: int
    project_count: int


class HomeAlert(BaseModel):
    kind: str
    title: str
    detail: str
    amount: int
    urgent: bool


class HomeSummary(BaseModel):
    """Figures for one currency. Amounts in different currencies are never added together."""

    project_count: int = Field(..., description="All projects, in any currency")
    currencies: list[CurrencyChoice]
    currency_code: str | None
    currency_exponent: int | None
    currency_project_count: int = Field(0, description="Projects using this currency")
    budgeted_amount: int
    spent_amount: int
    alerts: list[HomeAlert]


class HomeMonth(BaseModel):
    month: str = Field(..., description="Calendar month as YYYY-MM")
    amount: int


class HomeMonths(BaseModel):
    currency_code: str | None
    currency_exponent: int | None
    months: list[HomeMonth]
    highest_month: str | None


class HomeProject(BaseModel):
    id: str
    name: str
    currency_code: str
    currency_exponent: int
    budgeted_amount: int
    spent_amount: int
    expense_count: int


class HomeProjects(BaseModel):
    rows: list[HomeProject]


class HomeExpenseSummary(BaseModel):
    id: str
    project_id: str
    project_name: str
    currency_code: str
    currency_exponent: int
    category_name: str | None
    description: str
    amount: int
    spent_on: date


class HomeLatest(BaseModel):
    rows: list[HomeExpenseSummary]
