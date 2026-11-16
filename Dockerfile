# Two runtime images share one build:
#   app-slim  — api, web and setup (no Python); the smaller filesystem image.
#   app-full  — the worker, which also needs the quant engine's Python interpreter and libraries.
# Build arg NPM_REGISTRY switches the npm registry (e.g. https://registry.npmmirror.com in mainland China).
FROM node:24-trixie-slim AS base
WORKDIR /app
# pg_dump for the optional database backups (Debian's client matches the PostgreSQL 17 server in compose).
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client ca-certificates \
 && rm -rf /var/lib/apt/lists/*

FROM base AS build
ARG NPM_REGISTRY=
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/backend/package.json packages/backend/
COPY packages/contracts/package.json packages/contracts/
COPY industry/package.json industry/
COPY site/package.json site/
COPY modules/chronicle/package.json modules/chronicle/
COPY modules/analytics/package.json modules/analytics/
COPY modules/costs/package.json modules/costs/
COPY modules/quant/package.json modules/quant/
RUN npm ci --no-audit --no-fund ${NPM_REGISTRY:+--registry=$NPM_REGISTRY}
COPY . .
RUN npm run build -w @aihot/web && npm prune --omit=dev --no-audit --no-fund

# Runtime image for api, web and setup.
FROM base AS app-slim
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.ts"]

# The worker also runs the out-of-tree quant engine (stock-daily-analyzer, kept in the data volume at
# /data/quant-engine) as a subprocess, so its interpreter and libraries ship with this image only. The
# code is not baked in: upload it to the data volume and it is picked up by QUANT_ENGINE_DIR.
FROM app-slim AS app-full
USER root
# Build arg PIP_INDEX_URL switches the Python package index (e.g. https://pypi.tuna.tsinghua.edu.cn/simple in mainland China).
ARG PIP_INDEX_URL=
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv \
 && rm -rf /var/lib/apt/lists/* \
 && python3 -m venv /opt/quant-venv \
 && /opt/quant-venv/bin/pip install --no-cache-dir ${PIP_INDEX_URL:+--index-url $PIP_INDEX_URL} --upgrade pip \
 && /opt/quant-venv/bin/pip install --no-cache-dir ${PIP_INDEX_URL:+--index-url $PIP_INDEX_URL} akshare pandas numpy yfinance requests python-dotenv
ENV QUANT_PYTHON=/opt/quant-venv/bin/python
USER node
