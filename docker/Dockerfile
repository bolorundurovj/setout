# Setout single image: the API serves both the JSON API and the built web app.

FROM node:26-bookworm-slim AS web
WORKDIR /build
# hadolint ignore=DL3016
RUN npm install -g corepack && corepack enable
# Manifests first, so editing source does not invalidate the dependency install.
COPY package.json yarn.lock ./
COPY packages/api-client/package.json ./packages/api-client/
COPY apps/web/package.json ./apps/web/
RUN yarn install --frozen-lockfile
# The web app imports the SDK through a path alias, so both are copied.
COPY packages/api-client ./packages/api-client
COPY apps/web ./apps/web
RUN yarn --cwd packages/api-client generate
WORKDIR /build/apps/web
RUN yarn build

FROM python:3.14-slim-bookworm AS runtime
COPY --from=ghcr.io/astral-sh/uv:0.9.17 /uv /bin/uv

ARG SETOUT_VERSION=dev
ARG SETOUT_REVISION=unknown
LABEL org.opencontainers.image.title="Setout" \
	org.opencontainers.image.description="Self-hosted tracker for construction spend on personal building projects" \
	org.opencontainers.image.source="https://github.com/bolorundurovj/setout" \
	org.opencontainers.image.documentation="https://github.com/bolorundurovj/setout/tree/master/docs" \
	org.opencontainers.image.licenses="AGPL-3.0-or-later" \
	org.opencontainers.image.version="${SETOUT_VERSION}" \
	org.opencontainers.image.revision="${SETOUT_REVISION}"

ENV PYTHONUNBUFFERED=1 \
	UV_COMPILE_BYTECODE=1 \
	UV_LINK_MODE=copy \
	PATH="/app/api/.venv/bin:$PATH" \
	SETOUT_DATA_DIR=/var/lib/setout \
	SETOUT_STATIC_DIR=/app/web

WORKDIR /app/api
COPY apps/api/pyproject.toml apps/api/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY apps/api ./
RUN uv sync --frozen --no-dev

COPY --from=web /build/apps/web/dist/*/browser /app/web

# The app only writes to the data directory, so /app stays owned by root and read-only to it.
RUN useradd --system --create-home --uid 10001 setout \
	&& mkdir -p "$SETOUT_DATA_DIR" \
	&& chown setout:setout "$SETOUT_DATA_DIR"
USER setout

VOLUME ["/var/lib/setout"]
# The container always listens on 8474. SETOUT_PORT in docker/.env only picks the host port.
EXPOSE 8474

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
	CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8474/healthz', timeout=4)"]

# The app applies migrations at startup in its lifespan handler. exec makes uvicorn PID 1,
# so docker stop's SIGTERM reaches it and it shuts down cleanly.
CMD ["sh", "-c", "exec uvicorn setout.main:app --host 0.0.0.0 --port 8474 --proxy-headers --forwarded-allow-ips \"${SETOUT_FORWARDED_ALLOW_IPS:-127.0.0.1}\""]
