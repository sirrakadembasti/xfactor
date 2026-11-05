import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildCoderProjectContext } from '../engine/coderContext.js';

test('focused repair context keeps required source whole without letting unrelated export inventories exhaust its budget',async()=>{
 const projectDir=await fs.mkdtemp(path.join(os.tmpdir(),'xfactor-focused-context-'));
 try {
  await fs.mkdir(path.join(projectDir,'src'),{recursive:true});
  await fs.writeFile(path.join(projectDir,'src/subject.ts'),'export const subject = 42;');
  await fs.writeFile(path.join(projectDir,'src/unrelated.ts'),'export const enormous = '+JSON.stringify('x'.repeat(6000))+';');
  const input={projectDir,files:[{path:'src/subject.ts'},{path:'src/unrelated.ts'}],dependencyTargetFiles:['src/subject.ts'],maxBytes:2048};
  assert.match(await buildCoderProjectContext(input),/OMITTED CONTEXT/);
  const focused=await buildCoderProjectContext({...input,includeOptionalExports:false});
  assert.match(focused,/export const subject = 42/);assert.doesNotMatch(focused,/OMITTED CONTEXT|enormous/);
  assert.match(await buildCoderProjectContext({...input,includeOptionalExports:false,dependencyTargetFiles:['src/unrelated.ts']}),/OMITTED CONTEXT/);
 }finally{await fs.rm(projectDir,{recursive:true,force:true});}
});

test('coder context rereads complete dependency, auth and runtime contracts from disk', async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-coder-context-'));
    try {
        const files = {
            'prisma/schema.prisma': 'model User { id String @id }',
            'prisma/seed.ts': 'import { hashPassword } from "../src/lib/auth";',
            'src/lib/auth.ts': 'export function hashPassword(value: string) { return value; }',
            'src/backend/routes/rooms.ts': 'export const rooms = ' + JSON.stringify('x'.repeat(3000)) + ';\nexport const finalRoute = true;',
            'src/backend/app.ts': 'import { rooms } from "./routes/rooms"; export const app = rooms;',
            'src/backend/server.ts': 'app.listen(3001);',
            'src/backend/bootstrap.ts': 'registerHealth(app);\nexport const registerRoutes = () => true;',
            'src/auth/passwordHash.ts': 'const saltLength = 16;\nexport const PASSWORD_FORMAT = "salt:hash";',
            'src/components/RoomCard.tsx': 'const hidden = "not part of interface";\nexport interface RoomProps { id: string }\nexport function RoomCard(props: RoomProps) { return <div>{props.id}</div>; }',
            'package.json': '{"scripts":{"api":"tsx src/backend/server.ts"}}',
            'service-manifest.json': '{"services":{"api":{"port":3001}}}',
            '.env': 'MUST_NOT_LEAK_ENV',
            'src/.env.local': 'MUST_NOT_LEAK_NESTED_ENV',
            'manager/TALIMATNAME.md': 'MUST_NOT_LEAK_INSTRUCTIONS'
        };
        for (const [file, content] of Object.entries(files)) {
            await fs.mkdir(path.dirname(path.join(projectDir, file)), { recursive: true });
            await fs.writeFile(path.join(projectDir, file), content);
        }
        const context = await buildCoderProjectContext({ projectDir,
            files: Object.keys(files).map(file => ({ path: file, content: 'stale in-memory data' })),
            dependencyTargetFiles: ['src/backend/routes/rooms.ts'], targetFiles: ['src/backend/app.ts'] });
        for (const file of ['prisma/schema.prisma', 'prisma/seed.ts', 'src/lib/auth.ts', 'src/backend/routes/rooms.ts', 'src/backend/app.ts', 'src/backend/server.ts', 'src/backend/bootstrap.ts', 'src/auth/passwordHash.ts', 'package.json', 'service-manifest.json']) {
            assert.ok(context.includes(files[file]), `complete current content missing: ${file}`);
        }
        assert.match(context, /export interface RoomProps/);
        assert.match(context, /export function RoomCard/);
        assert.ok(!context.includes('not part of interface'));
        assert.ok(!context.includes('stale in-memory data'));
        assert.ok(!context.includes('MUST_NOT_LEAK'));
    } finally { await fs.rm(projectDir, { recursive: true, force: true }); }
});

test('coder context excludes private files and traversal even when declared as dependencies', async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-coder-private-'));
    try {
        await fs.writeFile(path.join(projectDir, '.env.example'), 'PRIVATE_CONTEXT_MARKER');
        await fs.writeFile(path.join(projectDir, 'credentials.json'), 'PRIVATE_CONTEXT_MARKER');
        await fs.writeFile(path.join(projectDir, 'AGENTS.md'), 'PRIVATE_CONTEXT_MARKER');
        const context = await buildCoderProjectContext({ projectDir, files: [],
            dependencyTargetFiles: ['.env.example', 'credentials.json', 'AGENTS.md', '../escape.ts', 'C:/outside.ts'] });
        assert.ok(!context.includes('PRIVATE_CONTEXT_MARKER'));
        assert.ok(!context.includes('escape.ts'));
        assert.ok(!context.includes('outside.ts'));
    } finally { await fs.rm(projectDir, { recursive: true, force: true }); }
});

test('coder context refuses symlinked dependency directories outside its project', async () => {
    const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-coder-link-'));
    const projectDir = path.join(fixture, 'project');
    const outside = path.join(fixture, 'outside');
    try {
        await fs.mkdir(projectDir);
        await fs.mkdir(outside);
        await fs.writeFile(path.join(outside, 'auth.ts'), 'export const externalSecret = "MUST_NOT_READ_LINK";');
        await fs.symlink(outside, path.join(projectDir, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
        const context = await buildCoderProjectContext({ projectDir,
            dependencyTargetFiles: ['linked/auth.ts'] });
        assert.match(context, /linked\/auth\.ts: excluded symlink/);
        assert.ok(!context.includes('MUST_NOT_READ_LINK'));
    } finally { await fs.rm(fixture, { recursive: true, force: true }); }
});

test('coder context keeps schema intact and reports whole-file budget omissions and missing dependencies', async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-coder-budget-'));
    try {
        await fs.mkdir(path.join(projectDir, 'prisma'));
        const schema = 'model Room { id String @id }';
        await fs.writeFile(path.join(projectDir, 'prisma/schema.prisma'), schema);
        await fs.writeFile(path.join(projectDir, 'large.ts'), 'export const large = "' + 'x'.repeat(10000) + '";');
        const context = await buildCoderProjectContext({ projectDir, maxBytes: 2048,
            files: [{ path: 'prisma/schema.prisma' }, { path: 'large.ts' }],
            dependencyTargetFiles: ['large.ts', 'missing.ts'] });
        assert.ok(context.includes(schema));
        assert.match(context, /large\.ts.*budget/i);
        assert.match(context, /missing\.ts.*missing/i);
        assert.ok(!context.includes('x'.repeat(100)));
        assert.ok(Buffer.byteLength(context) <= 2048);
    } finally { await fs.rm(projectDir, { recursive: true, force: true }); }
});
