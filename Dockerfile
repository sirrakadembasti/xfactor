# Node.js Multi-Stage Production Dockerfile for XFactor
FROM node:22.5.0-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --ignore-scripts || npm install
COPY frontend/ ./
RUN npm run build

FROM node:22.5.0-alpine AS backend
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S xfactor && adduser -S xfactor -G xfactor

COPY backend/package.json backend/package-lock.json* ./backend/
WORKDIR /app/backend
RUN npm ci --omit=dev --ignore-scripts || npm install --omit=dev
COPY backend/ ./
COPY docs/ ../docs/

# Copy static frontend build into static directory
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

RUN mkdir -p /app/projects && chown -R xfactor:xfactor /app
USER xfactor

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8000/healthz || exit 1

CMD ["node", "server.js"]
