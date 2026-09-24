import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runDeterministicProjectAudit } from '../agents/tester.js';

test('static audit accepts Next-generated next-env type references', () => {
    const files = [
        { path: 'package.json', content: '{"dependencies":{"next":"16.3.6","react":"18.3.1"}}' },
        { path: 'next-env.d.ts', content: '/// <reference types="next" />\nimport "./.next/types/routes.d.ts";\nimport "./.next/types/root-params.d.ts";\n' }
    ];
    const audit = runDeterministicProjectAudit(files);
    assert.equal(audit.passed, true, audit.issues.join('\n'));
});
