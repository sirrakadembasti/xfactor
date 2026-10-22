import { extractAndParseJSON, validateManagerPlan, normalizeManagerPlan, formatUntrustedPromptContext } from './schemas.js';
import { loadAgentSystemPrompt } from './agentLoader.js';

export const MANAGER_SYSTEM_PROMPT = loadAgentSystemPrompt('manager');
export function buildManagerPrompt(userRequest, conversationHistory = []) {
    let historyContext = "";
    if (conversationHistory.length > 0) {
        const historyText = conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n');
        historyContext = "\n" + formatUntrustedPromptContext('CONVERSATION_HISTORY', historyText);
    }

    const untrustedRequest = formatUntrustedPromptContext('USER_REQUEST', userRequest || '');

    return `Boss'un İstek Metni:
${untrustedRequest}
${historyContext}

Lütfen bu istek doğrultusunda kapsamlı bir TALIMATNAME.md metni ve domain bölünmesini JSON formatında üret.`;
}

export function parseManagerResponse(rawText) {
    let data;
    try {
        data = extractAndParseJSON(rawText);
    } catch {
        data = { talimatname: rawText };
    }
    const plan = normalizeManagerPlan(data);
    validateManagerPlan(plan, { requireManagement: true });
    return plan;
}

export function formatManagementProposal(management, browser = {}) {
    if (!management?.needed) return `**Yönetim değerlendirmesi:** Bu uygulama için ayrı yönetim akışı önerilmiyor. ${management?.reason || ''}`.trim();
    const resources = management.resources.map(resource =>
        `- **${resource.name}:** ${resource.operations.join(', ')} · UI: ${resource.uiPath} · API: ${resource.apiPath}${resource.readAccess ? ` · Okuma: ${resource.readAccess}` : ''}${resource.deletionPolicy ? ` · İlişkili kayıtlar: ${resource.deletionPolicy.relatedData} (${resource.deletionPolicy.reason})${resource.deletionPolicy.retentionRule ? ` · Saklama kuralı: ${resource.deletionPolicy.retentionRule}` : ''}` : ''}`);
    const roles = management.roles.map(role =>
        `- **${role.name}:** ${role.permissions.map(permission => `${permission.resource} (${permission.operations.join(', ')})`).join('; ')} · Demo: ${role.demoUser.username} (${role.demoUser.setup})`);
    const roleJourneys = management.roles.map(role =>
        `- **${role.name}:** İzinli: ${role.journeys.positive.join('; ')} · Reddedilen: ${role.journeys.negative.join('; ')}`);
    const browserJourneys = (browser.roleJourneys || []).map(journey => {
        const steps = (journey.steps || []).map(step => `${step.action} ${step.selector || step.target || step.url || ''}`.trim()).join(' → ');
        return `- **${journey.role} / ${journey.kind}:** ${steps} → ${journey.expectedOutcome?.kind || ''}: ${journey.expectedOutcome?.text || ''}`;
    });
    return [
        '**Önerilen yönetim kapsamı:** ' + management.reason,
        '**Yönetilecek kaynaklar:**', ...resources,
        '**Roller ve izole test hesapları:**', ...roles,
        '**Rol kabul akışları:**', ...roleJourneys,
        '**Tarayıcı kabul akışları:**', ...browserJourneys,
        `**Giriş:** ${management.authentication.login} · **Hesap sağlama:** ${management.authentication.accountProvisioning} · **Herkese açık kayıt:** ${management.authentication.publicRegistration ? 'Evet' : 'Hayır'}`
    ].join('\n');
}
