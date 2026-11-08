import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  chatComplete,
  checkConnection,
  describeAiError,
  isLoopbackUrl,
  listModels,
  MODELS_CACHE_KEY,
  MODELS_CACHE_TTL_MS,
  normalizeBaseUrl,
} from '../src/lib/services/localAI.js';

function jsonResponse(data, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => data };
}

describe('base URL helpers', () => {
  it('normalizes scheme and trailing slashes', () => {
    expect(normalizeBaseUrl('')).toBe('http://localhost:11434');
    expect(normalizeBaseUrl('localhost:11434/')).toBe('http://localhost:11434');
    expect(normalizeBaseUrl('https://example.test/ollama//')).toBe('https://example.test/ollama');
  });

  it('recognizes loopback hosts only', () => {
    expect(isLoopbackUrl('http://localhost:11434')).toBe(true);
    expect(isLoopbackUrl('http://127.0.0.1:11434')).toBe(true);
    expect(isLoopbackUrl('http://[::1]:11434')).toBe(true);
    expect(isLoopbackUrl('http://192.168.1.10:11434')).toBe(false);
    expect(isLoopbackUrl('not a url')).toBe(false);
  });
});

describe('checkConnection', () => {
  it('lists models from /api/tags', async () => {
    const fetchFn = async (url) => {
      expect(url).toBe('http://localhost:11434/api/tags');
      return jsonResponse({ models: [{ name: 'qwen3:8b' }, { model: 'llama3' }] });
    };
    await expect(checkConnection({ baseUrl: 'localhost:11434' }, { fetchFn })).resolves.toEqual({
      ok: true,
      models: ['qwen3:8b', 'llama3'],
    });
  });

  it('maps HTTP failures', async () => {
    await expect(
      checkConnection({}, { fetchFn: async () => jsonResponse({}, { ok: false, status: 404 }) }),
    ).resolves.toEqual({ ok: false, error: 'http-404' });
    await expect(
      checkConnection({}, { fetchFn: async () => jsonResponse({}, { ok: false, status: 500 }) }),
    ).resolves.toEqual({ ok: false, error: 'bad-response' });
  });

  it('reports a timeout', async () => {
    const fetchFn = (url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          const error = new Error('Aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    await expect(checkConnection({ baseUrl: 'http://localhost:11434', timeoutMs: 5 }, { fetchFn })).resolves.toEqual({
      ok: false,
      error: 'timeout',
    });
  });

  it('separates CORS-like failures from unreachable hosts', async () => {
    const cors = async () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(checkConnection({ baseUrl: 'http://localhost:11434' }, { fetchFn: cors })).resolves.toEqual({
      ok: false,
      error: 'cors',
    });
    await expect(checkConnection({ baseUrl: 'http://192.168.1.10:11434' }, { fetchFn: cors })).resolves.toEqual({
      ok: false,
      error: 'unreachable',
    });
  });

  it('never throws and returns an empty model list when offline', async () => {
    const result = await listModels(
      { baseUrl: 'http://localhost:11434' },
      {
        fetchFn: async () => {
          throw new TypeError('Failed to fetch');
        },
      },
    );
    expect(result).toEqual([]);
  });
});

describe('model cache', () => {
  function memoryStorage() {
    const data = new Map();
    return {
      getItem: (key) => (data.has(key) ? data.get(key) : null),
      setItem: (key, value) => data.set(key, String(value)),
      removeItem: (key) => data.delete(key),
    };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serves a fresh cached model list without a second request', async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    let calls = 0;
    const fetchFn = async () => {
      calls += 1;
      return jsonResponse({ models: [{ name: 'qwen3:8b' }] });
    };
    vi.stubGlobal('fetch', fetchFn);

    await expect(checkConnection({ baseUrl: 'http://localhost:11434' })).resolves.toEqual({
      ok: true,
      models: ['qwen3:8b'],
    });
    await expect(checkConnection({ baseUrl: 'http://localhost:11434' })).resolves.toEqual({
      ok: true,
      models: ['qwen3:8b'],
    });
    expect(calls).toBe(1);
  });

  it('ignores stale cache entries and honours the fresh flag', async () => {
    const store = memoryStorage();
    store.setItem(
      MODELS_CACHE_KEY,
      JSON.stringify({
        base: 'http://localhost:11434',
        models: ['old'],
        at: Date.now() - MODELS_CACHE_TTL_MS - 1,
      }),
    );
    vi.stubGlobal('localStorage', store);
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      async () => {
        calls += 1;
        return jsonResponse({ models: [{ name: 'qwen3:8b' }] });
      },
    );

    await expect(checkConnection({ baseUrl: 'http://localhost:11434' })).resolves.toEqual({
      ok: true,
      models: ['qwen3:8b'],
    });
    await expect(
      checkConnection({ baseUrl: 'http://localhost:11434', fresh: true }),
    ).resolves.toEqual({ ok: true, models: ['qwen3:8b'] });
    expect(calls).toBe(2);
  });

  it('never caches when the fetch function is injected (tests, custom clients)', async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    let calls = 0;
    const fetchFn = async () => {
      calls += 1;
      return jsonResponse({ models: [{ name: 'qwen3:8b' }] });
    };
    await checkConnection({ baseUrl: 'http://localhost:11434' }, { fetchFn });
    await checkConnection({ baseUrl: 'http://localhost:11434' }, { fetchFn });
    expect(calls).toBe(2);
  });
});

describe('chatComplete', () => {
  it('streams NDJSON tokens and returns the full text', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      '{"message":{"content":"Hallo"},"done":false}\n{"message":{"content":" Welt"},"done":false}\n',
      '{"message":{"content":"!"},"done":true}\n',
    ].map((part) => encoder.encode(part));

    const fetchFn = async (url, options) => {
      expect(url).toBe('http://localhost:11434/api/chat');
      const body = JSON.parse(options.body);
      expect(body).toMatchObject({ model: 'qwen3:8b', stream: true, options: { num_ctx: 8192 } });
      let index = 0;
      return {
        ok: true,
        body: {
          getReader() {
            return {
              read: async () =>
                index < chunks.length ? { done: false, value: chunks[index++] } : { done: true, value: undefined },
            };
          },
        },
      };
    };

    const tokens = [];
    const result = await chatComplete(
      { messages: [{ role: 'user', content: 'Hallo?' }], onToken: (token) => tokens.push(token) },
      { fetchFn },
    );
    expect(result).toEqual({ text: 'Hallo Welt!', aborted: false });
    expect(tokens).toEqual(['Hallo', ' Welt', '!']);
  });

  it('returns an error for a missing model', async () => {
    const result = await chatComplete({}, { fetchFn: async () => jsonResponse({}, { ok: false, status: 404 }) });
    expect(result).toEqual({ text: '', aborted: false, error: 'http-404' });
  });

  it('aborts cleanly', async () => {
    const controller = new AbortController();
    const fetchFn = (url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          const error = new Error('Aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    const pending = chatComplete({ signal: controller.signal }, { fetchFn });
    controller.abort();
    await expect(pending).resolves.toEqual({ text: '', aborted: true });
  });
});

describe('describeAiError', () => {
  it('names OLLAMA_ORIGINS for CORS', () => {
    const text = describeAiError('cors');
    expect(text).toContain('OLLAMA_ORIGINS');
    expect(text).toContain('http');
  });

  it('has a German message for every code', () => {
    for (const code of ['unreachable', 'timeout', 'http-404', 'bad-response', 'aborted']) {
      expect(describeAiError(code).length).toBeGreaterThan(10);
    }
  });
});
