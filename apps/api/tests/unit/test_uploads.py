from __future__ import annotations

import pytest
from fastapi import HTTPException

from setout.utils.uploads import checked_media_type, sanitise_filename

pytestmark = pytest.mark.unit


@pytest.mark.parametrize(
    ("filename", "expected"),
    [
        ("receipt.jpg", "receipt.jpg"),
        (r"C:\Users\ade\Desktop\receipt.jpg", "receipt.jpg"),
        ("/home/ade/receipt.jpg", "receipt.jpg"),
        ("permit <final>.pdf", "permit final.pdf"),
        ("   ", ""),
    ],
)
def test_sanitise_filename_keeps_the_last_path_segment_and_safe_characters(
    filename: str, expected: str
) -> None:
    assert sanitise_filename(filename) == expected


def test_sanitise_filename_truncates_to_255_characters() -> None:
    assert len(sanitise_filename("a" * 300 + ".pdf")) == 255


def test_checked_media_type_drops_parameters_and_lowercases() -> None:
    assert checked_media_type("Image/JPEG; charset=binary", b"x", subject="An attachment") == (
        "image/jpeg"
    )


def test_checked_media_type_rejects_types_other_than_images_and_pdfs() -> None:
    with pytest.raises(HTTPException) as caught:
        checked_media_type("text/csv", b"x", subject="A land document")

    assert caught.value.status_code == 415
    assert caught.value.detail == "A land document must be an image or a PDF"


def test_checked_media_type_rejects_an_empty_file() -> None:
    with pytest.raises(HTTPException) as caught:
        checked_media_type("application/pdf", b"", subject="An attachment")

    assert caught.value.status_code == 400
