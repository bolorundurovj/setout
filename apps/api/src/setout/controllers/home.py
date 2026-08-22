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
    HomeLatest,
    HomeMonth,
    HomeMonths,
    HomeProject,
    HomeProjects,
    HomeSpend,
    HomeSummary,
)
from setout.utils.budgets import planned_by_project, spent_by_project
from setout.utils.placeholders import bound

LATEST = 6
MONTHS = 8
MONTH_OF = {
    "sqlite": "strftime('%Y-%m', spent_on)",
    "postgres": "to_char(spent_on, 'YYYY-MM')",
}


class HomeController:
    async def summary(self, wanted: str | None, base: str | None) -> HomeSummary:
        projects = await self._projects()
        choices = self._choices(projects)
        code = self._code(choices, wanted, base)
        if code is None:
            return HomeSummary(
                projects=len(projects),
                currencies=choices,
                currency_code=None,
                currency_exponent=None,
                planned_amount=0,
                spent_amount=0,
                alerts=[],
            )

        here = [project for project in projects if project.currency_id == code]
        ids = [project.id for project in here]
        planned = await planned_by_project(ids)
        spent = await spent_by_project(ids)
        return HomeSummary(
            projects=len(projects),
            currencies=choices,
            currency_code=code,
            currency_exponent=here[0].currency.exponent,
            currency_projects=len(here),
            planned_amount=sum(planned.values()),
            spent_amount=sum(spent.values()),
            alerts=await self._alerts(ids),
        )

    async def months(self, wanted: str | None, base: str | None) -> HomeMonths:
        projects = await self._projects()
        code = self._code(self._choices(projects), wanted, base)
        if code is None:
            return HomeMonths(
                currency_code=None, currency_exponent=None, months=[], busiest_month=None
            )

        here = [project for project in projects if project.currency_id == code]
        months = await self._months([project.id for project in here])
        return HomeMonths(
            currency_code=code,
            currency_exponent=here[0].currency.exponent,
            months=months,
            busiest_month=max(months, key=lambda month: month.amount).month if months else None,
        )

    async def projects(self, wanted: str | None, base: str | None) -> HomeProjects:
        projects = await self._projects()
        code = self._code(self._choices(projects), wanted, base)
        here = [project for project in projects if code is None or project.currency_id == code]
        ids = [project.id for project in here]
        planned = await planned_by_project(ids)
        spent = await spent_by_project(ids)
        counts = await self._counts(ids)
        return HomeProjects(
            rows=[
                HomeProject(
                    id=project.id,
                    name=project.name,
                    currency_code=project.currency_id,
                    currency_exponent=project.currency.exponent,
                    planned_amount=planned.get(project.id, 0),
                    spent_amount=spent.get(project.id, 0),
                    expense_count=counts.get(project.id, 0),
                )
                for project in here
            ]
        )

    async def latest(self, wanted: str | None, base: str | None) -> HomeLatest:
        projects = await self._projects()
        code = self._code(self._choices(projects), wanted, base)
        ids = [project.id for project in projects if code is None or project.currency_id == code]
        rows = (
            await Expense.filter(project_id__in=ids, deleted_at__isnull=True)
            .order_by("-spent_on", "-created_at")
            .limit(LATEST)
            .prefetch_related("project__currency", "scope")
        )
        return HomeLatest(
            rows=[
                HomeSpend(
                    id=row.id,
                    project_id=row.project_id,
                    project_name=row.project.name,
                    currency_code=row.project.currency_id,
                    currency_exponent=row.project.currency.exponent,
                    scope_name=row.scope.name if row.scope else None,
                    description=row.description,
                    amount=row.amount,
                    spent_on=row.spent_on,
                )
                for row in rows
            ]
        )

    async def _projects(self) -> list[Project]:
        return (
            await Project.filter(deleted_at__isnull=True)
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
                currency_code=code, currency_exponent=exponents[code], projects=counts[code]
            )
            for code in sorted(counts)
        ]

    def _code(
        self, choices: list[CurrencyChoice], wanted: str | None, base: str | None
    ) -> str | None:
        """What the screen opens on: what was asked for, else the account's, else the first."""
        in_use = [choice.currency_code for choice in choices]
        for candidate in (wanted, base):
            if candidate and candidate.upper() in in_use:
                return candidate.upper()
        return in_use[0] if in_use else None

    async def _counts(self, project_ids: list[str]) -> dict[str, int]:
        if not project_ids:
            return {}
        rows = (
            await Expense.filter(project_id__in=project_ids, deleted_at__isnull=True)
            .annotate(total=Count("id"))
            .group_by("project_id")
            .values("project_id", "total")
        )
        return {str(row["project_id"]): int(row["total"]) for row in rows}

    async def _months(self, project_ids: list[str]) -> list[HomeMonth]:
        """Grouped by the database so only the months drawn come back."""
        if not project_ids:
            return []
        db = connections.get("default")
        month = MONTH_OF.get(db.capabilities.dialect, MONTH_OF["postgres"])
        holes = ",".join("?" * len(project_ids))
        rows = await db.execute_query_dict(
            bound(
                f"SELECT {month} AS month, SUM(amount) AS total FROM expense"
                f" WHERE deleted_at IS NULL AND project_id IN ({holes})"
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

        unfiled = await Expense.filter(
            project_id__in=project_ids, deleted_at__isnull=True, scope_id__isnull=True
        ).values_list("project_id", "amount")
        if unfiled:
            projects = len({project_id for project_id, _ in unfiled})
            alerts.append(
                HomeAlert(
                    kind="unfiled",
                    title="Spend with no scope",
                    detail=(
                        f"{len(unfiled)} {'receipt' if len(unfiled) == 1 else 'receipts'} "
                        f"across {projects} {'project' if projects == 1 else 'projects'}"
                    ),
                    amount=sum(amount for _, amount in unfiled),
                    urgent=True,
                )
            )

        owed = await Delivery.filter(
            project_id__in=project_ids,
            deleted_at__isnull=True,
            received_at__isnull=True,
            expense__deleted_at__isnull=True,
        ).prefetch_related("expense")
        if owed:
            alerts.append(
                HomeAlert(
                    kind="deliveries",
                    title="Paid for, not delivered",
                    detail=(
                        f"{len(owed)} {'thing' if len(owed) == 1 else 'things'} owed by a vendor"
                    ),
                    amount=sum(row.expense.amount for row in owed),
                    urgent=False,
                )
            )
        return alerts
