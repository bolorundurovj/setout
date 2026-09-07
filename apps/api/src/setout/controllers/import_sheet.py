from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime

from fastapi import HTTPException, status
from tortoise.transactions import in_transaction

from setout.models.budget import BudgetItem
from setout.models.category import Category
from setout.models.currency import Currency
from setout.models.expense import Expense
from setout.models.person import Person
from setout.models.project import Project
from setout.models.vendor import Vendor
from setout.schemas.import_sheet import (
    Answers,
    CategoryMatch,
    Decision,
    DecisionKind,
    ImportReport,
    ImportResult,
    SampleRow,
    SheetSeen,
    SheetSkipped,
)
from setout.services.sheets.gather import Gathered, gather
from setout.services.sheets.parsed import Trouble
from setout.services.sheets.values import category_code_for
from setout.services.sheets.workbook import Sheet, currency_in
from setout.services.sheets.workbook import read as read_sheets


@dataclass
class Target:
    project: Project | None
    name: str
    currency_code: str
    exponent: int


class ImportController:
    async def look(
        self,
        data: bytes,
        filename: str,
        *,
        project_id: str | None,
        name: str,
        currency_code: str,
    ) -> ImportReport:
        """Read the file and say what would happen. Writes nothing."""
        sheets = read_sheets(data, filename)
        target = await self._target(project_id, name, currency_code or currency_in(sheets))
        found = gather(sheets, target.exponent)
        return await self._report(found, target)

    async def _target(self, project_id: str | None, name: str, currency_code: str) -> Target:
        if project_id:
            project = await Project.get_or_none(
                id=project_id, deleted_at__isnull=True
            ).prefetch_related("currency")
            if project is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
                )
            return Target(
                project=project,
                name=project.name,
                currency_code=project.currency_id,
                exponent=project.currency.exponent,
            )

        if not name.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="A new project needs a name",
            )
        if not currency_code:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="This spreadsheet does not specify a currency, so select one",
            )
        currency = await Currency.get_or_none(code=currency_code)
        if currency is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Unknown currency: {currency_code}",
            )
        return Target(
            project=None,
            name=name.strip(),
            currency_code=currency.code,
            exponent=currency.exponent,
        )

    async def _report(self, found: Gathered, target: Target) -> ImportReport:
        known_categories = await self._known_categories(target.project)
        known_vendors = {v.casefold() for v in await self._known_vendor_names()}
        duplicates = await self._duplicates(found, target.project)

        categories = [
            CategoryMatch(
                code=category.code,
                name=category.name,
                lines=len(category.lines),
                budgeted_amount=category.budgeted_amount,
                matched_to=known_categories.get(category.code)
                or known_categories.get(category.name.casefold()),
            )
            for category in found.budget.categories
        ]
        new_vendors = [v for v in found.vendors.vendors if v.name.casefold() not in known_vendors]

        return ImportReport(
            project_id=target.project.id if target.project else None,
            project_name=target.name,
            currency_code=target.currency_code,
            currency_exponent=target.exponent,
            read=[SheetSeen(name=n, holds=h, rows=r) for n, h, r in found.read],
            skipped=[SheetSkipped(name=n, why=w) for n, w in found.skipped],
            categories=categories,
            budgeted_amount=found.budget.budgeted_amount,
            budgeted_lines=sum(len(s.lines) for s in found.budget.categories),
            spend_rows=len(found.spend.spend),
            spend_amount=found.spend.amount,
            vendors_new=len(new_vendors),
            vendors_known=len(found.vendors.vendors) - len(new_vendors),
            owed_rows=len([o for o in found.owed.owed if not o.resolved]),
            decisions=self._decisions(found, categories, duplicates),
            sample=self._sample(found, known_categories),
            left_behind=sorted(set(found.left_behind)),
        )

    def _sample(self, found: Gathered, known_categories: dict[str, str]) -> list[SampleRow]:
        headings = {category.code: category.name for category in found.budget.categories}
        rows = []
        for line in found.spend.spend[:5]:
            heading = category_code_for(line.codes[0]) if line.codes else ""
            rows.append(
                SampleRow(
                    spent_on=line.spent_on,
                    description=line.description,
                    category=headings.get(heading)
                    or known_categories.get(heading)
                    or "Uncategorized",
                    amount=line.amount,
                )
            )
        return rows

    def _blocking(self, found: Gathered) -> list[Decision]:
        return [decision for decision in self._decisions(found, [], 0) if decision.blocking]

    def _decisions(
        self, found: Gathered, categories: list[CategoryMatch], duplicates: int
    ) -> list[Decision]:
        out: list[Decision] = []

        unmatched = [s for s in categories if s.matched_to is None]
        if unmatched:
            out.append(
                Decision(
                    kind=DecisionKind.NEW_CATEGORIES,
                    count=len(unmatched),
                    detail=", ".join(s.name for s in unmatched[:4]),
                    amount=sum(s.budgeted_amount for s in unmatched),
                )
            )

        for kind, key, wording in (
            (Trouble.SEVERAL_CODES, DecisionKind.SEVERAL_CODES, "name more than one cost code"),
            (Trouble.NOT_PAID, DecisionKind.UNPAID, "are not marked paid"),
            (Trouble.NO_DESCRIPTION, DecisionKind.NO_DESCRIPTION, "carry a figure and no words"),
            (
                Trouble.NO_CATEGORY_YET,
                DecisionKind.ABOVE_ANY_CATEGORY,
                "sit above every category heading",
            ),
        ):
            rows = [p for p in found.problems if p.kind is kind]
            if rows:
                out.append(
                    Decision(
                        kind=key,
                        count=len(rows),
                        detail=f"{len(rows)} rows {wording}",
                        blocking=kind is Trouble.NO_CATEGORY_YET,
                    )
                )

        owed = [o for o in found.owed.owed if not o.resolved]
        if owed:
            out.append(
                Decision(
                    kind=DecisionKind.OWED_NOT_IMPORTABLE,
                    count=len(owed),
                    detail=(
                        "what is owed hangs off the expense that paid for it, and these rows "
                        "carry no amount, so they are listed here rather than brought in"
                    ),
                )
            )

        if duplicates:
            out.append(
                Decision(
                    kind=DecisionKind.DUPLICATES,
                    count=duplicates,
                    detail="already in this project, by date, amount and description",
                )
            )
        return out

    async def _known_categories(self, project: Project | None) -> dict[str, str]:
        if project is None:
            return {}
        rows = await Category.filter(project_id=project.id, deleted_at__isnull=True)
        out: dict[str, str] = {}
        for category in rows:
            if category.code:
                out[category.code] = category.name
            out[category.name.casefold()] = category.name
        return out

    async def _known_vendor_names(self) -> list[str]:
        return [v.name for v in await Vendor.filter(deleted_at__isnull=True)]

    async def _duplicates(self, found: Gathered, project: Project | None) -> int:
        if project is None or not found.spend.spend:
            return 0
        existing = {
            (e.spent_on, e.amount, e.description.casefold())
            for e in await Expense.filter(project_id=project.id, deleted_at__isnull=True)
        }
        return sum(
            1
            for line in found.spend.spend
            if (line.spent_on, line.amount, line.description.casefold()) in existing
        )

    async def bring_in(
        self,
        data: bytes,
        filename: str,
        *,
        project_id: str | None,
        name: str,
        currency_code: str,
        answers: Answers,
    ) -> ImportResult:
        """Write the file into the record, all of it or none of it."""
        sheets: list[Sheet] = read_sheets(data, filename)
        target = await self._target(project_id, name, currency_code or currency_in(sheets))
        found = gather(sheets, target.exponent)

        blocking = self._blocking(found)
        if blocking:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Resolve this first: {blocking[0].detail}",
            )

        async with in_transaction():
            return await self._write(found, target, answers)

    async def _write(self, found: Gathered, target: Target, answers: Answers) -> ImportResult:
        project = target.project or await Project.create(
            name=target.name, currency_id=target.currency_code
        )

        vendors, vendors_made = await self._vendors(found)
        people = await self._people(found)
        categories, landed, items, budgeted = await self._plan(found, project, answers)
        expenses, spent, skipped = await self._spend(
            found, project, vendors, people, categories, answers
        )

        return ImportResult(
            project_id=project.id,
            project_name=project.name,
            categories=len(landed),
            budget_items=items,
            budgeted_amount=budgeted,
            expenses=expenses,
            spend_amount=spent,
            vendors=vendors_made,
            people=len(people),
            skipped_duplicates=skipped,
        )

    async def _vendors(self, found: Gathered) -> tuple[dict[str, str], int]:
        by_name: dict[str, str] = {}
        for vendor in await Vendor.filter(deleted_at__isnull=True):
            by_name[vendor.name.casefold()] = vendor.id
            if vendor.contact_name:
                by_name.setdefault(vendor.contact_name.casefold(), vendor.id)

        made_count = 0
        for line in found.vendors.vendors:
            if line.name.casefold() in by_name:
                continue
            made_count += 1
            made = await Vendor.create(
                name=line.name,
                trade=line.trade or None,
                contact_name=line.contact_name or None,
                phone=line.phone or None,
                email=line.email or None,
                notes=line.notes or None,
            )
            by_name[line.name.casefold()] = made.id
            if line.contact_name:
                by_name.setdefault(line.contact_name.casefold(), made.id)
        return by_name, made_count

    async def _people(self, found: Gathered) -> dict[str, str]:
        wanted = {line.paid_by.strip() for line in found.spend.spend if line.paid_by.strip()}
        by_name = {p.name.casefold(): p.id for p in await Person.filter(deleted_at__isnull=True)}
        for who in sorted(wanted):
            if who.casefold() not in by_name:
                made = await Person.create(name=who)
                by_name[who.casefold()] = made.id
        return by_name

    async def _plan(
        self, found: Gathered, project: Project, answers: Answers
    ) -> tuple[dict[str, str], set[str], int, int]:
        by_code: dict[str, str] = {}
        for known in await Category.filter(project_id=project.id, deleted_at__isnull=True):
            if known.code:
                by_code[known.code] = known.id
            by_code.setdefault(known.name.casefold(), known.id)

        # by_code holds a key per category name as well as per code.
        landed: set[str] = set()
        items = 0
        budgeted = 0
        for order, heading in enumerate(found.budget.categories):
            category_id = by_code.get(heading.code) or by_code.get(heading.name.casefold())
            if category_id is None:
                if not answers.create_missing_categories:
                    continue
                made = await Category.create(
                    project_id=project.id, name=heading.name, code=heading.code, sort_order=order
                )
                category_id = made.id
                by_code[heading.code] = category_id
            landed.add(category_id)

            for line in heading.lines:
                await BudgetItem.create(
                    category_id=category_id,
                    description=line.description,
                    budgeted_amount=line.budgeted_amount,
                    cost_type=line.cost_type,
                    set_at=datetime.now(UTC),
                )
                items += 1
                budgeted += line.budgeted_amount
        return by_code, landed, items, budgeted

    async def _spend(
        self,
        found: Gathered,
        project: Project,
        vendors: dict[str, str],
        people: dict[str, str],
        categories: dict[str, str],
        answers: Answers,
    ) -> tuple[int, int, int]:
        existing = {
            (e.spent_on, e.amount, e.description.casefold())
            for e in await Expense.filter(project_id=project.id, deleted_at__isnull=True)
        }
        written = 0
        total = 0
        skipped = 0

        for line in found.spend.spend:
            if not line.paid and not answers.take_unpaid:
                continue
            spent_on = line.spent_on or date.today()
            key = (spent_on, line.amount, line.description.casefold())
            if answers.skip_duplicates and key in existing:
                skipped += 1
                continue

            category_id = None
            if line.codes and not (
                len(line.codes) > 1 and answers.several_codes == "uncategorized"
            ):
                first = line.codes[0]
                category_id = categories.get(first) or categories.get(category_code_for(first))

            await Expense.create(
                project_id=project.id,
                category_id=category_id,
                vendor_id=vendors.get(line.vendor.casefold()),
                paid_by_id=people.get(line.paid_by.casefold()),
                spent_on=spent_on,
                description=line.description,
                amount=line.amount,
                notes=line.notes or None,
            )
            existing.add(key)
            written += 1
            total += line.amount
        return written, total, skipped
