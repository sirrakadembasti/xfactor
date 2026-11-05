import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAgentSystemPrompt } from '../agents/agentLoader.js';

const roles = ['manager', 'director', 'teamleader', 'coder', 'reviewer', 'tester'];

// Regression: omitting the shared policy in any role must fail at the prompt boundary.
for (const role of roles) {
    test(`${role} receives the authoritative Turkish production policy`, async () => {
        const prompt = loadAgentSystemPrompt(role);
        assert.ok(prompt.includes('TÜRKÇE ÜRETİM DİLİ POLİTİKASI'), `${role} lacks shared production policy`);
        const { PRODUCTION_LANGUAGE_POLICY } = await import('../agents/productionLanguagePolicy.js');
        assert.equal(prompt.split(PRODUCTION_LANGUAGE_POLICY).length - 1, 1);
        const module = await import(`../agents/${role}.js`);
        assert.equal(module[`${role.toUpperCase()}_SYSTEM_PROMPT`], prompt);
        assert.ok(prompt.includes(`ROL TALİMATI (${role}; tam metin):`));
    });
}

test('technical identifier conversion preserves Turkish case and only transliterates Turkish letters', async () => {
    const { transliterateTurkishIdentifier } = await import('../agents/productionLanguagePolicy.js');
    const examples = [
        ['Çorap', 'Corap'], ['Ağaç', 'Agac'], ['İstanbul', 'Istanbul'],
        ['ılık', 'ilik'], ['Ördek', 'Ordek'], ['Şemsiye', 'Semsiye'], ['Üzüm', 'Uzum'],
        ['ÇçĞğİıÖöŞşÜü', 'CcGgIiOoSsUu'],
        ['görevli.ışık@örnek.test', 'gorevli.isik@ornek.test'],
        ['role_ADMIN-42', 'role_ADMIN-42'], ['café_日本語', 'café_日本語'], ['', '']
    ];
    for (const [input, expected] of examples) {
        assert.equal(transliterateTurkishIdentifier(input), expected);
    }
    assert.throws(() => transliterateTurkishIdentifier(null), TypeError);
    assert.throws(() => transliterateTurkishIdentifier({ name: 'Şef' }), TypeError);
});

test('identifier conversion is opt-in and leaves role IDs, enums, and display names intact', async () => {
    const { transliterateTurkishIdentifier } = await import('../agents/productionLanguagePolicy.js');
    const role = Object.freeze({ name: 'STORE_MANAGER', displayName: 'Mağaza Müdürü', demoUser: Object.freeze({ displayName: 'Işıl Çelik', username: 'isil.celik' }) });
    const persisted = JSON.stringify(role);
    assert.equal(transliterateTurkishIdentifier(role.demoUser.displayName), 'Isil Celik');
    assert.equal(JSON.stringify(role), persisted);
    assert.equal(role.name, 'STORE_MANAGER');
    assert.equal(role.displayName, 'Mağaza Müdürü');
    assert.equal(role.demoUser.displayName, 'Işıl Çelik');
});
