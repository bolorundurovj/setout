import pytest

from setout.utils.disposition import content_disposition

pytestmark = pytest.mark.unit


def test_a_plain_name_is_sent_both_ways() -> None:
    header = content_disposition("attachment", "receipt.pdf")

    assert header == "attachment; filename=\"receipt.pdf\"; filename*=UTF-8''receipt.pdf"


def test_a_non_latin_name_gets_an_ascii_fallback_and_a_utf8_name() -> None:
    header = content_disposition("inline", "résumé-土地.pdf")

    header.encode("latin-1")
    assert 'filename="resume-.pdf"' in header
    assert "filename*=UTF-8''r%C3%A9sum%C3%A9-%E5%9C%9F%E5%9C%B0.pdf" in header


def test_a_name_with_no_ascii_letters_falls_back_to_download() -> None:
    assert 'filename="download.pdf"' in content_disposition("inline", "土地.pdf")
    assert 'filename="download"' in content_disposition("inline", "土地")


def test_quotes_and_line_breaks_cannot_break_out_of_the_header() -> None:
    header = content_disposition("inline", 'a"b\r\nSet-Cookie: x=1.pdf')

    assert "\r" not in header
    assert "\n" not in header
    assert 'filename="a\'bSet-Cookie: x=1.pdf"' in header
