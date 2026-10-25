"""Small, dependency-free ASGI middleware: per-client rate limiting and a snapshot-keyed response cache.

Why these exist
---------------
Every analytics response is a **pure function of (snapshot, request)**: the snapshot only changes on a
deliberate refresh. That makes two things safe and valuable on a small free-tier host:

* ``ResponseCacheMiddleware`` keeps the *rendered* (compressed) JSON, so repeat requests skip pandas, Pydantic and
  gzip entirely, and answers ``If-None-Match`` with ``304`` without computing anything.
* ``RateLimitMiddleware`` bounds how much CPU one client can take from everyone else.

Both are pure ASGI (no ``BaseHTTPMiddleware``), so they add no body buffering or per-request task overhead, and
both are placed *inside* the CORS middleware in ``main.py`` so that 429/304/cached responses still carry the
correct CORS headers for the requesting origin (the cache never stores CORS headers).

Modules: ``rate_limit`` (token bucket), ``response_cache`` (ETag/304 cache), ``shared`` (header helpers, client identity).
"""

from .rate_limit import RateLimitMiddleware
from .response_cache import ResponseCacheMiddleware, _accepts_gzip, _etag_matches
from .shared import MAX_KEY_LENGTH, Headers, client_key

__all__ = [
    "MAX_KEY_LENGTH",
    "Headers",
    "RateLimitMiddleware",
    "ResponseCacheMiddleware",
    "_accepts_gzip",
    "_etag_matches",
    "client_key",
]
