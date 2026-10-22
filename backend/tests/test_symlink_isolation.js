/**
 * P0.3: Proje dosya API'si ve generated-file yazımlarında symlink ile
 * proje dışı okuma/yazmayı engelleme (canonical realpath containment).
 *
 * Hedef testler:
 *   (a) security helper davranış testleri (isSymlinkDirent, assertPathInsideRoot)
 *   (b) writeGeneratedFiles symlink-parent'lı hedefi reddetmeli (kısmi yazma olmaz)
 *   (c) getFiles HTTP: symlink file/dir üzerinden proje dışı sızma yapılamaz
 *
 * Symlink oluşturulamıyorsa (gerçek fs.symlink hatası) ilgili test atlanır ve
 * raporlanır; process.platform guard'ı KULLANILMAZ.
 */

import assert from 'assert';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { isSymlinkDirent, assertPathInsideRoot } from '../security.js';
import { writeGeneratedFiles } from '../engine/codeGenerator.js';
import express from 'express';

// fs.symlink hatası durumunda { skipped: true, reason } döner; başarıda true.
async function trySymlink(target, linkPath, type) {
    try {
        await fs.symlink(target, linkPath, type);
        return true;
    } catch (err) {
        return { skipped: true, reason: err.code || err.message };
    }
}

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

function pass(name) {
    passed += 1;
    console.log(`  ✅ PASS: ${name}`);
}
function fail(name, err) {
    failed += 1;
    failures.push(name);
    console.log(`  ❌ FAIL: ${name}`);
    console.log(String((err && err.stack) || err));
}
function skip(name, reason) {
    skipped += 1;
    console.log(`  ⏭️  SKIP: ${name} (${reason})`);
}

// ---------------------------------------------------------------------------
// (a) Helper davranış testleri
// ---------------------------------------------------------------------------
async function testHelperBehavior() {
    const name = '(a) security helper: isSymlinkDirent & assertPathInsideRoot';
    try {
        // isSymlinkDirent
        assert.strictEqual(isSymlinkDirent({ isSymbolicLink: () => true }), true, 'symlink dirent true');
        assert.strictEqual(isSymlinkDirent({ isSymbolicLink: () => false }), false, 'regular dirent false');
        assert.strictEqual(isSymlinkDirent(null), false, 'null false');
        assert.strictEqual(isSymlinkDirent(undefined), false, 'undefined false');
        assert.strictEqual(isSymlinkDirent({}), false, 'no isSymbolicLink fn false');

        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sym-helper-'));
        const inside = path.join(root, 'a.txt');
        await fs.writeFile(inside, 'hi');
        const real = await assertPathInsideRoot(inside, root);
        assert.strictEqual(typeof real, 'string', 'returns canonical path');

        const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sym-out-'));
        const outside = path.join(outsideDir, 'b.txt');
        await fs.writeFile(outside, 'out');
        let threw = false;
        try {
            await assertPathInsideRoot(outside, root);
        } catch {
            threw = true;
        }
        assert.strictEqual(threw, true, 'outside file must be rejected');

        await fs.rm(root, { recursive: true, force: true });
        await fs.rm(outsideDir, { recursive: true, force: true });
        pass(name);
    } catch (err) {
        fail(name, err);
    }
}

