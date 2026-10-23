"""Load the sample data.

All names, places and figures are fictional. The sample project is over budget, has
one uncategorised expense, one partly paid agreement and one advance, with expenses
across the last three months. Running it again makes no changes.
"""

from __future__ import annotations

import asyncio
import calendar
import struct
import sys
import zlib
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path

# Adds the API source to sys.path so the script runs from the repository root; hence E402.
API_SRC = Path(__file__).resolve().parents[1] / "apps" / "api" / "src"
sys.path.insert(0, str(API_SRC))

from tortoise.transactions import in_transaction  # noqa: E402

from setout.config import get_settings  # noqa: E402
from setout.db import apply_migrations, close_db, init_db  # noqa: E402
from setout.models.advance import Advance  # noqa: E402
from setout.models.agreement import Agreement  # noqa: E402
from setout.models.attachment import Attachment  # noqa: E402
from setout.models.budget import BudgetItem  # noqa: E402
from setout.models.category import Category  # noqa: E402
from setout.models.currency import Currency  # noqa: E402
from setout.models.delivery import Delivery  # noqa: E402
from setout.models.expense import CostType, Expense  # noqa: E402
from setout.models.item import Item  # noqa: E402
from setout.models.person import Person  # noqa: E402
from setout.models.project import Project  # noqa: E402
from setout.models.vendor import Vendor  # noqa: E402
from setout.services.storage import build_storage, checksum_of, key_for  # noqa: E402

NGN = 100  # Minor units per naira.

PROJECT = "Jacaranda Close, Ewuru"
SECOND_PROJECT = "Palm Ridge Bungalow"

CATEGORIES = [
    "Administrative expenses",
    "Equipment rentals",
    "Concrete foundation",
    "Structure and exterior",
    "Interior work",
    "Finalisation and inspections",
]

# Category and budget in naira. Totals 2,150,000, which the expenses exceed.
BUDGETS = [
    ("Administrative expenses", 150_000),
    ("Equipment rentals", 100_000),
    ("Concrete foundation", 350_000),
    ("Structure and exterior", 1_100_000),
    ("Interior work", 350_000),
    ("Finalisation and inspections", 100_000),
]

# Name, trade, contact person, phone, notes.
VENDORS = [
    ("Bright Star Aluminium", "roofing sheets", "Mr Tunde", "0803 111 4820", None),
    ("Ewuru Block Works", "block supplier", "Mr Kola", None, "No phone number"),
    ("Corner Depot Cement", "cement", "Mrs Adaeze", "0705 662 9013", None),
    ("Riverside Sawmill", "wood supplier", "Iya Bisi", None, None),
    ("Kunle Bricklaying", "bricklayer", "Mr Kunle", "0812 704 5566", None),
    ("Delta Peak Consults", "consultant", "Mr Femi", None, "Retired, hard to reach"),
]

# Name, unit, price history in naira.
ITEMS = [
    ("Six inch blocks", "block", [200, 220, 240, 260]),
    ("Cement", "bag", [3_800, 4_200, 4_600, 9_500]),
]

# (months back, day of month), so the sample always covers the last three months.
MonthOffset = tuple[int, int]

BUDGET_SET_ON: MonthOffset = (2, 1)

# Description, naira, category, vendor, cost type, quantity, unit rate, when.
ExpenseRow = tuple[str, int, str | None, str | None, CostType, int | None, int | None, MonthOffset]

