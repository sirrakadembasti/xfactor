FROM node:22.5.0-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
RUN npm run build

FROM node:22.5.0-alpine AS backend-deps
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:22.5.0-alpine AS runtime
WORKDIR /app/backend
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8000 \
    DB_PATH=/app/backend/data/projects.db \
    PROJECTS_ROOT=/app/projects \
    ARTIFACTS_ROOT=/app/backend/data/artifacts
RUN addgroup -S xfactor && adduser -S xfactor -G xfactor
COPY --from=backend-deps /app/backend/node_modules ./node_modules
COPY backend/ ./
COPY docs/ /app/docs/
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist
RUN mkdir -p /app/backend/data/artifacts /app/projects \
    && chown -R xfactor:xfactor /app
VOLUME ["/app/backend/data", "/app/projects"]
USER xfactor
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8000/healthz || exit 1
CMD ["node", "server.js"]