// ---------------------------------------------------------------------------
// (b) writeGeneratedFiles symlink-parent'lı hedefi reddetmeli
// ---------------------------------------------------------------------------
async function testWriteSymlinkParent() {
    const name = '(b) writeGeneratedFiles rejects symlink-parent target (no partial write)';
    const proj = await fs.mkdtemp(path.join(os.tmpdir(), 'sym-write-'));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'sym-write-out-'));
    const evilLink = path.join(proj, 'evil');
    const ok = await trySymlink(outside, evilLink, 'dir');
    if (ok !== true) {
        await fs.rm(proj, { recursive: true, force: true });
        await fs.rm(outside, { recursive: true, force: true });
        skip(name, `symlink creation failed: ${ok.reason}`);
        return;
    }
    try {
        // Sızma denemesi: evil/escaped.txt -> aslında outside/escaped.txt
        let threw = false;
        try {
            await writeGeneratedFiles(proj, null, [{ path: 'evil/escaped.txt', content: 'should-not-be-written' }]);
        } catch {
            threw = true;
        }
        assert.strictEqual(threw, true, 'writeGeneratedFiles should throw on symlink-parent target');

        // Kısmi yazma olmadı: dışarıdaki dosya var olmamalı
        let outsideExists = true;
        try {
            await fs.access(path.join(outside, 'escaped.txt'));
        } catch {
            outsideExists = false;
        }
        assert.strictEqual(outsideExists, false, 'no file written outside root via symlink parent');

        // Regresyon: normal alt-dizin yazımı hâlâ çalışmalı
        const written = await writeGeneratedFiles(proj, null, [{ path: 'src/app.js', content: 'console.log(1);' }]);
        assert.strictEqual(written.length, 1, 'normal write should succeed');
        const normalContent = await fs.readFile(path.join(proj, 'src', 'app.js'), 'utf8');
        assert.strictEqual(normalContent, 'console.log(1);', 'normal content written correctly');

        pass(name);
    } catch (err) {
        fail(name, err);
    } finally {
        await fs.rm(proj, { recursive: true, force: true });
        await fs.rm(outside, { recursive: true, force: true });
    }
}

// ---------------------------------------------------------------------------
// (b2) writeGeneratedFiles: çok-seviye symlink-parent hedefi reddetmeli VE
//      mkdir ile kök dışında dizin OLUŞTURMAMALI (P0.3 F1)
// ---------------------------------------------------------------------------
async function testWriteSymlinkParentNested() {
    const name = '(b2) writeGeneratedFiles rejects nested symlink-parent without creating outside dir';
    const proj = await fs.mkdtemp(path.join(os.tmpdir(), 'sym-write-nested-'));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'sym-write-nested-out-'));
    const evilLink = path.join(proj, 'evil');
    const ok = await trySymlink(outside, evilLink, 'dir');
    if (ok !== true) {
        await fs.rm(proj, { recursive: true, force: true });
        await fs.rm(outside, { recursive: true, force: true });
        skip(name, `symlink creation failed: ${ok.reason}`);
        return;
    }
    try {
        // Hedef: evil/sub/x.txt -> mkdir, evil symlink'ini takip edip /outside/sub'ı
        // KÖK DIŞINDA oluşturmaya çalışır. Bu reddedilmeli VE /outside/sub oluşmamalı.
        let threw = false;
        try {
            await writeGeneratedFiles(proj, null, [{ path: 'evil/sub/x.txt', content: 'should-not-be-written' }]);
        } catch {
            threw = true;
        }
        assert.strictEqual(threw, true, 'writeGeneratedFiles should throw on nested symlink-parent target');

        // mkdir, kök dışında dizin OLUŞTURMAMALI (F1: kısmi/yan etki yok).
        let outsideSubExists = true;
        try {
            await fs.access(path.join(outside, 'sub'));
        } catch {
            outsideSubExists = false;
        }
        assert.strictEqual(outsideSubExists, false, 'mkdir must NOT create dir outside root via symlink parent');

        // Regresyon: normal çok-seviye alt-dizin yazımı hâlâ çalışmalı
        const written = await writeGeneratedFiles(proj, null, [{ path: 'src/deep/app.js', content: 'console.log(2);' }]);
        assert.strictEqual(written.length, 1, 'normal nested write should succeed');
        const normalContent = await fs.readFile(path.join(proj, 'src', 'deep', 'app.js'), 'utf8');
        assert.strictEqual(normalContent, 'console.log(2);', 'normal nested content written correctly');

        pass(name);
    } catch (err) {
        fail(name, err);
    } finally {
        await fs.rm(proj, { recursive: true, force: true });
        await fs.rm(outside, { recursive: true, force: true });
    }
}

