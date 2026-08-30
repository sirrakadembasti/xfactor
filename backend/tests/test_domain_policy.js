import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import {
    extractDomainElements,
    checkTemplateContamination,
    isStubOrSkeleton
} from '../contracts/domainPolicy.js';

const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('1. extractDomainElements should derive expected models, endpoints, and screens from contract', async () => {
    const sampleContract = {
        summary: 'E-Commerce Platform',
        domains: [
            {
                name: 'auth',
                prefix: 'auth',
                description: 'User login and registration'
            },
            {
                name: 'catalog',
                prefix: 'catalog',
                description: 'Product listing and inventory'
            }
        ]
    };

    const elements = extractDomainElements(sampleContract);
    assert.ok(Array.isArray(elements));
    assert.ok(elements.length >= 2);

    const authDomain = elements.find(e => e.domain === 'auth');
    assert.ok(authDomain);
    assert.strictEqual(authDomain.prefix, 'auth');

    const catalogDomain = elements.find(e => e.domain === 'catalog');
    assert.ok(catalogDomain);
    assert.strictEqual(catalogDomain.prefix, 'catalog');
});

await runAsyncTest('2. checkTemplateContamination should detect unauthorized brand names and scaffold leaks', async () => {
    const allowedVocabulary = ['ecommerce', 'product', 'cart', 'user', 'order'];

    const cleanCode = `
        export function calculateCartTotal(cartItems) {
            return cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
        }
    `;
    const cleanCheck = checkTemplateContamination('src/services/cart.js', cleanCode, allowedVocabulary);
    assert.strictEqual(cleanCheck.contaminated, false);
    assert.strictEqual(cleanCheck.contaminants.length, 0);

    const contaminatedCode = `
        // Copied from Rent-a-Car scaffold
        export function calculateRentalDays(startDate, endDate) {
            console.log('AcmeCarRental System');
            return 5;
        }
    `;
    const dirtyCheck = checkTemplateContamination('src/services/rent.js', contaminatedCode, allowedVocabulary);
    assert.strictEqual(dirtyCheck.contaminated, true);
    assert.ok(dirtyCheck.contaminants.some(c => c.toLowerCase().includes('rent-a-car') || c.toLowerCase().includes('acmecarrental')));
});

await runAsyncTest('3. isStubOrSkeleton should detect placeholder/unimplemented controller patterns', async () => {
    const stubCode = `
        export async function getProductDetails(req, res) {
            // TODO: implement database lookup
            return res.json({ message: "not implemented yet" });
        }
    `;
    const stubCheck = isStubOrSkeleton(stubCode, '.js');
    assert.strictEqual(stubCheck.isStub, true);
    assert.ok(stubCheck.reasons.length > 0);

    const realCode = `
        export async function getProductDetails(req, res) {
            const { id } = req.params;
            const product = await db.product.findUnique({ where: { id: String(id) } });
            if (!product) return res.status(404).json({ error: "Product not found" });
            return res.json(product);
        }
    `;
    const realCheck = isStubOrSkeleton(realCode, '.js');
    assert.strictEqual(realCheck.isStub, false);
    assert.strictEqual(realCheck.reasons.length, 0);
});

finish();
