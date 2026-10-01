import { extractAndParseJSON, validateCoderFiles, extractCoderFilesFromText } from './schemas.js';
import { loadAgentPrompt } from './agentLoader.js';

export const CODER_SYSTEM_PROMPT = loadAgentPrompt('coder');

export function buildCoderPrompt(taskId, title, description, targetFiles, projectContext = "") {
    return `Görev ID: ${taskId}
Görev Başlığı: ${title}
Görev Açıklaması: ${description}
Üretilmesi Gereken Dosyalar: ${JSON.stringify(targetFiles)}

${projectContext ? `Mevcut Proje Bağlamı / Dosyaları:\n"""\n${projectContext}\n"""\n` : ""}

KURALLAR:
1. Yalnızca JSON formatında yanıt ver (\`\`\`json ... \`\`\` bloğu içinde).
2. Kod içeriğini "content" alanı içinde geçerli JSON dizesi olarak sağla.
3. BİLEŞEN KOMPOZİSYONU & KOMPAKT KOD KURALI: Sayfa veya form yazarken kodu gereksiz yere 500 satırlık devasa monolitlere dönüştürme. Temiz, modern, çalışan ve kompakt (100-200 satır) bileşenler yaz. Kodun ASLA token sınırına takılıp yarım kesilmesine (truncation) izin verme.
4. Her dosyanın tüm fonksiyon, etiket ve JSX kapanış parantezlerini eksiksiz kapat.`;
}
export function parseCoderResponse(rawText) {
    if (!rawText || typeof rawText !== 'string') {
        throw new Error('Geçersiz veya boş Coder çıktısı.');
    }

    // 1. Önce doğrudan veya onarımlı JSON parse dene
    try {
        const data = extractAndParseJSON(rawText);
        if (data && Array.isArray(data.files) && data.files.length > 0) {
            validateCoderFiles(data);
            return data;
        }
    } catch (err) {
        // JSON Parse hata verirse (örn: unescaped className="px-3" JSX tırnakları) devam et
    }

    // 2. Güçlü Coder Dosya Çıkarıcısı (Unescaped quotes, JSX attributes, truncated output recovery)
    const robustData = extractCoderFilesFromText(rawText);
    if (robustData && Array.isArray(robustData.files) && robustData.files.length > 0) {
        validateCoderFiles(robustData);
        return robustData;
    }

    throw new Error(`Coder çıktısı ayrıştırılamadı. Ham metin: ${rawText.slice(0, 150)}...`);
}