EXPENSES: list[ExpenseRow] = [
    (
        "Drawings and approval",
        210_000,
        "Administrative expenses",
        "Delta Peak Consults",
        CostType.FIXED,
        None,
        None,
        (2, 3),
    ),
    ("2 trucks of sand", 96_000, "Concrete foundation", None, CostType.MATERIAL, 2, 48_000, (2, 9)),
    (
        "Laterite delivery",
        18_000,
        "Concrete foundation",
        None,
        CostType.MATERIAL,
        None,
        None,
        (2, 17),
    ),
    (
        "Mixer hire for the week",
        85_000,
        "Equipment rentals",
        None,
        CostType.FIXED,
        None,
        None,
        (2, 26),
    ),
    (
        "480 six inch blocks at 260 each",
        124_800,
        "Structure and exterior",
        "Ewuru Block Works",
        CostType.MATERIAL,
        480,
        260,
        (1, 5),
    ),
    (
        "12 bags of cement plus delivery",
        114_000,
        "Structure and exterior",
        "Corner Depot Cement",
        CostType.MATERIAL,
        12,
        9_500,
        (1, 12),
    ),
    # An expense with a lost receipt: placeholder description and no category.
    ("MISSING", 61_000, None, None, CostType.MATERIAL, None, None, (1, 19)),
    (
        "Hardwood for the roof",
        265_000,
        "Structure and exterior",
        "Riverside Sawmill",
        CostType.MATERIAL,
        None,
        None,
        (1, 27),
    ),
    (
        "Roofing sheets",
        820_000,
        "Structure and exterior",
        "Bright Star Aluminium",
        CostType.MATERIAL,
        None,
        None,
        (0, 2),
    ),
    ("Tiles for two rooms", 340_000, "Interior work", None, CostType.MATERIAL, None, None, (0, 8)),
]

# Block work agreement, partly paid. Leaves 35,000 remaining.
AGREEMENT_AGREED = 180_000
AGREEMENT_PAYMENTS = [
    (60_000, (2, 20)),
    (25_000, (1, 8)),
    (35_000, (1, 22)),
    (15_000, (0, 4)),
    (10_000, (0, 9)),
]

# Paid, outstanding delivery.
OUTSTANDING_DESCRIPTION = "17 bags of cement"
OUTSTANDING_EXPECTED_DAYS = 5
OUTSTANDING_EXPENSE = "12 bags of cement plus delivery"

# The expense with a receipt attached.
RECEIPT_FOR = "Roofing sheets"
RECEIPT_NAME = "receipt_roofing.png"

# Advance to one person, and the amount spent from it.
ADVANCE = 80_000
ADVANCE_WHEN: MonthOffset = (1, 15)
PAID_ON_SITE = 47_500
PAID_ON_SITE_WHEN: MonthOffset = (0, 6)


def receipt_image(width: int = 240, height: int = 320) -> bytes:
    """A solid-colour PNG generated at runtime, so no binary sample file is committed."""

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    rows = b"".join(b"\x00" + bytes((214, 218, 224)) * width for _ in range(height))
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(rows))
        + chunk(b"IEND", b"")
    )


async def attach_receipt(project: Project, expense: Expense) -> None:
    image = receipt_image()
    checksum = checksum_of(image)
    key = key_for(checksum, RECEIPT_NAME)
    await build_storage(get_settings()).put(key, image, content_type="image/png")
    await Attachment.create(
        project=project,
        expense=expense,
        filename=RECEIPT_NAME,
        content_type="image/png",
        byte_size=len(image),
        checksum=checksum,
        storage_key=key,
    )


def date_for(when: MonthOffset) -> date:
    """Clamps the day to the end of the month, and to today in the current month."""
    months_back, day = when
    today = date.today()
    year, month = today.year, today.month - months_back
    while month < 1:
        month += 12
        year -= 1
    last = today.day if months_back == 0 else calendar.monthrange(year, month)[1]
    return date(year, month, min(day, last))


def datetime_for(when: MonthOffset) -> datetime:
    return datetime.combine(date_for(when), time.min, tzinfo=UTC)


