import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function validKey(value) {
  const key = String(value || '').trim();
  return /^[0-9a-f]{64}$/i.test(key) || (Buffer.from(key, 'base64').length === 32 && /^[A-Za-z0-9+/]+={0,2}$/.test(key));
}

export function ensureLLMEncryptionKey({
  envPath = path.join(backendDir, '.env'),
  examplePath = path.join(backendDir, '.env.example'),
  profilePath = process.env.LLM_CONFIG_PATH || path.join(backendDir, 'data', 'llm-profiles.json'),
  environment = process.env
} = {}) {
  const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : null;
  const configured = environment.LLM_CONFIG_ENCRYPTION_KEY || (envContent && dotenv.parse(envContent).LLM_CONFIG_ENCRYPTION_KEY);
  if (configured) {
    if (!validKey(configured)) throw new Error('LLM_CONFIG_ENCRYPTION_KEY 32 baytlık hex veya base64 anahtar olmalıdır.');
    environment.LLM_CONFIG_ENCRYPTION_KEY = configured;
    return configured;
  }

  if (fs.existsSync(profilePath)) {
    const data = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    if (data.profiles?.some(profile => profile.secret)) {
      throw new Error('Kayıtlı LLM profilleri var fakat şifreleme anahtarı yok. Önce eski LLM_CONFIG_ENCRYPTION_KEY değerini yedekten kurtarın.');
    }
  }

  const key = crypto.randomBytes(32).toString('hex');
  const base = envContent ?? fs.readFileSync(examplePath, 'utf8');
  const content = `${base.trimEnd()}\nLLM_CONFIG_ENCRYPTION_KEY=${key}\n`;
  fs.writeFileSync(envPath, content, { encoding: 'utf8', mode: 0o600, flag: envContent === null ? 'wx' : 'w' });
  environment.LLM_CONFIG_ENCRYPTION_KEY = key;
  return key;
}
