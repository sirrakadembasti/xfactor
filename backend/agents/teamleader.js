import { extractAndParseJSON, validateTeamleaderTasks, normalizeTeamleaderTasks } from './schemas.js';
import { loadAgentPromptFromDocs } from './agentLoader.js';

const FALLBACK_TEAMLEADER_PROMPT = `
Sen bir "Teamleader" ajanısın (teamleader.agent).
MİSYON:
1. Director'dan aldığın ALT-TALIMATNAME ve görevleri, Coder ajanlarının tek seferde tamamlayabileceği atomik alt görevlere böl.
2. ATOMİK TEK DOSYA KURALI: Her görev tam olarak bir targetFiles öğesi içerir. Servis, API rotası, şema, bileşen ve sayfa sarmalayıcısını ayrı DAG görevleri yap.
3. Her rol yolculuğundaki UI, API, şema/veri ve sonuç adımını requirementIds ile tek-dosya görevlere bağla; Zod update şeması ve paylaşılan component prop sözleşmesini açıklamada belirt.
4. GÖREV SIRALAMASI VE BAĞIMLILIKLAR: Şema -> Tipler -> Veritabanı Yardımcısı -> Servis Fonksiyonları -> API Rotaları -> UI Alt Bileşenleri -> Sayfa Sarmalayıcıları sıralamasını takip et.
5. Çıktını KESİNLİKLE aşağıdaki JSON şemasına uygun olarak üret. JSON dışında hiçbir açıklama metni üretme.
JSON ÇIKTI ŞEMASI:
{
  "tasks": [
    {
      "id": "gorev-1-setup",
      "title": "Proje Kurulumu",
      "description": "Yalnızca package.json için çalışan stack ve seed yapılandırması",
      "dependencies": [],
      "targetFiles": ["package.json"],
      "requirementIds": ["REQ-1"]
    },
    {
      "id": "gorev-2-entry",
      "title": "Uygulama Girişi",
      "description": "Yalnızca src/main.jsx; önceki yapılandırmaya bağımlı",
      "dependencies": ["gorev-1-setup"],
      "targetFiles": ["src/main.jsx"],
      "requirementIds": ["REQ-1"]
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
