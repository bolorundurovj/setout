from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status
from tortoise.functions import Count, Sum
from tortoise.transactions import in_transaction

from setout.models.agreement import Agreement
from setout.models.attachment import Attachment
from setout.models.expense import Expense
from setout.models.project import Project
from setout.models.vendor import Vendor
from setout.schemas.vendor import (
    VendorAgreement,
    VendorAgreements,
    VendorCreate,
    VendorCurrencyTotal,
    VendorExpenseSummary,
    VendorPage,
    VendorProjectExpenseSummary,
    VendorRead,
    VendorUpdate,
)
from setout.services import changes
from setout.services.storage import Storage
from setout.utils.balances import paid_by_agreement
from setout.utils.currencies import currency_exponents
from setout.utils.uploads import delete_unreferenced

NOT_FOUND_VENDOR = "Vendor not found"
DUPLICATE_NAME = "A vendor with that name already exists"


class VendorController:
    async def list_vendors(
        self, *, search: str | None, include_archived: bool, limit: int, offset: int
    ) -> VendorPage:
        query = Vendor.all() if include_archived else Vendor.filter(archived_at__isnull=True)
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
        vendor = await self._vendor_or_404(vendor_id, include_archived=True)
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

    async def archive(self, vendor_id: str) -> None:
        vendor = await self._vendor_or_404(vendor_id)
        vendor.archived_at = datetime.now(UTC)
        await vendor.save()

    async def restore(self, vendor_id: str) -> VendorRead:
        vendor = await self._vendor_or_404(vendor_id, include_archived=True)
        if vendor.archived_at is not None:
            await self._reject_duplicate(vendor.name)
            vendor.archived_at = None
            await vendor.save()
        totals = await self._totals([vendor.id])
        return self._read(vendor, totals.get(vendor.id, []))

    async def delete(self, vendor_id: str, storage: Storage | None = None) -> None:
        storage_keys: list[str] = []
        async with in_transaction():
            vendor = await self._vendor_or_404(vendor_id, include_archived=True)
            if vendor.archived_at is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Only archived vendors can be deleted permanently",
                )
            agreement_ids = [
                str(agreement_id)
                for agreement_id in await Agreement.filter(vendor_id=vendor.id).values_list(
                    "id", flat=True
                )
            ]
            if agreement_ids:
                attachments = await Attachment.filter(agreement_id__in=agreement_ids).all()
                storage_keys = [att.storage_key for att in attachments]
                await changes.recorded_update(
                    Expense.filter(agreement_id__in=agreement_ids), agreement_id=None
                )
            await changes.recorded_update(Expense.filter(vendor_id=vendor.id), vendor_id=None)
            await changes.recorded_delete(Agreement.filter(vendor_id=vendor.id))
            await vendor.delete()
        if storage_keys:
            await delete_unreferenced(storage_keys, storage)

    async def expense_summary(self, vendor_id: str) -> VendorExpenseSummary:
        vendor = await self._vendor_or_404(vendor_id, include_archived=True)
        rows = (
            await Expense.filter(vendor_id=vendor_id, archived_at__isnull=True)
            .group_by("project_id")
            .annotate(n=Count("id"), total=Sum("amount"))
            .values("project_id", "n", "total")
        )
        projects = await Project.filter(
            id__in=[row["project_id"] for row in rows]
        ).prefetch_related("currency")
        by_id = {project.id: project for project in projects}
        summaries = [
            VendorProjectExpenseSummary(
                project_id=str(row["project_id"]),
                project_name=by_id[row["project_id"]].name,
                currency_code=by_id[row["project_id"]].currency_id,
                currency_exponent=by_id[row["project_id"]].currency.exponent,
                expense_count=int(row["n"]),
                spent_amount=int(row["total"] or 0),
            )
            for row in rows
        ]
        summaries.sort(key=lambda row: row.project_name)
        return VendorExpenseSummary(
            vendor_id=vendor.id,
            name=vendor.name,
            projects=summaries,
        )

    async def agreements(self, vendor_id: str, *, limit: int, offset: int) -> VendorAgreements:
        vendor = await self._vendor_or_404(vendor_id, include_archived=True)
        query = Agreement.filter(vendor_id=vendor_id, archived_at__isnull=True)
        total = await query.count()
        rows = (
            await query.order_by("-created_at", "id")
            .offset(offset)
            .limit(limit)
            .prefetch_related("project__currency")
        )
        paid = await paid_by_agreement([row.id for row in rows])
        return VendorAgreements(
            vendor_id=vendor.id,
            name=vendor.name,
            total=total,
            limit=limit,
            offset=offset,
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
                    archived_at=row.archived_at,
                )
                for row in rows
            ],
        )

    async def _totals(self, vendor_ids: list[str]) -> dict[str, list[VendorCurrencyTotal]]:
        """Spent amount and expense count per vendor currency, grouped by the database."""
        if not vendor_ids:
            return {}
        rows = (
            await Expense.filter(vendor_id__in=vendor_ids, archived_at__isnull=True)
            .group_by("vendor_id", "project__currency_id")
            .annotate(n=Count("id"), total=Sum("amount"))
            .values("vendor_id", "project__currency_id", "n", "total")
        )
        exponents = await currency_exponents({row["project__currency_id"] for row in rows})
        grouped: dict[str, dict[str, VendorCurrencyTotal]] = {}
        for row in rows:
            code = str(row["project__currency_id"])
            grouped.setdefault(str(row["vendor_id"]), {})[code] = VendorCurrencyTotal(
                currency_code=code,
                currency_exponent=exponents[code],
                expense_count=int(row["n"]),
                spent_amount=int(row["total"] or 0),
            )
        return {
            vendor_id: [rows[code] for code in sorted(rows)] for vendor_id, rows in grouped.items()
        }

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
            archived_at=vendor.archived_at,
        )

    async def _reject_duplicate(self, name: str) -> None:
        if await Vendor.filter(name__iexact=name, archived_at__isnull=True).exists():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DUPLICATE_NAME)

    async def _vendor_or_404(self, vendor_id: str, *, include_archived: bool = False) -> Vendor:
        vendor = await Vendor.get_or_none(id=vendor_id)
        if vendor is None or (vendor.archived_at is not None and not include_archived):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_VENDOR)
        return vendor
