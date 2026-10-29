/**
 * Prisma & Auth Scaffold Templates (ENG-8)
 * Generates dual prisma/db bridges, schema.prisma, seed scripts, and auth helpers.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

export function ensureUserModelInSchema(schemaText) {
    if (!/model\s+User\s*\{/i.test(schemaText)) {
        const userModel = `\nmodel User {\n  id        String   @id @default(uuid())\n  username  String   @unique\n  password  String\n  role      String   @default("user")\n  createdAt DateTime @default(now())\n}\n`;
        return schemaText + (schemaText.endsWith('\n') ? '' : '\n') + userModel;
    }

    return schemaText.replace(/model\s+User\s*\{([\s\S]*?)\}/i, (match, body) => {
        let newBody = body;
        if (!/\bid\b/.test(newBody)) {
            newBody += `\n  id        String   @id @default(uuid())`;
        }
        if (!/\busername\b/.test(newBody)) {
            newBody += `\n  username  String   @unique`;
        }
        if (!/\bpassword\b/.test(newBody)) {
            newBody += `\n  password  String`;
        }
        if (!/\brole\b/.test(newBody)) {
            newBody += `\n  role      String   @default("user")`;
        }
        if (!/\bcreatedAt\b/.test(newBody)) {
            newBody += `\n  createdAt DateTime @default(now())`;
        }
        if (newBody === body) return match;
        return `${match.slice(0, match.indexOf('{') + 1)}${newBody}\n}`;
    });
}

export async function ensurePrismaAndAuthTemplates({
    projectDir,
    hasPrisma = false,
    isAuthRequired = false,
    plan = {},
    sourceFence = null,
    writeSource
}) {
    if (!writeSource) {
        throw new TypeError('ensurePrismaAndAuthTemplates requires a writeSource function.');
    }

    // 8. Prisma ve DB İstemcisi Çift Köprü Garantisi (src/lib/prisma.ts <-> src/lib/db.ts)
    if (hasPrisma) {
        const libDir = path.join(projectDir, 'src', 'lib');
        const prismaPath = path.join(libDir, 'prisma.ts');
        const dbPath = path.join(libDir, 'db.ts');

        await fs.mkdir(libDir, { recursive: true });
        const prismaExists = await fs.stat(prismaPath).then(() => true).catch(() => false);
        const dbExists = await fs.stat(dbPath).then(() => true).catch(() => false);

        if (!prismaExists && !dbExists) {
            const defaultPrismaClient = `import { PrismaClient } from '@prisma/client';\n\nconst globalForPrisma = globalThis as unknown as {\n  prisma: PrismaClient | undefined;\n};\n\nexport const prisma = globalForPrisma.prisma ?? new PrismaClient();\nexport const db = prisma;\n\nif (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;\n\nexport default prisma;\n`;
            await writeSource(prismaPath, defaultPrismaClient, 'utf8');
            await writeSource(dbPath, `import { prisma, db } from './prisma';\nexport * from './prisma';\nexport { prisma, db };\nexport default prisma;\n`, 'utf8');
        } else if (prismaExists && !dbExists) {
            const dbBridgeContent = `import { prisma } from './prisma';\nexport * from './prisma';\nexport const db = prisma;\nexport default prisma;\n`;
            await writeSource(dbPath, dbBridgeContent, 'utf8');
        } else if (dbExists && !prismaExists) {
            const prismaBridgeContent = `import { db } from './db';\nexport * from './db';\nexport const prisma = db;\nexport default db;\n`;
            await writeSource(prismaPath, prismaBridgeContent, 'utf8');
        }
    }

    // 9. Pragmatic Auth Standartları (schema.prisma User modeli, seed.ts admin, src/lib/auth.ts)
    if (isAuthRequired) {
        // 9a. schema.prisma (prisma/schema.prisma veya schema.prisma)
        const schemaPath1 = path.join(projectDir, 'prisma', 'schema.prisma');
        const schemaPath2 = path.join(projectDir, 'schema.prisma');
        const stat1 = await fs.stat(schemaPath1).catch(() => null);
        const stat2 = await fs.stat(schemaPath2).catch(() => null);
        let actualSchemaPath = stat1 ? schemaPath1 : (stat2 ? schemaPath2 : null);

        if (!actualSchemaPath) {
            actualSchemaPath = schemaPath1;
            await fs.mkdir(path.dirname(actualSchemaPath), { recursive: true });
            const defaultSchema = `generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "sqlite"\n  url      = env("DATABASE_URL")\n}\n\nmodel User {\n  id        String   @id @default(uuid())\n  username  String   @unique\n  password  String\n  role      String   @default("user")\n  createdAt DateTime @default(now())\n}\n`;
            await writeSource(actualSchemaPath, defaultSchema, 'utf8');
        } else {
            const schemaText = await fs.readFile(actualSchemaPath, 'utf8');
            const updatedSchema = ensureUserModelInSchema(schemaText);
            if (updatedSchema !== schemaText) {
                await writeSource(actualSchemaPath, updatedSchema, 'utf8');
            }
        }

        // 9b. prisma/seed.ts (veya seed.js)
        const seedTsPath = path.join(projectDir, 'prisma', 'seed.ts');
        const seedJsPath = path.join(projectDir, 'prisma', 'seed.js');
        const seedTsStat = await fs.stat(seedTsPath).catch(() => null);
        const seedJsStat = await fs.stat(seedJsPath).catch(() => null);

        if (!seedTsStat && !seedJsStat) {
            await fs.mkdir(path.join(projectDir, 'prisma'), { recursive: true });
            const demoSpecs = (Array.isArray(plan?.management?.roles) ? plan.management.roles : [])
                .filter((role) => role?.name && role?.demoUser?.username)
                .map((role) => ({
                    role: role.name,
                    username: role.demoUser.username,
                    passwordEnv: `XFACTOR_DEMO_PASSWORD_${role.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
                }));
            const seedContent = `import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();
const demoSpecs: Array<{ role: string; username: string; passwordEnv: string }> = ${JSON.stringify(demoSpecs, null, 2)};

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return \`\${salt}:\${hash}\`;
}

async function main() {
  if (process.env.NODE_ENV === 'production') return;
  for (const demo of demoSpecs) {
    const password = process.env[demo.passwordEnv];
    if (!password) throw new Error(\`Missing demo password: \${demo.passwordEnv}\`);
    await prisma.user.upsert({
      where: { username: demo.username },
      update: { password: hashPassword(password), role: demo.role },
      create: { username: demo.username, password: hashPassword(password), role: demo.role }
    });
  }
  console.log(\`Seeded \${demoSpecs.length} isolated demo users.\`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
`;
            await writeSource(seedTsPath, seedContent, 'utf8');
        }

        // 9c. src/lib/auth.ts (veya src/lib/auth.js)
        const authTsPath = path.join(projectDir, 'src', 'lib', 'auth.ts');
        const authJsPath = path.join(projectDir, 'src', 'lib', 'auth.js');
        const authTsStat = await fs.stat(authTsPath).catch(() => null);
        const authJsStat = await fs.stat(authJsPath).catch(() => null);

        if (!authTsStat && !authJsStat) {
            await fs.mkdir(path.join(projectDir, 'src', 'lib'), { recursive: true });
            const authContent = `import crypto from 'crypto';\n\nexport function hashPassword(password: string): string {\n  const salt = crypto.randomBytes(16).toString('hex');\n  const hash = crypto.scryptSync(password, salt, 64).toString('hex');\n  return \`\${salt}:\${hash}\`;\n}\n\nexport function verifyPassword(password: string, combined: string): boolean {\n  if (!combined || !combined.includes(':')) return false;\n  const [salt, originalHash] = combined.split(':');\n  if (!salt || !originalHash) return false;\n  const hash = crypto.scryptSync(password, salt, 64).toString('hex');\n  try {\n    const a = Buffer.from(hash, 'hex');\n    const b = Buffer.from(originalHash, 'hex');\n    if (a.length !== b.length) return false;\n    return crypto.timingSafeEqual(a, b);\n  } catch {\n    return false;\n  }\n}\n\nexport function requireAuth(req: any, res: any, next?: any) {\n  const user = req?.user || req?.session?.user;\n  if (!user) {\n    if (res && typeof res.status === 'function') {\n      return res.status(401).json({ error: 'Unauthorized' });\n    }\n    throw new Error('Unauthorized');\n  }\n  if (typeof next === 'function') {\n    return next();\n  }\n  return user;\n}\n\nexport function requireAdmin(req: any, res: any, next?: any) {\n  const user = requireAuth(req, res);\n  if (!user || user.role !== 'admin') {\n    if (res && typeof res.status === 'function') {\n      return res.status(403).json({ error: 'Forbidden: Admin access required' });\n    }\n    throw new Error('Forbidden: Admin access required');\n  }\n  if (typeof next === 'function') {\n    return next();\n  }\n  return user;\n}\n`;
            const permissionHelpers = `\nexport function hasPermission(user: any, resource: string, operation: string, matrix: any) {\n  const grants = matrix?.[user?.role];\n  return Array.isArray(grants) && grants.some((grant: any) => grant.resource === resource && Array.isArray(grant.operations) && grant.operations.includes(operation));\n}\n\nexport function requirePermission(req: any, resource: string, operation: string, matrix: any, res?: any, next?: any) {\n  const user = req?.user || req?.session?.user;\n  if (!user) return requireAuth(req, res);\n  if (!hasPermission(user, resource, operation, matrix)) {\n    if (res && typeof res.status === 'function') return res.status(403).json({ error: 'Forbidden' });\n    throw new Error('Forbidden');\n  }\n  if (typeof next === 'function') return next();\n  return user;\n}\n`;
            await writeSource(authTsPath, authContent + permissionHelpers, 'utf8');
        }
    }
}
