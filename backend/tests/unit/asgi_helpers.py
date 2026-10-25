"""A minimal ASGI harness for the middleware tests: a counting inner app, a fake clock and a request driver."""

from collections.abc import Awaitable, Callable
from typing import Any

import anyio
from starlette.types import Message, Receive, Scope, Send

BODY = b'{"ok": true}'


class CountingApp:
    """Returns a fixed JSON body (or a given status) and records how many times it was called."""

    def __init__(self, status: int = 200, body: bytes = BODY) -> None:
        self.calls = 0
        self.status = status
        self.body = body

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        self.calls += 1
        await send(
            {
                "type": "http.response.start",
                "status": self.status,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(self.body)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": self.body})


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


async def call(
    app: Callable[[Scope, Receive, Send], Awaitable[None]],
    path: str = "/api/summary",
    *,
    method: str = "GET",
    query: str = "",
    headers: dict[str, str] | None = None,
    client: tuple[str, int] | None = ("10.0.0.1", 1234),
) -> tuple[int, dict[str, str], bytes]:
    scope: Scope = {
        "type": "http",
        "method": method,
        "path": path,
        "query_string": query.encode(),
        "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
        "client": client,
    }
    sent: list[Message] = []

    async def receive() -> Message:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: Message) -> None:
        sent.append(message)

    await app(scope, receive, send)
    start = next(m for m in sent if m["type"] == "http.response.start")
    body = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
    headers_out = {k.decode(): v.decode() for k, v in start.get("headers", [])}
    return int(start["status"]), headers_out, body


def run(coro: Awaitable[Any]) -> Any:
    async def runner() -> Any:
        return await coro

    return anyio.run(runner)


# --- rate limiting -------------------------------------------------------------------------------------
