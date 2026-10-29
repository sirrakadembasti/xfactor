/**
 * Docker Scaffold Templates (ENG-8)
 * Generates Dockerfile and .dockerignore content for supported project runtime stacks.
 */

export function buildDockerfileContent({
    isNext = false,
    isExpressOnly = false,
    hasVite = false,
    hasExpressApi = false,
    hasPrisma = false
} = {}) {
    let dockerfileLines = [];
    if (isNext) {
        dockerfileLines = [
            'FROM node:22-alpine AS builder',
            'WORKDIR /app',
            'COPY package*.json ./',
            'RUN npm ci && mkdir -p node_modules',
            'COPY . .',
            'RUN mkdir -p public',
            hasPrisma ? 'RUN npx prisma generate' : '',
            'RUN npm run build',
            '',
            'FROM node:22-alpine AS runner',
            'WORKDIR /app',
            'ENV NODE_ENV=production PORT=3000',
            hasPrisma ? 'ENV DATABASE_URL=file:/data/app.db' : '',
            'COPY --from=builder /app/package*.json ./',
            'COPY --from=builder /app/node_modules ./node_modules',
            'COPY --from=builder /app/.next ./.next',
            'COPY --from=builder /app/public ./public',
            hasPrisma ? 'COPY --from=builder /app/prisma ./prisma' : '',
            hasPrisma ? 'RUN mkdir -p /data' : '',
            hasPrisma ? 'VOLUME ["/data"]' : '',
            'EXPOSE 3000',
            hasPrisma ? 'CMD ["sh", "-c", "npx prisma db push && npm start"]' : 'CMD ["npm", "start"]',
            ''
        ];
    } else if (isExpressOnly) {
        dockerfileLines = hasPrisma ? [
            'FROM node:22-alpine AS builder',
            'WORKDIR /app',
            'COPY package*.json ./',
            'RUN npm ci && mkdir -p node_modules',
            'COPY . .',
            'RUN npx prisma generate',
            '',
            'FROM node:22-alpine AS runner',
            'WORKDIR /app',
            'ENV NODE_ENV=production',
            'ENV DATABASE_URL=file:/data/app.db',
            'COPY --from=builder /app ./',
            'RUN mkdir -p /data',
            'VOLUME ["/data"]',
            'EXPOSE 3000',
            'CMD ["sh", "-c", "npx prisma db push && npm start"]',
            ''
        ] : [
            'FROM node:22-alpine',
            'WORKDIR /app',
            'COPY package*.json ./',
            'RUN npm ci --omit=dev',
            'COPY . .',
            'EXPOSE 3000',
            'CMD ["npm", "start"]',
            ''
        ];
    } else if (hasVite && hasExpressApi) {
        dockerfileLines = [
            'FROM node:22-alpine AS builder',
            'WORKDIR /app',
            'COPY package*.json ./',
            'RUN npm ci && mkdir -p node_modules',
            'COPY . .',
            hasPrisma ? 'RUN npx prisma generate' : '',
            'RUN npm run build',
            '',
            'FROM node:22-alpine AS runner',
            'WORKDIR /app',
            'ENV NODE_ENV=production PORT=3000',
            hasPrisma ? 'ENV DATABASE_URL=file:/data/app.db' : '',
            'COPY --from=builder /app ./',
            hasPrisma ? 'RUN mkdir -p /data' : '',
            hasPrisma ? 'VOLUME ["/data"]' : '',
            'EXPOSE 3000 4173',
            hasPrisma ? 'CMD ["sh", "-c", "npx prisma db push && npm start"]' : 'CMD ["npm", "start"]',
            ''
        ];
    } else {
        dockerfileLines = [
            'FROM node:22-alpine AS builder',
            'WORKDIR /app',
            'COPY package*.json ./',
            'RUN npm ci && mkdir -p node_modules',
            'COPY . .',
            'RUN npm run build',
            '',
            'FROM node:22-alpine AS runner',
            'WORKDIR /app',
            'COPY --from=builder /app/package*.json ./',
            'COPY --from=builder /app/node_modules ./node_modules',
            'COPY --from=builder /app/dist ./dist',
            'EXPOSE 4173',
            'CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4173"]',
            ''
        ];
    }
    return dockerfileLines.filter(Boolean).join('\n');
}

export function buildDockerignoreContent() {
    return [
        'node_modules',
        '.next',
        'dist',
        'build',
        '.env',
        '.env.local',
        '.git',
        'npm-debug.log*',
        ''
    ].join('\n');
}
