# Build context = raiz do monorepo. Processo de sessoes Baileys (sem porta HTTP).

FROM node:22-slim AS build
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@11.5.1
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @dispatch/shared build \
 && pnpm exec prisma generate \
 && pnpm --filter @dispatch/session-worker build

FROM node:22-slim AS runtime
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production
CMD ["node", "apps/session-worker/dist/main.js"]
