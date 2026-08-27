import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

import { runDeterministicProjectAudit, parseTesterResponse } from '../agents/tester.js';
import { normalizeReviewResult } from '../agents/schemas.js';
import { isTaskCompleted } from '../engine/fileProtocol.js';
import { ensureProjectScaffold } from '../engine/codeGenerator.js';
import { getProjectState, saveProjectState } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("==================================================");
console.log("⚡ XFactor Faz 0-4 Kalite Kapısı & Deterministik Doğrulama Süiti");
console.log("==================================================");

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  [PASS] ${name}`);
        passed++;
    } catch (e) {
        console.error(`  [FAIL] ${name}:`, e.message);
        failed++;
    }
}

async function asyncTest(name, fn) {
    try {
        await fn();
        console.log(`  [PASS] ${name}`);
        passed++;
    } catch (e) {
        console.error(`  [FAIL] ${name}:`, e.message);
        failed++;
    }
}

// ----------------------------------------------------
// 1. Deterministik Şema & Uyumsuzluk Denetimi
// ----------------------------------------------------
console.log("\n--- 1. Deterministik Prisma & JSON Denetimi ---");

test("1.1 Prisma model uyumsuzluğu (Bozuk proje vakası) tespit edilmeli ve onay engellenmeli", () => {
    const brokenFiles = [
        {
            path: 'prisma/schema.prisma',
            content: 'datasource db { provider = "sqlite" url = env("DATABASE_URL") }\nmodel Word { id String @id }\nmodel Score { id String @id }'
        },
        {
            path: 'src/app/api/leaderboard/route.ts',
            content: 'import { prisma } from "@/lib/prisma";\nexport async function GET() {\n  return prisma.leaderboard.findMany();\n}'
        },
        {
            path: 'package.json',
            content: '{"name": "app", "version": "1.0.0"}'
        }
    ];

    const audit = runDeterministicProjectAudit(brokenFiles);
    assert.strictEqual(audit.passed, false, "Prisma model uyumsuzluğu olan proje audit'ten geçmemeli");
    assert.ok(audit.issues.some(i => i.includes('leaderboard') && i.includes('schema.prisma')));

    // Tester response fail-closed testi
    const parsed = parseTesterResponse('{"approved": true, "summary": "Harika görünüyor"}', audit);
    assert.strictEqual(parsed.approved, false, "Deterministik hata varken approved false olmalıdır");
});

test("1.2 Geçerli Prisma ve API route uyumu başarılı geçmeli", () => {
    const validFiles = [
        {
            path: 'prisma/schema.prisma',
            content: 'datasource db { provider = "sqlite" url = env("DATABASE_URL") }\nmodel Leaderboard { id String @id score Int }\nmodel Word { id String @id }'
        },
        {
            path: 'src/lib/prisma.ts',
            content: 'export const prisma = { leaderboard: { findMany: () => [] } };'
        },
        {
            path: 'src/app/api/leaderboard/route.ts',
            content: 'import { prisma } from "@/lib/prisma";\nexport async function GET() {\n  return prisma.leaderboard.findMany();\n}'
        },
        {
            path: 'package.json',
            content: '{"name": "app", "version": "1.0.0"}'
        }
    ];

    const audit = runDeterministicProjectAudit(validFiles);
    assert.strictEqual(audit.passed, true, "Geçerli modellerde audit başarılı olmalı");
});

test("1.3 Bozuk JSON dosyaları deterministik olarak yakalanmalı", () => {
    const invalidJsonFiles = [
        { path: 'package.json', content: '{"name": "broken", incomplete' }
    ];
    const audit = runDeterministicProjectAudit(invalidJsonFiles);
    assert.strictEqual(audit.passed, false);
    assert.ok(audit.issues.some(i => i.includes('Geçersiz JSON')));
});

test("1.4 Kırık yerel import (Diskte olmayan dosya) tespit edilmeli ve onay engellenmeli", () => {
    const brokenImportFiles = [
        {
            path: 'src/app/api/categories/route.ts',
            content: 'import { db } from "@/lib/non_existent_module";\nexport async function GET() { return []; }'
        },
        {
            path: 'package.json',
            content: '{"name": "app", "version": "1.0.0"}'
        }
    ];
    const audit = runDeterministicProjectAudit(brokenImportFiles);
    assert.strictEqual(audit.passed, false, "Var olmayan dosya importu reddedilmeli");
    assert.ok(audit.issues.some(i => i.includes('Kırık Yerel İthalat')));
});

test("1.5 Eksik NPM bağımlılığı (package.json'da olmayan paket) tespit edilmeli ve onay engellenmeli", () => {
    const missingPkgFiles = [
        {
            path: 'src/app/layout.tsx',
            content: 'import { Toaster } from "sonner";\nexport default function Root() { return <Toaster />; }'
        },
        {
            path: 'package.json',
            content: '{"name": "app", "version": "1.0.0", "dependencies": { "react": "^18.0.0" }}'
        }
    ];
    const audit = runDeterministicProjectAudit(missingPkgFiles);
    assert.strictEqual(audit.passed, false, "package.json'da olmayan harici paket reddedilmeli");
    assert.ok(audit.issues.some(i => i.includes('Eksik NPM Bağımlılığı') && i.includes('sonner')));
});

test("1.5a Eksik NPM bağımlılığı (package.json içinde 0 bağımlılık / dependencies: {} varken) tespit edilmeli ve onay engellenmeli", () => {
    const emptyPkgFiles = [
        {
            path: 'src/App.tsx',
            content: 'import axios from "axios";\nexport function App() { return null; }'
        },
        {
            path: 'package.json',
            content: '{"name": "app", "version": "1.0.0", "dependencies": {}}'
        }
    ];
    const audit = runDeterministicProjectAudit(emptyPkgFiles);
    assert.strictEqual(audit.passed, false, "dependencies boş olsa bile bildirilmemiş harici paket reddedilmeli");
    assert.ok(audit.issues.some(i => i.includes('Eksik NPM Bağımlılığı') && i.includes('axios')));
});

test("1.6 @/lib/prisma ve @/lib/db köprüsü doğru çözümlenmeli", () => {
    const bridgeFiles = [
        {
            path: 'src/lib/prisma.ts',
            content: 'export const prisma = {};'
        },
        {
            path: 'src/app/api/categories/route.ts',
            content: 'import { db } from "@/lib/db";\nexport async function GET() { return []; }'
        },
        {
            path: 'package.json',
            content: '{"name": "app", "version": "1.0.0"}'
        }
    ];
    const audit = runDeterministicProjectAudit(bridgeFiles);
    assert.strictEqual(audit.passed, true, "prisma/db köprüsü otomatik çözümlenmeli");
});

test("1.7 Prisma provider ile env DATABASE_URL uyumsuzluğu reddedilmeli", () => {
    const files = [
        {
            path: 'prisma/schema.prisma',
            content: 'datasource db { provider = "postgresql" url = env("DATABASE_URL") }\nmodel User { id String @id }'
        },
        {
            path: '.env.example',
            content: 'DATABASE_URL="file:./dev.db"\n'
        },
        {
            path: 'package.json',
            content: '{"name":"bad-provider"}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, false, 'PostgreSQL provider with SQLite file URL should fail');
    assert.ok(audit.issues.some(i => i.includes('DATABASE_URL') && i.includes('provider')));
});

test("1.7a SQLite provider ile file URL uyumlu geçmeli", () => {
    const files = [
        {
            path: 'prisma/schema.prisma',
            content: 'datasource db { provider = "sqlite" url = env("DATABASE_URL") }\nmodel User { id String @id }'
        },
        {
            path: '.env.example',
            content: 'DATABASE_URL="file:./dev.db"\n'
        },
        {
            path: 'package.json',
            content: '{"name":"sqlite-ok"}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, true, 'SQLite provider with file URL should pass');
});

test("1.7b PostgreSQL provider ile postgresql URL uyumlu geçmeli", () => {
    const files = [
        {
            path: 'prisma/schema.prisma',
            content: 'datasource db { provider = "postgresql" url = env("DATABASE_URL") }\nmodel User { id String @id }'
        },
        {
            path: '.env.example',
            content: 'DATABASE_URL="postgresql://user:pass@localhost:5432/app"\n'
        },
        {
            path: 'package.json',
            content: '{"name":"postgres-ok"}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, true, 'PostgreSQL provider with postgresql URL should pass');
});


test("1.8 Auth fallback user ve hard-coded secret kullanımı reddedilmeli", () => {
    const files = [
        {
            path: 'src/lib/auth-helpers.ts',
            content: `
              const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
              export async function getCurrentUser() {
                return prisma.user.findFirst({ where: { isActive: true } });
              }
            `
        },
        {
            path: 'package.json',
            content: '{"name":"bad-auth","dependencies":{"@prisma/client":"^5.0.0"}}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, false, 'Fallback auth patterns should fail deterministic QA');
    assert.ok(audit.issues.some(i => i.includes('fallback') || i.includes('varsayılan kullanıcı')));
});

test("1.8a Identity-bound kullanıcı sorgusu ve literalsiz JWT secret geçmeli", () => {
    const files = [
        {
            path: 'src/lib/auth-helpers.ts',
            content: `
              const JWT_SECRET = process.env.JWT_SECRET;
              export async function getCurrentUser(userId) {
                return prisma.user.findUnique({ where: { id: userId } });
              }
            `
        },
        {
            path: 'package.json',
            content: '{"name":"good-auth","dependencies":{"@prisma/client":"^5.0.0"}}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, true, 'Identity-bound auth patterns should pass deterministic QA');
});

test("1.7c ANALYTICS_URL datasource DATABASE_URL'den bağımsız geçmeli", () => {
    const files = [
        {
            path: 'prisma/schema.prisma',
            content: 'datasource analytics { provider = "postgresql" url = env("ANALYTICS_URL") }\ndatasource db { provider = "sqlite" url = env("DATABASE_URL") }\nmodel User { id String @id }'
        },
        {
            path: '.env.example',
            content: 'DATABASE_URL="file:./dev.db"\nANALYTICS_URL="postgresql://user:pass@localhost:5432/analytics"\n'
        },
        {
            path: 'package.json',
            content: '{"name":"analytics-ok"}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, true, 'ANALYTICS_URL datasource should not be checked against DATABASE_URL');
});

test("1.8b Safe lookup olsa bile aynı dosyadaki varsayılan kullanıcı helper'ı reddedilmeli", () => {
    const files = [
        {
            path: 'src/lib/auth-helpers.ts',
            content: `
              const JWT_SECRET = process.env.JWT_SECRET;
              export async function getCurrentUser(userId) {
                return prisma.user.findUnique({ where: { id: userId } });
              }
              export async function requireUser() {
                return prisma.user.findFirst({ where: { isActive: true } });
              }
            `
        },
        {
            path: 'package.json',
            content: '{"name":"mixed-auth","dependencies":{"@prisma/client":"^5.0.0"}}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, false, 'Unsafe helper should fail even when a safe lookup exists elsewhere in the same file');
    assert.ok(audit.issues.some(i => i.includes('varsayılan kullanıcı')));
});

test("1.8c Boş quoted literal fallback de reddedilmeli", () => {
    const files = [
        {
            path: 'src/lib/auth-helpers.ts',
            content: `
              const JWT_SECRET = process.env.JWT_SECRET ?? '';
              export async function getCurrentUser(userId) {
                return prisma.user.findUnique({ where: { id: userId } });
              }
            `
        },
        {
            path: 'package.json',
            content: '{"name":"empty-fallback","dependencies":{"@prisma/client":"^5.0.0"}}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, false, 'Empty quoted fallback should fail deterministic QA');
    assert.ok(audit.issues.some(i => i.includes('fallback')));
});
test("1.8d Markdown, yorum ve string içindeki fallback-benzeri metinler tek başına secret fallback sayılmamalı", () => {
    const files = [
        {
            path: 'docs/security.md',
            content: [
                '# Güvenlik Notları',
                '',
                'Kullanıcı kopyası hazırlanırken `process.env.JWT_SECRET || "docs-only"` ifadesi sadece dokümantasyonda geçebilir.',
                '',
                '```ts',
                "const example = process.env.JWT_SECRET || 'docs-codeblock';",
                '```'
            ].join('\n')
        },
        {
            path: 'src/lib/auth-helpers.ts',
            content: `
              // process.env.JWT_SECRET || 'comment-only'
              const docsNote = "process.env.JWT_SECRET || 'string-only'";
              const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
              export async function getCurrentUser(userId) {
                return prisma.user.findUnique({ where: { id: userId } });
              }
            `
        },
        {
            path: 'package.json',
            content: '{"name":"doc-noise","dependencies":{"@prisma/client":"^5.0.0"}}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, false, 'Real fallback should still fail');
    assert.strictEqual(audit.issues.length, 1, 'Comment, string, and markdown-only fallback text should be ignored');
});

