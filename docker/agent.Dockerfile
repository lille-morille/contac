FROM oven/bun:1.3.9
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/agent/package.json packages/agent/package.json
COPY packages/app/package.json packages/app/package.json
RUN bun install --frozen-lockfile
COPY packages/core packages/core
COPY packages/agent packages/agent
CMD ["bun", "packages/agent/src/worker.ts"]