// Each invalid destination must be discovered before any source is replaced.
async function testLinkedWriteDestination(kind) {
    const name = `writeGeneratedFiles rejects ${kind} before changing source or outside sentinel`;
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'sym-destination-'));
    const proj = path.join(base, 'project');
    const outside = path.join(base, 'outside');
    try {
        await fs.mkdir(proj);
        await fs.mkdir(outside);
        await fs.mkdir(path.join(proj, 'src'));
        const source = path.join(proj, 'src/app.js');
        const sentinel = path.join(outside, 'sentinel.js');
        await fs.writeFile(source, 'SOURCE_BEFORE');
        await fs.writeFile(sentinel, 'OUTSIDE_BEFORE');
        let root = proj;
        let coder = null;
        let linkTarget = sentinel;
        let linkPath = path.join(proj, 'target.js');
        let linkType = 'file';
        const files = [{ path: 'src/app.js', content: 'SOURCE_AFTER' }];
        if (kind === 'output leaf symlink') {
            files.push({ path: 'target.js', content: 'OUTSIDE_AFTER' });
        } else if (kind === 'coder copy leaf symlink') {
            coder = path.join(proj, 'coder');
            await fs.mkdir(coder);
            linkPath = path.join(coder, 'src__app.js');
        } else if (kind === 'coder directory junction') {
            coder = path.join(proj, 'coder');
            linkPath = coder;
            linkTarget = outside;
            linkType = process.platform === 'win32' ? 'junction' : 'dir';
        } else if (kind === 'project root junction') {
            root = path.join(base, 'alias');
            linkPath = root;
            linkTarget = proj;
            linkType = process.platform === 'win32' ? 'junction' : 'dir';
        } else if (kind === 'internal ancestor junction') {
            linkPath = path.join(proj, 'alias');
            linkTarget = path.join(proj, 'src');
            linkType = process.platform === 'win32' ? 'junction' : 'dir';
            files.push({ path: 'alias/new.js', content: 'MUST_NOT_EXIST' });
        }
        const linked = await trySymlink(linkTarget, linkPath, linkType);
        if (linked !== true) {
            skip(name, `symlink creation failed: ${linked.reason}`);
            return;
        }
        await assert.rejects(writeGeneratedFiles(root, coder, files, files.map(file => file.path)), /link|symbolic|junction/i);
        assert.strictEqual(await fs.readFile(source, 'utf8'), 'SOURCE_BEFORE');
        assert.strictEqual(await fs.readFile(sentinel, 'utf8'), 'OUTSIDE_BEFORE');
        await assert.rejects(fs.access(path.join(outside, 'src__app.js')), { code: 'ENOENT' });
        await assert.rejects(fs.access(path.join(proj, 'src/new.js')), { code: 'ENOENT' });
        pass(name);
    } catch (error) {
        fail(name, error);
    } finally {
        const relative = path.relative(os.tmpdir(), base);
        assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
        await fs.rm(base, { recursive: true, force: true });
    }
}

async function testRegularWriteReplacement() {
    const name = 'writeGeneratedFiles replaces regular source and coder copy';
    const proj = await fs.mkdtemp(path.join(os.tmpdir(), 'sym-replace-'));
    try {
        const coder = path.join(proj, 'manager/coder');
        await fs.mkdir(coder, { recursive: true });
        await fs.mkdir(path.join(proj, 'src'));
        await fs.writeFile(path.join(proj, 'src/app.js'), 'OLD_SOURCE');
        await fs.writeFile(path.join(coder, 'src__app.js'), 'OLD_COPY');
        const written = await writeGeneratedFiles(proj, coder, [{ path: 'src/app.js', content: 'NEW_SOURCE' }], ['src/app.js']);
        assert.deepStrictEqual(written, [{ path: 'src/app.js', size: 10 }]);
        assert.strictEqual(await fs.readFile(path.join(proj, 'src/app.js'), 'utf8'), 'NEW_SOURCE');
        assert.strictEqual(await fs.readFile(path.join(coder, 'src__app.js'), 'utf8'), 'NEW_SOURCE');
        assert.deepStrictEqual(await fs.readdir(path.join(proj, 'src')), ['app.js']);
        assert.deepStrictEqual(await fs.readdir(coder), ['src__app.js']);
        pass(name);
    } catch (error) {
        fail(name, error);
    } finally {
        await fs.rm(proj, { recursive: true, force: true });
    }
}

