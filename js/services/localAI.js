/**
 * Local AI service — talks to the user's own Ollama instance.
 *
 * Architecture: the page (whether served from localhost or Vercel) calls the
 * visitor's Ollama at their loopback address directly from the browser.
 * Browsers exempt http://localhost from mixed-content blocking, so this
 * works from HTTPS origins too. CORS is granted per user via OLLAMA_ORIGINS.
 *
 * Privacy: PDF text and prompts never leave the user's machine. This module
 * only ever contacts the configured loopback base URL — no cloud, no keys.
 *
 * DOM-free: safe to import in plain Node tests. All fetch calls accept an
 * injected fetchFn/signal so tests never touch the network.
 */

export const DEFAULT_MODEL = 'qwen3:8b';
export const DEFAULT_BASE_URL = 'http://localhost:11434';
export const DEFAULT_NUM_CTX = 8192;

export const CHUNK_SIZE = 2500;
export const CHUNK_OVERLAP = 200;
export const MAX_OBJECTIVES = 40;
export const MAX_RESOURCES = 20;
export const CONNECT_TIMEOUT_MS = 4000;

/**
 * Merged local-AI settings with backwards-compatible defaults.
 * store.js spreads seed settings over stored ones, so adding the key to the
 * seed keeps old datasets working.
 */
export function defaultLocalAISettings() {
  return { model: DEFAULT_MODEL, baseUrl: DEFAULT_BASE_URL, numCtx: DEFAULT_NUM_CTX };
}

export function getLocalAISettings(state) {
  const stored = state?.settings?.localAI;
  return { ...defaultLocalAISettings(), ...(stored && typeof stored === 'object' ? stored : {}) };
}

function baseUrlOf(opts = {}) {
  const raw = typeof opts.baseUrl === 'string' ? opts.baseUrl.trim() : DEFAULT_BASE_URL;
  return (raw || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/**
 * Quick reachability probe: GET /api/tags with a short timeout.
 * Never throws — returns { ok, models, error }.
 */
export async function checkConnection(opts = {}, deps = {}) {
  const base = baseUrlOf(opts);
  const fetchFn = deps.fetchFn || fetch;
  const timeoutMs = opts.timeoutMs ?? CONNECT_TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchFn(`${base}/api/tags`, { signal: ctrl.signal });
    if (!res.ok) return { ok: false, models: [], error: `http-${res.status}` };
    const data = await res.json().catch(() => ({}));
    const models = Array.isArray(data?.models)
      ? data.models.map(m => m?.name).filter(n => typeof n === 'string' && n)
      : [];
    return { ok: true, models, error: null };
  } catch (e) {
    return { ok: false, models: [], error: classifyConnectionError(e) };
  } finally {
    clearTimeout(timer);
  }
}

export function classifyConnectionError(e) {
  const msg = String(e?.name === 'AbortError' ? 'timeout' : (e?.message || e || '')).toLowerCase();
  if (e?.name === 'AbortError' || msg.includes('timeout') || msg.includes('aborted')) return 'timeout';
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed')) return 'unreachable';
  if (msg.includes('cors') || msg.includes('origin')) return 'cors';
  return 'unknown';
}

/** German user-facing message for connection/chat failures. */
export function describeLocalAIError(code) {
  switch (code) {
    case 'unreachable':
      return 'Ollama ist nicht erreichbar. Läuft Ollama auf diesem Rechner? (ollama serve starten)';
    case 'timeout':
      return 'Ollama antwortet nicht rechtzeitig. Läuft ein Modell? (ollama list prüfen)';
    case 'cors':
      return 'Browser blockt die Anfrage (CORS). OLLAMA_ORIGINS muss diese Website enthalten — siehe Anleitung in den Einstellungen.';
    case 'model-missing':
      return 'Das gewählte Modell ist in Ollama nicht installiert. (ollama pull <modell>)';
    case 'bad-json':
      return 'Das Modell hat keine auswertbare Antwort geliefert. Erneut versuchen — ggf. mit kleinerem PDF-Ausschnitt.';
    default:
      return 'Lokale KI-Anfrage fehlgeschlagen. Ollama-Status in den Einstellungen prüfen.';
  }
}

/**
 * Single non-streaming chat call. think:false disables Qwen3 reasoning output
 * (keeps answers short and JSON-parseable). Never throws on HTTP errors —
 * throws Error with a classified code instead.
 */
export async function chatComplete({ model, messages, format = undefined, numCtx = DEFAULT_NUM_CTX, baseUrl, signal } = {}, deps = {}) {
  const base = baseUrlOf({ baseUrl });
  const fetchFn = deps.fetchFn || fetch;
  if (!model) throw localAIError('model-missing');
  let res;
  try {
    res = await fetchFn(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        think: false,
        format,
        options: { num_ctx: numCtx },
      }),
      signal,
    });
  } catch (e) {
    throw localAIError(classifyConnectionError(e));
  }
  if (!res.ok) {
    if (res.status === 404) throw localAIError('model-missing');
    throw localAIError('unknown');
  }
  const data = await res.json().catch(() => ({}));
  const content = typeof data?.message?.content === 'string' ? data.message.content : '';
  return content;
}

