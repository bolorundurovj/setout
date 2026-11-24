"""Browser response policies for the packaged web app, API, and interactive API docs."""

import base64
import hashlib
import re
from pathlib import Path

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send


def app_policy(static_dir: Path | None) -> str:
    scripts = ["'self'"]
    index = static_dir / "index.html" if static_dir else None
    if index and index.is_file():
        # Trust the inline bootstrap scripts shipped with this exact Angular build.
        html = index.read_text(encoding="utf-8")
        for source in re.findall(r"<script\b[^>]*>(.*?)</script>", html, re.I | re.S):
            if source:
                digest = hashlib.sha256(source.encode()).digest()
                scripts.append("'sha256-" + base64.b64encode(digest).decode() + "'")
    return (
        "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; "
        "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: http:; "
        "script-src " + " ".join(scripts)
    )


class SecurityHeaders:
    def __init__(self, app: ASGIApp, static_dir: Path | None) -> None:
        self.app = app
        self.policy = app_policy(static_dir)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path = scope["path"]

        async def add_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["X-Content-Type-Options"] = "nosniff"
                headers["X-Frame-Options"] = "DENY"
                headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
                if path in {"/docs", "/docs/oauth2-redirect", "/redoc"}:
                    headers["Content-Security-Policy"] = (
                        "default-src 'self'; frame-ancestors 'none'; object-src 'none'; "
                        "script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
                        "style-src 'self' https: 'unsafe-inline'; font-src 'self' https:; "
                        "img-src 'self' https: data:; worker-src 'self' blob:"
                    )
                else:
                    headers["Content-Security-Policy"] = self.policy
                if path.startswith(("/api/attachments/", "/api/land-documents/")) and path.endswith(
                    "/file"
                ):
                    headers["Cache-Control"] = "private, no-store"
            await send(message)

        await self.app(scope, receive, add_headers)