// ---------------------------------------------------------------------------
// (c) getFiles HTTP entegrasyonu: symlink üzerinden dışarı sızma olmamalı
// ---------------------------------------------------------------------------
async function testGetFilesHttp() {
    const name = '(c) getFiles HTTP: symlink file/dir cannot leak outside root';
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sym-http-'));
    // Gerçek projects.db'ye ve projects/ dizinine dokunmamak için hem PROJECTS_ROOT
    // hem de DB_PATH'i temp'e yönlendir. Bu, import-time syncProjectsWithDisk()
    // çağrısının (db.js module-load yan etkisi) yalnızca temp ortamı etkilemesini sağlar.
    process.env.PROJECTS_ROOT = baseDir;
    process.env.DB_PATH = ':memory:';
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'sym-http-out-'));
    let skippedTest = false;
    let server;

    try {
        const projectDir = path.join(baseDir, 'symproj123');
        await fs.mkdir(projectDir, { recursive: true });

        // Meşru dosya (route çalışıyor kanıtı)
        await fs.writeFile(path.join(projectDir, 'welcome.js'), 'export const x = 1;');

        // Proje dışı gizli dosya + alt dizin
        const secretPath = path.join(outside, 'secret.txt');
        await fs.writeFile(secretPath, 'TOP_SECRET_DO_NOT_LEAK');
        await fs.mkdir(path.join(outside, 'inner'), { recursive: true });
        await fs.writeFile(path.join(outside, 'inner', 'notes.txt'), 'TOP_SECRET_INNER');

        // Symlink FILE -> dışarıdaki gizli dosya
        const leakFile = path.join(projectDir, 'leak.txt');
        const okFile = await trySymlink(secretPath, leakFile, 'file');
        // Symlink DIR -> dışarıdaki dizin
        const evilDir = path.join(projectDir, 'evil');
        const okDir = await trySymlink(outside, evilDir, 'dir');

        if (okFile !== true || okDir !== true) {
            skip(name, `symlink creation failed: ${JSON.stringify({ okFile, okDir })}`);
            skippedTest = true;
            return;
        }

        const { createProjectRouter } = await import('../routes/projectRoutes.js');
        const app = express();
        app.use(express.json());
        const router = createProjectRouter({
            requireAuth: (req, res, next) => { req.user = { id: 'tester', isAdmin: true }; next(); },
            projectAccess: () => (req, res, next) => next(),
            wsHub: { broadcast() {} }
        });
        app.use('/api/projects', router);

        server = app.listen(0, '127.0.0.1');
        await new Promise((resolve) => server.once('listening', resolve));
        const port = server.address().port;

        const res = await fetch(`http://127.0.0.1:${port}/api/projects/symproj123/files`, {
            headers: { origin: 'https://xfactor.example', 'x-xfactor-csrf': '1' }
        });
        assert.strictEqual(res.status, 200, 'files endpoint should return 200');
        const body = await res.json();
        assert.ok(Array.isArray(body), 'response should be an array');

        const contents = body.map((f) => f.content).join('\n');
        assert.ok(!contents.includes('TOP_SECRET_DO_NOT_LEAK'), 'symlink FILE must not leak secret content');
        assert.ok(!contents.includes('TOP_SECRET_INNER'), 'symlink DIR must not leak outside content');

        const paths = body.map((f) => f.path);
        assert.ok(paths.includes('welcome.js'), 'legit file should still be returned');

        pass(name);
    } catch (err) {
        if (!skippedTest) fail(name, err);
    } finally {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        await fs.rm(baseDir, { recursive: true, force: true });
        await fs.rm(outside, { recursive: true, force: true });
    }
}

async function main() {
    console.log('==================================================');
    console.log('🔒 P0.3: Symlink Isolation Testleri');
    console.log('==================================================');
    await testHelperBehavior();
    await testWriteSymlinkParent();
    await testWriteSymlinkParentNested();
    for (const kind of ['output leaf symlink', 'coder directory junction', 'coder copy leaf symlink', 'project root junction', 'internal ancestor junction']) {
        await testLinkedWriteDestination(kind);
    }
    await testRegularWriteReplacement();
    await testGetFilesHttp();
    console.log('==================================================');
    console.log(`📊 Sonuç: ${passed} Başarılı, ${failed} Hatalı, ${skipped} Atlanan`);
    console.log('==================================================');
    if (failed > 0) {
        console.log('Başarısız testler:', failures.join(', '));
        process.exit(1);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
