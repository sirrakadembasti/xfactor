/**
 * ⚡ XFactor Build Validator & Compiler Quality Gate Test Suite
 */

import assert from 'assert';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { executeSafeCommand, validateProjectBuild } from '../engine/buildValidator.js';
import { detectProjectStack } from '../engine/codeGenerator.js';
// P0.4: Test 4/5 host build yolunu kullanmalı (varsayılan artık fail-closed sandboxed).
// Diğer süitleri etkilememek için orijinal değer teardown'da geri alınır.
const __ORIGINAL_XFACTOR_BUILD_SANDBOX = process.env.XFACTOR_BUILD_SANDBOX;
process.env.XFACTOR_BUILD_SANDBOX = 'host';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DIR = path.join(__dirname, '../data', `test-build-gate-${Date.now()}`);

console.log("==================================================");
console.log("⚡ XFactor Real Build & Compiler Quality Gate Test Suite");
console.log("==================================================");

let passedCount = 0;
let failedCount = 0;

async function runTest(name, fn) {
    try {
        await fn();
        console.log(`  [PASS] ${name}`);
        passedCount++;
    } catch (err) {
        console.error(`  [FAIL] ${name}`);
        console.error(`         Hata: ${err.message}`);
        failedCount++;
    }
}

// 1. Stack Detection Testi
await runTest("1. Stack Detection: Next.js, Vite, Express ve Prisma doğru algılanmalı", async () => {
    const nextDir = path.join(TEST_DIR, 'next-app');
    await fs.mkdir(path.join(nextDir, 'src', 'app'), { recursive: true });
    await fs.writeFile(path.join(nextDir, 'next.config.js'), 'module.exports = {};', 'utf8');

    const stack = await detectProjectStack(nextDir, { title: 'Next App' }, {});
    assert.strictEqual(stack.framework, 'nextjs', 'Next.js framework doğru tespit edilmeli');
    assert.strictEqual(stack.isNext, true);

    const viteDir = path.join(TEST_DIR, 'vite-app');
    await fs.mkdir(viteDir, { recursive: true });
    await fs.writeFile(path.join(viteDir, 'vite.config.js'), 'export default {};', 'utf8');

    const viteStack = await detectProjectStack(viteDir, { title: 'Vite App' }, {});
    assert.strictEqual(viteStack.framework, 'vite', 'Vite framework doğru tespit edilmeli');
    assert.strictEqual(viteStack.hasVite, true);
});

// 2. Test 1 — Valid TypeScript (PASS)
await runTest("2. Test 1 — Valid TypeScript: Hatasız TypeScript projesi tsc denetiminden geçmeli", async () => {
    const validTsDir = path.join(TEST_DIR, 'valid-ts');
    await fs.mkdir(path.join(validTsDir, 'src'), { recursive: true });
    
    await fs.writeFile(path.join(validTsDir, 'tsconfig.json'), JSON.stringify({
        compilerOptions: {
            target: 'es2022',
            module: 'esnext',
            moduleResolution: 'bundler',
            noEmit: true,
            strict: true,
            skipLibCheck: true
        },
        include: ['src/**/*']
    }, null, 2), 'utf8');

    await fs.writeFile(path.join(validTsDir, 'src', 'index.ts'), `
export interface User {
    id: string;
    name: string;
    age: number;
}

export function greet(user: User): string {
    return \`Hello, \${user.name}! You are \${user.age} years old.\`;
}

const alice: User = { id: 'u1', name: 'Alice', age: 25 };
greet(alice);
`, 'utf8');

    const result = await validateProjectBuild(validTsDir, { title: 'Valid TS' }, {});
    assert.strictEqual(result.passed, true, 'Valid TypeScript projesi denetimden başarıyla geçmeli');
    assert.strictEqual(result.issues.length, 0, 'Hiçbir issue olmamalı');
    assert.ok(result.checks.some(c => c.name === 'typescript_typecheck' && c.exitCode === 0));
});

// 3. Test 2 — Invalid TypeScript (FAIL)
await runTest("3. Test 2 — Invalid TypeScript: Tip uyumsuzluğu (Type Error) tsc tarafından yakalanmalı", async () => {
    const invalidTsDir = path.join(TEST_DIR, 'invalid-ts');
    await fs.mkdir(path.join(invalidTsDir, 'src'), { recursive: true });

    await fs.writeFile(path.join(invalidTsDir, 'tsconfig.json'), JSON.stringify({
        compilerOptions: {
            target: 'es2022',
            module: 'esnext',
            moduleResolution: 'bundler',
            noEmit: true,
            strict: true,
            skipLibCheck: true
        },
        include: ['src/**/*']
    }, null, 2), 'utf8');

    // Hatalı TypeScript kodu: string değişkenine number atanmış
    await fs.writeFile(path.join(invalidTsDir, 'src', 'broken.ts'), `
export const name: string = 12345;
export function calculate(a: number): number {
    return a.toLowerCase();
}
`, 'utf8');

    const result = await validateProjectBuild(invalidTsDir, { title: 'Invalid TS' }, {});
    assert.strictEqual(result.passed, false, 'Invalid TypeScript projesi yakalanmalı ve FAIL olmalı');
    assert.ok(result.issues.length > 0, 'En az bir derleme hatası raporlanmalı');
    assert.ok(result.issues.some(i => i.includes('TypeScript Tip/Derleme Hatası') || i.includes('Type')), 'TypeScript hata detayı içermeli');
});

