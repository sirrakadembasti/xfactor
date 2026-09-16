import { validateProjectBuild, validatePrismaSchemaContent, validateTypeScriptFiles } from '../engine/buildValidator.js';
import path from 'path';
import fs from 'fs/promises';

const projectDirs = [
  'projects/project-5b06b129-fc52-4347-841f-be694e03841f',
  'projects/project-99e55eed-35a0-48ef-b214-cc65fec70ad7',
  'projects/project-f4679f5c-cca5-4276-8faf-6e30cde68b56'
];

for (const dirRel of projectDirs) {
  const pDir = path.resolve(dirRel);
  console.log('\n========================================');
  console.log('Validating Project:', path.basename(pDir));
  console.log('========================================');

  const schemaPath = path.join(pDir, 'prisma/schema.prisma');
  try {
    const schemaContent = await fs.readFile(schemaPath, 'utf8');
    const pRes = validatePrismaSchemaContent(schemaContent);
    console.log('Prisma Schema Validation:', pRes.passed ? 'PASSED' : 'FAILED', pRes.issues);
  } catch (e) {
    console.log('Prisma Schema Missing or Unreadable:', e.message);
  }

  const tsconfigPath = path.join(pDir, 'tsconfig.json');
  try {
    const tsRes = await validateTypeScriptFiles(pDir, tsconfigPath);
    console.log('TypeScript AST Validation:', tsRes.passed ? 'PASSED' : 'FAILED', tsRes.issues?.slice(0, 3));
  } catch (e) {
    console.log('TSConfig Missing or Unreadable:', e.message);
  }

  const bRes = await validateProjectBuild(pDir, {}, {}, { phase: 'generation' });
  console.log('Build & Compiler Quality Gate:', bRes.passed ? 'PASSED' : 'FAILED');
  if (!bRes.passed) {
    console.log('Issues:', bRes.issues);
  } else {
    console.log('Checks:', bRes.checks.map(c => `${c.name}: ${c.status}`));
  }
}
