"""The project PDF report.

`gather` reads each table exactly once and computes every section from that
shared data: the header totals, category lines, cost-type totals, month bars,
agreements, advances and outstanding deliveries.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date

from fastapi import HTTPException, status

from setout.models.advance import Advance
from setout.models.agreement import Agreement
from setout.models.budget import BudgetItem
from setout.models.category import Category
from setout.models.delivery import Delivery
from setout.models.expense import CostType, Expense
from setout.models.person import Person
from setout.models.project import Project
from setout.models.vendor import Vendor
from setout.services import report
from setout.utils.balances import balance_of
from setout.utils.categories import rolled_up_totals
from setout.utils.months import to_months

COST_TYPE_NAMES = {
    CostType.LABOUR: "Labour",
    CostType.MATERIAL: "Material",
    CostType.FIXED: "Fixed",
}


class ReportController:
    async def pdf(self, project_id: str) -> tuple[str, bytes]:
        built = await self.gather(project_id, date.today())
        return built.project_name, report.render(built)

    async def gather(self, project_id: str, generated_on: date) -> report.ProjectReport:
        project = await Project.get_or_none(
            id=project_id, archived_at__isnull=True
        ).prefetch_related("currency", "land")
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        categories = await Category.filter(project_id=project_id, archived_at__isnull=True)
        items = await BudgetItem.filter(
            category__project_id=project_id,
            archived_at__isnull=True,
            category__archived_at__isnull=True,
        ).only("category_id", "cost_type", "budgeted_amount")
        expenses = await Expense.filter(project_id=project_id, archived_at__isnull=True).only(
            "id",
            "category_id",
            "cost_type",
            "amount",
            "spent_on",
            "agreement_id",
            "paid_by_id",
            "vendor_id",
        )
        agreements = (
            await Agreement.filter(project_id=project_id, archived_at__isnull=True)
            .order_by("created_at", "id")
            .only("id", "description", "agreed_amount", "vendor_id")
        )
        advances = await Advance.filter(project_id=project_id, archived_at__isnull=True).values(
            "person_id", "amount"
        )
        people = await Person.all()
        outstanding_rows = (
            await Delivery.filter(
                project_id=project_id,
                archived_at__isnull=True,
                received_at__isnull=True,
                expense__archived_at__isnull=True,
            )
            .order_by("expected", "created_at", "id")
            .only("id", "description", "expected", "expense_id")
        )
        expense_by_id = {expense.id: expense for expense in expenses}
        vendor_ids = {expense.vendor_id for expense in expenses if expense.vendor_id is not None}
        vendor_ids.update(row.vendor_id for row in agreements)
        vendors = {
            str(row["id"]): str(row["name"])
            for row in await Vendor.filter(id__in=list(vendor_ids)).values("id", "name")
        }

        spent_total = sum(expense.amount for expense in expenses)
        land = project.land if project.land_id is not None else None
        built = report.ProjectReport(
            project_name=project.name,
            land_name=land.name if land is not None else None,
            currency_code=project.currency_id,
            exponent=project.currency.exponent,
            generated_on=generated_on,
            budgeted_amount=sum(item.budgeted_amount for item in items),
            spent_amount=spent_total,
        )
        self._categories(built, categories, items, expenses, spent_total)
        self._cost_types(built, items, expenses)
        built.months = [
            report.MonthLine(month.month, month.amount, month.expense_count)
            for month in to_months(expenses, categories)
        ]
        self._agreements(built, agreements, expenses, vendors)
        self._advances(built, advances, people, expenses)
        built.outstanding = []
        for row in outstanding_rows:
            expense = expense_by_id.get(row.expense_id)
            built.outstanding.append(
                report.OutstandingLine(
                    description=row.description,
                    vendor_name=(
                        vendors.get(expense.vendor_id, "") if expense and expense.vendor_id else ""
                    ),
                    expected=row.expected,
                    amount=expense.amount if expense else 0,
                )
            )
        return built

    def _categories(
        self,
        built: report.ProjectReport,
        categories: list[Category],
        items: list[BudgetItem],
        expenses: list[Expense],
        spent_total: int,
    ) -> None:
        budgeted: dict[str, int] = defaultdict(int)
        for item in items:
            budgeted[item.category_id] += item.budgeted_amount
        spent: dict[str, int] = defaultdict(int)
        for expense in expenses:
            if expense.category_id is not None:
                spent[expense.category_id] += expense.amount
        rolled = rolled_up_totals(categories, dict(budgeted))
        spent_rolled = rolled_up_totals(categories, dict(spent))
        top_level = [category for category in categories if category.parent_id is None]
        built.categories = [
            report.CategoryLine(category.name, rolled[category.id], spent_rolled[category.id])
            for category in top_level
        ]
        uncategorised = spent_total - sum(spent_rolled[category.id] for category in top_level)
        if uncategorised:
            built.categories.append(report.CategoryLine("Uncategorised", 0, uncategorised))

    def _cost_types(
        self, built: report.ProjectReport, items: list[BudgetItem], expenses: list[Expense]
    ) -> None:
        budgeted: dict[CostType | None, int] = {}
        for item in items:
            budgeted[item.cost_type] = budgeted.get(item.cost_type, 0) + item.budgeted_amount
        spent: dict[CostType | None, int] = {}
        for expense in expenses:
            spent[expense.cost_type] = spent.get(expense.cost_type, 0) + expense.amount
        built.cost_types = [
            report.CostTypeLine(name, budgeted.get(cost_type, 0), spent.get(cost_type, 0))
            for cost_type, name in [*COST_TYPE_NAMES.items(), (None, "Not set")]
            if budgeted.get(cost_type) or spent.get(cost_type)
        ]

    def _agreements(
        self,
        built: report.ProjectReport,
        agreements: list[Agreement],
        expenses: list[Expense],
        vendors: dict[str, str],
    ) -> None:
        paid: dict[str, int] = defaultdict(int)
        for expense in expenses:
            if expense.agreement_id is not None:
                paid[str(expense.agreement_id)] += expense.amount
        built.agreements = [
            report.AgreementLine(
                vendor_name=vendors.get(row.vendor_id, ""),
                description=row.description,
                agreed_amount=row.agreed_amount,
                paid_amount=paid.get(row.id, 0),
                balance_amount=balance_of(row.agreed_amount, paid.get(row.id, 0)),
            )
            for row in agreements
        ]

    def _advances(
        self,
        built: report.ProjectReport,
        advances: list[dict[str, int]],
        people: list[Person],
        expenses: list[Expense],
    ) -> None:
        advanced: dict[str, int] = defaultdict(int)
        for row in advances:
            advanced[str(row["person_id"])] += int(row["amount"])
        spent: dict[str, int] = defaultdict(int)
        for expense in expenses:
            if expense.paid_by_id is not None:
                spent[str(expense.paid_by_id)] += expense.amount
        built.advances = []
        for person in people:
            given = advanced.get(person.id, 0)
            used = spent.get(person.id, 0)
            if not (given or used):
                continue
            # An archived person stays on the report only while a balance remains open.
            if person.archived_at is not None and given - used == 0:
                continue
            built.advances.append(
                report.AdvanceLine(
                    person_name=person.name,
                    advanced_amount=given,
                    spent_amount=used,
                    balance_amount=given - used,
                )
            )
