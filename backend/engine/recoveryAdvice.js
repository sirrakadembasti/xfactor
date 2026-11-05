// A worker revision veto cannot be resolved by replaying the same contract.
export function requiresManagerRevision(error) {
    return /Worker repair requires Manager revision:/i.test(String(error || ''));
}

export function workflowRecoveryAdvice(error) {
    return requiresManagerRevision(error)
        ? 'Aynı planı yeniden sürdürmek açık onarım engelini gidermez. Mevcut çalışmayı korumak için önce Manager ile kontrol sonuçlarını değerlendirin. Yalnız Yeniden Doğrula kaynakları değiştirmeden yeni kontrol yapar; hataları onarmaz. Yeni bir plan revizyonunu onaylamak kaynakların yeniden üretilmesine yol açabilir; onaydan önce yapılacak değişiklikleri değerlendirin.'
        : 'Manager ile hata kaydını değerlendirebilir veya Devam Et (Resume) ile kayıtlı görevlerden sürdürebilirsiniz.';
}
