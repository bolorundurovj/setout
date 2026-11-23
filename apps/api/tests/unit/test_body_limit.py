import pytest
from starlette.types import Message, Receive, Scope, Send

from setout.utils.body_limit import BodyLimit

pytestmark = [pytest.mark.unit, pytest.mark.asyncio]


async def _run(chunks: list[bytes], headers: list[tuple[bytes, bytes]]) -> tuple[int, bytes]:
    seen: list[bytes] = []

    async def app(scope: Scope, receive: Receive, send: Send) -> None:
        message = await receive()
        seen.append(message["body"])
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    pending = [
        {"type": "http.request", "body": chunk, "more_body": i < len(chunks) - 1}
        for i, chunk in enumerate(chunks)
    ]

    async def receive() -> Message:
        return pending.pop(0)

    sent: list[Message] = []

    async def send(message: Message) -> None:
        sent.append(message)

    scope = {"type": "http", "path": "/api/install/restore", "headers": headers}
    await BodyLimit(app, "/api/install/restore", lambda: 10)(scope, receive, send)
    body = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
    return sent[0]["status"], body if sent[0]["status"] != 200 else b"".join(seen)


async def test_a_body_streamed_past_the_limit_is_refused() -> None:
    status, _ = await _run([b"123456", b"789012"], [])

    assert status == 413


async def test_a_declared_length_past_the_limit_is_refused_before_reading() -> None:
    status, _ = await _run([b"1"], [(b"content-length", b"11")])

    assert status == 413


async def test_a_body_within_the_limit_reaches_the_app_intact() -> None:
    status, body = await _run([b"12345", b"67890"], [])

    assert status == 200
    assert body == b"1234567890"
