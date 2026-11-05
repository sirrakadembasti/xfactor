import assert from 'node:assert/strict';
import test from 'node:test';

const extract = async (files, options) => {
    const module = await import('../contracts/uiLanguageCatalogue.js');
    assert.equal(typeof module.buildUiLanguageCatalogue, 'function', 'static candidate extractor is missing');
    return module.buildUiLanguageCatalogue(files, options);
};

test('extracts visible JSX literals without treating technical identifiers or credentials as UI', async () => {
    const content = `const role = 'admin'; const credentials = { username: 'demo', password: 'secret' };
export const View = () => <main className="admin"><h1>Sign in</h1><p>İşlem başarılı, şüğöçı.</p><input type="password" value="secret" placeholder="Password" aria-label={'Şifre'} /><button>{'Save'}</button></main>;`;
    const result = await extract([{ path: 'View.tsx', content }]);
    assert.deepEqual(result.candidates.map(c => c.text), ['Sign in', 'İşlem başarılı, şüğöçı.', 'Password', 'Şifre', 'Save']);
    assert.equal(result.kind, 'static-candidates');
    assert.equal(result.reviewed, false);
    assert.equal(result.fullProductProof, false);
    assert.equal(result.extractionComplete, true);
    assert.equal(result.inventoryComplete, true);
    assert.match(result.inventorySourceHash, /^[a-f0-9]{64}$/);
    for (const candidate of result.candidates) {
        assert.equal(candidate.anchor.path, 'View.tsx');
        assert.equal(candidate.anchor.sourceHash, result.files[0].sourceHash);
        assert.ok(candidate.anchor.line >= 2 && candidate.anchor.column >= 0);
        assert.ok(content.slice(candidate.anchor.start, candidate.anchor.end).includes(candidate.text));
    }
    assert.equal(content.includes("const role = 'admin'"), true);
});

test('captures HTTP and zod validation messages only in relevant expression contexts', async () => {
    const content = `const schema = z.object({ name: z.string({ required_error: 'Ad gerekli' }).min(2, 'Too short').refine(v => v.length > 0, { message: 'Geçersiz ad' }) });
res.status(400).json({ error: 'Access denied', message: 'İşlem reddedildi', role: 'admin' });
const unrelated = { message: 'internal metadata', error: 'internal key' }; config.json({message: 'not HTTP'});`;
    const result = await extract([{ path: 'api.ts', content }]);
    assert.deepEqual(result.candidates.map(c => c.text).sort(), ['Ad gerekli', 'Too short', 'Geçersiz ad', 'Access denied', 'İşlem reddedildi'].sort());
    assert.equal(result.extractionComplete, true);
});

test('dynamic UI, unsupported sources, and parser failures remain explicit incomplete evidence', async () => {
    const result = await extract([
        { path: 'dynamic.jsx', content: 'const x = <p title={tooltip}>{user.name}{t("hello")}</p>; res.json({message: computed});' },
        { path: 'view.vue', content: '<template>Hello</template>' },
        { path: 'view.html', content: '<p>Hello</p>' },
        { path: 'broken.tsx', content: 'const x = <p' }
    ]);
    assert.equal(result.extractionComplete, false);
    assert.equal(result.inventoryComplete, true);
    assert.equal(result.fullProductProof, false);
    for (const code of ['dynamic-ui-expression', 'unsupported-source', 'parse-error']) {
        assert.ok(result.issues.some(i => i.code === code), code);
    }
    assert.ok(result.issues.filter(i => i.code === 'dynamic-ui-expression').every(i => i.anchor?.line >= 1));
});

test('source inventory hash includes non-candidate source changes and file paths', async () => {
    const files = [{ path: 'a.tsx', content: 'const a = <p>Merhaba</p>;' }];
    const first = await extract(files);
    const changed = await extract([{ ...files[0], content: files[0].content + ' // changed' }]);
    const renamed = await extract([{ ...files[0], path: 'b.tsx' }]);
    assert.notEqual(first.inventorySourceHash, changed.inventorySourceHash);
    assert.notEqual(first.inventorySourceHash, renamed.inventorySourceHash);
    assert.notEqual(first.files[0].sourceHash, changed.files[0].sourceHash);
});

test('byte, file, node and candidate quotas stop extraction and never imply complete evidence', async () => {
    const fixtures = [{ path: 'a.jsx', content: 'const x = <p>Bir</p>;' }, { path: 'b.jsx', content: 'const x = <p>İki</p>;' }];
    for (const options of [{ maxFiles: 1 }, { maxTotalBytes: 2 }, { maxFileBytes: 2 }]) {
        const result = await extract(fixtures, options);
        assert.equal(result.extractionComplete, false);
        assert.equal(result.inventoryComplete, false);
        assert.equal(result.inventorySourceHash, null);
        assert.ok(result.issues.some(i => i.code.includes('limit')));
    }
    const candidates = await extract(fixtures, { maxCandidates: 1 });
    assert.equal(candidates.candidates.length, 1);
    assert.equal(candidates.extractionComplete, false);
    assert.ok(candidates.issues.some(i => i.code === 'candidate-limit'));
    const nodes = await extract(fixtures, { maxNodes: 1 });
    assert.equal(nodes.extractionComplete, false);
    assert.ok(nodes.issues.some(i => i.code === 'node-limit'));
});

test('dynamic validation and computed message properties cannot look statically complete', async () => {
    const result = await extract([{ path: 'form.ts', content: `import { z as validator } from 'zod';
const x = validator.string().min(3, translatedMessage).refine(check, {message: getMessage()});
res.json({[messageKey]: 'unknown', ...payload});` }]);
    assert.equal(result.extractionComplete, false);
    assert.equal(result.issues.filter(i => i.code === 'dynamic-ui-expression').length, 2);
    assert.ok(result.issues.some(i => i.code === 'dynamic-message-properties'));
});

test('invalid or ambiguous inventory, unsafe quota options, and issue cuts never become complete', async () => {
    const { buildUiLanguageCatalogue } = await import('../contracts/uiLanguageCatalogue.js');
    assert.throws(() => buildUiLanguageCatalogue(null), TypeError);
    assert.throws(() => buildUiLanguageCatalogue([], {maxFiles: -1}), TypeError);
    const malformed = await extract([{path: 'a.ts', content: 3}]);
    assert.equal(malformed.inventoryComplete, false);
    assert.equal(malformed.inventorySourceHash, null);
    const duplicates = await extract([{path: 'a.ts', content: ''}, {path: 'a.ts', content: ''}]);
    assert.equal(duplicates.inventoryComplete, false);
    assert.equal(duplicates.inventorySourceHash, null);
    const limited = await extract([{path: 'a.jsx', content: 'const a = <p>{one}{two}{three}</p>;'}], {maxIssues: 1});
    assert.equal(limited.issues.length, 1);
    assert.equal(limited.issues[0].code, 'issue-limit');
    assert.equal(limited.extractionComplete, false);
});
