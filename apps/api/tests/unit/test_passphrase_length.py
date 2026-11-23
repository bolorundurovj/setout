import pytest

from setout.services.auth import PassphraseTooLong, hash_passphrase, verify_passphrase

pytestmark = pytest.mark.unit


def test_hashing_a_passphrase_over_72_bytes_raises_a_clear_error() -> None:
    with pytest.raises(PassphraseTooLong, match="up to 72 bytes"):
        hash_passphrase("é" * 36 + "a")


def test_a_passphrase_of_exactly_72_bytes_hashes_and_verifies() -> None:
    hashed = hash_passphrase("é" * 36)

    assert verify_passphrase("é" * 36, hashed) is True
