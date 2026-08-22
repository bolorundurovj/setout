# Setout single image: the API serves both the JSON API and the built web app.

FROM node:26-bookworm-slim AS web
WORKDIR /build
RUN corepack enable
# The web app consumes the SDK by path alias, so bring both in.
COPY package.json yarn.lock* ./
COPY packages/api-client ./packages/api-client
COPY apps/web ./apps/web
RUN yarn install --frozen-lockfile || yarn install
# Generate the SDK from the openapi.json.
RUN cd packages/api-client && yarn generate && yarn format
WORKDIR /build/apps/web
RUN yarn build

FROM python:3.12-slim-bookworm AS runtime
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
	SETOUT_PORT=8474 \
	SETOUT_DATA_DIR=/var/lib/setout \
	SETOUT_STATIC_DIR=/app/web

WORKDIR /app/api
COPY apps/api/pyproject.toml apps/api/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY apps/api ./
RUN uv sync --frozen --no-dev

COPY --from=web /build/apps/web/dist/*/browser /app/web

RUN useradd --system --create-home --uid 10001 setout \
	&& mkdir -p "$SETOUT_DATA_DIR" \
	&& chown -R setout:setout "$SETOUT_DATA_DIR" /app
USER setout

VOLUME ["/var/lib/setout"]
EXPOSE 8474

# The app applies migrations on start through its lifespan.
CMD ["sh", "-c", "uv run uvicorn setout.main:app --host 0.0.0.0 --port ${SETOUT_PORT}"]
