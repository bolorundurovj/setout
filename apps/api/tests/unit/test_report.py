from __future__ import annotations

import re
from datetime import date

import pytest

from setout.services import report

pytestmark = pytest.mark.unit


def a_report(**over: object) -> report.ProjectReport:
    built = report.ProjectReport(
        project_name="Jacaranda Close, Ewuru",
        land_name="Plot 14, Ewuru",
        currency_code="NGN",
        exponent=2,
        generated_on=date(2026, 10, 25),
        budgeted_amount=500_000_00,
        spent_amount=176_500_00,
        categories=[report.CategoryLine("Foundation", 500_000_00, 176_500_00)],
        cost_types=[report.CostTypeLine("Material", 500_000_00, 176_500_00)],
        months=[report.MonthLine("2026-08", 176_500_00, 2)],
        agreements=[
            report.AgreementLine("Adebayo Blocks", "Block work", 300_000_00, 100_000_00, 200_000_00)
        ],
        advances=[report.AdvanceLine("Ayo", 50_000_00, 80_000_00, -30_000_00)],
        outstanding=[
            report.OutstandingLine(
                "17 bags of cement", "Corner Depot", date(2026, 10, 30), 76_500_00
            )
        ],
    )
    for name, value in over.items():
        setattr(built, name, value)
    return built


def test_render_returns_a_pdf_with_every_section_filled() -> None:
    assert report.render(a_report()).startswith(b"%PDF")


def test_render_returns_a_pdf_for_an_empty_project() -> None:
    empty = a_report(
        land_name=None,
        budgeted_amount=0,
        spent_amount=0,
        categories=[],
        cost_types=[],
        months=[],
        agreements=[],
        advances=[],
        outstanding=[],
    )
    assert report.render(empty).startswith(b"%PDF")


def test_render_handles_a_project_over_budget_and_a_currency_without_minor_units() -> None:
    over = a_report(exponent=0, budgeted_amount=1_000, spent_amount=1_500)
    assert report.render(over).startswith(b"%PDF")


def test_render_accepts_markup_characters_and_long_descriptions() -> None:
    long = a_report(
        project_name="Smith & Sons <Phase 2>",
        agreements=[
            report.AgreementLine(
                "Adebayo Blocks & Sons", "Block work " * 30, 300_000_00, 100_000_00, 200_000_00
            )
        ],
    )
    assert report.render(long).startswith(b"%PDF")


def test_render_embeds_the_app_fonts() -> None:
    pdf = report.render(a_report())
    assert b"DMSans" in pdf
    assert b"DMMono" in pdf


def test_render_spreads_a_long_report_over_numbered_pages() -> None:
    long = a_report(
        months=[report.MonthLine(f"2025-{month:02d}", 1_000_00, 1) for month in range(1, 13)] * 6
    )

    pdf = report.render(long)

    assert len(re.findall(rb"/Type /Page\b", pdf)) > 1
