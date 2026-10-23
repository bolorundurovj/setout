from __future__ import annotations

import hashlib
import hmac

import bcrypt

from setout.config import Settings, get_settings


def hash_passphrase(passphrase: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(passphrase.encode("utf-8"), salt).decode("utf-8")


def verify_passphrase(passphrase: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(passphrase.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def delay_for(failures: int, settings: Settings) -> float | None:
    """Returns None once the attempt limit is reached.

    A delay replaces a lockout, which would lock out the only account.
    """
    if failures >= settings.sign_in_max_attempts:
        return None
    delayed_attempts = failures - settings.sign_in_free_attempts
    if delayed_attempts < 0:
        return 0.0
    wait: float = settings.sign_in_delay_seconds * (2**delayed_attempts)
    return min(wait, settings.sign_in_delay_cap_seconds)


def _signature(session_id: str) -> str:
    key = get_settings().secret_key.encode("utf-8")
    return hmac.new(key, session_id.encode("utf-8"), hashlib.sha256).hexdigest()


def sign_session_id(session_id: str) -> str:
    return f"{session_id}.{_signature(session_id)}"


def read_session_id(cookie_value: str) -> str | None:
    """The signature rejects a tampered cookie without a database lookup."""
    session_id, separator, signature = cookie_value.rpartition(".")
    if not separator or not session_id or not signature:
        return None
    # compare_digest rejects non-ASCII str, and the cookie value is untrusted input.
    if not hmac.compare_digest(signature.encode("utf-8"), _signature(session_id).encode("utf-8")):
        return None
    return session_id
