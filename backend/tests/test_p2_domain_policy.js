import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { verifyDomainCompliance } from '../contracts/domainPolicy.js';

const { runAsyncTest, finish } = createTestHarness();
const filteredTest = process.argv.find(arg => arg.startsWith('--test='))?.split('=')[1];

if (!filteredTest || filteredTest === 'schema-presence') {
    await runAsyncTest('P2.1.1: verifyDomainCompliance rejects missing database models in schema.prisma', async () => {
        const contract = {
            domainEntities: ['Todo', 'Category']
        };

        const files = [
            {
                path: 'prisma/schema.prisma',
                content: `
                    datasource db {
                      provider = "sqlite"
                      url      = "file:./dev.db"
                    }
                    generator client {
                      provider = "prisma-client-js"
                    }
                    model Todo {
                      id        String   @id @default(uuid())
                      title     String
                      completed Boolean  @default(false)
                    }
                `
            },
            {
                path: 'src/index.js',
                content: 'console.log("App");'
            }
        ];

        const result = verifyDomainCompliance(contract, files);
        assert.strictEqual(
            result.passed,
            false,
            'Expected failed compliance result for missing Category model'
        );
        assert.ok(
            result.issues.some(issue => issue.includes('Category')),
            'Issues list must note missing Category model'
        );
    });

    await runAsyncTest('P2.1.1: verifyDomainCompliance passes when all required models exist in schema.prisma', async () => {
        const contract = {
            domainEntities: ['Todo', 'Category']
        };

        const files = [
            {
                path: 'prisma/schema.prisma',
                content: `
                    model Todo {
                      id    String @id
                      title String
                    }
                    model Category {
                      id   String @id
                      name String
                    }
                `
            },
            {
                path: 'src/index.js',
                content: `
                    import { prisma } from './lib/prisma.js';
                    await prisma.todo.findMany();
                    await prisma.category.findMany();
                `
            }
        ];

        const result = verifyDomainCompliance(contract, files);
        assert.strictEqual(result.passed, true);
        assert.strictEqual(result.issues.length, 0);
    });
}

if (!filteredTest || filteredTest === 'entity-query') {
    await runAsyncTest('P2.1.2: verifyDomainCompliance rejects models that are declared but never queried in source code', async () => {
        const contract = {
            domainEntities: ['Todo', 'Category']
        };

        const files = [
            {
                path: 'prisma/schema.prisma',
                content: `
                    model Todo {
                      id    String @id
                      title String
                    }
                    model Category {
                      id   String @id
                      name String
                    }
                `
            },
            {
                path: 'src/routes/todos.js',
                content: `
                    import { prisma } from '../lib/prisma.js';
                    export async function getTodos(req, res) {
                        const todos = await prisma.todo.findMany();
                        res.json(todos);
                    }
                `
            }
        ];

        const result = verifyDomainCompliance(contract, files);
        assert.strictEqual(
            result.passed,
            false,
            'Expected compliance failure for unused entity Category'
        );
        assert.ok(
            result.issues.some(issue => issue.includes('Category') && issue.includes('queried')),
            'Issues list must note unqueried Category entity'
        );
    });

    await runAsyncTest('P2.1.2: verifyDomainCompliance passes when all models are queried in source code', async () => {
        const contract = {
            domainEntities: ['Todo', 'Category']
        };

        const files = [
            {
                path: 'prisma/schema.prisma',
                content: `
                    model Todo {
                      id    String @id
                      title String
                    }
                    model Category {
                      id   String @id
                      name String
                    }
                `
            },
            {
                path: 'src/routes/todos.js',
                content: `
                    import { prisma } from '../lib/prisma.js';
                    export async function getTodos(req, res) {
                        const todos = await prisma.todo.findMany();
                        const categories = await prisma.category.findMany();
                        res.json({ todos, categories });
                    }
                `
            }
        ];

        const result = verifyDomainCompliance(contract, files);
        assert.strictEqual(result.passed, true);
        assert.strictEqual(result.issues.length, 0);
    });
}

finish();
