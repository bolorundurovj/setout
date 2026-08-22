from __future__ import annotations

from fastapi import HTTPException, UploadFile, status


async def read_capped(file: UploadFile, cap: int) -> bytes:
    data = await file.read(cap + 1)
    if len(data) > cap:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"That file is larger than the {cap // (1024 * 1024)} MB limit",
        )
    return data
