from __future__ import annotations

from collections import defaultdict

from tortoise import connections
from tortoise.functions import Count

from setout.models.delivery import Delivery
from setout.models.expense import Expense
from setout.models.project import Project
from setout.schemas.home import (
    CurrencyChoice,
    HomeAlert,
    HomeExpenseSummary,
    HomeLatest,
    HomeMonth,
    HomeMonths,
    HomeProject,
    HomeProjects,
    HomeSummary,
)
from setout.utils.budgets import budgeted_by_project, spent_by_project
from setout.utils.placeholders import bound

LATEST = 6
MONTHS = 8
MONTH_OF = {
    "sqlite": "strftime('%Y-%m', spent_on)",
    "postgres": "to_char(spent_on, 'YYYY-MM')",
}


class HomeController:
    async def summary(self, requested: str | None, base_currency: str | None) -> HomeSummary:
        projects = await self._projects()
        choices = self._choices(projects)
        code = self._code(choices, requested, base_currency)
        if code is None:
            return HomeSummary(
                project_count=len(projects),
                currencies=choices,
                currency_code=None,
                currency_exponent=None,
                budgeted_amount=0,
                spent_amount=0,
                alerts=[],
            )

        in_currency = [project for project in projects if project.currency_id == code]
        ids = [project.id for project in in_currency]
        budgeted = await budgeted_by_project(ids)
        spent = await spent_by_project(ids)
        return HomeSummary(
            project_count=len(projects),
            currencies=choices,
            currency_code=code,
            currency_exponent=in_currency[0].currency.exponent,
            currency_project_count=len(in_currency),
            budgeted_amount=sum(budgeted.values()),
            spent_amount=sum(spent.values()),
            alerts=await self._alerts(ids),
        )

    async def months(self, requested: str | None, base_currency: str | None) -> HomeMonths:
        projects = await self._projects()
        code = self._code(self._choices(projects), requested, base_currency)
        if code is None:
            return HomeMonths(
                currency_code=None, currency_exponent=None, months=[], highest_month=None
            )

        in_currency = [project for project in projects if project.currency_id == code]
        months = await self._months([project.id for project in in_currency])
        return HomeMonths(
            currency_code=code,
            currency_exponent=in_currency[0].currency.exponent,
            months=months,
            highest_month=max(months, key=lambda month: month.amount).month if months else None,
        )

    async def projects(self, requested: str | None, base_currency: str | None) -> HomeProjects:
        projects = await self._projects()
        code = self._code(self._choices(projects), requested, base_currency)
        in_currency = [
            project for project in projects if code is None or project.currency_id == code
        ]
        ids = [project.id for project in in_currency]
        budgeted = await budgeted_by_project(ids)
        spent = await spent_by_project(ids)
        counts = await self._counts(ids)
        return HomeProjects(
            rows=[
                HomeProject(
                    id=project.id,
                    name=project.name,
                    currency_code=project.currency_id,
                    currency_exponent=project.currency.exponent,
                    budgeted_amount=budgeted.get(project.id, 0),
                    spent_amount=spent.get(project.id, 0),
                    expense_count=counts.get(project.id, 0),
                )
                for project in in_currency
            ]
        )

    async def latest(self, requested: str | None, base_currency: str | None) -> HomeLatest:
        projects = await self._projects()
        code = self._code(self._choices(projects), requested, base_currency)
        ids = [project.id for project in projects if code is None or project.currency_id == code]
        rows = (
            await Expense.filter(project_id__in=ids, archived_at__isnull=True)
            .order_by("-spent_on", "-created_at")
            .limit(LATEST)
            .prefetch_related("project__currency", "category")
        )
        return HomeLatest(
            rows=[
                HomeExpenseSummary(
                    id=row.id,
                    project_id=row.project_id,
                    project_name=row.project.name,
                    currency_code=row.project.currency_id,
                    currency_exponent=row.project.currency.exponent,
                    category_name=row.category.name if row.category else None,
                    description=row.description,
                    amount=row.amount,
                    spent_on=row.spent_on,
                )
                for row in rows
            ]
        )

    async def _projects(self) -> list[Project]:
        return (
            await Project.filter(archived_at__isnull=True)
            .order_by("-created_at")
            .prefetch_related("currency")
        )

    def _choices(self, projects: list[Project]) -> list[CurrencyChoice]:
        counts: dict[str, int] = defaultdict(int)
        exponents: dict[str, int] = {}
        for project in projects:
            counts[project.currency_id] += 1
            exponents[project.currency_id] = project.currency.exponent
        return [
            CurrencyChoice(
                currency_code=code, currency_exponent=exponents[code], project_count=counts[code]
            )
            for code in sorted(counts)
        ]

    def _code(
        self, choices: list[CurrencyChoice], requested: str | None, base_currency: str | None
    ) -> str | None:
        """The requested currency, else the account currency, else the first in use."""
        in_use = [choice.currency_code for choice in choices]
        for candidate in (requested, base_currency):
            if candidate and candidate.upper() in in_use:
                return candidate.upper()
        return in_use[0] if in_use else None

    async def _counts(self, project_ids: list[str]) -> dict[str, int]:
        if not project_ids:
            return {}
        rows = (
            await Expense.filter(project_id__in=project_ids, archived_at__isnull=True)
            .annotate(total=Count("id"))
            .group_by("project_id")
            .values("project_id", "total")
        )
        return {str(row["project_id"]): int(row["total"]) for row in rows}

    async def _months(self, project_ids: list[str]) -> list[HomeMonth]:
        """Grouped in SQL so only the displayed months are returned."""
        if not project_ids:
            return []
        db = connections.get("default")
        month = MONTH_OF.get(db.capabilities.dialect, MONTH_OF["postgres"])
        placeholders = ",".join("?" * len(project_ids))
        rows = await db.execute_query_dict(
            bound(
                f"SELECT {month} AS month, SUM(amount) AS total FROM expense"
                f" WHERE archived_at IS NULL AND project_id IN ({placeholders})"
                f" GROUP BY month ORDER BY month DESC LIMIT {MONTHS}",
                db,
            ),
            list(project_ids),
        )
        return [
            HomeMonth(month=str(row["month"]), amount=int(row["total"])) for row in reversed(rows)
        ]

    async def _alerts(self, project_ids: list[str]) -> list[HomeAlert]:
        alerts: list[HomeAlert] = []

        uncategorised = await Expense.filter(
            project_id__in=project_ids, archived_at__isnull=True, category_id__isnull=True
        ).values_list("project_id", "amount")
        if uncategorised:
            projects = len({project_id for project_id, _ in uncategorised})
            alerts.append(
                HomeAlert(
                    kind="uncategorised",
                    title="Uncategorised Expenses",
                    detail=(
                        f"{len(uncategorised)} "
                        f"{'expense' if len(uncategorised) == 1 else 'expenses'} "
                        f"across {projects} {'project' if projects == 1 else 'projects'}"
                    ),
                    amount=sum(amount for _, amount in uncategorised),
                    urgent=True,
                )
            )

        outstanding = await Delivery.filter(
            project_id__in=project_ids,
            archived_at__isnull=True,
            received_at__isnull=True,
            expense__archived_at__isnull=True,
        ).prefetch_related("expense")
        if outstanding:
            alerts.append(
                HomeAlert(
                    kind="deliveries",
                    title="Outstanding Deliveries",
                    detail=(
                        f"{len(outstanding)} paid "
                        f"{'expense' if len(outstanding) == 1 else 'expenses'} outstanding"
                    ),
                    amount=sum(row.expense.amount for row in outstanding),
                    urgent=False,
                )
            )
        return alerts
