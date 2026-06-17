# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app

# Copy manifests first for layer caching.
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/

RUN npm ci

# Copy sources and build shared + server.
COPY packages/shared packages/shared
COPY packages/server packages/server
RUN npm run build --workspace=@rtc/shared \
 && npm run build --workspace=@rtc/server

# --- Runtime stage ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN npm ci --omit=dev

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/server/dist packages/server/dist

EXPOSE 4000
USER node
CMD ["node", "packages/server/dist/index.js"]
