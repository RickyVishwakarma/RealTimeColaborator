# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/client/package.json packages/client/

RUN npm ci

COPY packages/shared packages/shared
COPY packages/client packages/client
RUN npm run build --workspace=@rtc/shared \
 && npm run build --workspace=@rtc/client

# --- Runtime stage: static files served by nginx ---
FROM nginx:1.27-alpine AS runtime
COPY packages/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/client/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