test("1.8e Optional TypeScript return annotation sonrası unsafe helper body denetlenmeli", () => {
    const files = [
        {
            path: 'src/lib/auth-helpers.ts',
            content: `
              const JWT_SECRET = process.env.JWT_SECRET;
              export async function getCurrentUser(userId): Promise<User> {
                return prisma.user.findFirst({ where: { isActive: true } });
              }
              export const requireUser = async (): Promise<User> => {
                return prisma.user.findFirst({ where: { isActive: true } });
              };
            `
        },
        {
            path: 'package.json',
            content: '{"name":"typed-unsafe","dependencies":{"@prisma/client":"^5.0.0"}}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, false, 'Typed unsafe helpers should fail deterministic QA');
    assert.strictEqual(
        audit.issues.filter(i => i.includes('varsayılan kullanıcı')).length,
        2,
        'Both typed unsafe helpers should be extracted and flagged'
    );
});

test("1.8f getUser referansı ve findFirst çağrısı tek başına false-positive olmamalı", () => {
    const files = [
        {
            path: 'src/lib/reporting.ts',
            content: `
              const getUserLabel = 'getUser';
              export function listUsers() {
                return prisma.user.findFirst({ where: { isActive: true } });
              }
            `
        },
        {
            path: 'package.json',
            content: '{"name":"unrelated-findfirst","dependencies":{"@prisma/client":"^5.0.0"}}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, true, 'Unrelated file-wide references should not trigger auth anti-patterns');
});
test("1.8g Template interpolation içindeki fallback reddedilmeli, düz template metni yoksayılmalı", () => {
    const files = [
        {
            path: 'src/lib/auth-helpers.ts',
            content: `
              const templateText = \`process.env.JWT_SECRET || 'docs-only'\`;
              export async function getCurrentUser(userId) {
                return \`prefix \${process.env.JWT_SECRET || 'fallback-secret-key'} suffix\`;
              }
            `
        },
        {
            path: 'package.json',
            content: '{"name":"template-interpolation","dependencies":{"@prisma/client":"^5.0.0"}}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, false, 'Executable fallback inside template interpolation should fail deterministic QA');
    assert.strictEqual(audit.issues.length, 1, 'Plain template text should be ignored while executable interpolation is flagged once');
    assert.ok(audit.issues[0].includes('fallback'));
});

test("1.8h TS tip anotasyonlu requireUser arrow helper reddedilmeli", () => {
    const files = [
        {
            path: 'src/lib/auth-helpers.ts',
            content: `
              const JWT_SECRET = process.env.JWT_SECRET;
              const requireUser: () => Promise<User> = async () => {
                return prisma.user.findFirst({ where: { isActive: true } });
              };
            `
        },
        {
            path: 'package.json',
            content: '{"name":"typed-arrow-unsafe","dependencies":{"@prisma/client":"^5.0.0"}}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, false, 'Typed requireUser arrow helper should fail deterministic QA');
    assert.ok(audit.issues.some(i => i.includes('varsayılan kullanıcı')));
});

test("1.8i Template interpolation içindeki regex literal fallback'ı gizlememeli", () => {
    const files = [
        {
            path: 'src/lib/auth-helpers.ts',
            content: `
              const JWT_SECRET = process.env.JWT_SECRET;
              export async function getCurrentUser(userId) {
                return \`prefix \${/[/*]/.test(userId) ? process.env.JWT_SECRET || 'fallback-secret-key' : 'safe'} suffix\`;
              }
            `
        },
        {
            path: 'package.json',
            content: '{"name":"regex-template-interpolation","dependencies":{"@prisma/client":"^5.0.0"}}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, false, 'Executable fallback hidden behind a regex literal inside template interpolation should fail deterministic QA');
    assert.ok(audit.issues.some(i => i.includes('fallback')));
});


test("1.8j Non-code text içindeki typed arrow helper örneği yok sayılmalı", () => {
    const files = [
        {
            path: 'src/lib/auth-helpers.ts',
            content: `
              const JWT_SECRET = process.env.JWT_SECRET;
              export const requireUser: () => Promise<User> = async () => {
                const docsExample = "const requireUser: () => Promise<User> = async () => prisma.user.findFirst({ where: { isActive: true } });";
                return getSessionUser();
              };
            `
        },
        {
            path: 'package.json',
            content: '{"name":"typed-arrow-doc-example","dependencies":{"@prisma/client":"^5.0.0"}}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, true, 'Code-like text inside a string should not be treated as executable auth logic');
});

test("1.8k Bozuk script kaynağı açık sözdizimi hatasıyla reddedilmeli", () => {
    const files = [
        {
            path: 'src/lib/auth-helpers.ts',
            content: `
              const JWT_SECRET = process.env.JWT_SECRET;
              export const requireUser: () => Promise<User> = async () => {
                return prisma.user.findFirst({ where: { isActive: true } });
            `
        },
        {
            path: 'package.json',
            content: '{"name":"malformed-source","dependencies":{"@prisma/client":"^5.0.0"}}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, false, 'Malformed script source should fail deterministic QA');
    assert.strictEqual(audit.issues.length, 1, 'Malformed source should emit one explicit parse issue');
    assert.ok(audit.issues[0].includes('Sözdizimi Hatası'));
});

test("1.8l Caller-derived member expression geçmeli, literal id reddedilmeli", () => {
    const files = [
        {
            path: 'src/lib/auth-helpers.ts',
            content: `
              export async function getCurrentUser(user) {
                return prisma.user.findFirst({ where: { id: user.profile.id } });
              }
              export async function requireUser() {
                return prisma.user.findFirst({ where: { id: 'fixed-user-id' } });
              }
            `
        },
        {
            path: 'package.json',
            content: '{"name":"member-vs-literal-id","dependencies":{"@prisma/client":"^5.0.0"}}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, false, 'Literal id must fail while caller-derived member expression stays acceptable');
    assert.strictEqual(audit.issues.filter(i => i.includes('varsayılan kullanıcı')).length, 1, 'Only the literal id branch should be flagged');
});

test("1.8m Nested audited helper en yakın helper'da bir kez raporlanmalı", () => {
    const files = [
        {
            path: 'src/lib/auth-helpers.ts',
            content: `
              export async function getCurrentUser() {
                const requireUser = async () => {
                  return prisma.user.findFirst({ where: { id: 'fixed-user-id' } });
                };
                return requireUser();
              }
            `
        },
        {
            path: 'package.json',
            content: '{"name":"nested-helper-scope","dependencies":{"@prisma/client":"^5.0.0"}}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, false, 'Nested unsafe helper should fail deterministic QA');
    assert.strictEqual(audit.issues.filter(i => i.includes('varsayılan kullanıcı')).length, 1, 'Only the nearest helper should emit once');
});

test("1.8n Optional chaining env fallback ve prisma findFirst desteği çalışmalı", () => {
    const files = [
        {
            path: 'src/lib/auth-helpers.ts',
            content: `
              const JWT_SECRET = process?.env?.JWT_SECRET ?? '';
              export async function getCurrentUser() {
                return prisma?.user?.findFirst?.({ where: { id: 'fixed-user-id' } });
              }
            `
        },
        {
            path: 'package.json',
            content: '{"name":"optional-chain-support","dependencies":{"@prisma/client":"^5.0.0"}}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, false, 'Optional chaining source should still fail on fallback and unsafe lookup');
    assert.strictEqual(audit.issues.filter(i => i.includes('fallback')).length, 1, 'Optional env fallback should be detected once');
    assert.strictEqual(audit.issues.filter(i => i.includes('varsayılan kullanıcı')).length, 1, 'Optional prisma.findFirst should be detected once');
});

test("1.8o Mixed OR where branch unsafe ise reddedilmeli", () => {
    const files = [
        {
            path: 'src/lib/auth-helpers.ts',
            content: `
              export async function getCurrentUser(userId) {
                return prisma.user.findFirst({
                  where: {
                    OR: [
                      { id: userId },
                      { id: 'fixed-user-id' }
                    ]
                  }
                });
              }
            `
        },
        {
            path: 'package.json',
            content: '{"name":"mixed-or-branch","dependencies":{"@prisma/client":"^5.0.0"}}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, false, 'Mixed OR branch should fail deterministic QA');
    assert.strictEqual(audit.issues.filter(i => i.includes('varsayılan kullanıcı')).length, 1, 'Unsafe OR branch should be flagged once');
});

test("1.8p Local binding id identity-derived sayılmamalı", () => {
    const files = [
        {
            path: 'src/lib/auth-helpers.ts',
            content: `
              export async function getCurrentUser(userId) {
                const fixedId = userId;
                return prisma.user.findFirst({ where: { id: fixedId } });
              }
            `
        },
        {
            path: 'package.json',
            content: '{"name":"local-binding-id","dependencies":{"@prisma/client":"^5.0.0"}}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, false, 'Fixed local bindings must not count as identity-derived');
    assert.strictEqual(audit.issues.filter(i => i.includes('varsayılan kullanıcı')).length, 1);
});

test("1.8q NOT predicate identity veremez", () => {
    const files = [
        {
            path: 'src/lib/auth-helpers.ts',
            content: `
              export async function getCurrentUser(userId) {
                return prisma.user.findFirst({ where: { NOT: { id: userId } } });
              }
            `
        },
        {
            path: 'package.json',
            content: '{"name":"not-predicate","dependencies":{"@prisma/client":"^5.0.0"}}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, false, 'NOT should never satisfy identity-bound lookup');
    assert.strictEqual(audit.issues.filter(i => i.includes('varsayılan kullanıcı')).length, 1);
});

test("1.8r Spread veya duplicate where belirsizliği reddedilmeli", () => {
    const files = [
        {
            path: 'src/lib/auth-helpers.ts',
            content: `
              const baseWhere = { id: 'fixed-user-id' };
              export async function getCurrentUser(userId) {
                return prisma.user.findFirst({
                  where: { ...baseWhere, id: userId, id: 'fixed-user-id' }
                });
              }
            `
        },
        {
            path: 'package.json',
            content: '{"name":"ambiguous-where","dependencies":{"@prisma/client":"^5.0.0"}}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, false, 'Spread/duplicate where ambiguity must fail conservatively');
    assert.strictEqual(audit.issues.filter(i => i.includes('varsayılan kullanıcı')).length, 1);
});

test("1.8s Nested non-auth helper shadowed param kullanıcıyı gizlemeli ve reddedilmeli", () => {
    const files = [
        {
            path: 'src/lib/auth-helpers.ts',
            content: `
              export async function getCurrentUser(userId) {
                const loadUser = (userId) => prisma.user.findFirst({ where: { id: userId } });
                return loadUser('fixed-user-id');
              }
            `
        },
        {
            path: 'package.json',
            content: '{"name":"shadowed-nested-helper","dependencies":{"@prisma/client":"^5.0.0"}}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, false, 'Shadowed nested helper should fail deterministic QA');
    assert.strictEqual(audit.issues.filter(i => i.includes('varsayılan kullanıcı')).length, 1, 'Shadowed nested param must not inherit outer provenance');
});

test("1.8t Nested closure outer userId ile güvenli kalmalı", () => {
    const files = [
        {
            path: 'src/lib/auth-helpers.ts',
            content: `
              export async function getCurrentUser(userId) {
                const loadUser = () => prisma.user.findFirst({ where: { id: userId } });
                return loadUser();
              }
            `
        },
        {
            path: 'package.json',
            content: '{"name":"nested-closure-safe","dependencies":{"@prisma/client":"^5.0.0"}}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, true, 'Outer-closure based lookup should remain safe');
});

test("1.8u Duplicate final where conservative olarak reddedilmeli", () => {
    const files = [
        {
            path: 'src/lib/auth-helpers.ts',
            content: `
              export async function getCurrentUser(userId) {
                return prisma.user.findFirst({
                  where: { id: userId },
                  where: { id: 'fixed-user-id' }
                });
              }
            `
        },
        {
            path: 'package.json',
            content: '{"name":"duplicate-final-where","dependencies":{"@prisma/client":"^5.0.0"}}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, false, 'Duplicate where must fail conservatively');
    assert.strictEqual(audit.issues.filter(i => i.includes('varsayılan kullanıcı')).length, 1);
});

test("1.8v Trailing spread options object konservatif olarak reddedilmeli", () => {
    const files = [
        {
            path: 'src/lib/auth-helpers.ts',
            content: `
              const extraOptions = { take: 1 };
              export async function getCurrentUser(userId) {
                return prisma.user.findFirst({
                  where: { id: userId },
                  ...extraOptions
                });
              }
            `
        },
        {
            path: 'package.json',
            content: '{"name":"trailing-spread-options","dependencies":{"@prisma/client":"^5.0.0"}}'
        }
    ];

    const audit = runDeterministicProjectAudit(files);
    assert.strictEqual(audit.passed, false, 'Options-object spread must fail conservatively');
    assert.strictEqual(audit.issues.filter(i => i.includes('varsayılan kullanıcı')).length, 1);
});



// ----------------------------------------------------
// 2. Reviewer & Tester Fail-Closed Normalizasyonu
// ----------------------------------------------------
console.log("\n--- 2. Fail-Closed Onay Normalizasyonu ---");

test("2.1 Tanımsız veya sessiz onaylar fail-closed olarak false dönmeli", () => {
    const emptyReview = normalizeReviewResult({});
    assert.strictEqual(emptyReview.approved, false, "Boş obje onaylanmamalı");

    const feedbackReview = normalizeReviewResult({ feedback: "Düzeltilmesi gereken syntax hatası var" });
    assert.strictEqual(feedbackReview.approved, false, "Feedback varken approved false olmalı");

    const validApproval = normalizeReviewResult({ approved: true, summary: "Mükemmel kod" });
    assert.strictEqual(validApproval.approved, true);
});

// ----------------------------------------------------
// 3. Hedef Dosyalar ile Checkpoint Doğrulaması
// ----------------------------------------------------
console.log("\n--- 3. Hedef Dosya Varlık Denetimi (Checkpoint) ---");

await asyncTest("3.1 RAPOR.md olsa bile hedef dosya diskte yoksa görev tamamlandı sayılmamalı", async () => {
    const testDir = path.join(os.tmpdir(), 'test-checkpoint-guard');
    await fs.rm(testDir, { recursive: true, force: true });
    const coderDir = path.join(testDir, 'coder-task');
    await fs.mkdir(coderDir, { recursive: true });
    // RAPOR.md yaz
    await fs.writeFile(path.join(coderDir, 'RAPOR.md'), '# Rapor\nKod yazıldı');

    // Hedef dosya src/App.jsx diskte henüz YOK
    const isDoneWithoutFile = await isTaskCompleted(coderDir, testDir, ['src/App.jsx']);
    assert.strictEqual(isDoneWithoutFile, false, "Hedef dosya diskte yoksa isTaskCompleted false dönmeli");

    // Hedef dosyayı oluştur
    const appPath = path.join(testDir, 'src/App.jsx');
    await fs.mkdir(path.dirname(appPath), { recursive: true });
    await fs.writeFile(appPath, 'export default function App() { return null; }');

    const isDoneWithFile = await isTaskCompleted(coderDir, testDir, ['src/App.jsx']);
    assert.strictEqual(isDoneWithFile, true, "Hedef dosya diskte varsa isTaskCompleted true dönmeli");

    // Temizlik
    await fs.rm(testDir, { recursive: true, force: true });
});

// ----------------------------------------------------
// 4. Dinamik Scaffold Guard
// ----------------------------------------------------
console.log("\n--- 4. Dinamik Scaffold Guard ---");

await asyncTest("4.1 Vite React projelerinde Vite şablonu ve Next.js kirliliği olmaması", async () => {
    const viteProjectDir = path.join(os.tmpdir(), 'test-vite-scaffold');
    await fs.mkdir(viteProjectDir, { recursive: true });

    await ensureProjectScaffold(viteProjectDir, { title: 'Vite Mini App' }, { summary: 'Vite React SPA projesi' });

    const pkgRaw = await fs.readFile(path.join(viteProjectDir, 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgRaw);

    assert.ok(pkg.devDependencies['vite'], "Vite bağımlılığı eklenmiş olmalı");
    assert.strictEqual(pkg.scripts.dev, 'vite', "Dev scripti vite olmalı");
    assert.strictEqual(pkg.dependencies['next'], undefined, "Vite projesinde next dependency olmamalı");

    const viteConfigExists = await fs.stat(path.join(viteProjectDir, 'vite.config.js')).then(() => true).catch(() => false);
    assert.ok(viteConfigExists, "vite.config.js üretilmiş olmalı");

    await fs.rm(viteProjectDir, { recursive: true, force: true });
});

await asyncTest("4.2 Scaffold gerçek .env değil yalnızca güvenli .env.example üretmeli", async () => {
    const scaffoldDir = path.join(os.tmpdir(), 'test-env-scaffold');
    await fs.rm(scaffoldDir, { recursive: true, force: true });
    await fs.mkdir(scaffoldDir, { recursive: true });

    await ensureProjectScaffold(scaffoldDir, { title: 'Secure App' }, { summary: 'Next.js Prisma app' });

    const envExists = await fs.stat(path.join(scaffoldDir, '.env')).then(() => true).catch(() => false);
    const envExample = await fs.readFile(path.join(scaffoldDir, '.env.example'), 'utf8');

    assert.strictEqual(envExists, false, 'Scaffold should not create a real .env with reusable secrets');
    assert.ok(envExample.includes('NEXTAUTH_SECRET=replace-with-a-long-random-secret'), '.env.example should contain placeholder secret guidance');
    assert.ok(!envExample.includes('super-secret-xfactor-key-2026'), '.env.example must not contain a shared hard-coded secret');

    await fs.rm(scaffoldDir, { recursive: true, force: true });
});
await asyncTest("4.3 Önceden var olan .env byte-identical kalmalı", async () => {
    let scaffoldDir;
    const originalEnv = 'EXISTING_ENV_SENTINEL=preserve-me\nCUSTOM_FLAG=true\n';

    try {
        scaffoldDir = await fs.mkdtemp(path.join(__dirname, 'tmp-env-existing-'));
        const envPath = path.join(scaffoldDir, '.env');

        await fs.writeFile(envPath, originalEnv, 'utf8');

        await ensureProjectScaffold(scaffoldDir, { title: 'Existing Env App' }, { summary: 'Next.js Prisma app' });

        const afterEnv = await fs.readFile(envPath, 'utf8');
        assert.strictEqual(afterEnv, originalEnv, '.env içeriği byte-byte değişmeden kalmalı');
    } finally {
        if (scaffoldDir) {
            await fs.rm(scaffoldDir, { recursive: true, force: true });
        }
    }
});



// ----------------------------------------------------
// 5. Workflow State DB Kalıcılığı
// ----------------------------------------------------
console.log("\n--- 5. Workflow State Kalıcılığı ---");

await asyncTest("5.1 state.workflow objesi SQLite'a yazılmalı ve okunmalı", async () => {
    const projectId = `test-wf-state-${Date.now()}`;
    const testState = {
        id: projectId,
        title: "Workflow Test Projesi",
        status: "running",
        plan: { summary: "Plan" },
        workflow: {
            directorSpecs: { frontend: { altTalimatname: "Alt" } },
            teamleaderPlans: { "frontend.tl": { tasks: [{ id: "t1", title: "Task 1" }] } }
        },
        chatHistory: []
    };

    saveProjectState(testState);

    const loadedState = getProjectState(projectId);
    assert.ok(loadedState && loadedState.workflow, "loadedState.workflow tanımlı olmalı");
    assert.strictEqual(loadedState.workflow.directorSpecs.frontend.altTalimatname, "Alt");
    assert.strictEqual(loadedState.workflow.teamleaderPlans["frontend.tl"].tasks[0].id, "t1");
});

console.log("\n==================================================");
console.log(`🎉 Kalite Kapısı Test Sonuçları: ${passed} Başarılı, ${failed} Hatalı`);
console.log("==================================================");

if (failed > 0) {
    process.exit(1);
}
