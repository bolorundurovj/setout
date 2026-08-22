from __future__ import annotations

from fastapi import HTTPException, status

from setout.models.agreement import Agreement
from setout.models.attachment import Attachment
from setout.models.budget import BudgetItem
from setout.models.delivery import Delivery
from setout.models.expense import Expense
from setout.models.project import Project
from setout.models.scope import Scope
from setout.services.sheets import write
from setout.services.sheets.values import is_scope_code
from setout.utils.balances import paid_by_agreement


class ExportController:
    async def workbook(self, project_id: str) -> tuple[str, bytes]:
        project = await Project.get_or_none(
            id=project_id, deleted_at__isnull=True
        ).prefetch_related("currency")
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        book = write.Book(
            project_name=project.name,
            exponent=project.currency.exponent,
            currency_code=project.currency_id,
        )
        codes = await self._plan(project, book)
        await self._spend(project, book, codes)
        await self._owed(project, book)
        await self._agreements(project, book)
        await self._files(project, book)
        return project.name, write.build(book)

    async def _plan(self, project: Project, book: write.Book) -> dict[str, str]:
        scopes = await Scope.filter(project_id=project.id, deleted_at__isnull=True).order_by(
            "sort_order", "id"
        )
        items = await BudgetItem.filter(
            scope__project_id=project.id, scope__deleted_at__isnull=True, deleted_at__isnull=True
        )
        by_scope: dict[str, list[BudgetItem]] = {}
        for item in items:
            by_scope.setdefault(item.scope_id, []).append(item)

        codes: dict[str, str] = {}
        for order, scope in enumerate(scopes, start=1):
            code = scope.code if scope.code and is_scope_code(scope.code) else f"{order}000"
            codes[scope.id] = code
            lines = [
                write.PlanLine(
                    code=f"{code[:-3]}{number:03d}",
                    name=item.description,
                    planned_amount=item.planned_amount,
                    cost_type=item.cost_type.value if item.cost_type else None,
                )
                for number, item in enumerate(by_scope.get(scope.id, []), start=1)
            ]
            book.scopes.append(write.PlanScope(code=code, name=scope.name, lines=lines))
        return codes

    async def _spend(self, project: Project, book: write.Book, codes: dict[str, str]) -> None:
        rows = await Expense.filter(
            project_id=project.id, deleted_at__isnull=True
        ).prefetch_related("vendor", "paid_by", "item")
        files: dict[str, str] = {}
        for attachment in await Attachment.filter(project_id=project.id, deleted_at__isnull=True):
            files.setdefault(attachment.expense_id, attachment.filename)

        vendors: dict[str, write.VendorRow] = {}
        people: dict[str, write.PersonRow] = {}
        prices: dict[str, write.PriceRow] = {}

        for expense in rows:
            vendor = expense.vendor
            if vendor and vendor.id not in vendors:
                vendors[vendor.id] = write.VendorRow(
                    name=vendor.name,
                    trade=vendor.trade or "",
                    contact_name=vendor.contact_name or "",
                    phone=vendor.phone or "",
                    email=vendor.email or "",
                    notes=vendor.notes or "",
                )
            person = expense.paid_by
            if person and person.id not in people:
                people[person.id] = write.PersonRow(
                    name=person.name,
                    role=person.role or "",
                    phone=person.phone or "",
                    notes=person.notes or "",
                )
            item = expense.item
            if item and expense.unit_rate is not None:
                held = prices.get(item.id)
                if held is None or held.spent_on is None or expense.spent_on >= held.spent_on:
                    prices[item.id] = write.PriceRow(
                        name=item.name,
                        unit=item.unit or "",
                        unit_rate=expense.unit_rate,
                        vendor=vendor.name if vendor else "",
                        spent_on=expense.spent_on,
                    )

            book.spend.append(
                write.SpendRow(
                    vendor=vendor.name if vendor else "",
                    code=codes.get(expense.scope_id or "", ""),
                    description=expense.description,
                    spent_on=expense.spent_on,
                    amount=expense.amount,
                    document=files.get(expense.id, ""),
                    paid_by=person.name if person else "",
                    notes=expense.notes or "",
                )
            )

        book.vendors.extend(vendors.values())
        book.people.extend(people.values())
        book.prices.extend(prices.values())

    async def _owed(self, project: Project, book: write.Book) -> None:
        rows = await Delivery.filter(
            project_id=project.id, deleted_at__isnull=True, expense__deleted_at__isnull=True
        ).prefetch_related("expense__vendor")
        for row in rows:
            vendor = row.expense.vendor
            book.owed.append(
                write.OwedRow(
                    description=row.description,
                    vendor=vendor.name if vendor else "",
                    promised=row.promised or "",
                    received_on=row.received_at.date() if row.received_at else None,
                )
            )

    async def _agreements(self, project: Project, book: write.Book) -> None:
        rows = await Agreement.filter(
            project_id=project.id, deleted_at__isnull=True
        ).prefetch_related("vendor")
        paid = await paid_by_agreement([row.id for row in rows])
        for row in rows:
            book.agreements.append(
                write.AgreementRow(
                    vendor=row.vendor.name,
                    description=row.description,
                    agreed_amount=row.agreed_amount,
                    paid_amount=paid.get(row.id, 0),
                )
            )
            if not any(v.name == row.vendor.name for v in book.vendors):
                book.vendors.append(
                    write.VendorRow(
                        name=row.vendor.name,
                        trade=row.vendor.trade or "",
                        contact_name=row.vendor.contact_name or "",
                        phone=row.vendor.phone or "",
                        email=row.vendor.email or "",
                        notes=row.vendor.notes or "",
                    )
                )

    async def _files(self, project: Project, book: write.Book) -> None:
        rows = await Attachment.filter(
            project_id=project.id, deleted_at__isnull=True
        ).prefetch_related("expense")
        for row in rows:
            book.files.append(
                write.FileRow(
                    filename=row.filename,
                    against=row.expense.description,
                    byte_size=row.byte_size,
                    checksum=row.checksum,
                )
            )
