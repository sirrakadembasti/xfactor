import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logWarning } from '../observability.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOCS_DIR = path.join(__dirname, '../../docs');

/**
 * docs/<agentName>.md dosyasını okuyarak dinamik ajan promptu döner.
 * Dosya bulunamazsa veya hata olursa fallbackPrompt kullanılır.
 */
export function loadAgentPromptFromDocs(agentName, fallbackPrompt) {
    try {
        const docPath = path.join(DOCS_DIR, `${agentName}.md`);
        if (fs.existsSync(docPath)) {
            const content = fs.readFileSync(docPath, 'utf8');
            // Frontmatter (--- ... ---) kısmını temizle
            const cleanContent = content.replace(/^---[\s\S]*?---\s*/, '').trim();
            if (cleanContent && cleanContent.length > 50) {
                return cleanContent;
            }
        }
    } catch (error) {
        logWarning('agent.docs_prompt_read_failed', error, { agentName });
    }
    return fallbackPrompt;
}

/**
 * docs/ORKESTRASYON-TALIMATNAMESI.md ana anayasa dosyasını diskten dinamik okur.
 */
export function loadOrkestrasyonTalimatnamesi() {
    try {
        const docPath = path.join(DOCS_DIR, 'ORKESTRASYON-TALIMATNAMESI.md');
        if (fs.existsSync(docPath)) {
            const content = fs.readFileSync(docPath, 'utf8');
            if (content && content.length > 100) {
                return content.trim();
            }
        }
    } catch (error) {
        logWarning('agent.orchestration_docs_read_failed', error);
    }
    return '';
}
