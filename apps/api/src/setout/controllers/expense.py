from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from fastapi import HTTPException, status
from tortoise.expressions import Q
from tortoise.functions import Sum
from tortoise.queryset import QuerySet

from setout.models.agreement import Agreement
from setout.models.attachment import Attachment
from setout.models.budget import BudgetItem
from setout.models.category import Category
from setout.models.delivery import Delivery
from setout.models.expense import Expense
from setout.models.item import Item
from setout.models.person import Person
from setout.models.project import Project
from setout.models.vendor import Vendor
from setout.schemas.expense import (
    BulkCategoriseExpenses,
    BulkCategoriseResult,
    CategorySuggestion,
    ExpenseCreate,
    ExpensePage,
    ExpenseRead,
    ExpenseSort,
    ExpenseUpdate,
    ProjectExpenseSummary,
    ProjectMonths,
)
from setout.services.storage import Storage
from setout.utils.attachments import counts_for
from setout.utils.cascade import archive_under_expense, restore_under_expense
from setout.utils.expenses import derived_amount
from setout.utils.months import month_range, to_months
from setout.utils.uploads import delete_unreferenced

SORT_ORDERS: dict[ExpenseSort, tuple[str, ...]] = {
    ExpenseSort.RECENT: ("-spent_on", "-created_at"),
    ExpenseSort.OLDEST: ("spent_on", "created_at"),
    ExpenseSort.LARGEST: ("-amount", "-spent_on"),
    ExpenseSort.SMALLEST: ("amount", "-spent_on"),
}


