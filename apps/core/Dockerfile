# Build context = raiz do monorepo.
# Core serve a API + o painel (Vite build copiado p/ apps/core/public, servido em /app).

FROM node:22-slim AS build
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@11.5.1
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @dispatch/shared build \
 && pnpm exec prisma generate \
 && pnpm --filter @dispatch/panel build \
 && pnpm --filter @dispatch/core build \
 && mkdir -p apps/core/public \
 && cp -r apps/panel/dist/. apps/core/public/

FROM node:22-slim AS runtime
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production
CMD ["node", "apps/core/dist/main.js"]
