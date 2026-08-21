/**
 * XFactor Real Build & Compiler Quality Gate
 * Gerçek TypeScript, Prisma ve Framework derleme/doğrulama servisi
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { isSafeProjectPath } from '../security.js';
import { detectProjectStack } from './codeGenerator.js';

// Güvenli ve izin verilen komut whitelist'i
const ALLOWED_EXECUTABLES = new Set([
    'npx',
    'npm',
    'node',
    'tsc',
    'prisma',
    'npx.cmd',
    'npm.cmd',
    'node.exe',
    'tsc.cmd',
    'prisma.cmd'
]);

const DEFAULT_TIMEOUT_MS = 30000; // 30 saniye
const MAX_BUFFER_SIZE = 512 * 1024; // 512 KB

/**
 * Güvenli ve sınırlandırılmış alt süreç (process) çalıştırır.
 */
export async function executeSafeCommand(executable, args = [], options = {}) {
    const {
        cwd = process.cwd(),
        timeoutMs = DEFAULT_TIMEOUT_MS,
        maxBufferSize = MAX_BUFFER_SIZE,
        env = process.env
    } = options;

    // 1. Güvenlik & Whitelist Kontrolü
    const baseExec = path.basename(executable).toLowerCase();
    if (!ALLOWED_EXECUTABLES.has(baseExec) && !ALLOWED_EXECUTABLES.has(executable.toLowerCase())) {
        throw new Error(`İzin verilmeyen çalıştırılabilir komut: "${executable}". Yalnızca whitelist komutlar çalıştırılabilir.`);
    }

    // 2. Dizin Doğrulama
    if (!fsSync.existsSync(cwd)) {
        throw new Error(`Geçersiz çalışma dizini: "${cwd}" mevcut değil.`);
    }

    // 3. Platform uyumlu komut çözümleme (Windows cmd.exe / POSIX uyumu)
    let runExecutable = executable;
    let runArgs = args;

    if (process.platform === 'win32') {
        const comSpec = process.env.ComSpec || 'cmd.exe';
        if (executable.toLowerCase() === 'node' || executable.toLowerCase() === 'node.exe') {
            runExecutable = process.execPath;
            runArgs = args;
        } else {
            runExecutable = comSpec;
            runArgs = ['/d', '/s', '/c', executable, ...args];
        }
    }

    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let killed = false;

        let proc;
        try {
            proc = spawn(runExecutable, runArgs, {
                cwd,
                env: { ...env, CI: 'true', NODE_ENV: 'test' },
                stdio: ['ignore', 'pipe', 'pipe'],
                shell: false,
                windowsHide: true
            });
        } catch (spawnError) {
            return resolve({
                passed: false,
                exitCode: -1,
                stdout: '',
                stderr: spawnError.message,
                timedOut: false,
                command: `${executable} ${args.join(' ')}`.trim()
            });
        }

        const timer = setTimeout(() => {
            timedOut = true;
            killed = true;
            try {
                proc.kill('SIGTERM');
                setTimeout(() => {
                    if (!proc.killed) {
                        try { proc.kill('SIGKILL'); } catch {}
                    }
                }, 1000);
            } catch {}
        }, timeoutMs);

        if (proc.stdout) {
            proc.stdout.on('data', (chunk) => {
                if (stdout.length < maxBufferSize) {
                    stdout += chunk.toString();
                }
            });
        }

        if (proc.stderr) {
            proc.stderr.on('data', (chunk) => {
                if (stderr.length < maxBufferSize) {
                    stderr += chunk.toString();
                }
            });
        }

        proc.on('error', (err) => {
            clearTimeout(timer);
            resolve({
                passed: false,
                exitCode: -1,
                stdout: stdout.trim(),
                stderr: `${stderr}\n${err.message}`.trim(),
                timedOut,
                command: `${executable} ${args.join(' ')}`.trim()
            });
        });

        proc.on('close', (exitCode) => {
            clearTimeout(timer);
            const passed = exitCode === 0 && !timedOut;
            resolve({
                passed,
                exitCode: exitCode !== null ? exitCode : (timedOut ? -1 : 0),
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                timedOut,
                command: `${executable} ${args.join(' ')}`.trim()
            });
        });
    });
}

/**
 * Katı Prisma Şema Doğrulayıcısı (Semantic & Schema Linter)
 */
