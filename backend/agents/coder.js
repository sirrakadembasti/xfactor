import { extractAndParseJSON, validateCoderFiles, extractCoderFilesFromText } from './schemas.js';

export const CODER_SYSTEM_PROMPT = `
Sen bir "Coder" ajanısın (coder.agent).
Hiyerarşinin en alt (yaprak) seviyesindesin; doğrudan kod yazar ve üretirsin.

MİSYON:
1. Sana verilen atomik görevi (GOREV.md) ve hedef dosya listesini eksiksiz şekilde kodla.
2. Kodların çalışır, modern, temiz ve standartlara uygun olduğundan emin ol.
3. Çıktını KESİNLİKLE aşağıdaki JSON şemasında dosyalar dizisi olarak üret.

JSON ÇIKTI ŞEMASI:
{
  "summary": "Bu görevde yazılan/güncellenen bileşenlerin özeti",
  "files": [
    {
      "path": "src/App.jsx",
      "content": "import React from 'react';\\nexport default function App() { return <div>Hello</div>; }"
    },
    {
      "path": "src/index.css",
      "content": "@tailwind base;\\n@tailwind components;\\n@tailwind utilities;"
    }
  ]
}
`;

export function buildCoderPrompt(taskId, title, description, targetFiles, projectContext = "") {
    return `Görev ID: ${taskId}
Görev Başlığı: ${title}
Görev Açıklaması: ${description}
Üretilmesi Gereken Dosyalar: ${JSON.stringify(targetFiles)}

${projectContext ? `Mevcut Proje Bağlamı / Dosyaları:\n"""\n${projectContext}\n"""\n` : ""}

KURALLAR:
1. Yalnızca JSON formatında yanıt ver (\`\`\`json ... \`\`\` bloğu içinde).
2. Kod içeriğini "content" alanı içinde geçerli JSON dizesi olarak sağla.
3. Gereksiz yorum veya dolgu kod ekleme; temiz, modern, modüler ve çalışan kod yaz.`;
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
