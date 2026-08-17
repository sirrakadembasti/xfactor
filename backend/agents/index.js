export * from './schemas.js';
export * from './manager.js';
export * from './director.js';
export * from './teamleader.js';
export * from './coder.js';
export * from './reviewer.js';
export * from './tester.js';

import { MANAGER_SYSTEM_PROMPT, buildManagerPrompt, parseManagerResponse } from './manager.js';
import { DIRECTOR_SYSTEM_PROMPT, buildDirectorPrompt, parseDirectorResponse } from './director.js';
import { TEAMLEADER_SYSTEM_PROMPT, buildTeamleaderPrompt, parseTeamleaderResponse } from './teamleader.js';
import { CODER_SYSTEM_PROMPT, buildCoderPrompt, parseCoderResponse } from './coder.js';
import { REVIEWER_SYSTEM_PROMPT, buildReviewerPrompt, parseReviewerResponse } from './reviewer.js';
import { TESTER_SYSTEM_PROMPT, buildTesterPrompt, parseTesterResponse } from './tester.js';

export const AGENT_REGISTRY = {
    manager: {
        role: 'manager',
        systemPrompt: MANAGER_SYSTEM_PROMPT,
        buildPrompt: buildManagerPrompt,
        parseResponse: parseManagerResponse
    },
    director: {
        role: 'director',
        systemPrompt: DIRECTOR_SYSTEM_PROMPT,
        buildPrompt: buildDirectorPrompt,
        parseResponse: parseDirectorResponse
    },
    teamleader: {
        role: 'teamleader',
        systemPrompt: TEAMLEADER_SYSTEM_PROMPT,
        buildPrompt: buildTeamleaderPrompt,
        parseResponse: parseTeamleaderResponse
    },
    coder: {
        role: 'coder',
        systemPrompt: CODER_SYSTEM_PROMPT,
        buildPrompt: buildCoderPrompt,
        parseResponse: parseCoderResponse
    },
    reviewer: {
        role: 'reviewer',
        systemPrompt: REVIEWER_SYSTEM_PROMPT,
        buildPrompt: buildReviewerPrompt,
        parseResponse: parseReviewerResponse
    },
    tester: {
        role: 'tester',
        systemPrompt: TESTER_SYSTEM_PROMPT,
        buildPrompt: buildTesterPrompt,
        parseResponse: parseTesterResponse
    }
};

export function getAgent(agentName) {
    const key = (agentName || '').toLowerCase().trim();
    const agent = AGENT_REGISTRY[key];
    if (!agent) {
        throw new Error(`Bilinmeyen ajan türü: "${agentName}". Geçerli ajanlar: ${Object.keys(AGENT_REGISTRY).join(', ')}`);
    }
    return agent;
}
