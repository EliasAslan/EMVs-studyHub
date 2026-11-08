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

export const MODELS_CACHE_TTL_MS = 5 * 60 * 1000;
export const MODELS_CACHE_KEY = 'studyhub_ai_models_v1';

function isInjectedFetch(deps) {
  return !!(deps && typeof deps.fetchFn === 'function');
}

function cacheStore() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function readModelsCache(base) {
  try {
    const store = cacheStore();
    if (!store) return null;
    const raw = store.getItem(MODELS_CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (entry.base !== base || !Array.isArray(entry.models)) return null;
    if (Date.now() - Number(entry.at || 0) > MODELS_CACHE_TTL_MS) return null;
    return entry.models;
  } catch {
    return null;
  }
}

function writeModelsCache(base, models) {
  try {
    const store = cacheStore();
    if (!store) return;
    store.setItem(MODELS_CACHE_KEY, JSON.stringify({ base, models, at: Date.now() }));
  } catch {
    // Quota or private mode: the live result still works.
  }
}

// Dedupe concurrent checks so opening the assistant doesn't fire parallel /api/tags calls.
const pendingChecks = new Map();

/**
 * @returns {{ok:true, models:string[]}|{ok:false, error:string}}
 */
export async function checkConnection(
  { baseUrl = DEFAULT_BASE_URL, timeoutMs = 4000, fresh = false } = {},
  deps = {},
) {
  const base = normalizeBaseUrl(baseUrl);
  const injected = isInjectedFetch(deps);
  if (!injected && !fresh) {
    const cached = readModelsCache(base);
    if (cached) return { ok: true, models: cached };
    const pending = pendingChecks.get(base);
    if (pending) return pending;
    const task = fetchConnection(base, timeoutMs, deps);
    pendingChecks.set(base, task);
    try {
      const result = await task;
      if (result.ok) writeModelsCache(base, result.models);
      return result;
    } finally {
      pendingChecks.delete(base);
    }
  }
  const result = await fetchConnection(base, timeoutMs, deps);
  if (!injected && result.ok) writeModelsCache(base, result.models);
  return result;
}

async function fetchConnection(base, timeoutMs, deps) {
  const fetchFn = resolveFetch(deps);
  if (!fetchFn) return { ok: false, error: 'unreachable' };
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

export async function listModels({ baseUrl = DEFAULT_BASE_URL, fresh = false } = {}, deps = {}) {
  const result = await checkConnection({ baseUrl, fresh }, deps);
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
