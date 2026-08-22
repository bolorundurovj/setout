"""Load the sample data.

Everything here is invented: made up places, made up traders, made up people.
The figures are chosen so the app has something to show. The project is over
its budget, one purchase has no scope, one agreement is part paid, and one
person is holding money. The spend runs across the last three months, so the
month by month view has more than one bar in it.

Running this twice changes nothing, so it is safe against a database that
already has it.
"""

from __future__ import annotations

import asyncio
import calendar
import struct
import sys
import zlib
from datetime import UTC, date, datetime, time
from pathlib import Path

# Make the backend package importable when run from the repository root. The
# setout imports below have to follow it, hence the E402.
API_SRC = Path(__file__).resolve().parents[1] / "apps" / "api" / "src"
sys.path.insert(0, str(API_SRC))

from tortoise.transactions import in_transaction  # noqa: E402

from setout.config import get_settings  # noqa: E402
from setout.db import apply_migrations, close_db, init_db  # noqa: E402
from setout.models.advance import Advance  # noqa: E402
from setout.models.attachment import Attachment  # noqa: E402
from setout.models.agreement import Agreement  # noqa: E402
from setout.models.budget import BudgetItem  # noqa: E402
from setout.models.currency import Currency  # noqa: E402
from setout.models.delivery import Delivery  # noqa: E402
from setout.models.expense import CostType, Expense  # noqa: E402
from setout.models.item import Item  # noqa: E402
from setout.models.person import Person  # noqa: E402
from setout.models.project import Project  # noqa: E402
from setout.models.scope import Scope  # noqa: E402
from setout.models.vendor import Vendor  # noqa: E402
from setout.services.storage import build_storage, checksum_of, key_for  # noqa: E402

NGN = 100  # Minor units per naira.

PROJECT = "Jacaranda Close, Ewuru"
SECOND_PROJECT = "Palm Ridge Bungalow"

SCOPES = [
    "Administrative expenses",
    "Equipment rentals",
    "Concrete foundation",
    "Structure and exterior",
    "Interior work",
    "Finalization and inspections",
]

# Scope, planned in naira. Adds up to 2,150,000, which the spend passes. A
# budget that is already blown is the case worth being able to see.
PLANNED = [
    ("Administrative expenses", 150_000),
    ("Equipment rentals", 100_000),
    ("Concrete foundation", 350_000),
    ("Structure and exterior", 1_100_000),
    ("Interior work", 350_000),
    ("Finalization and inspections", 100_000),
]

# Name, trade, who you ask for, phone, note.
VENDORS = [
    ("Bright Star Aluminium", "roofing sheets", "Mr Tunde", "0803 111 4820", None),
    ("Ewuru Block Works", "block supplier", "Mr Kola", None, "No phone number"),
    ("Corner Depot Cement", "cement", "Mrs Adaeze", "0705 662 9013", None),
    ("Riverside Sawmill", "wood supplier", "Iya Bisi", None, None),
    ("Kunle Bricklaying", "bricklayer", "Mr Kunle", "0812 704 5566", None),
    ("Delta Peak Consults", "consultant", "Mr Femi", None, "Retired, hard to reach"),
]

# Name, unit, what it has cost over time in naira.
ITEMS = [
    ("Six inch blocks", "block", [200, 220, 240, 260]),
    ("Cement", "bag", [3_800, 4_200, 4_600, 9_500]),
]

# Dates are held as (months back, day of the month), not as fixed dates, so the
# sample is always about the last three months however long from now it is run.
When = tuple[int, int]

BUDGET_WHEN: When = (2, 1)

# Description, naira, scope, vendor, cost type, quantity, unit rate, when.
Spend = tuple[str, int, str | None, str | None, CostType, int | None, int | None, When]

