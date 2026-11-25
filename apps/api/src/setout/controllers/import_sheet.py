from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import UTC, date, datetime

from fastapi import HTTPException, status
from tortoise.transactions import in_transaction

from setout.models.budget import BudgetItem
from setout.models.category import Category
from setout.models.currency import Currency
from setout.models.expense import Expense
from setout.models.item import Item
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
from setout.services import changes
from setout.services.sheets.gather import ParsedWorkbook, parse_workbook
from setout.services.sheets.parsed import ExpenseLine, ProblemKind
from setout.services.sheets.values import category_code_for
from setout.services.sheets.workbook import Sheet, detect_currency
from setout.services.sheets.workbook import read as read_sheets


@dataclass
class Target:
    project: Project | None
    name: str
    currency_code: str
    exponent: int


@dataclass
class ClassifiedExpense:
    line: ExpenseLine
    spent_on: date
    duplicate: str | None


def vendor_names(entries: list[tuple[str, str | None]]) -> dict[str, str]:
    names = {name.casefold(): name.casefold() for name, _ in entries}
    contacts: dict[str, set[str]] = {}
    for name, contact in entries:
        if contact:
            contacts.setdefault(contact.casefold(), set()).add(name.casefold())
    for contact, companies in contacts.items():
        if len(companies) == 1:
            names.setdefault(contact, next(iter(companies)))
    return names


async def classify_rows(
    parsed: ParsedWorkbook, project: Project | None, *, take_unpaid: bool
) -> list[ClassifiedExpense]:
    vendors = await Vendor.filter(archived_at__isnull=True)
    entries = [(v.name, v.contact_name) for v in vendors]
    known = {v.name.casefold() for v in vendors}
    entries.extend(
        (v.name, v.contact_name) for v in parsed.vendors.vendors if v.name.casefold() not in known
    )
    aliases = vendor_names(entries)
    existing: set[tuple[date, int, str, str, str]] = set()
    if project:
        expenses = await Expense.filter(
            project_id=project.id, archived_at__isnull=True
        ).prefetch_related("vendor", "paid_by")
        existing.update(
            (
                e.spent_on,
                e.amount,
                e.description.casefold(),
                e.vendor.name.casefold() if e.vendor else "",
                e.paid_by.name.casefold() if e.paid_by else "",
            )
            for e in expenses
        )
    seen: set[tuple[date, int, str, str, str]] = set()
    today = date.today()
    rows = []
    for line in parsed.expenses.expenses:
        if not line.paid and not take_unpaid:
            continue
        spent_on = line.spent_on or today
        vendor = line.vendor.casefold()
        key = (
            spent_on,
            line.amount,
            line.description.casefold(),
            aliases.get(vendor, vendor),
            line.paid_by.casefold(),
        )
        source = "project" if key in existing else "file" if key in seen else None
        rows.append(ClassifiedExpense(line, spent_on, source))
        seen.add(key)
    return rows


