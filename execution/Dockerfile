# Operator-owned fixed image/toolchain configuration for isolated job execution
FROM node:22.23.2-alpine

# Pin approved npm version
RUN npm install -g npm@10.9.8

# Set up the non-root execution user and directories
RUN addgroup -S worker && adduser -S worker -G worker

# Provide basic utilities and fixed archive extraction tooling.
RUN apk add --no-cache curl bash jq unzip chromium
COPY package.json package-lock.json /opt/browser/
RUN cd /opt/browser && npm ci --ignore-scripts --no-audit --no-fund
COPY browserRunner.cjs /opt/worker/browserRunner.cjs

# Copy the portable executable translation entrypoint
COPY entrypoint.js /opt/worker/entrypoint.js
RUN chown -R worker:worker /opt/worker && chmod +x /opt/worker/entrypoint.js
COPY registryProxy.js /opt/proxy/registryProxy.js
RUN chown -R worker:worker /opt/proxy
# Registry proxy tarball cache (named volume mount point; a new volume inherits this ownership).
RUN mkdir -p /cache && chown worker:worker /cache

USER worker
WORKDIR /workspace

# Container must be run with read-only root, no privileges, no capabilities.
# The entrypoint will handle readiness, timeouts, and process execution safely.
ENTRYPOINT ["node", "/opt/worker/entrypoint.js"]
