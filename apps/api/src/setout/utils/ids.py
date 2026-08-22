from __future__ import annotations

import secrets

# No 0/O or 1/l/I, so an id can be read aloud or copied off a screen.
ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
LENGTH = 12


def short_id() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(LENGTH))