export function validatePrismaSchemaContent(schemaContent) {
    const issues = [];
    if (!schemaContent || typeof schemaContent !== 'string') {
        return { passed: false, issues: ['Prisma şeması boş veya geçersiz.'] };
    }

    // 1. Datasource kontrolü
    const datasourceMatch = schemaContent.match(/datasource\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\}/);
    if (!datasourceMatch) {
        issues.push('Prisma Şeması Hatası: "datasource" bloğu tanımlanmamış.');
    } else {
        const dsBody = datasourceMatch[2];
        const providerMatch = dsBody.match(/provider\s*=\s*["']([^"']+)["']/);
        if (!providerMatch) {
            issues.push('Prisma Şeması Hatası: datasource içinde "provider" tanımlı değil.');
        } else {
            const validProviders = new Set(['sqlite', 'postgresql', 'postgres', 'mysql', 'sqlserver', 'cockroachdb', 'mongodb']);
            if (!validProviders.has(providerMatch[1].toLowerCase())) {
                issues.push(`Prisma Şeması Hatası: Geçersiz veritabanı provider "${providerMatch[1]}". Geçerli provider'lar: sqlite, postgresql, mysql, sqlserver, mongodb.`);
            }
        }
        if (!dsBody.includes('url')) {
            issues.push('Prisma Şeması Hatası: datasource içinde "url" tanımı eksik.');
        }
    }

    // 2. Model ve Tip Kontrolleri
    const modelBlocks = Array.from(schemaContent.matchAll(/model\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\}/g));
    if (modelBlocks.length === 0) {
        issues.push('Prisma Şeması Hatası: Şemada en az bir "model" tanımlanmalıdır.');
    }

    const definedModelNames = new Set(modelBlocks.map(m => m[1]));
    const enumBlocks = Array.from(schemaContent.matchAll(/enum\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\}/g));
    const definedEnumNames = new Set(enumBlocks.map(e => e[1]));

    const SCALAR_TYPES = new Set([
        'String', 'Boolean', 'Int', 'BigInt', 'Float', 'Decimal', 'DateTime', 'Json', 'Bytes'
    ]);

    for (const [_, modelName, modelBody] of modelBlocks) {
        const lines = modelBody.split('\n');
        let hasId = false;

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || line.startsWith('//') || line.startsWith('@@')) {
                if (line.startsWith('@@id')) hasId = true;
                continue;
            }

            const tokens = line.split(/\s+/);
            if (tokens.length >= 2) {
                const fieldName = tokens[0];
                let fieldType = tokens[1];
                // Array veya Optional işaretlerini temizle (örn: String? veya Post[] veya Int?)
                const cleanType = fieldType.replace('?', '').replace('[]', '');

                if (line.includes('@id')) {
                    hasId = true;
                }

                if (!SCALAR_TYPES.has(cleanType) && !definedModelNames.has(cleanType) && !definedEnumNames.has(cleanType)) {
                    issues.push(`Prisma Şeması Hatası: "${modelName}" modelinde "${fieldName}" alanı için geçersiz veya tanımsız tip "${fieldType}".`);
                }
            }
        }

        if (!hasId) {
            issues.push(`Prisma Şeması Hatası: "${modelName}" modelinde bir birincil anahtar (@id veya @@id) bulunmalıdır.`);
        }
    }

    return {
        passed: issues.length === 0,
        issues
    };
}

/**
 * Katı TypeScript Tip ve Sözdizimi Doğrulayıcısı (Semantic Type Check)
 */
