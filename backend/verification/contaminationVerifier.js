const KNOWN_TEMPLATE_CONTAMINANTS = [
    'rent-a-car',
    'car rental',
    'carrental',
    'acmecarrental',
    'fleet management',
    'acmecorp',
    'examplecorp',
    'template-app',
    'boilerplate-demo'
];

export function verifyContamination(contract = {}, files = []) {
    const issues = [];
    const rawAllowed = contract.allowedVocabulary || contract.allowedTerms || [];
    const allowedVocabulary = new Set(
        (Array.isArray(rawAllowed) ? rawAllowed : [rawAllowed]).map(w => String(w).toLowerCase().trim())
    );

    // Also treat declared contract domains and entities as intrinsically allowed
    const domainEntities = Array.isArray(contract.domainEntities) ? contract.domainEntities : [];
    for (const e of domainEntities) {
        const name = typeof e === 'string' ? e : (e.name || '');
        if (name) allowedVocabulary.add(name.toLowerCase().trim());
    }

    for (const file of files) {
        const content = file.content || '';
        if (!content || typeof content !== 'string') continue;
        const lowerContent = content.toLowerCase();

        for (const contaminant of KNOWN_TEMPLATE_CONTAMINANTS) {
            const lowerContaminant = contaminant.toLowerCase();
            if (allowedVocabulary.has(lowerContaminant)) {
                continue;
            }

            if (lowerContent.includes(lowerContaminant)) {
                issues.push(`Template contamination: out-of-domain vocabulary '${contaminant}' detected in ${file.path || 'unknown file'}`);
            }
        }
    }

    return {
        passed: issues.length === 0,
        issues
    };
}