EXPENSES: list[Spend] = [
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
    # The receipt is gone. It is still real spend, so it is filed to nothing.
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

# Block work, agreed and part paid. Leaves 35,000 owed.
AGREEMENT_AGREED = 180_000
AGREEMENT_PARTS = [
    (60_000, (2, 20)),
    (25_000, (1, 8)),
    (35_000, (1, 22)),
    (15_000, (0, 4)),
    (10_000, (0, 9)),
]

# Paid for and still not delivered.
OWED_WHAT = "17 bags of cement"
OWED_PROMISED = "this week"
OWED_FOR = "12 bags of cement plus delivery"

# Which expense carries a photograph of its receipt in the sample.
RECEIPT_FOR = "Roofing sheets"
RECEIPT_NAME = "receipt_roofing.png"

# Advanced to one person, and what she has paid out so far.
ADVANCE = 80_000
ADVANCE_WHEN: When = (1, 15)
PAID_ON_SITE = 47_500
PAID_ON_SITE_WHEN: When = (0, 6)


def receipt_image(width: int = 240, height: int = 320) -> bytes:
    """A plain slab of colour standing in for a photograph of a receipt.

    Drawn here rather than committed as a file, so nothing binary sits in the
    repository for the sake of sample data.
    """

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
    """Put the file wherever the settings say files go, and record it."""
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


def on(when: When) -> date:
    """A day in one of the last three months, never in the future.

    A day past the end of a short month, or past today in this one, comes back
    as the last day there is.
    """
    months_back, day = when
    today = date.today()
    year, month = today.year, today.month - months_back
    while month < 1:
        month += 12
        year -= 1
    last = today.day if months_back == 0 else calendar.monthrange(year, month)[1]
    return date(year, month, min(day, last))


def at(when: When) -> datetime:
    """The same day as a timestamp, for the columns that hold one."""
    return datetime.combine(on(when), time.min, tzinfo=UTC)


async def seed() -> None:
    status = await apply_migrations()
    print(f"Database status: {status}")
    await init_db()
    try:
        if await Project.exists(name=PROJECT):
            print("Sample data is already there. Nothing to do.")
            return

        # All of it or none of it. A half seeded database looks seeded to the
        # check above, and would then never be filled in.
        async with in_transaction():
            await _load()

        planned = sum(naira for _, naira in PLANNED)
        project = await Project.get(name=PROJECT)
        expenses = await Expense.filter(project_id=project.id).order_by("spent_on")
        spent = sum(e.amount for e in expenses) // NGN
        difference = spent - planned
        standing = f"over by {difference:,}" if difference > 0 else f"under by {-difference:,}"
        months: dict[str, int] = {}
        for expense in expenses:
            key = expense.spent_on.strftime("%b %Y")
            months[key] = months.get(key, 0) + expense.amount // NGN
        print(f"Seeded {project.name}: planned {planned:,}, spent {spent:,}")
        print(f"That is {standing}, with 61,000 of it unfiled.")
        print("Across " + ", ".join(f"{name} {amount:,}" for name, amount in months.items()) + ".")
        print(
            f"Kunle Bricklaying is owed {AGREEMENT_AGREED - sum(p for p, _ in AGREEMENT_PARTS):,}. "
            f"Aunty Ngozi holds {ADVANCE - PAID_ON_SITE:,}."
        )
        print(f"Corner Depot Cement still owes {OWED_WHAT}.")
        print(f"{RECEIPT_FOR} carries a photograph of its receipt.")
    finally:
        await close_db()


async def _load() -> None:
        ngn = await Currency.get(code="NGN")
        project = await Project.create(
            name=PROJECT,
            currency=ngn,
            notes="A three bedroom build, part way up.",
        )
        await Project.create(name=SECOND_PROJECT, currency=ngn)

        scopes = {
            name: await Scope.create(project=project, name=name, sort_order=order)
            for order, name in enumerate(SCOPES)
        }

        for scope_name, naira in PLANNED:
            await BudgetItem.create(
                scope=scopes[scope_name],
                description="Planned",
                planned_amount=naira * NGN,
                set_at=at(BUDGET_WHEN),
            )

        vendors = {
            name: await Vendor.create(
                name=name, trade=trade, contact_name=contact, phone=phone, notes=notes
            )
            for name, trade, contact, phone, notes in VENDORS
        }

        for name, unit, prices in ITEMS:
            await Item.create(
                name=name, unit=unit, notes=f"Has cost {prices[0]:,} to {prices[-1]:,}"
            )

        agreement = await Agreement.create(
            project=project,
            vendor=vendors["Kunle Bricklaying"],
            description="Block work",
            agreed_amount=AGREEMENT_AGREED * NGN,
        )
        for part, when in AGREEMENT_PARTS:
            await Expense.create(
                project=project,
                scope=scopes["Structure and exterior"],
                vendor=vendors["Kunle Bricklaying"],
                agreement=agreement,
                spent_on=on(when),
                description="Part payment",
                amount=part * NGN,
                cost_type=CostType.LABOUR,
            )

        for spend in EXPENSES:
            description, naira, filed_to, bought_from, cost_type, quantity, rate, when = spend
            expense = await Expense.create(
                project=project,
                scope=scopes[filed_to] if filed_to else None,
                vendor=vendors[bought_from] if bought_from else None,
                spent_on=on(when),
                description=description,
                amount=naira * NGN,
                quantity=quantity,
                unit_rate=rate * NGN if rate else None,
                cost_type=cost_type,
            )
            if description == OWED_FOR:
                await Delivery.create(
                    project=project,
                    expense=expense,
                    description=OWED_WHAT,
                    promised=OWED_PROMISED,
                )
            if description == RECEIPT_FOR:
                await attach_receipt(project, expense)

        keeper = await Person.create(name="Aunty Ngozi")
        await Advance.create(
            person=keeper, project=project, given_on=on(ADVANCE_WHEN), amount=ADVANCE * NGN
        )
        await Expense.create(
            project=project,
            scope=scopes["Administrative expenses"],
            paid_by=keeper,
            spent_on=on(PAID_ON_SITE_WHEN),
            description="Paid on site",
            amount=PAID_ON_SITE * NGN,
            cost_type=CostType.FIXED,
        )


if __name__ == "__main__":
    asyncio.run(seed())
