import { extractAndParseJSON, validateTeamleaderTasks, normalizeTeamleaderTasks } from './schemas.js';

export const TEAMLEADER_SYSTEM_PROMPT = `
Sen bir "Teamleader" ajanısın (teamleader.agent).
Director'dan aldığın ALT-TALIMATNAME ve görevleri, Coder ajanlarının tek seferde tamamlayabileceği ATOMİK (bağımsız ve odaklı) alt görevlere bölmekle yükümlüsün.

MİSYON:
1. Domain şartnamesini oku ve bağımlılık sırasına göre atomik Coder görevlerine (DAG) ayır.
2. Her görev için üretilmesi gereken hedef dosyaları ve kabul kriterlerini belirle.
3. Çıktını KESİNLİKLE aşağıdaki JSON formatında döndür.

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

export function buildTeamleaderPrompt(teamleaderName, mission, altTalimatname) {
    return `Teamleader Adı: ${teamleaderName}
Misyon: ${mission}

Domain Alt-Talimatnamesi:
"""
${altTalimatname}
"""

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
