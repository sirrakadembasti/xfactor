const descriptions = {
    prisma_seed_accounts: 'Deneme hesaplarının hazırlanmasını düzelt.',
    lint: 'Mevcut ekran davranışını koruyarak kod denetimi hatalarını gider.',
    security_baseline: 'Bağlantı izinlerindeki güvenlik eksiklerini gider.',
    management_runtime_contract: 'Uygulamanın ve yönetim ekranlarının çalışma bilgilerini tamamla.',
    test_suite_execution: 'Gerçek uygulama testlerinin çalışmasını sağla.',
    test_infrastructure: 'Gerçek davranışı sınayan uygulama testlerini tamamla.',
    management_demo_seed: 'Deneme hesapları ve yönetim verilerindeki eksikleri gider.',
    management_role_login: 'Kullanıcı girişlerinin ve yetkilerinin doğrulanmasını sağla.',
    browser_journey: 'Ekran kullanım kontrollerinde bildirilen eksikleri gider.',
    browser_management_interaction: 'Yönetim ekranlarının kullanımındaki eksikleri gider.',
    requirement_traceability: 'Onaylı kapsam ile kontrol kanıtlarının bağlantısını tamamla.'
};
// Display text is server-owned. Model prose is an internal Coder instruction,
// never a trustworthy status report or a place to display credential literals.
export function presentControlledRepair(proposal, checks = [], phase = 'proposed') {
    const gates = new Map(checks.map(check => [check.id, check.gate_name]));
    return { ...proposal,
        summary: phase === 'patched' ? `${proposal.targets.length} dosyadaki sınırlı kaynak değişiklikleri uygulandı. Teslim kabulü yeni kontrol kanıtlarına bağlıdır.`
            : phase === 'repairing' ? 'Sınırlı kaynak onarımı başlatıldı. Tamamlanan değişiklikler ve sonraki kontroller ayrıca değerlendirilecek.'
                : `${proposal.targets.length} dosyada kayıtlı eksikleri giderecek sınırlı değişiklikler öneriliyor. Henüz uygulanmadı; sonuç yeni kontrollerle değerlendirilecek.`,
        targets: proposal.targets.map(target => ({ ...target, instructions: [...new Set(target.checkIds.map(id => descriptions[gates.get(id)]).filter(Boolean))].join(' ')
            || 'Kayıtlı kontrol eksiklerini gider; mevcut işlevleri koru.' }))
    };
}