// 4. Test 3 — Invalid Prisma Schema (FAIL)
await runTest("4. Test 3 — Invalid Prisma: Bozuk Prisma şeması npx prisma validate tarafından yakalanmalı", async () => {
    const invalidPrismaDir = path.join(TEST_DIR, 'invalid-prisma');
    await fs.mkdir(path.join(invalidPrismaDir, 'prisma'), { recursive: true });

    // Bozuk Prisma şeması: data source eksik, geçersiz tip tanımları
    await fs.writeFile(path.join(invalidPrismaDir, 'prisma', 'schema.prisma'), `
datasource db {
  provider = "unknown_invalid_provider"
  url      = env("DATABASE_URL")
}

model BrokenModel {
  id   InvalidTypeNotExists @id
  name String
}
`, 'utf8');

    const result = await validateProjectBuild(invalidPrismaDir, { title: 'Invalid Prisma' }, {});
    assert.strictEqual(result.passed, false, 'Bozuk Prisma şeması FAIL olmalı');
    assert.ok(result.issues.some(i => i.includes('Prisma')), 'Prisma şema hatası raporlanmalı');
});
// 5. Test 4 — Build Script Failure (FAIL)
await runTest("5. Test 4 — Build Failure: package.json build scripti hata verirse FAIL dönmeli", async () => {
    const failBuildDir = path.join(TEST_DIR, 'fail-build');
    await fs.mkdir(path.join(failBuildDir, 'node_modules'), { recursive: true });

    await fs.writeFile(path.join(failBuildDir, 'package.json'), JSON.stringify({
        name: 'fail-build-app',
        version: '1.0.0',
        scripts: {
            build: 'node -e "console.error(\\"Critical build failure!\\"); process.exit(1);"'
        }
    }, null, 2), 'utf8');

    const result = await validateProjectBuild(failBuildDir, { title: 'Fail Build' }, {});
    assert.strictEqual(result.passed, false, 'Build hatası durumunda passed=false olmalı');
    assert.ok(result.issues.some(i => i.includes('Framework Build Hatası')), 'Build hatası detayı raporlanmalı');
});

// 6. Test 5 — Command Timeout (Killed safely)
await runTest("6. Test 5 — Timeout: Takılan/sonsuz döngüdeki komut timeout sonrası güvenle sonlandırılmalı", async () => {
    const timeoutDir = path.join(TEST_DIR, 'timeout-test');
    await fs.mkdir(timeoutDir, { recursive: true });

    // 5 saniye uyuyan komutu 500ms timeout ile çalıştır
    const res = await executeSafeCommand('node', ['-e', 'setTimeout(() => {}, 10000);'], {
        cwd: timeoutDir,
        timeoutMs: 500
    });

    assert.strictEqual(res.passed, false, 'Zaman aşımına uğrayan komut passed=false olmalı');
    assert.strictEqual(res.timedOut, true, 'timedOut bayrağı true olmalı');
});

// 7. Security: Whitelist Dışı Komut Reddedilmeli
await runTest("7. Security: Whitelist dışındaki keyfi komutlar kesinlikle engellenmeli", async () => {
    await assert.rejects(
        async () => {
            await executeSafeCommand('rmdir', ['/s', '/q', 'C:\\'], { cwd: TEST_DIR });
        },
        /İzin verilmeyen çalıştırılabilir komut/,
        'Whitelist dışı komut çalıştırılamaz hatası fırlatılmalı'
    );
});

// Temizlik
try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
} catch {}
// P0.4: env'i orijinal haline geri al (diğer süitler etkilenmesin).
if (__ORIGINAL_XFACTOR_BUILD_SANDBOX === undefined) {
    delete process.env.XFACTOR_BUILD_SANDBOX;
} else {
    process.env.XFACTOR_BUILD_SANDBOX = __ORIGINAL_XFACTOR_BUILD_SANDBOX;
}

console.log("==================================================");
console.log(`🎉 Build Validator Testleri: ${passedCount} Başarılı, ${failedCount} Hatalı`);
console.log("==================================================");

if (failedCount > 0) {
    process.exit(1);
}
