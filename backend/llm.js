import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

async function fetchWithRetry(url, options, retries = 3) {
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, options);
            return res;
        } catch (err) {
            lastError = err;
            console.warn(`Fetch başarısız oldu (Deneme ${i + 1}/${retries}). Hata: ${err.message}. Tekrar deneniyor...`);
            await new Promise(res => setTimeout(res, 1000 * (i + 1))); // Exponential backoff
        }
    }
    throw new Error(`Fetch ${retries} denemeden sonra başarısız oldu. Son hata: ${lastError.message}`);
}

export async function generateLLMResponse(messages, options = {}) {
    dotenv.config(); // Her istekte güncel .env değişkenlerini yükle

    const allowMockFallback = options.allowMockFallback === true || process.env.ALLOW_MOCK_FALLBACK === 'true';
    const provider = (options.provider || process.env.AI_PROVIDER || 'google').toLowerCase().trim();
    
    // Model belirleme (Sağlayıcıya özel model veya genel AI_MODEL)
    let aiModel = options.model?.trim() || process.env[`${provider.toUpperCase()}_MODEL`]?.trim() || process.env.AI_MODEL?.trim() || 'gemini-3.6-flash';
    
    let apiKey = options.apiKey !== undefined ? options.apiKey?.trim() : '';
    let baseURL = options.baseURL?.trim() || '';

    if (options.apiKey === undefined) {
        if (provider === 'google') {
            apiKey = process.env.GOOGLE_API_KEY?.trim() || '';
        }
        else if (provider === 'openai') {
            apiKey = process.env.OPENAI_API_KEY?.trim() || '';
            baseURL = process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1/chat/completions";
            if (!aiModel) aiModel = 'gpt-5.6-sol';
        }
        else if (provider === 'openrouter') {
            apiKey = process.env.OPENROUTER_API_KEY?.trim() || '';
            baseURL = process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1/chat/completions";
            if (!aiModel) aiModel = 'google/gemini-3.6-flash';
        }
        else if (provider === 'deepseek') {
            apiKey = process.env.DEEPSEEK_API_KEY?.trim() || '';
            baseURL = process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com/chat/completions";
            if (!aiModel) aiModel = 'deepseek-chat';
        }
        else if (provider === 'qwen') {
            apiKey = process.env.QWEN_API_KEY?.trim() || '';
            baseURL = process.env.QWEN_BASE_URL?.trim() || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";
            if (!aiModel) aiModel = 'qwen3-max';
        }
        else if (provider === 'minimax') {
            apiKey = process.env.MINIMAX_API_KEY?.trim() || '';
            baseURL = process.env.MINIMAX_BASE_URL?.trim() || "https://api.minimax.io/v1/chat/completions";
            if (!aiModel) aiModel = 'abab7-chat';
        }
        else if (provider === 'kimi') {
            apiKey = process.env.KIMI_API_KEY?.trim() || '';
            baseURL = process.env.KIMI_BASE_URL?.trim() || "https://api.moonshot.ai/v1/chat/completions";
            if (!aiModel) aiModel = 'moonshot-v1-32k';
        }
    }

    if (!baseURL && process.env.AI_BASE_URL?.trim()) {
        baseURL = process.env.AI_BASE_URL.trim();
    }

    // API Key Kontrolü: güvenli fail-closed davranışı; yalnızca açıkça allowMockFallback=true ise mock döner.
    if (!apiKey || apiKey === 'your_gemini_api_key_here' || apiKey.startsWith('your_')) {
        if (allowMockFallback) {
            return "(Simüle Edilen LLM Yanıtı: Geçerli bir API_KEY bulunamadığı için simülasyon olarak kod üretilmiştir. console.log('Hello Boss!');)";
        }
        throw new Error(`Missing or invalid ${provider.toUpperCase()} API key. Set the provider secret in the environment or enable ALLOW_MOCK_FALLBACK=true for explicit local testing only.`);
    }

    // =========================================================================
    // 1. GOOGLE GEMINI PROVIDER (Resmi SDK ve Yerel REST API Çağrısı)
    // =========================================================================
    if (provider === 'google') {
        // Önce Resmi SDK'yı dene
        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            
            const systemMsg = messages.find(m => m.role === 'system');
            const systemInstruction = systemMsg ? systemMsg.content : undefined;

            const model = genAI.getGenerativeModel({
                model: aiModel,
                systemInstruction: systemInstruction,
                generationConfig: { maxOutputTokens: 8192 }
            });

            const contents = messages
                .filter(m => m.role !== 'system')
                .map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }]
                }));

            const result = await model.generateContent({ contents });
            const responseText = result.response.text();
            if (responseText) return responseText;
        } catch (sdkError) {
            console.warn("Google SDK çağrısı başarısız oldu, yerel REST API fallback deneniyor:", sdkError.message);
        }

        // SDK Başarısız olursa Doğrudan Google Native REST API Fallback
        try {
            const nativeUrl = `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKey}`;
            
            const systemMsg = messages.find(m => m.role === 'system');
            const contents = messages
                .filter(m => m.role !== 'system')
                .map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }]
                }));

            const payload = {
                contents,
                generationConfig: { maxOutputTokens: 8192 }
            };
            if (systemMsg) {
                payload.systemInstruction = { parts: [{ text: systemMsg.content }] };
            }
            const response = await fetchWithRetry(nativeUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Google API Hatası [${response.status}]: ${errText}`);
            }

            const data = await response.json();
            const textPart = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textPart) return textPart;

            throw new Error("Google REST API boş yanıt döndürdü.");
        } catch (restError) {
            console.error("Google REST API Fallback Hatası:", restError.message);
            if (allowMockFallback) {
                return `(Sistem Mesajı: Yapay zekâ sunucusuna erişilemedi [${restError.message}]. Ancak mimari planınız onaylandı, varsayılan şablonla üretime geçebilirsiniz.)`;
            }
            throw restError;
        }
    }

    // =========================================================================
    // 2. OPENAI UYUMLU REST API ÇAĞRISI (OpenAI, OpenRouter, DeepSeek, Qwen vb.)
    // =========================================================================
    if (baseURL && !baseURL.endsWith('/chat/completions')) {
        baseURL = baseURL.replace(/\/+$/, '') + '/chat/completions';
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    };

    const requestBody = JSON.stringify({ model: aiModel, messages: messages, max_tokens: 8192 });

    let response;
    try {
        response = await fetchWithRetry(baseURL, {
            method: 'POST',
            headers: headers,
            body: requestBody
        });
    } catch (err) {
        if (allowMockFallback) {
            console.warn("Ağ hatası nedeniyle mock yanıt döndürülüyor:", err.message);
            return `(Sistem Mesajı: Yapay zekâ sunucusuna erişilemedi [${err.message}]. Ancak mimari planınız onaylandı, varsayılan şablonla üretime geçebilirsiniz.)`;
        }
        throw new Error(`Yapay zeka sunucusuna bağlanılamadı. Ağ/DNS Hatası: ${err.message}. Lütfen İnternet/VPN/Proxy bağlantınızı kontrol edin.`);
    }

    if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`${provider.toUpperCase()} API Hatası: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    
    if (Array.isArray(data) && data[0]?.error) {
        throw new Error(`${provider.toUpperCase()} API Hatası: ${data[0].error.message || JSON.stringify(data[0].error)}`);
    }
    if (data.error) {
        throw new Error(`${provider.toUpperCase()} API Hatası: ${data.error.message || JSON.stringify(data.error)}`);
    }

    return data.choices[0].message.content;
}
