FROM oven/bun:1.3.9 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/agent/package.json packages/agent/package.json
COPY packages/app/package.json packages/app/package.json
RUN bun install --frozen-lockfile
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_API_URL
RUN bun --filter '@contac/app' build

FROM oven/bun:1.3.9
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/app/node_modules ./packages/app/node_modules
COPY --from=build /app/packages/app/package.json ./packages/app/package.json
COPY --from=build /app/packages/app/dist ./packages/app/dist
COPY --from=build /app/packages/app/server.mjs ./packages/app/server.mjs
WORKDIR /app/packages/app
EXPOSE 3000
CMD ["bun", "server.mjs"]
