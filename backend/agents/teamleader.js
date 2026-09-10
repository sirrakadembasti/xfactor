import { extractAndParseJSON, validateTeamleaderTasks, normalizeTeamleaderTasks } from './schemas.js';
import { loadAgentPromptFromDocs } from './agentLoader.js';

const FALLBACK_TEAMLEADER_PROMPT = `
Sen bir "Teamleader" ajanısın (teamleader.agent).
MİSYON:
1. Director'dan aldığın ALT-TALIMATNAME ve görevleri, Coder ajanlarının tek seferde tamamlayabileceği ATOMİK (bağımsız ve odaklı) alt görevlere bölmekle yükümlüsün.
2. ATOMİK TEKİL DOSYA KURALI: Hem servisi (örn: src/lib/ai.ts) hem de API rotasını (örn: src/app/api/...) ASLA aynı göreve bağlama; servisi ayrı, route'u ona bağımlı ayrı görev yap. Hedef dosya sayısı prensip olarak 1, istisnai olarak en fazla 2 olmalıdır.
3. GÖREV SIRALAMASI VE BAĞIMLILIKLAR (DAG): Şema -> Tipler -> Veritabanı Yardımcısı -> Servis Fonksiyonları -> API Rotaları -> UI Alt Bileşenleri -> Sayfa Sarmalayıcıları sıralamasını takip et.
4. Çıktını KESİNLİKLE aşağıdaki JSON şemasına uygun olarak üret. JSON dışında hiçbir açıklama metni üretme.
JSON ÇIKTI ŞEMASI:
{
  "tasks": [
    {
      "id": "gorev-1-setup",
      "title": "Proje Kurulumu ve Konfigürasyon",
      "description": "package.json ve temel index dosyasının oluşturulması",
      "dependencies": [],
      "targetFiles": ["package.json", "index.html", "src/main.jsx"]
    },
    {
      "id": "gorev-2-components",
      "title": "Ana Arayüz Bileşenleri",
      "description": "App.jsx ve temel UI bileşenlerinin kodlanması",
      "dependencies": ["gorev-1-setup"],
      "targetFiles": ["src/App.jsx", "src/components/Header.jsx"]
    }
  ]
}
`;

export const TEAMLEADER_SYSTEM_PROMPT = loadAgentPromptFromDocs('teamleader', FALLBACK_TEAMLEADER_PROMPT);
export function buildTeamleaderPrompt(teamleaderName, mission, altTalimatname, requirements = []) {
    const reqList = Array.isArray(requirements) && requirements.length > 0
        ? `\nOnaylı Sözleşme Gereksinimleri (Her görevin "requirementIds" dizisinde YALNIZCA bu listedeki ID'leri kullanabilirsin):\n` +
          requirements.map(r => typeof r === 'string' ? `- ${r}` : `- ${r.id}: ${r.statement || r.title || r.id}`).join('\n') +
          `\nKRİTİK KURAL (GEREKSİNİM KAPSAMI): Her görevin "requirementIds" alanına YALNIZCA yukarıdaki listede yer alan ID'leri (örn: "REQ-1", "REQ-2") ata. Listede bulunmayan yeni veya farklı bir REQ ID'si uydurma.\n`
        : '';
    return `Teamleader Adı: ${teamleaderName}
Misyon: ${mission}

Domain Alt-Talimatnamesi:
"""
${altTalimatname}
"""
${reqList}
Lütfen bu görevi bağımlılıklarıyla birlikte atomik Coder görevlerine bölerek JSON formatında döndür.`;
}

export function parseTeamleaderResponse(rawText) {
    let data;
    try {
        data = extractAndParseJSON(rawText);
    } catch {
        data = { tasks: [] };
    }
    return normalizeTeamleaderTasks(data);
}
