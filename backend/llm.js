import './networkResolver.js';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logError, logWarning, writeStructuredLog } from './observability.js';

dotenv.config();

function sleepAbortable(ms, signal) {
    if (!signal) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    if (signal.aborted) {
        return Promise.reject(new Error(`LLM sleep aborted: ${signal.reason || 'ABORTED'}`));
    }
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            reject(new Error(`LLM sleep aborted: ${signal.reason || 'ABORTED'}`));
        };
        signal.addEventListener('abort', onAbort, { once: true });
    });
}

async function fetchWithRetry(url, options, { retries = 3, signal = null } = {}) {
    let lastError;
    for (let i = 0; i < retries; i++) {
        if (signal?.aborted) {
            throw new Error(`LLM fetch aborted: ${signal.reason || 'ABORTED'}`);
        }
        try {
            const res = await fetch(url, { ...options, signal });
            if (res.status === 429 || res.status >= 500) {
                if (i < retries - 1 && !signal?.aborted) {
                    const backoffMs = 1000 * (i + 1);
                    logWarning('llm.fetch_retry_status', null, { status: res.status, attempt: i + 1, backoffMs });
                    await sleepAbortable(backoffMs, signal);
                    continue;
                }
            }
            return res;
        } catch (err) {
            lastError = err;
            if (signal?.aborted || err.name === 'AbortError' || err.name === 'TimeoutError') {
                throw err;
            }
            logWarning('llm.fetch_retry_failed', err, { attempt: i + 1, totalAttempts: retries });
            if (i < retries - 1 && !signal?.aborted) {
                await sleepAbortable(1000 * (i + 1), signal);
            }
        }
    }
    throw new Error(`Fetch ${retries} denemeden sonra başarısız oldu. Son hata: ${lastError?.message || lastError}`);
}

export async function generateLLMResponse(messages, options = {}) {
    dotenv.config(); // Her istekte güncel .env değişkenlerini yükle

    const allowMockFallback = options.allowMockFallback === true || process.env.ALLOW_MOCK_FALLBACK === 'true';
    const provider = (options.provider || process.env.AI_PROVIDER || 'google').toLowerCase().trim();
    
    // Model belirleme (Sağlayıcıya özel model veya genel AI_MODEL)
    let aiModel = options.model?.trim() || process.env[`${provider.toUpperCase()}_MODEL`]?.trim() || process.env.AI_MODEL?.trim() || 'gemini-3.6-flash';
    
    let apiKey = options.apiKey !== undefined ? options.apiKey?.trim() : '';
    let baseURL = options.baseURL?.trim() || '';
    const timeoutMs = Number(options.timeoutMs ?? process.env.LLM_TIMEOUT_MS ?? 60000);
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const mergedSignal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;

    if (mergedSignal.aborted) {
        const preflightErr = new Error(`LLM call aborted: ${mergedSignal.reason || 'ABORTED'}`);
        preflightErr.name = 'AbortError';
        throw preflightErr;
    }

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

            let contents = messages
                .filter(m => m.role !== 'system')
                .map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: (m.content || '').trim() || 'Lütfen göreve devam ediniz.' }]
                }));

            if (contents.length === 0) {
                const sys = messages.find(m => m.role === 'system');
                contents = [{
                    role: 'user',
                    parts: [{ text: sys?.content || 'Lütfen görevi tamamlayınız.' }]
                }];
            }
            // Pass signal or race with mergedSignal for SDK
            const generatePromise = model.generateContent({ contents });
            let result;
            if (mergedSignal) {
                if (mergedSignal.aborted) {
                    const abortErr = new Error(`LLM call aborted: ${mergedSignal.reason || 'ABORTED'}`);
                    abortErr.name = 'AbortError';
                    throw abortErr;
                }
                let onAbort;
                const abortPromise = new Promise((_, reject) => {
                    onAbort = () => {
                        const abortErr = new Error(`LLM call aborted: ${mergedSignal.reason || 'ABORTED'}`);
                        abortErr.name = 'AbortError';
                        reject(abortErr);
                    };
                    mergedSignal.addEventListener('abort', onAbort, { once: true });
                });
                try {
                    result = await Promise.race([generatePromise, abortPromise]);
                } finally {
                    if (onAbort) {
                        mergedSignal.removeEventListener('abort', onAbort);
                    }
                }
            } else {
                result = await generatePromise;
            }
            const candidate = result.response.candidates?.[0];
            if (candidate?.finishReason === 'MAX_TOKENS') {
                writeStructuredLog('warn', 'llm.response_truncated', { provider: 'google', transport: 'sdk', tokenLimit: 8192 });
            }
            const responseText = result.response.text();
            if (responseText) return responseText;
        } catch (sdkError) {
            if (mergedSignal?.aborted || sdkError.name === 'AbortError' || sdkError.name === 'TimeoutError') {
                throw sdkError;
            }
            logWarning('llm.google_sdk_failed', sdkError, { fallback: 'rest' });
        }
        // SDK Başarısız olursa Doğrudan Google Native REST API Fallback
        try {
            const nativeUrl = `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKey}`;
            
            const systemMsg = messages.find(m => m.role === 'system');
            let contents = messages
                .filter(m => m.role !== 'system')
                .map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: (m.content || '').trim() || 'Lütfen göreve devam ediniz.' }]
                }));

            if (contents.length === 0) {
                contents = [{ role: 'user', parts: [{ text: systemMsg?.content || 'Lütfen görevi tamamlayınız.' }] }];
            }

            const requestPayload = {
                contents,
                generationConfig: { maxOutputTokens: 8192 }
            };
            if (systemMsg) {
                requestPayload.systemInstruction = { parts: [{ text: systemMsg.content }] };
            }

            const restOptions = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestPayload)
            };
            const response = await fetchWithRetry(nativeUrl, restOptions, { signal: mergedSignal });
            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Google REST API Hatası (${response.status}): ${errText}`);
            }
            const data = await response.json();
            const candidate = data.candidates?.[0];
            if (candidate?.finishReason === 'MAX_TOKENS') {
                writeStructuredLog('warn', 'llm.response_truncated', { provider: 'google', transport: 'rest' });
            }
            const textPart = candidate?.content?.parts?.[0]?.text;
            if (textPart) return textPart;
        } catch (restError) {
            if (mergedSignal?.aborted || restError.name === 'AbortError' || restError.name === 'TimeoutError') {
                throw restError;
            }
            logError('llm.google_rest_failed', restError);
            if (allowMockFallback) {
                return '(Sistem Mesajı: Yapay zekâ sunucusuna erişilemedi. Ancak mimari planınız onaylandı, varsayılan şablonla üretime geçebilirsiniz.)';
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
        }, { signal: mergedSignal });
    } catch (err) {
        if (mergedSignal?.aborted || err.name === 'AbortError' || err.name === 'TimeoutError') {
            throw err;
        }
        if (allowMockFallback) {
            logWarning('llm.mock_fallback_used', err, { provider });
            return '(Sistem Mesajı: Yapay zekâ sunucusuna erişilemedi. Ancak mimari planınız onaylandı, varsayılan şablonla üretime geçebilirsiniz.)';
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

    const choice = data.choices?.[0];
    if (choice?.finish_reason === 'length') {
        writeStructuredLog('warn', 'llm.response_truncated', { provider });
    }

    const content = choice?.message?.content;
    if (!content) {
        throw new Error(`${provider.toUpperCase()} API boş içerik döndürdü.`);
    }
    return content;
}
