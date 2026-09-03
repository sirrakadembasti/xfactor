import { extractAndParseJSON, validateTeamleaderTasks, normalizeTeamleaderTasks } from './schemas.js';
import { loadAgentPromptFromDocs } from './agentLoader.js';

const FALLBACK_TEAMLEADER_PROMPT = `
Sen bir "Teamleader" ajanısın (teamleader.agent).
Director'dan aldığın ALT-TALIMATNAME ve görevleri, Coder ajanlarının tek seferde tamamlayabileceği ATOMİK (bağımsız ve odaklı) alt görevlere bölmekle yükümlüsün.

MİSYON:
1. Domain şartnamesini oku ve bağımlılık sırasına göre atomik Coder görevlerine (DAG) ayır.
2. Her görev için üretilmesi gereken hedef dosyaları ve kabul kriterlerini belirle.
3. KRİTİK KURAL (ATOMİK DOSYA LİMİTİ): LLM çıktı token sınırına takılmamak ve kodların yarım kesilmesini (truncation) önlemek için her bir görevin "targetFiles" listesinde YALNIZCA 1 DOSYA tanımla. Asla tek bir göreve 2 veya daha fazla UI bileşeni ya da dosya atama; her bileşeni ayrı bir alt göreve böl.
4. Çıktını KESİNLİKLE aşağıdaki JSON formatında döndür.
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
