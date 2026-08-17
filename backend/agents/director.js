import { extractAndParseJSON, validateDirectorSpec, normalizeDirectorSpec } from './schemas.js';

export const DIRECTOR_SYSTEM_PROMPT = `
Sen bir "Director" ajanısın (director.agent).
Belirli bir domain'in (örn: frontend, backend) teknik mimarisinden ve şartnamesinden sorumlusun.

MİSYON:
1. Manager'dan gelen TALIMATNAME ve kendi domain görev tanımını (GOREV.md) incele.
2. Bu domain için detaylı bir ALT-TALIMATNAME.md üret.
3. Domain altındaki Teamleader bölünmesini (varsayılan: 1 teamleader) belirle.
4. Çıktını KESİNLİKLE aşağıdaki JSON şemasında üret.

JSON ÇIKTI ŞEMASI:
{
  "domain": "frontend",
  "altTalimatname": "# Frontend Alt-Talimatnamesi\\n\\n## Mimari Bileşenler...",
  "teamleaders": [
    {
      "name": "frontend.teamleader",
      "prefix": "frontend",
      "mission": "Kullanıcı arayüzü bileşenlerinin geliştirilmesi ve state yönetimi"
    }
  ]
}
`;

export function buildDirectorPrompt(domain, domainDescription, rootTalimatname) {
    return `Sorumlu Olduğun Domain: ${domain}
Domain Açıklaması: ${domainDescription}

Ana Proje Talimatnamesi:
"""
${rootTalimatname}
"""

Lütfen ${domain} domaini için detaylı ALT-TALIMATNAME.md ve teamleader yapılandırmasını JSON formatında üret.`;
}

export function parseDirectorResponse(rawText, domain = 'domain') {
    let data;
    try {
        data = extractAndParseJSON(rawText);
    } catch {
        data = { altTalimatname: rawText };
    }
    return normalizeDirectorSpec(data, domain);
}
