# syntax=docker/dockerfile:1.7
#
# WindScope UK API. Build context is the REPOSITORY ROOT so the committed data snapshot can be baked in:
#     docker build -f backend/Dockerfile -t windscope-api .
#
# Two stages: dependencies are installed into a virtualenv in the builder, and only that venv plus the
# app code and the snapshot are copied into the slim runtime image (no compilers, no pip cache).

# ---------------------------------------------------------------------------------------------------
FROM python:3.12-slim AS builder
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /build
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY backend/pyproject.toml ./pyproject.toml
COPY backend/app ./app
RUN pip install .

# ---------------------------------------------------------------------------------------------------
FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    APP_ENV=production \
    DATA_DIR=/app/data \
    PORT=8000

RUN useradd --system --uid 10001 --create-home windscope
WORKDIR /app
COPY --from=builder /opt/venv /opt/venv

# The vetted real-data snapshot (data/snapshots/current/*) is baked into the image so the hosted demo never
# depends on Elexon being reachable. If it is absent, set AUTO_INGEST_ON_START=true to fetch on first boot.
COPY --chown=windscope:windscope data/snapshots/ /app/data/snapshots/
RUN chown -R windscope:windscope /app

USER windscope
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/api/health' % os.environ.get('PORT','8000'), timeout=4)"

# `exec` so uvicorn is PID 1 and receives SIGTERM; PORT is injected by most PaaS (Render, Heroku, Fly, ...).
CMD ["sh", "-c", "exec uvicorn app.main:create_app --factory --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
