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
from setout.services.sheets.gather import ParsedWorkbook, parse_workbook
from setout.services.sheets.parsed import ProblemKind
from setout.services.sheets.values import category_code_for
from setout.services.sheets.workbook import Sheet, detect_currency
from setout.services.sheets.workbook import read as read_sheets


@dataclass
class Target:
    project: Project | None
    name: str
    currency_code: str
    exponent: int


class ImportController:
    async def preview(
        self,
        data: bytes,
        filename: str,
        *,
        project_id: str | None,
        name: str,
        currency_code: str,
    ) -> ImportReport:
        """Parse the file and report what an import would change. Writes nothing."""
        sheets = read_sheets(data, filename)
        target = await self._target(project_id, name, currency_code or detect_currency(sheets))
        parsed = parse_workbook(sheets, target.exponent)
        return await self._report(parsed, target)

    async def _target(self, project_id: str | None, name: str, currency_code: str) -> Target:
        if project_id:
            project = await Project.get_or_none(
                id=project_id, archived_at__isnull=True
            ).prefetch_related("currency")
            if project is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="Project not parsed"
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

    async def _report(self, parsed: ParsedWorkbook, target: Target) -> ImportReport:
        known_categories = await self._known_categories(target.project)
        known_vendors = {v.casefold() for v in await self._known_vendor_names()}
        duplicates = await self._duplicates(parsed, target.project)

        categories = [
            CategoryMatch(
                code=category.code,
                name=category.name,
                lines=len(category.lines),
                budgeted_amount=category.budgeted_amount,
                matched_to=known_categories.get(category.code)
                or known_categories.get(category.name.casefold()),
            )
            for category in parsed.budget.categories
        ]
        new_vendors = [v for v in parsed.vendors.vendors if v.name.casefold() not in known_vendors]

        return ImportReport(
            project_id=target.project.id if target.project else None,
            project_name=target.name,
            currency_code=target.currency_code,
            currency_exponent=target.exponent,
            read=[SheetSeen(name=n, holds=h, rows=r) for n, h, r in parsed.sheets_read],
            skipped=[SheetSkipped(name=n, why=w) for n, w in parsed.skipped],
            categories=categories,
            budgeted_amount=parsed.budget.budgeted_amount,
            budgeted_lines=sum(len(s.lines) for s in parsed.budget.categories),
            expense_rows=len(parsed.expenses.expenses),
            spent_amount=parsed.expenses.amount,
            vendors_new=len(new_vendors),
            vendors_known=len(parsed.vendors.vendors) - len(new_vendors),
            outstanding_rows=len([o for o in parsed.outstanding.outstanding if not o.received]),
            decisions=self._decisions(parsed, categories, duplicates),
            sample=self._sample(parsed, known_categories),
            left_behind=sorted(set(parsed.unimported_columns)),
        )

    def _sample(self, parsed: ParsedWorkbook, known_categories: dict[str, str]) -> list[SampleRow]:
        headings = {category.code: category.name for category in parsed.budget.categories}
        rows = []
        for line in parsed.expenses.expenses[:5]:
            heading = category_code_for(line.codes[0]) if line.codes else ""
            rows.append(
                SampleRow(
                    spent_on=line.spent_on,
                    description=line.description,
                    category=headings.get(heading)
                    or known_categories.get(heading)
                    or "Uncategorised",
                    amount=line.amount,
                )
            )
        return rows

    def _blocking(self, parsed: ParsedWorkbook) -> list[Decision]:
        return [decision for decision in self._decisions(parsed, [], 0) if decision.blocking]

    def _decisions(
        self, parsed: ParsedWorkbook, categories: list[CategoryMatch], duplicates: int
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

        for problem_kind, decision_kind, wording in (
            (
                ProblemKind.MULTIPLE_CODES,
                DecisionKind.SEVERAL_CODES,
                "reference more than one cost code",
            ),
            (ProblemKind.NOT_PAID, DecisionKind.UNPAID, "are not marked paid"),
            (
                ProblemKind.NO_DESCRIPTION,
                DecisionKind.NO_DESCRIPTION,
                "have an amount but no description",
            ),
            (
                ProblemKind.BEFORE_FIRST_CATEGORY,
                DecisionKind.ABOVE_ANY_CATEGORY,
                "appear before the first category heading",
            ),
        ):
            rows = [p for p in parsed.problems if p.kind is problem_kind]
            if rows:
                out.append(
                    Decision(
                        kind=decision_kind,
                        count=len(rows),
                        detail=f"{len(rows)} rows {wording}",
                        blocking=problem_kind is ProblemKind.BEFORE_FIRST_CATEGORY,
                    )
                )

        outstanding = [o for o in parsed.outstanding.outstanding if not o.received]
        if outstanding:
            out.append(
                Decision(
                    kind=DecisionKind.OUTSTANDING_NOT_IMPORTABLE,
                    count=len(outstanding),
                    detail=(
                        "a delivery must belong to an expense, and these rows have no amount, "
                        "so they are listed but not imported"
                    ),
                )
            )

        if duplicates:
            out.append(
                Decision(
                    kind=DecisionKind.DUPLICATES,
                    count=duplicates,
                    detail="already in this project, matched by date, amount and description",
                )
            )
        return out

    async def _known_categories(self, project: Project | None) -> dict[str, str]:
        if project is None:
            return {}
        rows = await Category.filter(project_id=project.id, archived_at__isnull=True)
        out: dict[str, str] = {}
        for category in rows:
            if category.code:
                out[category.code] = category.name
            out[category.name.casefold()] = category.name
        return out

    async def _known_vendor_names(self) -> list[str]:
        return [v.name for v in await Vendor.filter(archived_at__isnull=True)]

    async def _duplicates(self, parsed: ParsedWorkbook, project: Project | None) -> int:
        if project is None or not parsed.expenses.expenses:
            return 0
        existing = {
            (e.spent_on, e.amount, e.description.casefold())
            for e in await Expense.filter(project_id=project.id, archived_at__isnull=True)
        }
        return sum(
            1
            for line in parsed.expenses.expenses
            if (line.spent_on, line.amount, line.description.casefold()) in existing
        )

    async def run_import(
        self,
        data: bytes,
        filename: str,
        *,
        project_id: str | None,
        name: str,
        currency_code: str,
        answers: Answers,
    ) -> ImportResult:
        sheets: list[Sheet] = read_sheets(data, filename)
        target = await self._target(project_id, name, currency_code or detect_currency(sheets))
        parsed = parse_workbook(sheets, target.exponent)

        blocking = self._blocking(parsed)
        if blocking:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Resolve this before importing: {blocking[0].detail}",
            )

        async with in_transaction():
            return await self._write(parsed, target, answers)

    async def _write(
        self, parsed: ParsedWorkbook, target: Target, answers: Answers
    ) -> ImportResult:
        project = target.project or await Project.create(
            name=target.name, currency_id=target.currency_code
        )

        vendors, vendors_created = await self._vendors(parsed)
        people = await self._people(parsed)
        categories, category_ids, items, budgeted = await self._import_budget(
            parsed, project, answers
        )
        expenses, spent, skipped = await self._import_expenses(
            parsed, project, vendors, people, categories, answers
        )

        return ImportResult(
            project_id=project.id,
            project_name=project.name,
            category_count=len(category_ids),
            budget_item_count=items,
            budgeted_amount=budgeted,
            expense_count=expenses,
            spent_amount=spent,
            vendor_count=vendors_created,
            person_count=len(people),
            skipped_duplicates=skipped,
        )

    async def _vendors(self, parsed: ParsedWorkbook) -> tuple[dict[str, str], int]:
        by_name: dict[str, str] = {}
        for vendor in await Vendor.filter(archived_at__isnull=True):
            by_name[vendor.name.casefold()] = vendor.id
            if vendor.contact_name:
                by_name.setdefault(vendor.contact_name.casefold(), vendor.id)

        created_count = 0
        for line in parsed.vendors.vendors:
            if line.name.casefold() in by_name:
                continue
            created_count += 1
            created = await Vendor.create(
                name=line.name,
                trade=line.trade or None,
                contact_name=line.contact_name or None,
                phone=line.phone or None,
                email=line.email or None,
                notes=line.notes or None,
            )
            by_name[line.name.casefold()] = created.id
            if line.contact_name:
                by_name.setdefault(line.contact_name.casefold(), created.id)
        return by_name, created_count

    async def _people(self, parsed: ParsedWorkbook) -> dict[str, str]:
        payer_names = {
            line.paid_by.strip() for line in parsed.expenses.expenses if line.paid_by.strip()
        }
        by_name = {p.name.casefold(): p.id for p in await Person.filter(archived_at__isnull=True)}
        for payer_name in sorted(payer_names):
            if payer_name.casefold() not in by_name:
                created = await Person.create(name=payer_name)
                by_name[payer_name.casefold()] = created.id
        return by_name

    async def _import_budget(
        self, parsed: ParsedWorkbook, project: Project, answers: Answers
    ) -> tuple[dict[str, str], set[str], int, int]:
        category_ids_by_key: dict[str, str] = {}
        for known in await Category.filter(project_id=project.id, archived_at__isnull=True):
            if known.code:
                category_ids_by_key[known.code] = known.id
            category_ids_by_key.setdefault(known.name.casefold(), known.id)

        category_ids: set[str] = set()
        items = 0
        budgeted = 0
        for order, heading in enumerate(parsed.budget.categories):
            category_id = category_ids_by_key.get(heading.code) or category_ids_by_key.get(
                heading.name.casefold()
            )
            if category_id is None:
                if not answers.create_missing_categories:
                    continue
                created = await Category.create(
                    project_id=project.id, name=heading.name, code=heading.code, sort_order=order
                )
                category_id = created.id
                category_ids_by_key[heading.code] = category_id
            category_ids.add(category_id)

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
        return category_ids_by_key, category_ids, items, budgeted

    async def _import_expenses(
        self,
        parsed: ParsedWorkbook,
        project: Project,
        vendors: dict[str, str],
        people: dict[str, str],
        categories: dict[str, str],
        answers: Answers,
    ) -> tuple[int, int, int]:
        existing = {
            (e.spent_on, e.amount, e.description.casefold())
            for e in await Expense.filter(project_id=project.id, archived_at__isnull=True)
        }
        imported = 0
        total = 0
        skipped = 0

        for line in parsed.expenses.expenses:
            if not line.paid and not answers.take_unpaid:
                continue
            spent_on = line.spent_on or date.today()
            key = (spent_on, line.amount, line.description.casefold())
            if answers.skip_duplicates and key in existing:
                skipped += 1
                continue

            category_id = None
            if line.codes and not (
                len(line.codes) > 1 and answers.several_codes == "uncategorised"
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
            imported += 1
            total += line.amount
        return imported, total, skipped
