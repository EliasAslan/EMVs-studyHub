/**
 * Minimal Ollama client. Framework-free and network-injectable so tests never
 * touch a real server. Only the configured base URL is ever contacted.
 */

import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  DEFAULT_NUM_CTX,
  normalizeBaseUrl,
  isLoopbackUrl,
} from '../data/aiConfig.js';

export { DEFAULT_BASE_URL, DEFAULT_MODEL, DEFAULT_NUM_CTX, normalizeBaseUrl, isLoopbackUrl };


function resolveFetch(deps) {
  if (deps && typeof deps.fetchFn === 'function') return deps.fetchFn;
  if (typeof fetch === 'function') return fetch;
  return null;
}

function abortError() {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

/**
 * @returns {{ok:true, models:string[]}|{ok:false, error:string}}
 */
export async function checkConnection({ baseUrl = DEFAULT_BASE_URL, timeoutMs = 4000 } = {}, deps = {}) {
  const fetchFn = resolveFetch(deps);
  if (!fetchFn) return { ok: false, error: 'unreachable' };

  const base = normalizeBaseUrl(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    const response = await fetchFn(`${base}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!response || !response.ok) {
      return { ok: false, error: response?.status === 404 ? 'http-404' : 'bad-response' };
    }
    const data = await response.json();
    const models = Array.isArray(data?.models)
      ? data.models.map((m) => String(m?.name || m?.model || '')).filter(Boolean)
      : [];
    return { ok: true, models };
  } catch (error) {
    if (error?.name === 'AbortError') return { ok: false, error: 'timeout' };
    if (error instanceof TypeError && isLoopbackUrl(base)) return { ok: false, error: 'cors' };
    return { ok: false, error: 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

export async function listModels({ baseUrl = DEFAULT_BASE_URL } = {}, deps = {}) {
  const result = await checkConnection({ baseUrl }, deps);
  return result.ok ? result.models : [];
}

function parseLine(line, onToken) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let data;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (data?.error) return { error: true };
  const delta = data?.message?.content;
  if (typeof delta === 'string' && delta) onToken?.(delta);
  return data?.done ? { done: true } : null;
}

/**
 * POST /api/chat with streaming NDJSON. Resolves with the full text.
 * @returns {Promise<{text:string, aborted:boolean}>}
 */
export async function chatComplete(
  {
    baseUrl = DEFAULT_BASE_URL,
    model = DEFAULT_MODEL,
    messages = [],
    numCtx = DEFAULT_NUM_CTX,
    format,
    signal,
    onToken,
  } = {},
  deps = {},
) {
  const fetchFn = resolveFetch(deps);
  if (!fetchFn) return { text: '', aborted: false, error: 'unreachable' };

  const base = normalizeBaseUrl(baseUrl);
  let text = '';
  try {
    const response = await fetchFn(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        ...(format ? { format } : {}),
        options: { num_ctx: numCtx },
      }),
      signal,
    });

    if (!response || !response.ok) {
      return {
        text: '',
        aborted: false,
        error: response?.status === 404 ? 'http-404' : 'bad-response',
      };
    }
    if (!response.body?.getReader) {
      const data = await response.json();
      text = String(data?.message?.content || '');
      if (text) onToken?.(text);
      return { text, aborted: false };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const event = parseLine(line, (delta) => {
          text += delta;
          onToken?.(delta);
        });
        if (event?.error) return { text, aborted: false, error: 'bad-response' };
        if (event?.done) return { text, aborted: false };
      }
    }
    if (buffer.trim()) {
      parseLine(buffer, (delta) => {
        text += delta;
        onToken?.(delta);
      });
    }
    return { text, aborted: false };
  } catch (error) {
    if (error?.name === 'AbortError' || signal?.aborted) return { text, aborted: true };
    if (error instanceof TypeError && isLoopbackUrl(base)) {
      return { text, aborted: false, error: 'cors' };
    }
    return { text, aborted: false, error: 'unreachable' };
  }
}

export function describeAiError(code) {
  const origin = typeof location !== 'undefined' ? location.origin : 'http://localhost:5173';
  switch (code) {
    case 'cors':
      return `Der Browser blockiert die Verbindung (CORS). Starte Ollama mit OLLAMA_ORIGINS=${origin} und lade die Seite neu.`;
    case 'timeout':
      return 'Ollama hat zu lange nicht geantwortet. Läuft der Dienst noch?';
    case 'http-404':
      return 'Das Modell wurde nicht gefunden. Prüfe den Modellnamen oder lade es mit „ollama pull“.';
    case 'bad-response':
      return 'Ollama hat unerwartet geantwortet. Prüfe die Adresse und den Modellnamen.';
    case 'aborted':
      return 'Abgebrochen.';
    default:
      return 'Ollama ist nicht erreichbar. Läuft der Dienst auf diesem Gerät?';
  }
}
