from __future__ import annotations

import hashlib
import hmac

import bcrypt

from setout.config import get_settings


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def _signature(session_id: str) -> str:
    key = get_settings().secret_key.encode("utf-8")
    return hmac.new(key, session_id.encode("utf-8"), hashlib.sha256).hexdigest()


def sign_session_id(session_id: str) -> str:
    return f"{session_id}.{_signature(session_id)}"


def read_session_id(cookie_value: str) -> str | None:
    """Return the session id, or None when the signature does not match.

    Session ids are random and stored in the database, so the signature is not
    what makes them unguessable. It lets us reject a tampered cookie without
    touching the database.
    """
    session_id, separator, signature = cookie_value.rpartition(".")
    if not separator or not session_id or not signature:
        return None
    # Compare as bytes: compare_digest rejects non-ASCII str, and the cookie is
    # whatever the caller sent.
    if not hmac.compare_digest(signature.encode("utf-8"), _signature(session_id).encode("utf-8")):
        return None
    return session_id
