FROM oven/bun:1.3.9
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/agent/package.json packages/agent/package.json
COPY packages/app/package.json packages/app/package.json
COPY packages/mail/package.json packages/mail/package.json
RUN bun install --frozen-lockfile
COPY packages/mail packages/mail
EXPOSE 2525 8788
CMD ["bun", "packages/mail/src/server.ts"]
