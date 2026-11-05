const statementKey = value => String(value || '').trim().replace(/\s+/g, ' ');

// Requirement IDs are obligations, not slots for unrelated replacement work.
// Generated management requirements are validated by the management contract.
export function compareApprovedScope(baseContract, draft) {
    if (!baseContract) return { valid: true, issues: [] };
    const base = typeof baseContract.contract_json === 'string'
        ? JSON.parse(baseContract.contract_json) : baseContract.contract_json;
    const candidate = typeof draft === 'string' ? JSON.parse(draft) : draft;
    const issues = [];
    const seen = new Set();
    for (const requirement of candidate?.requirements || []) {
        if (seen.has(requirement.id)) issues.push({ id: requirement.id, before: 'Benzersiz gereksinim kimliği',
            after: requirement.statement, kind: 'duplicate' });
        seen.add(requirement.id);
    }
    for (const requirement of base.requirements || []) {
        if (requirement.mandatory === false || /^MGMT-/.test(requirement.id)) continue;
        const revised = candidate?.requirements?.find(item => item.id === requirement.id);
        if (!revised || revised.mandatory === false
            || statementKey(revised.statement) !== statementKey(requirement.statement)) {
            issues.push({ id: requirement.id, before: requirement.statement,
                after: revised?.statement || '', kind: !revised ? 'missing' : revised.mandatory === false ? 'optional' : 'changed' });
        }
    }
    const management = base.management;
    const revisedManagement = candidate?.management;
    const changed = (id, before, after) => issues.push({ id, before, after, kind: 'changed' });
    const operations = values => [...new Set(values || [])].sort().join(', ');
    if (management?.needed === true) {
        if (revisedManagement?.needed !== true) {
            changed('MGMT-SCOPE', 'Onaylı yönetim kaynakları, roller ve izinler korunmalı.', 'Yönetim kapsamı kapatılmış.');
        } else {
            for (const resource of management.resources || []) {
                const revised = revisedManagement.resources?.find(item => item.name === resource.name);
                if (!revised || (resource.operations || []).some(operation => !revised.operations?.includes(operation))
                    || revised.readAccess !== resource.readAccess
                    || revised.deletionPolicy?.relatedData !== resource.deletionPolicy?.relatedData) {
                    changed(`MGMT-RESOURCE:${resource.name}`,
                        `${resource.name}: ${operations(resource.operations)}; okuma: ${resource.readAccess}; ilişkili kayıtlar: ${resource.deletionPolicy?.relatedData || 'none'}`,
                        revised ? `${operations(revised.operations)}; okuma: ${revised.readAccess}; ilişkili kayıtlar: ${revised.deletionPolicy?.relatedData || 'none'}` : 'Kaynak çıkarılmış.');
                }
            }
            for (const role of management.roles || []) {
                const revised = revisedManagement.roles?.find(item => item.name === role.name);
                const matrix = value => (management.resources || []).map(resource =>
                    `${resource.name}: ${operations(value?.permissions?.find(permission => permission.resource === resource.name)?.operations)}`).join('; ');
                if (!revised || matrix(revised) !== matrix(role)) changed(`MGMT-ROLE:${role.name}`,
                    `${role.name}: ${matrix(role)}`, revised ? matrix(revised) : 'Rol çıkarılmış.');
            }
        }
    }
    return { valid: issues.length === 0, issues };
}

export function enforceApprovedScope(result, baseContract) {
    if (!result.plan) return result;
    const scopeReview = compareApprovedScope(baseContract, result.plan);
    return scopeReview.valid ? result : { ...result, plan: null, scopeReview,
        error: 'Onaylı zorunlu kapsam kaybı: ' + scopeReview.issues.map(issue => `${issue.id}: ${issue.before}`).join('; ')
            + '. Mevcut zorunlu gereksinimleri aynı kimlik ve ifadeyle koru; düzeltmeleri yeni kimliklerle ekle.' };
}