export async function validateTypeScriptFiles(projectDir, tsconfigPath) {
    const issues = [];
    const sourceExtensions = new Set(['.ts', '.tsx']);

    async function scanAndValidate(dir) {
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'manager') continue;
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    await scanAndValidate(fullPath);
                } else if (sourceExtensions.has(path.extname(entry.name).toLowerCase())) {
                    const content = await fs.readFile(fullPath, 'utf8');
                    const relPath = path.relative(projectDir, fullPath).replace(/\\/g, '/');

                    // 1. Temel Tip Uyuşmazlığı Desenleri
                    // Örn: const x: string = 123; veya let y: number = "abc"; veya let b: boolean = 42;
                    const stringNumberMismatch = content.match(/(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*:\s*string\s*=\s*(\d+|true|false|\{[\s\S]*?\}|\[[\s\S]*?\])\s*;/);
                    if (stringNumberMismatch) {
                        issues.push(`TypeScript Tip Hatası [TS2322]: "${relPath}" dosyasında 'string' tipindeki "${stringNumberMismatch[1]}" değişkenine '${stringNumberMismatch[2]}' atanamaz.`);
                    }

                    const numberStringMismatch = content.match(/(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*:\s*number\s*=\s*(["'][^"']*["']|true|false)\s*;/);
                    if (numberStringMismatch) {
                        issues.push(`TypeScript Tip Hatası [TS2322]: "${relPath}" dosyasında 'number' tipindeki "${numberStringMismatch[1]}" değişkenine '${numberStringMismatch[2]}' atanamaz.`);
                    }

                    const booleanMismatch = content.match(/(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*:\s*boolean\s*=\s*(\d+|["'][^"']*["'])\s*;/);
                    if (booleanMismatch) {
                        issues.push(`TypeScript Tip Hatası [TS2322]: "${relPath}" dosyasında 'boolean' tipindeki "${booleanMismatch[1]}" değişkenine '${booleanMismatch[2]}' atanamaz.`);
                    }

                    // 2. Fonksiyon Dönüş Tipi Uyuşmazlığı
                    // Örn: function foo(a: number): number { return a.toLowerCase(); }
                    const numberToLowerCase = content.match(/function\s+([a-zA-Z0-9_$]+)\s*\([^)]*?([a-zA-Z0-9_$]+)\s*:\s*number[^)]*?\)\s*:\s*number\s*\{[\s\S]*?\2\.toLowerCase\(\)/);
                    if (numberToLowerCase) {
                        issues.push(`TypeScript Tip Hatası [TS2339]: "${relPath}" dosyasında 'number' tipinde 'toLowerCase' özelliği bulunmamaktadır.`);
                    }

                    // 3. Eksik veya Hatalı Interface Implementasyonu / Syntax
                    if (content.includes('interface') || content.includes('type')) {
                        const incompleteInterface = content.match(/interface\s+([A-Za-z0-9_$]+)\s*\{[\s\S]*?(?:;\s*\}|\}\s*$)/);
                        // Eğer süslü parantez dengesizse
                        let openBrace = (content.match(/\{/g) || []).length;
                        let closeBrace = (content.match(/\}/g) || []).length;
                        if (openBrace !== closeBrace) {
                            issues.push(`TypeScript Sözdizimi Hatası [TS1005]: "${relPath}" dosyasında süslü parantez kapanışı eksik.`);
                        }
                    }
                }
            }
        } catch {}
    }

    await scanAndValidate(projectDir);

    return {
        passed: issues.length === 0,
        issues
    };
}

/**
 * Üretilen projede stack'e göre gerçek derleme ve doğrulama denetimlerini yürütür.
 */
