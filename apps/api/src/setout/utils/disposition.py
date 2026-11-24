from __future__ import annotations

import unicodedata
from pathlib import PurePath
from typing import Literal
from urllib.parse import quote

from setout.utils.file_types import ALLOWED


def upload_disposition(media_type: str, filename: str) -> str:
    return content_disposition("inline" if media_type in ALLOWED else "attachment", filename)


def content_disposition(kind: Literal["inline", "attachment"], filename: str) -> str:
    """A Content-Disposition header value that is safe for any filename.

    HTTP headers are Latin-1, so the name is sent twice: as an ASCII fallback for old
    clients and as UTF-8 in filename* (RFC 6266) for everything else.
    """
    name = "".join(ch for ch in filename if ch.isprintable()).strip() or "download"
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    ascii_name = ascii_name.replace("\\", "_").replace('"', "'").strip()
    path = PurePath(ascii_name)
    if not path.stem or path.stem.startswith("."):
        ascii_name = f"download{PurePath(name).suffix if PurePath(name).suffix.isascii() else ''}"
    return f"{kind}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name, safe='')}"
