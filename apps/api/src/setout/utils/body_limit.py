from __future__ import annotations

import json
from collections.abc import Callable

from starlette.types import ASGIApp, Message, Receive, Scope, Send


class BodyLimit:
    """Reject requests to the given path whose body exceeds the limit, before the app reads it.

    The body is buffered up to the limit and then replayed, so the app sees it unchanged.
    """

    def __init__(self, app: ASGIApp, path: str, limit: Callable[[], int]) -> None:
        self.app = app
        self.path = path
        self.limit = limit

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"] != self.path:
            await self.app(scope, receive, send)
            return

        limit = self.limit()
        declared = dict(scope["headers"]).get(b"content-length", b"")
        if declared.isdigit() and int(declared) > limit:
            await self._too_large(send, limit)
            return

        chunks: list[bytes] = []
        size = 0
        while True:
            message = await receive()
            if message["type"] != "http.request":
                return
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > limit:
                await self._too_large(send, limit)
                return
            chunks.append(chunk)
            if not message.get("more_body", False):
                break

        replayed = False

        async def replay() -> Message:
            nonlocal replayed
            if replayed:
                return await receive()
            replayed = True
            return {"type": "http.request", "body": b"".join(chunks), "more_body": False}

        await self.app(scope, replay, send)

    async def _too_large(self, send: Send, limit: int) -> None:
        body = json.dumps(
            {"detail": f"The backup exceeds this server's limit of {limit:,} bytes"}
        ).encode()
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
