// Status questions use persisted facts, never an LLM reconstruction of history.
import { readLatestAttemptObservation } from '../verification/attemptObservation.js';
export function buildRecordedVerificationAnswer(state, database) {
    if (!['paused', 'verification_failed', 'pending_approval'].includes(state.status)) return null;
    const contract = database.prepare("SELECT id FROM project_contracts WHERE project_id=? AND status='approved' ORDER BY revision DESC LIMIT 1").get(state.id);
    if (!contract) return null;
    const run = database.prepare('SELECT id,status,started_at,ended_at FROM verification_runs WHERE project_id=? AND contract_id=? ORDER BY started_at DESC,rowid DESC LIMIT 1')
        .get(state.id, contract.id);
    if (!run) return null;
    const attempt = readLatestAttemptObservation(database, state.id, contract.id);
    const newerFailure = attempt?.noVerificationRun && ['failed', 'rejected', 'failed_timeout', 'failed_interrupted'].includes(attempt.status)
        && Date.parse(attempt.startedAt) > Date.parse(run.started_at);
    const attemptWhen = newerFailure ? new Date(attempt.endedAt || attempt.startedAt).toLocaleString('tr-TR', {
        timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : null;
    const rows = database.prepare('SELECT gate_name,status,evidence_json FROM verification_checks WHERE run_id=?').all(run.id);
    const passed = new Set(rows.filter(row => row.status === 'PASS').map(row => row.gate_name));
    const failed = new Set(rows.filter(row => ['FAIL', 'BLOCKED'].includes(row.status)).map(row => row.gate_name));
    const unstarted = new Set(rows.filter(row => {
        if (row.status !== 'FAIL') return false;
        try { return /\bspawn (?:UNKNOWN|EACCES|EPERM|ENOENT|ENOMEM|EAGAIN)\b/.test(JSON.parse(row.evidence_json || '{}').reason || ''); }
        catch { return false; }
    }).map(row => row.gate_name));
    const date = new Date(run.ended_at || run.started_at);
    const when = Number.isFinite(date.getTime()) ? date.toLocaleString('tr-TR', {
        timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : 'tarihi kayıtta belirtilmemiş';
    const ready = [];
    if (passed.has('clean_install')) ready.push('gerekli bileşenler kurulabiliyor');
    if (passed.has('framework_build')) ready.push('uygulama derlenebiliyor');
    const missing = [];
    if (failed.has('prisma_seed_accounts')) missing.push('deneme hesapları hazırlanamamış');
    if (unstarted.size) missing.push('bazı kontrol komutları başlatılamamış; bu sonuç tek başına uygulamada kod hatası bulunduğu anlamına gelmez');
    if (failed.has('lint') && !unstarted.has('lint')) missing.push('kod denetimi hata bulmuş');
    if (failed.has('framework_build') && !unstarted.has('framework_build')) missing.push('uygulamanın derlemesi geçmemiş');
    if (failed.has('management_runtime_contract')) missing.push('yönetim kontrolleri için gerekli çalışma bilgileri eksik');
    if (failed.has('management_demo_seed') || failed.has('management_role_login')) missing.push('kullanıcı girişleri doğrulanamamış');
    if (failed.has('test_suite_execution') || failed.has('test_infrastructure')) missing.push('uygulama testleri başarıyla tamamlanmamış');
    if (failed.has('browser_journey') || failed.has('browser_management_interaction')) missing.push('ekran kullanım kontrolleri geçmemiş');
    if (failed.has('security_baseline')) missing.push('güvenlik kontrolünde eksikler var');
    const running = ['queued', 'running'].includes(run.status);
    return [
        'Uygulama henüz tamamlanmadı; teslimi onaylanmış değil.',
        newerFailure ? `Son çalışma denemesi: ${attemptWhen}. ${attempt.stage === 'prepare_dependencies' ? 'Bağımlılık hazırlığı tamamlanamadı.' : 'Yeni kontrol kayıtları oluşmadan durdu.'} ${/deadline|timed?\s*out|timeout/i.test(attempt.error)
            ? 'İşlem ayrılan sürede tamamlanamadı.' : attempt.error} Bu denemede yeni doğrulama koşusu oluşmadı; aşağıdaki kontrol sonuçları daha eski kayıtlardır.` : '',
        `Son kayıtlı kontrol: ${when}.${running ? ' Bu kontrolün sonucu henüz kaydedilmemiş.' : ''}`,
        ready.length ? `Hazır olanlar: ${ready.join('; ')}.` : '',
        missing.length ? `Eksikler: ${missing.join('; ')}. Bunlar ayrı kontrol sonuçlarıdır; birinin diğerine neden olduğunu bu kayıtlar tek başına göstermiyor.`
            : failed.size ? 'Bazı zorunlu kontroller tamamlanmamış; ayrıntıları Kalite Paneli’nde görebilirsiniz.' : '',
        'Bu sohbet yeni bir kontrol veya üretim başlatmadı.',
        state.repairPreparation?.available
            ? 'Mevcut çalışmayı koruyan onarım önerisi hazırla seçeneği, değişecek dosyaları ve yapılacak işleri önce gösterir. Öneri hazırlanması dosyaları değiştirmez; onarım ve sonraki doğrulama ayrı adımlardır.' : '',
        'Mevcut çalışmayı koruyarak eksikleri inceleyebiliriz. “Yalnız Yeniden Doğrula” dosyaları değiştirmeden tekrar kontrol eder; hataları kendiliğinden onarmaz. Onarım için yapılacak değişiklikler ayrıca değerlendirilmelidir. Yeni bir planı onaylamak kaynakların yeniden üretilmesine yol açabilir. Sonuç ancak yeni kontrollerle anlaşılır; başarı şimdiden garanti edilemez.'
    ].filter(Boolean).join('\n\n');
}
