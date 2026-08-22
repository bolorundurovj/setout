from __future__ import annotations

from datetime import date, datetime

import pytest

from setout.services.sheets.values import (
    as_code,
    as_date,
    as_flag,
    as_minor,
    as_phone,
    as_text,
    codes_in,
    from_serial,
    is_scope_code,
)

pytestmark = pytest.mark.unit


class TestReadingADate:
    def test_a_serial_becomes_the_day_it_stands_for(self) -> None:
        # 44691 is how the sample workbook holds 10 May 2022.
        assert as_date(44691) == date(2022, 5, 10)
        assert as_date(44927) == date(2023, 1, 1)

    def test_the_phantom_leap_day_does_not_shift_later_dates(self) -> None:
        # Excel believes 1900 had a 29th of February. Serial 61 is 1 March 1900.
        assert as_date(59) == date(1900, 2, 28)
        assert as_date(61) == date(1900, 3, 1)

    def test_a_date_that_arrives_as_a_date_is_left_alone(self) -> None:
        assert as_date(date(2026, 8, 14)) == date(2026, 8, 14)
        assert as_date(datetime(2026, 8, 14, 9, 30)) == date(2026, 8, 14)

    def test_written_dates_are_read(self) -> None:
        assert as_date("2026-08-14") == date(2026, 8, 14)
        assert as_date("14 Aug 2026") == date(2026, 8, 14)

    def test_an_empty_cell_is_no_date(self) -> None:
        assert as_date(None) is None
        assert as_date("") is None
        assert as_date("sometime") is None


class TestReadingMoney:
    def test_naira_become_kobo(self) -> None:
        assert as_minor(500000, 2) == 50_000_000
        assert as_minor("4,126,800", 2) == 412_680_000

    def test_a_currency_symbol_and_spaces_are_ignored(self) -> None:
        assert as_minor("₦19,850.00", 2) == 1_985_000
        assert as_minor("$19,850.00", 2) == 1_985_000

    def test_the_awkward_fractions_do_not_drift(self) -> None:
        # 0.1 + 0.2 in floats is the classic drift; Decimal keeps it exact.
        assert as_minor(0.1, 2) == 10
        assert as_minor(1.15, 2) == 115
        assert as_minor(8.30, 2) == 830

    def test_a_currency_with_no_minor_unit(self) -> None:
        assert as_minor(1500, 0) == 1500

    def test_nothing_to_read_is_nothing(self) -> None:
        assert as_minor(None, 2) is None
        assert as_minor("", 2) is None
        assert as_minor("n/a", 2) is None


class TestReadingText:
    def test_a_whole_number_loses_the_float_tail(self) -> None:
        assert as_text(1000.0) == "1000"
        assert as_text(" Administrative Expenses ") == "Administrative Expenses"

    def test_a_phone_kept_as_a_number_reads_as_digits(self) -> None:
        assert as_phone(8000000001.0) == "8000000001"

    def test_a_phone_typed_as_text_is_left_as_written(self) -> None:
        assert as_phone("(800) 000-0001") == "(800) 000-0001"
        assert as_phone("08000000001, 08000000002") == "08000000001, 08000000002"


class TestCostCodes:
    def test_the_float_tail_comes_off(self) -> None:
        assert as_code(1000.0) == "1000"
        assert as_code("3001.0") == "3001"

    def test_a_code_ending_in_three_noughts_heads_a_scope(self) -> None:
        assert is_scope_code("1000") is True
        assert is_scope_code("6000") is True
        assert is_scope_code("3001") is False
        # Not a scope: too short to be one of the X000 headings.
        assert is_scope_code("000") is False

    def test_a_row_may_name_several_codes(self) -> None:
        assert codes_in("2003, 2005, 3000") == ["2003", "2005", "3000"]
        assert codes_in(1001.0) == ["1001"]
        assert codes_in("") == []


class TestPaidFlag:
    def test_the_ways_a_sheet_says_paid(self) -> None:
        assert as_flag(1) is True
        assert as_flag("yes") is True
        assert as_flag(0) is False
        assert as_flag("") is False


class TestCostCodesInACell:
    def test_a_code_excel_handed_over_as_a_float_is_still_that_code(self) -> None:
        assert codes_in("3001.0") == ["3001"]
        assert codes_in(1000.0) == ["1000"]

    def test_a_cell_may_name_several(self) -> None:
        assert codes_in("2003, 2005, 3000") == ["2003", "2005", "3000"]

    def test_a_figure_with_real_decimals_is_not_a_code(self) -> None:
        assert codes_in("10.02") == []
        assert codes_in("1.5") == []

    def test_a_cell_saying_nothing_names_no_codes(self) -> None:
        assert codes_in("") == []
        assert codes_in(None) == []
        assert codes_in("none") == []


class TestReadingAFlag:
    @pytest.mark.parametrize("cell", [True, 1, "1", "yes", "Y", "true", "paid"])
    def test_a_sheet_says_yes_in_many_ways(self, cell: object) -> None:
        assert as_flag(cell) is True

    @pytest.mark.parametrize("cell", [False, 0, "", None, "no", "n", "false", "x"])
    def test_and_no_in_as_many(self, cell: object) -> None:
        assert as_flag(cell) is False


class TestSerialDatesAtTheEdges:
    def test_the_day_the_1900_system_starts(self) -> None:
        assert from_serial(1) == date(1900, 1, 1)

    def test_the_leap_day_1900_never_had(self) -> None:
        assert from_serial(61) == date(1900, 3, 1)

    def test_a_date_from_the_real_sheet(self) -> None:
        assert from_serial(44691) == date(2022, 5, 10)

    def test_nothing_sensible_comes_back_as_nothing(self) -> None:
        assert from_serial(0) is None
        assert from_serial(-5) is None
