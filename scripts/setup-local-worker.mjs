import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PINNED, command, resolveTools } from './local-worker-tools.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function setupLocalWorker({ install = false, env = process.env } = {}) {
  const node = path.resolve(env.XFACTOR_LOCAL_NODE || process.execPath);
  if (command(node, ['--version']).replace(/^v/, '') !== PINNED.node) throw new Error(`Setup requires Node ${PINNED.node}; select it with XFACTOR_LOCAL_NODE.`);
  let npm = env.XFACTOR_LOCAL_NPM_CLI;
  if (!npm) for (const candidate of [path.join(path.dirname(node), 'node_modules/npm/bin/npm-cli.js'), path.resolve(path.dirname(node), '../lib/node_modules/npm/bin/npm-cli.js')]) if (await fs.stat(candidate).catch(() => null)) { npm = candidate; break; }
  if (!npm || command(node, [npm, '--version']) !== PINNED.npm) throw new Error(`Setup requires npm ${PINNED.npm}; set XFACTOR_LOCAL_NPM_CLI.`);
  if (install) {
    // Only reviewed repository lockfiles; never install a generated job/project here.
    for (const directory of ['backend', 'execution']) {
      const cwd = path.join(root, directory);
      await fs.access(path.join(cwd, 'package-lock.json'));
      console.log(`[setup] Installing locked ${directory} dependencies (scripts disabled).`);
      command(node, [npm, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd, env, timeout: 600_000, stdio: 'inherit' });
    }
    const playwright = path.resolve(env.XFACTOR_LOCAL_PLAYWRIGHT || path.join(root, 'execution/node_modules/playwright-core/index.mjs'));
    console.log('[setup] Installing pinned Playwright Chromium; no global npm changes.');
    command(node, [path.join(path.dirname(playwright), 'cli.js'), 'install', 'chromium'], { env, timeout: 600_000, stdio: 'inherit' });
  }
  const tools = await resolveTools(env);
  console.log(`[setup] Ready: Node ${tools.versions.node}, npm ${tools.versions.npm}, Playwright ${tools.versions.playwright}; local-trusted, OS isolation=false.`);
  return tools;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) setupLocalWorker({ install: process.argv.includes('--install') }).catch(error => { console.error(error.message); process.exitCode = 1; });
