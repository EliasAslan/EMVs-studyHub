/**
 * Pure AI defaults and URL helpers. Kept separate from the Ollama client so
 * stores and the global capture UI never pull the network service into the
 * main bundle.
 */

export const DEFAULT_BASE_URL = 'http://localhost:11434';
export const DEFAULT_MODEL = 'qwen3:8b';
export const DEFAULT_NUM_CTX = 8192;

/** Trim, add a scheme when missing, and drop trailing slashes. */
export function normalizeBaseUrl(raw) {
  let value = String(raw || '').trim();
  if (!value) return DEFAULT_BASE_URL;
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`;
  return value.replace(/\/+$/, '');
}

/** localhost, 127.0.0.1 and ::1 are treated as this device. */
export function isLoopbackUrl(raw) {
  try {
    const url = new URL(normalizeBaseUrl(raw));
    const host = url.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}
