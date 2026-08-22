from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status

from setout.models.agreement import Agreement
from setout.models.expense import Expense
from setout.models.vendor import Vendor
from setout.schemas.vendor import (
    VendorAgreement,
    VendorAgreements,
    VendorCreate,
    VendorCurrencyTotal,
    VendorPage,
    VendorProjectSpend,
    VendorRead,
    VendorSpend,
    VendorUpdate,
)
from setout.utils.balances import paid_by_agreement

NOT_FOUND_VENDOR = "Vendor not found"
DUPLICATE_NAME = "A vendor with that name already exists"


class VendorController:
    async def list_vendors(
        self, *, search: str | None, include_archived: bool, limit: int, offset: int
    ) -> VendorPage:
        query = Vendor.all() if include_archived else Vendor.filter(deleted_at__isnull=True)
        if search:
            query = query.filter(name__icontains=search)
        total = await query.count()
        vendors = await query.offset(offset).limit(limit)
        totals = await self._totals([vendor.id for vendor in vendors])
        return VendorPage(
            items=[self._read(vendor, totals.get(vendor.id, [])) for vendor in vendors],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def create(self, req: VendorCreate) -> VendorRead:
        await self._reject_duplicate(req.name)
        vendor = await Vendor.create(**req.model_dump())
        return self._read(vendor, [])

    async def get(self, vendor_id: str) -> VendorRead:
        vendor = await self._vendor_or_404(vendor_id, include_deleted=True)
        totals = await self._totals([vendor.id])
        return self._read(vendor, totals.get(vendor.id, []))

    async def update(self, vendor_id: str, req: VendorUpdate) -> VendorRead:
        vendor = await self._vendor_or_404(vendor_id)
        changes = req.model_dump(exclude_unset=True)
        name = changes.get("name")
        if name is not None and name.casefold() != vendor.name.casefold():
            await self._reject_duplicate(name)
        if changes:
            vendor.update_from_dict(changes)
            await vendor.save()
        totals = await self._totals([vendor.id])
        return self._read(vendor, totals.get(vendor.id, []))

    async def delete(self, vendor_id: str) -> None:
        vendor = await self._vendor_or_404(vendor_id)
        vendor.deleted_at = datetime.now(UTC)
        await vendor.save()

    async def restore(self, vendor_id: str) -> VendorRead:
        vendor = await self._vendor_or_404(vendor_id, include_deleted=True)
        if vendor.deleted_at is not None:
            vendor.deleted_at = None
            await vendor.save()
        totals = await self._totals([vendor.id])
        return self._read(vendor, totals.get(vendor.id, []))

    async def spend(self, vendor_id: str) -> VendorSpend:
        vendor = await self._vendor_or_404(vendor_id, include_deleted=True)
        rows: dict[str, VendorProjectSpend] = {}
        for expense in await Expense.filter(
            vendor_id=vendor_id, deleted_at__isnull=True
        ).prefetch_related("project__currency"):
            row = rows.get(expense.project_id)
            if row is None:
                rows[expense.project_id] = VendorProjectSpend(
                    project_id=expense.project_id,
                    project_name=expense.project.name,
                    currency_code=expense.project.currency_id,
                    currency_exponent=expense.project.currency.exponent,
                    expense_count=1,
                    spent_amount=expense.amount,
                )
            else:
                row.expense_count += 1
                row.spent_amount += expense.amount
        return VendorSpend(
            vendor_id=vendor.id,
            name=vendor.name,
            projects=sorted(rows.values(), key=lambda row: row.project_name),
        )

    async def agreements(self, vendor_id: str) -> VendorAgreements:
        vendor = await self._vendor_or_404(vendor_id, include_deleted=True)
        rows = await Agreement.filter(
            vendor_id=vendor_id, deleted_at__isnull=True
        ).prefetch_related("project__currency")
        paid = await paid_by_agreement([row.id for row in rows])
        return VendorAgreements(
            vendor_id=vendor.id,
            name=vendor.name,
            agreements=[
                VendorAgreement(
                    id=row.id,
                    project_id=row.project_id,
                    project_name=row.project.name,
                    currency_code=row.project.currency_id,
                    currency_exponent=row.project.currency.exponent,
                    description=row.description,
                    agreed_amount=row.agreed_amount,
                    paid_amount=paid.get(row.id, 0),
                    balance_amount=row.agreed_amount - paid.get(row.id, 0),
                    created_at=row.created_at,
                    deleted_at=row.deleted_at,
                )
                for row in rows
            ],
        )

    async def _totals(self, vendor_ids: list[str]) -> dict[str, list[VendorCurrencyTotal]]:
        if not vendor_ids:
            return {}
        grouped: dict[str, dict[tuple[str, int], VendorCurrencyTotal]] = {}
        for expense in await Expense.filter(
            vendor_id__in=vendor_ids, deleted_at__isnull=True
        ).prefetch_related("project__currency"):
            owner = expense.vendor_id
            if owner is None:
                continue
            key = (expense.project.currency_id, expense.project.currency.exponent)
            rows = grouped.setdefault(owner, {})
            row = rows.get(key)
            if row is None:
                rows[key] = VendorCurrencyTotal(
                    currency_code=key[0],
                    currency_exponent=key[1],
                    expense_count=1,
                    spent_amount=expense.amount,
                )
            else:
                row.expense_count += 1
                row.spent_amount += expense.amount
        return {owner: [rows[key] for key in sorted(rows)] for owner, rows in grouped.items()}

    def _read(self, vendor: Vendor, totals: list[VendorCurrencyTotal]) -> VendorRead:
        return VendorRead(
            id=vendor.id,
            name=vendor.name,
            trade=vendor.trade,
            contact_name=vendor.contact_name,
            phone=vendor.phone,
            email=vendor.email,
            notes=vendor.notes,
            expense_count=sum(total.expense_count for total in totals),
            totals=totals,
            created_at=vendor.created_at,
            updated_at=vendor.updated_at,
            deleted_at=vendor.deleted_at,
        )

    async def _reject_duplicate(self, name: str) -> None:
        if await Vendor.filter(name__iexact=name, deleted_at__isnull=True).exists():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DUPLICATE_NAME)

    async def _vendor_or_404(self, vendor_id: str, *, include_deleted: bool = False) -> Vendor:
        vendor = await Vendor.get_or_none(id=vendor_id)
        if vendor is None or (vendor.deleted_at is not None and not include_deleted):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_VENDOR)
        return vendor
