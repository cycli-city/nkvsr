# syntax=docker/dockerfile:1.7
#
# WindScope UK web UI: static Vite build served by unprivileged nginx, which also reverse-proxies /api/*
# to the backend so the browser sees a single origin (no CORS). Build context: ./frontend
#     docker build -t windscope-web ./frontend

# ---------------------------------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Leave empty to call same-origin /api (proxied by nginx). Set to an absolute URL to call a separate API host.
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

# ---------------------------------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:1.31-alpine AS runtime
# nginx's entrypoint renders *.template files with the container's environment variables.
ENV API_UPSTREAM=http://backend:8000
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