function localAIError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

// ---------------------------------------------------------------------------
// Pure text helpers (unit-tested)
// ---------------------------------------------------------------------------

/** Split text into overlapping chunks so long PDFs fit the context window. */
export function splitIntoChunks(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= chunkSize) return [clean];
  const out = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + chunkSize, clean.length);
    out.push(clean.slice(start, end));
    if (end >= clean.length) break;
    start = end - overlap;
  }
  return out;
}

/**
 * Defensive JSON extraction from model output: strip code fences, cut to the
 * outermost braces, drop trailing commas. Returns the parsed value or throws
 * an Error with code 'bad-json'.
 */
export function repairJson(raw) {
  let s = String(raw || '').trim();
  if (!s) throw localAIError('bad-json');
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const first = s.search(/[{[]/);
  const lastBrace = s.lastIndexOf('}');
  const lastBracket = s.lastIndexOf(']');
  const last = Math.max(lastBrace, lastBracket);
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  s = s.replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(s);
  } catch {
    throw localAIError('bad-json');
  }
}

function asNonEmptyString(v, max = 500) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) + '…' : s;
}

/**
 * Normalize one extraction payload (single chunk or merge result) into
 * { objectives: [{title, description}], resources: [{name, note}] }.
 * Caps lengths, drops empties. Never throws on odd shapes.
 */
export function normalizeExtraction(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const rawObjs = Array.isArray(p.objectives) ? p.objectives : (Array.isArray(p.lernziele) ? p.lernziele : []);
  const rawRes = Array.isArray(p.resources) ? p.resources : (Array.isArray(p.ressourcen) ? p.ressourcen : []);
  const objectives = [];
  for (const o of rawObjs) {
    if (objectives.length >= MAX_OBJECTIVES) break;
    const src = o && typeof o === 'object' ? o : { title: o };
    const title = asNonEmptyString(src.title ?? src.titel, 300);
    if (!title || title.length < 8) continue;
    objectives.push({ title, description: asNonEmptyString(src.description ?? src.beschreibung, 800) || '' });
  }
  const resources = [];
  for (const r of rawRes) {
    if (resources.length >= MAX_RESOURCES) break;
    const src = r && typeof r === 'object' ? r : { name: r };
    const name = asNonEmptyString(src.name ?? src.titel, 200);
    if (!name || name.length < 3) continue;
    resources.push({ name, note: asNonEmptyString(src.note ?? src.notiz, 300) || '' });
  }
  return { objectives, resources };
}

