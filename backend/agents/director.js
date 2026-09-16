import { extractAndParseJSON, validateDirectorSpec, normalizeDirectorSpec } from './schemas.js';
import { loadAgentPromptFromDocs } from './agentLoader.js';

const FALLBACK_DIRECTOR_PROMPT = `
Sen bir "Director" ajanısın (director.agent).
Belirli bir domain'in (örn: frontend, backend) teknik mimarisinden ve şartnamesinden sorumlusun.

MİSYON:
1. Manager'dan gelen TALIMATNAME ve kendi domain görev tanımını (GOREV.md) incele.
2. Merkezi güncel-stabil stack politikasını kullan; tarihli sürüm listeleri veya el yapımı lockfile isteme.
3. ALT-TALIMATNAME'de her rolün eksiksiz UI, API, şema/veri ve sonuç yolculuğunu; ayrıca API/UI/Prisma alan sözleşmesini belirt.
4. Paylaşılan bileşen prop API'lerini tek TypeScript kaynağıyla koru; prop adlarını uydurma. Güncelleme Zod şemalarında partial temel object üzerinde uygulanır, refine/effects sonrasında uygulanmaz.
5. Domain altındaki Teamleader bölünmesini belirle ve her Coder görevinin tek dosyalı olacağını belirt.
6. Çıktını KESİNLİKLE aşağıdaki JSON şemasında üret.

JSON ÇIKTI ŞEMASI:
{
  "domain": "frontend",
  "altTalimatname": "# Frontend Alt-Talimatnamesi\\n\\n## Mimari Bileşenler...",
  "teamleaders": [
    {
      "name": "frontend.teamleader",
      "prefix": "frontend",
      "mission": "Kullanıcı arayüzü bileşenlerinin geliştirilmesi ve state yönetimi"
    }
  ]
}
`;

export const DIRECTOR_SYSTEM_PROMPT = loadAgentPromptFromDocs('director', FALLBACK_DIRECTOR_PROMPT);
export function buildDirectorPrompt(domain, domainDescription, rootTalimatname) {
    return `Sorumlu Olduğun Domain: ${domain}
Domain Açıklaması: ${domainDescription}

Ana Proje Talimatnamesi:
"""
${rootTalimatname}
"""

Lütfen ${domain} domaini için detaylı ALT-TALIMATNAME.md ve teamleader yapılandırmasını JSON formatında üret.`;
}

export function parseDirectorResponse(rawText, domain = 'domain') {
    let data;
    try {
        data = extractAndParseJSON(rawText);
    } catch {
        data = { altTalimatname: rawText };
    }
    return normalizeDirectorSpec(data, domain);
}

export function validatePlanTasks(planTasks = [], contract = {}) {
    const issues = [];
    const contractRequirements = [
        ...(Array.isArray(contract.requirements) ? contract.requirements : []),
        ...(Array.isArray(contract.requirementIds) ? contract.requirementIds : [])
    ];
    const approvedRequirementIds = new Set(
        contractRequirements
            .map(requirement => (
                typeof requirement === 'string' ? requirement : requirement?.id
            ))
            .filter(requirementId => typeof requirementId === 'string' && requirementId.length > 0)
    );

    for (const task of planTasks) {
        const taskId = task?.id || task?.title || 'unknown';
        if (!Array.isArray(task?.requirementIds) || task.requirementIds.length === 0) {
            issues.push(`UNSOLICITED_FEATURE: Task "${taskId}" has no requirementIds`);
            continue;
        }
        for (const requirementId of task.requirementIds) {
            if (!approvedRequirementIds.has(requirementId)) {
                issues.push(
                    `UNSOLICITED_FEATURE: Task "${taskId}" references unknown requirement "${requirementId}"`
                );
            }
        }
    }

    return {
        passed: issues.length === 0,
        issues
    };
}
