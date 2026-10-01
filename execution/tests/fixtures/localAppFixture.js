import JSZip from '../../../backend/node_modules/jszip/lib/index.js';

// All dependencies are Node built-ins. Lock preparation and npm ci need no registry.
export function localAppFixture(port, { testMode = 'passing' } = {}) {
  const manifest = { name: 'xfactor-native-role-fixture', version: '1.0.0', private: true,
    type: 'module', scripts: { build: 'npm run fixture:build', 'fixture:build': 'node build.js', start: 'node server.js',
      test: 'node --test tests/app.test.js', 'xfactor:test:setup': 'node seed.js' } };
  const packageJsonBytes = Buffer.from(JSON.stringify(manifest) + '\n');
  const schema = 'CREATE TABLE IF NOT EXISTS assets (id INTEGER PRIMARY KEY, name TEXT NOT NULL);';
  const page = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:16px;font-family:Arial}button{padding:12px;margin:4px}main{max-width:100%}</style></head><body><main><h1>Assets</h1><button id="save">Save asset</button><button id="read">Read assets</button><button id="forbidden">Forbidden action</button><p id="result" role="status"></p></main><script>
const show=text=>document.querySelector('#result').textContent=text;
document.querySelector('#save').onclick=async()=>{const response=await fetch('/api/assets',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'browser asset'})});show(response.ok?'Saved':'Denied')};
document.querySelector('#read').onclick=async()=>{const response=await fetch('/api/assets');show(response.ok?'Read complete':'Denied')};
document.querySelector('#forbidden').onclick=async()=>{const response=await fetch('/api/forbidden',{method:'POST'});show(response.status===403?'Denied':'Unexpected')};
</script></body></html>`;
  const files = {
    'package.json': packageJsonBytes,
    'fixture-schema.sql': schema,
    'service-manifest.json': JSON.stringify({ services: { web: { command: 'npm', args: ['run', 'start'], port, healthEndpoint: '/health' } } }),
    'README.md': `# Native role fixture\nNode 22 SQLite; service at localhost:${port}.\n\n\`\`\`sh\nnpm run build\nnpm run start\nnpm run test\n\`\`\`\n`,
    'build.js': `import fs from 'node:fs'; import assert from 'node:assert/strict'; assert.match(fs.readFileSync('server.js','utf8'),/createServer/); fs.mkdirSync('dist',{recursive:true}); fs.writeFileSync('dist/build.json',JSON.stringify({built:true})); console.log('Built fixture');`,
    'seed.js': `import fs from 'node:fs'; import {DatabaseSync} from 'node:sqlite';
const manager=process.env.XFACTOR_DEMO_PASSWORD_MANAGER; const viewer=process.env.XFACTOR_DEMO_PASSWORD_VIEWER;
if(!manager||!viewer||manager===viewer)throw new Error('Synthetic role credentials required');
fs.writeFileSync('users.json',JSON.stringify({'manager-fixture':{password:manager,role:'manager'},'viewer-fixture':{password:viewer,role:'viewer'}}));
const db=new DatabaseSync('dev.db'); db.exec(fs.readFileSync('fixture-schema.sql','utf8')); db.close(); console.log('Roles and SQLite prepared');`,
    'server.js': `import http from 'node:http'; import fs from 'node:fs'; import {randomUUID} from 'node:crypto'; import {DatabaseSync} from 'node:sqlite';
const users=JSON.parse(fs.readFileSync('users.json','utf8')); const sessions=new Map(); const db=new DatabaseSync('dev.db');
http.createServer(async(req,res)=>{try{
const chunks=[]; for await(const chunk of req)chunks.push(chunk); const body=Buffer.concat(chunks).toString();
const json=(status,data)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data))};
const session=sessions.get(req.headers.cookie?.match(/session=([^;]+)/)?.[1]);
if(req.url==='/health')return json(200,{ok:true});
if(req.url==='/'&&req.method==='GET'){res.writeHead(200,{'content-type':'text/html'});res.end(${JSON.stringify(page)});return}
if(req.url==='/api/auth/login'&&req.method==='POST'){const data=JSON.parse(body||'{}');const user=users[data.username];if(!user||user.password!==data.password)return json(401,{});const token=randomUUID();sessions.set(token,user.role);res.setHeader('set-cookie','session='+token+'; HttpOnly; SameSite=Lax; Path=/');return json(200,{user:{role:user.role}})}
if(req.url==='/api/forbidden')return json(session?403:401,{});
if(req.url==='/api/assets'){if(!session)return json(401,{});if(req.method==='GET')return json(200,db.prepare('SELECT id,name FROM assets ORDER BY id').all());if(req.method==='POST'){if(session!=='manager')return json(403,{});const data=JSON.parse(body||'{}');if(typeof data.name!=='string'||!data.name)return json(400,{});const record=db.prepare('INSERT INTO assets(name) VALUES (?)').run(data.name);return json(201,{id:Number(record.lastInsertRowid),name:data.name})}}
return json(404,{});
}catch(error){res.writeHead(500);res.end('Fixture error')}}).listen(${port},'127.0.0.1');`,
    'tests/app.test.js': testMode === 'zero' ? '// Deliberately zero tests.\n' : `import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import {DatabaseSync} from 'node:sqlite';
test('build artifact and actual live service',async()=>{assert.equal(JSON.parse(fs.readFileSync('dist/build.json','utf8')).built,true);const response=await fetch('http://127.0.0.1:${port}/health');assert.equal(response.status,200);assert.equal((await response.json()).ok,true);${testMode === 'failing' ? "assert.fail('Deliberate fixture test failure');" : ''}});
test('SQLite write survives closing and reopening',()=>{let db=new DatabaseSync('dev.db');db.exec('CREATE TABLE IF NOT EXISTS suite_probe (value TEXT)');db.prepare('INSERT INTO suite_probe(value) VALUES (?)').run('persisted');db.close();db=new DatabaseSync('dev.db');assert.equal(db.prepare('SELECT value FROM suite_probe').get().value,'persisted');db.exec('DROP TABLE suite_probe');db.close()});`
  };
  const contract = {
    database: { provider: 'sqlite' }, schemaPath: 'fixture-schema.sql', requireWrite: true,
    api: { baseUrl: `http://127.0.0.1:${port}` },
    browser: { url: `http://127.0.0.1:${port}/`, journey: { steps: [{ action: 'assert_element', selector: 'main' }] }, roleJourneys: [
      { role: 'manager', kind: 'positive', steps: [{ action: 'click', selector: '#save' }], expectedOutcome: { kind: 'success', text: 'Saved' } },
      { role: 'viewer', kind: 'positive', steps: [{ action: 'click', selector: '#read' }], expectedOutcome: { kind: 'success', text: 'Read complete' } },
      ...['manager', 'viewer'].map(role => ({ role, kind: 'negative', steps: [{ action: 'click', selector: '#forbidden' }], expectedOutcome: { kind: 'denied', text: 'Denied' } }))
    ] },
    management: { needed: true, authentication: { apiLogin: { path: '/api/auth/login' } },
      resources: [{ name: 'assets', apiPath: '/api/assets', operations: ['create', 'read'], readAccess: 'authenticated' }],
      roles: [{ name: 'manager', demoUser: { username: 'manager-fixture' }, permissions: [{ resource: 'assets', operations: ['create', 'read'] }] },
        { name: 'viewer', demoUser: { username: 'viewer-fixture' }, permissions: [{ resource: 'assets', operations: ['read'] }] }] }
  };
  return { packageJsonBytes, contract, files, async archive(lockBytes) {
    const zip = new JSZip();
    for (const [name, bytes] of Object.entries({ ...files, 'package-lock.json': lockBytes })) zip.file(name, bytes);
    return zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX', compression: 'STORE' });
  } };
}
