import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureLLMEncryptionKey as ensureKey } from '../../llm-yonetimi/src/setup.js';
const backendDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const ensureLLMEncryptionKey = (options={}) => ensureKey({ envPath: path.join(backendDir,'.env'), examplePath:path.join(backendDir,'.env.example'), profilePath:process.env.LLM_CONFIG_PATH || path.join(backendDir,'data/llm-profiles.json'), ...options });
