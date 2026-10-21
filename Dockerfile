FROM node:22.23.2-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
RUN npm run build

FROM node:22.23.2-alpine AS llm-plugin-deps
WORKDIR /app/llm-yonetimi
COPY llm-yonetimi/package.json llm-yonetimi/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:22.23.2-alpine AS backend-deps
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:22.23.2-alpine AS runtime
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
# Backend verification budgets share the worker's pure hard-limit module.
# Preserve its ESM package scope without including the execution service.
COPY execution/package.json execution/limits.js /app/execution/
COPY llm-yonetimi/ /app/llm-yonetimi/
COPY --from=llm-plugin-deps /app/llm-yonetimi/node_modules /app/llm-yonetimi/node_modules
COPY docs/ /app/docs/
COPY x-agents/ /app/x-agents/
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist
RUN mkdir -p /app/backend/data/artifacts /app/projects \
    && chown -R xfactor:xfactor /app/backend/data /app/projects
VOLUME ["/app/backend/data", "/app/projects"]
USER xfactor
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8000/healthz || exit 1
CMD ["node", "server.js"]
