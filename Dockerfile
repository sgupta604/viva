# syntax=docker/dockerfile:1.7
# viva — zero-install runtime image.
# Multi-stage: Node is only present in the build stage. Final image has no
# node_modules and ships the viewer as pre-built static assets.

# ---------- Stage 1: viewer-build ----------
FROM node:20-bookworm-slim AS viewer-build
WORKDIR /src/viewer

# Install deps first for layer caching.
COPY viewer/package.json viewer/package-lock.json ./
RUN npm ci

# Copy the rest of the viewer source and build with sourcemaps stripped
# (sourcemap gate in vite.config.ts is controlled by VITE_SOURCEMAP).
COPY viewer/ ./
ENV VITE_SOURCEMAP=0
RUN npm run build


# ---------- Stage 2: runtime ----------
FROM python:3.12-slim-bookworm AS runtime

# OCI image metadata.
LABEL org.opencontainers.image.title="viva" \
      org.opencontainers.image.description="Config codebase visualizer (offline, zero-install)." \
      org.opencontainers.image.source="https://github.com/sgupta604/viva" \
      org.opencontainers.image.version="0.1.0" \
      org.opencontainers.image.licenses=""

# Runtime libs for lxml wheels. No -dev packages, no compilers: lxml 5.x ships
# manylinux amd64 wheels so pip does not need to build from source.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libxml2 libxslt1.1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install the crawler (runtime deps only; no [dev] extras).
COPY crawler/ ./crawler/
RUN pip install --no-cache-dir ./crawler

# Pre-built viewer from the build stage.
COPY --from=viewer-build /src/viewer/dist ./viewer/dist

# Entrypoint script.
COPY docker/entrypoint.sh /app/docker/entrypoint.sh
RUN chmod +x /app/docker/entrypoint.sh

# Drop privileges for runtime.
RUN useradd --system --uid 1001 --home-dir /app --shell /usr/sbin/nologin viva \
    && chown -R viva:viva /app
USER viva

EXPOSE 5173
ENTRYPOINT ["/app/docker/entrypoint.sh"]
