ALLOWED: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "application/pdf": ".pdf",
}


def matches_signature(media_type: str, data: bytes) -> bool:
    signatures = {
        "image/jpeg": b"\xff\xd8\xff",
        "image/png": b"\x89PNG\r\n\x1a\n",
        "application/pdf": b"%PDF-",
    }
    if media_type in signatures:
        return data.startswith(signatures[media_type])
    if media_type == "image/webp":
        return data.startswith(b"RIFF") and data[8:12] == b"WEBP"
    if media_type not in {"image/heic", "image/heif"} or data[4:8] != b"ftyp":
        return False
    size = int.from_bytes(data[:4], "big")
    if size < 16 or size > len(data) or size % 4:
        return False
    brands = {data[8:12], *(data[i : i + 4] for i in range(16, size, 4))}
    valid = {b"heic", b"heix", b"hevc", b"hevx"}
    if media_type == "image/heif":
        valid.update({b"mif1", b"msf1"})
    return bool(brands & valid)
