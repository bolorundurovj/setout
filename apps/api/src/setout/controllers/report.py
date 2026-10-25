from __future__ import annotations

from datetime import date

from setout.controllers.agreement import AgreementController
from setout.controllers.category import CategoryController
from setout.controllers.expense import ExpenseController
from setout.controllers.project import ProjectController
from setout.models.agreement import Agreement
from setout.models.budget import BudgetItem
from setout.models.delivery import Delivery
from setout.models.expense import CostType, Expense
from setout.services import report
from setout.utils.balances import balance_of, paid_by_agreement

COST_TYPE_NAMES = {
    CostType.LABOUR: "Labour",
    CostType.MATERIAL: "Material",
    CostType.FIXED: "Fixed",
}


class ReportController:
    def __init__(self) -> None:
        self.projects = ProjectController()
        self.categories = CategoryController()
        self.expenses = ExpenseController()
        self.agreements = AgreementController()

    async def pdf(self, project_id: str) -> tuple[str, bytes]:
        built = await self.gather(project_id, date.today())
        return built.project_name, report.render(built)

    async def gather(self, project_id: str, generated_on: date) -> report.ProjectReport:
        project = await self.projects.get(project_id)
        built = report.ProjectReport(
            project_name=project.name,
            land_name=project.land_name,
            currency_code=project.currency_code,
            exponent=project.currency_exponent,
            generated_on=generated_on,
            budgeted_amount=project.budgeted_amount,
            spent_amount=project.spent_amount,
        )
        await self._categories(project_id, built)
        await self._cost_types(project_id, built)
        months = await self.expenses.months(project_id)
        built.months = [
            report.MonthLine(month.month, month.amount, month.expense_count)
            for month in months.months
        ]
        await self._agreements(project_id, built)
        built.advances = [
            report.AdvanceLine(
                person_name=row.person_name,
                advanced_amount=row.advanced_amount,
                spent_amount=row.spent_amount,
                balance_amount=row.balance_amount,
            )
            for row in await self.agreements.balances(project_id)
            if row.advanced_amount or row.spent_amount
        ]
        await self._outstanding(project_id, built)
        return built

    async def _categories(self, project_id: str, built: report.ProjectReport) -> None:
        budget = await self.categories.budget(project_id)
        top_level = [category for category in budget.categories if category.parent_id is None]
        built.categories = [
            report.CategoryLine(category.name, category.budgeted_amount, category.spent_amount)
            for category in top_level
        ]
        uncategorised = built.spent_amount - sum(category.spent_amount for category in top_level)
        if uncategorised:
            built.categories.append(report.CategoryLine("Uncategorised", 0, uncategorised))

    async def _cost_types(self, project_id: str, built: report.ProjectReport) -> None:
        budgeted: dict[CostType | None, int] = {}
        for row in await BudgetItem.filter(
            archived_at__isnull=True,
            category__archived_at__isnull=True,
            category__project_id=project_id,
        ).values("cost_type", "budgeted_amount"):
            key = row["cost_type"]
            budgeted[key] = budgeted.get(key, 0) + int(row["budgeted_amount"])
        spent: dict[CostType | None, int] = {}
        for row in await Expense.filter(project_id=project_id, archived_at__isnull=True).values(
            "cost_type", "amount"
        ):
            key = row["cost_type"]
            spent[key] = spent.get(key, 0) + int(row["amount"])
        built.cost_types = [
            report.CostTypeLine(name, budgeted.get(cost_type, 0), spent.get(cost_type, 0))
            for cost_type, name in [*COST_TYPE_NAMES.items(), (None, "Not set")]
            if budgeted.get(cost_type) or spent.get(cost_type)
        ]

    async def _agreements(self, project_id: str, built: report.ProjectReport) -> None:
        rows = (
            await Agreement.filter(project_id=project_id, archived_at__isnull=True)
            .order_by("created_at", "id")
            .prefetch_related("vendor")
        )
        paid = await paid_by_agreement([row.id for row in rows])
        built.agreements = [
            report.AgreementLine(
                vendor_name=row.vendor.name,
                description=row.description,
                agreed_amount=row.agreed_amount,
                paid_amount=paid.get(row.id, 0),
                balance_amount=balance_of(row.agreed_amount, paid.get(row.id, 0)),
            )
            for row in rows
        ]

    async def _outstanding(self, project_id: str, built: report.ProjectReport) -> None:
        rows = (
            await Delivery.filter(
                project_id=project_id,
                archived_at__isnull=True,
                received_at__isnull=True,
                expense__archived_at__isnull=True,
            )
            .order_by("expected", "created_at", "id")
            .prefetch_related("expense__vendor")
        )
        built.outstanding = [
            report.OutstandingLine(
                description=row.description,
                vendor_name=row.expense.vendor.name if row.expense.vendor else "",
                expected=row.expected,
                amount=row.expense.amount,
            )
            for row in rows
        ]