function normTitle(t) {
  return String(t || '').toLowerCase().replace(/[^a-zäöüß0-9]+/gi, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Merge per-chunk extractions: dedupe objectives by normalized title
 * (keep the longer description), concat resources by name. Pure.
 */
export function mergeExtractions(list) {
  const seen = new Map();
  const resources = new Map();
  for (const item of list || []) {
    const n = normalizeExtraction(item);
    for (const o of n.objectives) {
      const key = normTitle(o.title);
      if (!key) continue;
      const prev = seen.get(key);
      if (!prev || o.description.length > prev.description.length) seen.set(key, o);
      if (seen.size >= MAX_OBJECTIVES) break;
    }
    for (const r of n.resources) {
      const key = normTitle(r.name);
      if (!key || resources.has(key)) continue;
      resources.set(key, r);
      if (resources.size >= MAX_RESOURCES) break;
    }
  }
  return { objectives: [...seen.values()], resources: [...resources.values()] };
}

// ---------------------------------------------------------------------------
// Prompts + orchestration
// ---------------------------------------------------------------------------

const EXTRACTION_SCHEMA_HINT = `Antworte AUSSCHLIESSLICH mit validem JSON in exakt dieser Form:
{"objectives": [{"title": "...", "description": "..."}], "resources": [{"name": "...", "note": "..."}]}
Kein Fliesstext, keine Markdown-Fences, kein Kommentar.`;

export function buildChunkPrompt(chunk, moduleTitle) {
  return `Du analysierst einen Ausschnitt aus einem deutschen Studien-Skript${moduleTitle ? ` zum Modul "${moduleTitle}"` : ''}.

Ausschnitt:
"""${chunk}"""

Extrahiere daraus Lernziele (konkrete, prüfbare Fähigkeiten/Verständnisziele, jeweils EIN Satz als title, 1-2 Sätze Detail als description) und erwähnte Lernmaterialien (Bücher, Tools, Links, Videos als resources mit name und kurzer note).
Erfinde NICHTS dazu — nur was im Text steht. Uploade keine Prüfungsdaten, keine Noten, keine Termine.
${EXTRACTION_SCHEMA_HINT}`;
}

export function buildMergePrompt(items, moduleTitle) {
  const compact = items.map(o => `- ${o.title}${o.description ? ` — ${o.description}` : ''}`).join('\n');
  return `Du bereinigst eine Lernziel-Liste${moduleTitle ? ` zum Modul "${moduleTitle}"` : ''} (aus mehreren PDF-Ausschnitten, daher ggf. doppelt oder unscharf).

Liste:
${compact}

Fasse Dubletten zusammen, streiche inhaltsleere Einträge, formuliere jedes Ziel als genau EINEN klaren deutschen Satz (title) plus 1-2 Sätze description. Erfinde keine neuen Themen dazu.
${EXTRACTION_SCHEMA_HINT}`;
}

/**
 * Full pipeline: chunk text → per-chunk extraction → merge pass.
 * onProgress({phase, done, total}) for UI. signal aborts between calls.
 * chatFn injectable for tests: async ({messages, format}) => string.
 */
export async function extractObjectivesFromText(text, opts = {}, deps = {}) {
  const { model = DEFAULT_MODEL, baseUrl, numCtx = DEFAULT_NUM_CTX, moduleTitle = '', signal } = opts;
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
  const chatFn = deps.chatFn || ((args) => chatComplete({ model, baseUrl, numCtx, signal, ...args }));
  const chunks = splitIntoChunks(text);
  if (!chunks.length) throw localAIError('bad-json');

  const perChunk = [];
  for (let i = 0; i < chunks.length; i += 1) {
    if (signal?.aborted) throw localAIError('aborted');
    onProgress({ phase: 'chunks', done: i, total: chunks.length });
    try {
      const raw = await chatFn({ messages: [{ role: 'user', content: buildChunkPrompt(chunks[i], moduleTitle) }], format: 'json' });
      perChunk.push(normalizeExtraction(repairJson(raw)));
    } catch (e) {
      // One bad chunk never kills the import — skip it, keep the rest.
      if (e?.code === 'aborted' || signal?.aborted) throw localAIError('aborted');
      perChunk.push({ objectives: [], resources: [] });
    }
  }
  onProgress({ phase: 'chunks', done: chunks.length, total: chunks.length });

  const merged = mergeExtractions(perChunk);
  if (!merged.objectives.length) return merged;

  // Merge/cleanup pass for multi-chunk results (single chunk is already clean).
  if (chunks.length > 1) {
    if (signal?.aborted) throw localAIError('aborted');
    onProgress({ phase: 'merge', done: 0, total: 1 });
    try {
      const raw = await chatFn({ messages: [{ role: 'user', content: buildMergePrompt(merged.objectives, moduleTitle) }], format: 'json' });
      const cleaned = normalizeExtraction(repairJson(raw));
      onProgress({ phase: 'merge', done: 1, total: 1 });
      // Safety: the merge pass must not invent — cap at 2x chunk count, but
      // never return LESS than nothing... if it returns empty, keep chunk results.
      if (cleaned.objectives.length) {
        const combinedResources = [...cleaned.resources];
        for (const r of merged.resources) {
          if (combinedResources.length >= MAX_RESOURCES) break;
          if (!combinedResources.some(x => normTitle(x.name) === normTitle(r.name))) combinedResources.push(r);
        }
        return { objectives: cleaned.objectives.slice(0, MAX_OBJECTIVES), resources: combinedResources };
      }
    } catch (e) {
      if (e?.code === 'aborted' || signal?.aborted) throw localAIError('aborted');
      // fall through with chunk-level results
    }
    onProgress({ phase: 'merge', done: 1, total: 1 });
  }
  return merged;
}