class ExpenseController:
    async def list(
        self,
        project_id: str,
        *,
        category_id: str | None,
        agreement_id: str | None,
        month: str | None,
        search: str | None,
        vendor_id: str | None,
        paid_by_id: str | None,
        item_id: str | None,
        spent_from: date | None,
        spent_to: date | None,
        sort: ExpenseSort,
        uncategorised_only: bool,
        agreement_only: bool,
        include_archived: bool,
        limit: int,
        offset: int,
    ) -> ExpensePage:
        await self._project_or_404(project_id)
        query = Expense.filter(project_id=project_id)
        if not include_archived:
            query = query.filter(archived_at__isnull=True)
        if uncategorised_only:
            query = query.filter(category_id__isnull=True)
        elif category_id is not None:
            query = query.filter(category_id=category_id)
        if agreement_id is not None:
            query = query.filter(agreement_id=agreement_id)
        elif agreement_only:
            query = query.filter(agreement_id__isnull=False)
        if month is not None:
            first, following = month_range(month)
            query = query.filter(spent_on__gte=first, spent_on__lt=following)
        if search:
            query = query.filter(Q(description__icontains=search) | Q(notes__icontains=search))
        if vendor_id is not None:
            query = query.filter(vendor_id=vendor_id)
        if paid_by_id is not None:
            query = query.filter(paid_by_id=paid_by_id)
        if item_id is not None:
            query = query.filter(item_id=item_id)
        if spent_from is not None:
            query = query.filter(spent_on__gte=spent_from)
        if spent_to is not None:
            query = query.filter(spent_on__lte=spent_to)
        total = await query.count()
        total_amount = await self._sum_of(query)
        rows = await query.order_by(*SORT_ORDERS[sort]).offset(offset).limit(limit)
        counts = await counts_for("expense_id", [row.id for row in rows])
        return ExpensePage(
            items=[self._read(row, counts.get(row.id, 0)) for row in rows],
            total=total,
            total_amount=total_amount,
            limit=limit,
            offset=offset,
        )

    async def _sum_of(self, query: QuerySet[Expense]) -> int:
        added = await query.annotate(total=Sum("amount")).values("total")
        return int(added[0]["total"] or 0) if added else 0

    async def create(self, project_id: str, req: ExpenseCreate) -> ExpenseRead:
        await self._project_or_404(project_id)
        category_id = await self._resolve_category(project_id, req)
        if category_id is not None:
            await self._categorisable_category(category_id, project_id)
        await self._references_or_404(req.item_id, req.vendor_id, req.paid_by_id)
        await self._agreement_or_404(req.agreement_id, project_id)
        amount = self._amount(req.quantity, req.unit_rate, req.amount)
        expense = await Expense.create(
            project_id=project_id,
            category_id=category_id,
            item_id=req.item_id,
            vendor_id=req.vendor_id,
            agreement_id=req.agreement_id,
            paid_by_id=req.paid_by_id,
            spent_on=req.spent_on or date.today(),
            description=req.description,
            quantity=req.quantity,
            unit_rate=req.unit_rate,
            amount=amount,
            cost_type=req.cost_type,
            notes=req.notes,
        )
        return self._read(expense, 0)

    async def bulk_categorise(
        self, project_id: str, req: BulkCategoriseExpenses
    ) -> BulkCategoriseResult:
        await self._project_or_404(project_id)
        await self._categorisable_category(req.category_id, project_id)
        categorised = await Expense.filter(
            project_id=project_id,
            id__in=req.expense_ids,
            archived_at__isnull=True,
            category_id__isnull=True,
        ).update(category_id=req.category_id)
        return BulkCategoriseResult(categorised_count=categorised)

    async def _resolve_category(self, project_id: str, req: ExpenseCreate) -> str | None:
        if req.category_id is not None:
            return req.category_id
        if not req.auto_categorize:
            return None
        if req.item_id:
            category_id = await self._unanimous_category(project_id, item_id=req.item_id)
            if category_id:
                return category_id
        if req.vendor_id:
            return await self._unanimous_category(project_id, vendor_id=req.vendor_id)
        return None

    async def suggest_category(
        self, project_id: str, item_id: str | None, vendor_id: str | None
    ) -> CategorySuggestion:
        await self._project_or_404(project_id)
        if item_id:
            category_id = await self._most_common_category(project_id, item_id=item_id)
            if category_id:
                return CategorySuggestion(
                    category_id=category_id, reason="Earlier expenses for this item"
                )
        if vendor_id:
            category_id = await self._most_common_category(project_id, vendor_id=vendor_id)
            if category_id:
                return CategorySuggestion(
                    category_id=category_id, reason="Earlier expenses with this vendor"
                )
        return CategorySuggestion(category_id=None, reason=None)

    async def _category_counts(
        self, project_id: str, *, item_id: str | None = None, vendor_id: str | None = None
    ) -> tuple[dict[str, int], int]:
        query = Expense.filter(
            project_id=project_id, archived_at__isnull=True, category_id__isnull=False
        )
        if item_id is not None:
            query = query.filter(item_id=item_id)
        elif vendor_id is not None:
            query = query.filter(vendor_id=vendor_id)
        else:
            return {}, 0
        counts: dict[str, int] = {}
        for expense in await query.only("category_id"):
            category_id = expense.category_id
            assert category_id is not None
            counts[category_id] = counts.get(category_id, 0) + 1
        return counts, sum(counts.values())

    async def _most_common_category(
        self, project_id: str, *, item_id: str | None = None, vendor_id: str | None = None
    ) -> str | None:
        counts, _ = await self._category_counts(project_id, item_id=item_id, vendor_id=vendor_id)
        if not counts:
            return None
        max_count = max(counts.values())
        winners = [category_id for category_id, count in counts.items() if count == max_count]
        return winners[0] if len(winners) == 1 else None

    async def _unanimous_category(
        self, project_id: str, *, item_id: str | None = None, vendor_id: str | None = None
    ) -> str | None:
        counts, total = await self._category_counts(
            project_id, item_id=item_id, vendor_id=vendor_id
        )
        if not counts or total < 2:
            return None
        max_count = max(counts.values())
        winners = [category_id for category_id, count in counts.items() if count == max_count]
        if len(winners) != 1:
            return None
        return winners[0] if max_count == total else None

    async def get(self, expense_id: str) -> ExpenseRead:
        expense = await self._expense_or_404(expense_id)
        counts = await counts_for("expense_id", [expense.id])
        return self._read(expense, counts.get(expense.id, 0))

    async def update(self, expense_id: str, req: ExpenseUpdate) -> ExpenseRead:
        expense = await self._expense_or_404(expense_id)
        changes = req.model_dump(exclude_unset=True)
        if changes.get("category_id") is not None:
            await self._categorisable_category(changes["category_id"], expense.project_id)
        await self._references_or_404(
            changes.get("item_id"), changes.get("vendor_id"), changes.get("paid_by_id")
        )
        await self._agreement_or_404(changes.get("agreement_id"), expense.project_id)
        if changes:
            # Amount is derived below. The column is not nullable, and a request with
            # quantity and unit rate sends a null amount intentionally.
            entered = changes.pop("amount", None)
            expense.update_from_dict(changes)
            derived = derived_amount(expense.quantity, expense.unit_rate)
            if derived is not None:
                if entered is not None and entered != derived:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        detail="Amount must equal quantity × unit rate",
                    )
                expense.amount = derived
            elif entered is not None:
                expense.amount = entered
            await expense.save()
        counts = await counts_for("expense_id", [expense.id])
        return self._read(expense, counts.get(expense.id, 0))

    async def archive(self, expense_id: str) -> None:
        expense = await self._expense_or_404(expense_id)
        archived_at = datetime.now(UTC)
        expense.archived_at = archived_at
        await expense.save()
        await archive_under_expense(expense.id, archived_at)

    async def restore(self, expense_id: str) -> ExpenseRead:
        expense = await self._expense_or_404(expense_id, include_archived=True)
        if expense.archived_at is not None:
            archived_at = expense.archived_at
            expense.archived_at = None
            await expense.save()
            await restore_under_expense(expense.id, archived_at)
        counts = await counts_for("expense_id", [expense.id])
        return self._read(expense, counts.get(expense.id, 0))

    async def delete(self, expense_id: str, storage: Storage | None = None) -> None:
        expense = await self._expense_or_404(expense_id, include_archived=True)
        if expense.archived_at is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only archived expenses can be deleted permanently",
            )
        delivery_ids = await Delivery.filter(expense_id=expense.id).values_list("id", flat=True)
        attachments = await Attachment.filter(
            Q(expense_id=expense.id) | Q(delivery_id__in=list(delivery_ids))
        ).all()
        storage_keys = [att.storage_key for att in attachments]
        await expense.delete()
        await delete_unreferenced(storage_keys, storage)

    async def expense_summary(self, project_id: str) -> ProjectExpenseSummary:
        project = await self._project_or_404(project_id)
        # Filtered by category id instead of a join, which would group the sum per category.
        category_ids = await Category.filter(
            project_id=project_id, archived_at__isnull=True
        ).values_list("id", flat=True)
        budgeted = await self._total(
            BudgetItem.filter(category_id__in=category_ids, archived_at__isnull=True),
            "budgeted_amount",
        )
        active = Expense.filter(project_id=project_id, archived_at__isnull=True)
        spent = await self._total(active, "amount")
        uncategorised = await self._total(active.filter(category_id__isnull=True), "amount")
        uncategorised_count = await active.filter(category_id__isnull=True).count()
        archived = await Expense.filter(project_id=project_id, archived_at__isnull=False).count()
        return ProjectExpenseSummary(
            project_id=project.id,
            currency_code=project.currency_id,
            currency_exponent=project.currency.exponent,
            budgeted_amount=budgeted,
            spent_amount=spent,
            uncategorised_amount=uncategorised,
            uncategorised_count=uncategorised_count,
            archived_count=archived,
            variance_percent=round((spent - budgeted) / budgeted * 100, 2) if budgeted else None,
        )

    async def months(self, project_id: str) -> ProjectMonths:
        project = await self._project_or_404(project_id)
        # Built in Python: segments follow budget order and roll up to each top-level
        # category, which a single query cannot express.
        expenses = await Expense.filter(project_id=project_id, archived_at__isnull=True).only(
            "id", "spent_on", "category_id", "amount"
        )
        categories = await Category.filter(project_id=project_id, archived_at__isnull=True)
        months = to_months(expenses, categories)
        # max() keeps the first maximum, so a tie resolves to the earlier month.
        highest = max(months, key=lambda month: month.amount).month if months else None
        return ProjectMonths(
            project_id=project.id,
            currency_code=project.currency_id,
            currency_exponent=project.currency.exponent,
            total_amount=sum(month.amount for month in months),
            months=months,
            highest_month=highest,
        )

    def _amount(self, quantity: object, unit_rate: int | None, entered: int | None) -> int:
        derived = derived_amount(quantity, unit_rate)  # type: ignore[arg-type]
        if derived is not None:
            if entered is not None and entered != derived:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Amount must equal quantity × unit rate",
                )
            return derived
        if entered is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Enter an amount, or a quantity and a unit rate",
            )
        return entered

    async def _references_or_404(
        self, item_id: str | None, vendor_id: str | None, paid_by_id: str | None
    ) -> None:
        if (
            item_id is not None
            and not await Item.filter(id=item_id, archived_at__isnull=True).exists()
        ):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
        if (
            vendor_id is not None
            and not await Vendor.filter(id=vendor_id, archived_at__isnull=True).exists()
        ):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
        if (
            paid_by_id is not None
            and not await Person.filter(id=paid_by_id, archived_at__isnull=True).exists()
        ):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")

    async def _agreement_or_404(self, agreement_id: str | None, project_id: str) -> None:
        if agreement_id is None:
            return
        exists = await Agreement.filter(
            id=agreement_id, project_id=project_id, archived_at__isnull=True
        ).exists()
        if not exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agreement not found")

    async def _total(self, query: QuerySet[Any], column: str) -> int:
        rows = await query.annotate(total=Sum(column)).values("total")
        return int(rows[0]["total"] or 0) if rows else 0

    def _read(self, expense: Expense, attachment_count: int) -> ExpenseRead:
        fields = {
            name: getattr(expense, name)
            for name in ExpenseRead.model_fields
            if name != "attachment_count"
        }
        return ExpenseRead.model_validate({**fields, "attachment_count": attachment_count})

    async def _project_or_404(self, project_id: str) -> Project:
        project = await Project.get_or_none(
            id=project_id, archived_at__isnull=True
        ).prefetch_related("currency")
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        return project

    async def _categorisable_category(self, category_id: str, project_id: str) -> Category:
        category = await Category.get_or_none(
            id=category_id, project_id=project_id, archived_at__isnull=True
        )
        if category is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
        if await Category.filter(parent_id=category.id, archived_at__isnull=True).exists():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Expenses cannot be assigned to a category that has subcategories",
            )
        return category

    async def _expense_or_404(self, expense_id: str, *, include_archived: bool = False) -> Expense:
        expense = await Expense.get_or_none(id=expense_id)
        if expense is None or (expense.archived_at is not None and not include_archived):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
        return expense