async def seed() -> None:
    status = await apply_migrations()
    print(f"Database status: {status}")
    await init_db()
    try:
        if await Project.exists(name=PROJECT):
            print("Sample data already exists. No changes made.")
            return

        # A partly seeded database would pass the exists check above and never be completed.
        async with in_transaction():
            await _load()

        budgeted = sum(naira for _, naira in BUDGETS)
        project = await Project.get(name=PROJECT)
        expenses = await Expense.filter(project_id=project.id).order_by("spent_on")
        spent = sum(e.amount for e in expenses) // NGN
        difference = spent - budgeted
        variance_text = f"over by {difference:,}" if difference > 0 else f"under by {-difference:,}"
        months: dict[str, int] = {}
        for expense in expenses:
            key = expense.spent_on.strftime("%b %Y")
            months[key] = months.get(key, 0) + expense.amount // NGN
        print(f"Seeded {project.name}: budgeted {budgeted:,}, spent {spent:,}")
        print(f"Budget {variance_text}, with 61,000 uncategorised.")
        print("Across " + ", ".join(f"{name} {amount:,}" for name, amount in months.items()) + ".")
        print(
            f"Kunle Bricklaying agreement remaining: "
            f"{AGREEMENT_AGREED - sum(p for p, _ in AGREEMENT_PAYMENTS):,}. "
            f"Aunty Ngozi advance balance: {ADVANCE - PAID_ON_SITE:,}."
        )
        print(f"Outstanding from Corner Depot Cement: {OUTSTANDING_DESCRIPTION}.")
        print(f"{RECEIPT_FOR} has a receipt attached.")
    finally:
        await close_db()


async def _load() -> None:
    ngn = await Currency.get(code="NGN")
    project = await Project.create(
        name=PROJECT,
        currency=ngn,
        notes="Three-bedroom house, under construction.",
    )
    await Project.create(name=SECOND_PROJECT, currency=ngn)

    categories = {
        name: await Category.create(project=project, name=name, sort_order=order)
        for order, name in enumerate(CATEGORIES)
    }

    for budget_category, naira in BUDGETS:
        await BudgetItem.create(
            category=categories[budget_category],
            description="Budgeted",
            budgeted_amount=naira * NGN,
            set_at=datetime_for(BUDGET_SET_ON),
        )

    vendors = {
        name: await Vendor.create(
            name=name, trade=trade, contact_name=contact, phone=phone, notes=notes
        )
        for name, trade, contact, phone, notes in VENDORS
    }

    for name, unit, prices in ITEMS:
        await Item.create(
            name=name, unit=unit, notes=f"Price range {prices[0]:,} to {prices[-1]:,}"
        )

    agreement = await Agreement.create(
        project=project,
        vendor=vendors["Kunle Bricklaying"],
        description="Block work",
        agreed_amount=AGREEMENT_AGREED * NGN,
    )
    for payment, when in AGREEMENT_PAYMENTS:
        await Expense.create(
            project=project,
            category=categories["Structure and exterior"],
            vendor=vendors["Kunle Bricklaying"],
            agreement=agreement,
            spent_on=date_for(when),
            description="Part payment",
            amount=payment * NGN,
            cost_type=CostType.LABOUR,
        )

    for row in EXPENSES:
        description, naira, category_name, vendor_name, cost_type, quantity, rate, when = row
        expense = await Expense.create(
            project=project,
            category=categories[category_name] if category_name else None,
            vendor=vendors[vendor_name] if vendor_name else None,
            spent_on=date_for(when),
            description=description,
            amount=naira * NGN,
            quantity=quantity,
            unit_rate=rate * NGN if rate else None,
            cost_type=cost_type,
        )
        if description == OUTSTANDING_EXPENSE:
            await Delivery.create(
                project=project,
                expense=expense,
                description=OUTSTANDING_DESCRIPTION,
                expected=date.today() + timedelta(days=OUTSTANDING_EXPECTED_DAYS),
            )
        if description == RECEIPT_FOR:
            await attach_receipt(project, expense)

    advance_holder = await Person.create(name="Aunty Ngozi")
    await Advance.create(
        person=advance_holder,
        project=project,
        given_on=date_for(ADVANCE_WHEN),
        amount=ADVANCE * NGN,
    )
    await Expense.create(
        project=project,
        category=categories["Administrative expenses"],
        paid_by=advance_holder,
        spent_on=date_for(PAID_ON_SITE_WHEN),
        description="Paid on site",
        amount=PAID_ON_SITE * NGN,
        cost_type=CostType.FIXED,
    )


if __name__ == "__main__":
    asyncio.run(seed())
