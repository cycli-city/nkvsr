"""Helpers shared by the middleware: raw ASGI header access, client identity and the JSON error body."""

from __future__ import annotations

import json

from starlette.types import Scope

Headers = list[tuple[bytes, bytes]]

MAX_KEY_LENGTH = 64  # client keys come from request headers: bound the memory one request can pin


def header(scope: Scope, name: bytes) -> str:
    for key, value in scope.get("headers", []):
        if key == name:
            return str(value.decode("latin-1"))
    return ""


def client_key(scope: Scope) -> str:
    """Best-effort client identity: first ``X-Forwarded-For`` hop, else the socket peer.

    Trade-off (documented in docs/03-ARCHITECTURE.md): a client can spoof this header to evade *its own* limit, but cannot
    use it to consume anyone else's budget; trusting only the right-most hop would instead make every user share the
    proxy's bucket if the platform adds more than one proxy. Network-level abuse is the edge's job (Render sits behind
    Cloudflare); this limiter protects the application's CPU from a single noisy client.
    """
    forwarded = header(scope, b"x-forwarded-for").split(",")[0].strip()
    if forwarded:
        return forwarded[:MAX_KEY_LENGTH]
    client = scope.get("client")
    return str(client[0])[:MAX_KEY_LENGTH] if client else "unknown"


def json_error(code: str, message: str) -> bytes:
    return json.dumps({"error": {"code": code, "message": message, "details": None}}).encode()
