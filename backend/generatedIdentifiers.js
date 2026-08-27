/**
 * XFactor Üretilen Tanımlayıcı Normalizatörü (Canonical Kaynak)
 *
 * Domain prefix, teamleader prefix, task id, dependency id ve ajan isimleri
 * gibi LLM kökenli değerleri dosya-sistemi açısından tehlikesiz, deterministic
 * tanımlayıcılara dönüştürür.
 *
 * Bu modül TEK canonical kaynaktır. codeGenerator.js (geriye uyum için yeniden
 * dışa aktarır), fileProtocol.js ve schemas.js bu sembolü buradan içe aktarır.
 * Duplicate implementasyon bırakılmaz.
 */

/**
 * Domain, task ID ve ajan isimlerini güvenli tanımlayıcılara dönüştürür.
 *
 * Garanti: Sonuç ASLA path ayracı (`/` veya `\`) veya parent segment (`..`)
 * taşıyamaz. Bu sayede kötü niyetli/hatalı LLM çıktıları proje root'u dışına
 * dosya yolu oluşturamaz.
 *
 * @param {string} raw
 * @returns {string} slash/parent-segment içermeyen deterministic tanımlayıcı
 */
export function normalizeGeneratedIdentifier(raw) {
    if (!raw || typeof raw !== 'string') {
        return 'unnamed';
    }

    // Path traversal karakterlerini, bölüleri ve geçersiz sembolleri alt çizgiye dönüştür
    let sanitized = raw
        .replace(/\.\./g, '')
        .replace(/[\\/]/g, '_')
        .replace(/[^a-zA-Z0-9_\-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');

    return sanitized || 'unnamed';
}