IMPORT_COUNTS = {
    "category_count",
    "budget_item_count",
    "expense_count",
    "vendor_count",
    "person_count",
}


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
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="The selected project could not be found.",
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

    async def _exclude_existing_budget_lines(
        self, parsed: ParsedWorkbook, project: Project | None
    ) -> None:
        if project is None or not parsed.budget.categories:
            return
        categories = await Category.filter(project_id=project.id, archived_at__isnull=True)
        by_key = {c.name.casefold(): c.id for c in categories}
        by_key.update({c.code: c.id for c in categories if c.code})
        items = await BudgetItem.filter(
            category_id__in=list(by_key.values()), archived_at__isnull=True
        )
        remaining: Counter[tuple[str, str, int, str | None]] = Counter(
            (i.category_id, i.description.casefold(), i.budgeted_amount, i.cost_type) for i in items
        )
        for heading in parsed.budget.categories:
            category_id = by_key.get(heading.code) or by_key.get(heading.name.casefold())
            if category_id is None:
                continue
            new_lines = []
            for line in heading.lines:
                key = (
                    category_id,
                    line.description.casefold(),
                    line.budgeted_amount,
                    line.cost_type,
                )
                if remaining[key]:
                    remaining[key] -= 1
                else:
                    new_lines.append(line)
            heading.lines = new_lines

    async def _report(self, parsed: ParsedWorkbook, target: Target) -> ImportReport:
        await self._exclude_existing_budget_lines(parsed, target.project)
        known_categories = await self._known_categories(target.project)
        known_vendors = await Vendor.filter(archived_at__isnull=True)
        classified = await classify_rows(parsed, target.project, take_unpaid=True)
        duplicates = [row.line.row for row in classified if row.duplicate]

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
        existing_names = {v.name.casefold() for v in known_vendors}
        aliases = vendor_names(
            [(v.name, v.contact_name) for v in known_vendors]
            + [
                (v.name, v.contact_name)
                for v in parsed.vendors.vendors
                if v.name.casefold() not in existing_names
            ]
        )
        referenced = {v.name.casefold() for v in parsed.vendors.vendors}
        referenced.update(
            aliases.get(e.vendor.casefold(), e.vendor.casefold())
            for e in parsed.expenses.expenses
            if e.vendor
        )

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
            vendors_new=len(referenced - existing_names),
            vendors_known=len(referenced & existing_names),
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
        return [decision for decision in self._decisions(parsed, [], []) if decision.blocking]

    def _decisions(
        self, parsed: ParsedWorkbook, categories: list[CategoryMatch], duplicates: list[int]
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
                    count=len(duplicates),
                    detail="Possible duplicate expense rows: " + ", ".join(map(str, duplicates)),
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
            with changes.recording_paused():
                result = await self._write(parsed, target, answers)
            await changes.record_import(result.project_id, result.model_dump(include=IMPORT_COUNTS))
            return result

    async def _write(
        self, parsed: ParsedWorkbook, target: Target, answers: Answers
    ) -> ImportResult:
        project = target.project or await Project.create(
            name=target.name, currency_id=target.currency_code
        )

        await Project.filter(id=project.id).select_for_update().first()
        await self._exclude_existing_budget_lines(parsed, project)
        classified = await classify_rows(parsed, project, take_unpaid=answers.take_unpaid)
        vendors, vendors_created = await self._vendors(parsed)
        people = await self._people(
            [r.line for r in classified if not (answers.skip_duplicates and r.duplicate)]
        )
        catalogue = await self._items(parsed)
        categories, category_ids, items, budgeted = await self._import_budget(
            parsed, project, answers
        )
        expenses, spent, skipped = await self._import_expenses(
            classified, project, vendors, people, catalogue, categories, answers
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
            skipped_file_duplicates=sum(r.duplicate == "file" for r in classified)
            if answers.skip_duplicates
            else 0,
        )

    async def _vendors(self, parsed: ParsedWorkbook) -> tuple[dict[str, str], int]:
        existing = await Vendor.filter(archived_at__isnull=True)
        by_name = {v.name.casefold(): v.id for v in existing}
        entries = [(v.name, v.contact_name) for v in existing]

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
            entries.append((line.name, line.contact_name))
        aliases = vendor_names(entries)
        resolved = {alias: by_name[name] for alias, name in aliases.items()}
        for expense in parsed.expenses.expenses:
            key = expense.vendor.casefold()
            if key and key not in resolved:
                vendor = await Vendor.create(name=expense.vendor)
                resolved[key] = vendor.id
                created_count += 1
        return resolved, created_count

    async def _people(self, lines: list[ExpenseLine]) -> dict[str, str]:
        payer_names = {line.paid_by.strip() for line in lines if line.paid_by.strip()}
        by_name = {p.name.casefold(): p.id for p in await Person.filter(archived_at__isnull=True)}
        for payer_name in sorted(payer_names):
            if payer_name.casefold() not in by_name:
                created = await Person.create(name=payer_name)
                by_name[payer_name.casefold()] = created.id
        return {name.casefold(): by_name[name.casefold()] for name in payer_names}

    async def _items(self, parsed: ParsedWorkbook) -> dict[str, str]:
        units = {
            line.item.strip(): line.unit.strip()
            for line in parsed.expenses.expenses
            if line.item.strip()
        }
        by_name = {i.name.casefold(): i.id for i in await Item.filter(archived_at__isnull=True)}
        for name in sorted(units):
            if name.casefold() not in by_name:
                created = await Item.create(name=name, unit=units[name] or None)
                by_name[name.casefold()] = created.id
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
        created_with_parent: list[tuple[Category, str]] = []
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
                if heading.parent_code:
                    created_with_parent.append((created, heading.parent_code))
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

        # Parents are linked after every row is read, since a parent can follow its child.
        for child, parent_code in created_with_parent:
            parent_id = category_ids_by_key.get(parent_code)
            if parent_id and parent_id != child.id:
                child.parent_id = parent_id
                await child.save()
        return category_ids_by_key, category_ids, items, budgeted

    async def _import_expenses(
        self,
        rows: list[ClassifiedExpense],
        project: Project,
        vendors: dict[str, str],
        people: dict[str, str],
        catalogue: dict[str, str],
        categories: dict[str, str],
        answers: Answers,
    ) -> tuple[int, int, int]:
        imported = 0
        total = 0
        skipped = 0

        for row in rows:
            line = row.line
            if answers.skip_duplicates and row.duplicate:
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
                spent_on=row.spent_on,
                description=line.description,
                amount=line.amount,
                notes=line.notes or None,
                cost_type=line.cost_type,
                quantity=line.quantity,
                unit_rate=line.unit_rate,
                item_id=catalogue.get(line.item.casefold()) if line.item else None,
            )
            imported += 1
            total += line.amount
        return imported, total, skipped
