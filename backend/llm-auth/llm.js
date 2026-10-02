import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLLMProfileStore as createStore } from '../../llm-yonetimi/src/index.js';
export { mountLLMManagement, PROVIDERS, validateProviderUrl } from '../../llm-yonetimi/src/index.js';
const here=path.dirname(fileURLToPath(import.meta.url));
export const createLLMProfileStore = (options={}) => createStore({ filePath: process.env.LLM_CONFIG_PATH || path.resolve(here,'../data/llm-profiles.json'), ...options });