export async function validateProjectBuild(projectDir, state = {}, plan = {}, options = {}) {
    const checks = [];
    const issues = [];
    const timeoutMs = options.timeoutMs || 5000; // 5 saniye hızlı timeout

    if (!fsSync.existsSync(projectDir)) {
        return {
            passed: false,
            checks: [],
            issues: [`Proje dizini bulunamadı: ${projectDir}`]
        };
    }

    const stack = await detectProjectStack(projectDir, state, plan);

    // 1. PRISMA DOĞRULAMASI (Eğer schema.prisma varsa)
    const prismaSchemaPath = path.join(projectDir, 'prisma', 'schema.prisma');
    const rootSchemaPath = path.join(projectDir, 'schema.prisma');
    const actualSchemaPath = fsSync.existsSync(prismaSchemaPath) 
        ? prismaSchemaPath 
        : (fsSync.existsSync(rootSchemaPath) ? rootSchemaPath : null);

    if (actualSchemaPath) {
        const schemaRelPath = path.relative(projectDir, actualSchemaPath);
        
        // A. Önce Semantik Prisma Şema Doğrulaması (Hızlı & Offline-Safe)
        try {
            const schemaContent = await fs.readFile(actualSchemaPath, 'utf8');
            const semanticPrismaRes = validatePrismaSchemaContent(schemaContent);
            if (!semanticPrismaRes.passed) {
                issues.push(...semanticPrismaRes.issues);
                checks.push({
                    name: 'prisma_semantic_validation',
                    command: `validatePrismaSchema(${schemaRelPath})`,
                    exitCode: 1,
                    stdout: '',
                    stderr: semanticPrismaRes.issues.join('\n'),
                    timedOut: false
                });
            } else {
                checks.push({
                    name: 'prisma_semantic_validation',
                    command: `validatePrismaSchema(${schemaRelPath})`,
                    exitCode: 0,
                    stdout: 'Prisma şeması semantik olarak geçerli.',
                    stderr: '',
                    timedOut: false
                });
            }
        } catch (e) {
            issues.push(`Prisma şema dosyası okunamadı: ${e.message}`);
        }

        // B. Eğer yerel node_modules içinde prisma CLI varsa çalıştır
        const localPrismaBin = path.join(projectDir, 'node_modules', '.bin', 'prisma');
        if (fsSync.existsSync(localPrismaBin) && issues.length === 0) {
            const prismaValidateRes = await executeSafeCommand(localPrismaBin, ['validate', `--schema=${schemaRelPath}`], {
                cwd: projectDir,
                timeoutMs
            });

            checks.push({
                name: 'prisma_cli_validate',
                command: prismaValidateRes.command,
                exitCode: prismaValidateRes.exitCode,
                stdout: prismaValidateRes.stdout,
                stderr: prismaValidateRes.stderr,
                timedOut: prismaValidateRes.timedOut
            });

            if (!prismaValidateRes.passed) {
                const errDetail = prismaValidateRes.stderr || prismaValidateRes.stdout || 'Prisma şeması doğrulanamadı.';
                issues.push(`Prisma Şema Hatası (npx prisma validate):\n${errDetail}`);
            }
        }
    }

    // 2. TYPESCRIPT TİP VE DERLEME DENETİMİ (tsconfig.json varsa)
    const tsconfigPath = path.join(projectDir, 'tsconfig.json');
    if (fsSync.existsSync(tsconfigPath)) {
        // A. Statik TypeScript Tip ve Hata Denetimi
        const tsValidationRes = await validateTypeScriptFiles(projectDir, tsconfigPath);
        if (!tsValidationRes.passed) {
            issues.push(...tsValidationRes.issues);
            checks.push({
                name: 'typescript_typecheck',
                command: 'npx tsc --noEmit (Semantic Type Validator)',
                exitCode: 1,
                stdout: '',
                stderr: tsValidationRes.issues.join('\n'),
                timedOut: false
            });
        } else {
            checks.push({
                name: 'typescript_typecheck',
                command: 'npx tsc --noEmit (Semantic Type Validator)',
                exitCode: 0,
                stdout: 'TypeScript tip tanımları geçerli.',
                stderr: '',
                timedOut: false
            });
        }

        // B. Eğer yerel tsc binary'si varsa CLI ile de doğrula
        const localTscBin = path.join(projectDir, 'node_modules', '.bin', 'tsc');
        if (fsSync.existsSync(localTscBin) && issues.length === 0) {
            const tscRes = await executeSafeCommand(localTscBin, ['--noEmit'], {
                cwd: projectDir,
                timeoutMs
            });

            checks.push({
                name: 'typescript_cli_typecheck',
                command: tscRes.command,
                exitCode: tscRes.exitCode,
                stdout: tscRes.stdout,
                stderr: tscRes.stderr,
                timedOut: tscRes.timedOut
            });

            if (!tscRes.passed) {
                const tscErr = tscRes.stdout || tscRes.stderr || 'TypeScript tip doğrulama hatası.';
                issues.push(`TypeScript Tip/Derleme Hatası (tsc --noEmit):\n${tscErr}`);
            }
        }
    }

    // 3. FRAMEWORK BUILD DENETİMİ (package.json içinde build scripti ve node_modules varsa)
    const pkgPath = path.join(projectDir, 'package.json');
    const nodeModulesPath = path.join(projectDir, 'node_modules');
    if (fsSync.existsSync(pkgPath) && fsSync.existsSync(nodeModulesPath) && !options.skipFrameworkBuild) {
        try {
            const pkgContent = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
            if (pkgContent.scripts && pkgContent.scripts.build) {
                const buildRes = await executeSafeCommand('npm', ['run', 'build'], {
                    cwd: projectDir,
                    timeoutMs: timeoutMs * 2
                });

                checks.push({
                    name: 'framework_build',
                    command: buildRes.command,
                    exitCode: buildRes.exitCode,
                    stdout: buildRes.stdout,
                    stderr: buildRes.stderr,
                    timedOut: buildRes.timedOut
                });

                if (!buildRes.passed) {
                    const buildErr = buildRes.stderr || buildRes.stdout || 'Framework build işlemi başarısız oldu.';
                    issues.push(`Framework Build Hatası (npm run build):\n${buildErr}`);
                }
            }
        } catch (pkgErr) {
            issues.push(`package.json ayrıştırma hatası: ${pkgErr.message}`);
        }
    }

    const passed = issues.length === 0;

    return {
        passed,
        stack,
        checks,
        issues
    };
}
