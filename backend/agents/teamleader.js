import { extractAndParseJSON, normalizeTeamleaderTasks } from './schemas.js';
import { loadAgentPrompt } from './agentLoader.js';

export const TEAMLEADER_SYSTEM_PROMPT = loadAgentPrompt('teamleader');
export function buildTeamleaderPrompt(teamleaderName, mission, altTalimatname, requirements = []) {
    const reqList = Array.isArray(requirements) && requirements.length > 0
        ? `\nOnaylı Sözleşme Gereksinimleri (Her görevin "requirementIds" dizisinde YALNIZCA bu listedeki ID'leri kullanabilirsin):\n` +
          requirements.map(r => typeof r === 'string' ? `- ${r}` : `- ${r.id}: ${r.statement || r.title || r.id}`).join('\n') +
          `\nKRİTİK KURAL (GEREKSİNİM KAPSAMI): Her görevin "requirementIds" alanına YALNIZCA yukarıdaki listede yer alan ID'leri (örn: "REQ-1", "REQ-2") ata. Listede bulunmayan yeni veya farklı bir REQ ID'si uydurma.\n`
        : '';
    const managementRule = requirements.some(r => /^MGMT-(?:RESOURCE|ROLE)-\d+$/.test(typeof r === 'string' ? r : r?.id || ''))
        ? `\nYÖNETİM KAPSAMI: Her MGMT-RESOURCE-N için her onaylı işlemde ayrı UI ve API görevi üret; görevde managementCoverage: [{"requirementId":"MGMT-RESOURCE-N","surface":"ui" veya "api","operation":"create|read|update|delete"}] kullan. Bir görev hem ui hem api yüzeyini karşılayamaz. Her MGMT-ROLE-N için login görevini ve ayrı hedef dosyadaki positive/negative rol yolculuğu görevlerini managementCoverage: [{"requirementId":"MGMT-ROLE-N","journey":"login|positive|negative"}] ile bağla. Her kaydın requirementId değeri görevin requirementIds dizisinde bulunmalı.\n`
        : '';
    return `Teamleader Adı: ${teamleaderName}
Misyon: ${mission}

Domain Alt-Talimatnamesi:
"""
${altTalimatname}
"""
${reqList}${managementRule}
Lütfen bu görevi bağımlılıklarıyla birlikte atomik Coder görevlerine bölerek JSON formatında döndür.`;
}

export function parseTeamleaderResponse(rawText) {
    let data;
    try {
        data = extractAndParseJSON(rawText);
    } catch {
        data = { tasks: [] };
    }
    return normalizeTeamleaderTasks(data);
}
