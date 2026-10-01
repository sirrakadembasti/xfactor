import { agentRoleFile, readAgentDocument } from './agentPaths.js';

/**
 * Yalnız sabit x-agents kökündeki izinli rol dosyasını okur.
 * Eksik, bağlantılı veya geçersiz dosyada üretim durur; başka kaynak kullanılmaz.
 */
export function loadAgentPrompt(agentName) {
    const content = readAgentDocument(agentRoleFile(agentName));
    const cleanContent = content.replace(/^---[\s\S]*?---\s*/, '').trim();
    if (cleanContent.length <= 50) throw new Error('Agent instructions are missing or incomplete.');
    return cleanContent;
}

/**
 * x-agents/ORKESTRASYON-TALIMATNAMESI.md ana anayasa dosyasını diskten dinamik okur.
 */
export function loadOrkestrasyonTalimatnamesi() {
    const content = readAgentDocument('ORKESTRASYON-TALIMATNAMESI.md').trim();
    if (content.length <= 100) throw new Error('Agent orchestration instructions are missing or incomplete.');
    return content;
}
