FROM oven/bun:1.3.9 AS base
COPY --from=ghcr.io/typst/typst:0.15.1 /bin/typst /usr/local/bin/typst
RUN apt-get update && apt-get install -y --no-install-recommends fonts-liberation && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/agent/package.json packages/agent/package.json
COPY packages/app/package.json packages/app/package.json
COPY packages/mail/package.json packages/mail/package.json
RUN bun install --frozen-lockfile
ENV SEARCH_MODEL_CACHE_DIR=/app/.cache/search-model
COPY packages/api/src/embedding.ts packages/api/src/preload-search-model.ts packages/api/src/
RUN bun packages/api/src/preload-search-model.ts
COPY packages/core packages/core
COPY packages/api packages/api
COPY skills/contac-export-review skills/contac-export-review
EXPOSE 8787
CMD ["bun", "packages/api/src/server.ts"]
