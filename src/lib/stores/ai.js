/**
 * Device-local AI configuration. Never written to app state or the cloud.
 */

import { derived, get, writable } from 'svelte/store';
import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  DEFAULT_NUM_CTX,
  normalizeBaseUrl,
} from '../data/aiConfig.js';

export const AI_STORAGE_KEY = 'studyhub_ai_v1';

export const DEFAULT_AI_SETTINGS = Object.freeze({
  enabled: false,
  baseUrl: DEFAULT_BASE_URL,
  model: DEFAULT_MODEL,
  numCtx: DEFAULT_NUM_CTX,
});

function storage() {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage || null;
  } catch {
    return null;
  }
}

export function normalizeAiSettings(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const numCtx = Math.floor(Number(source.numCtx));
  return {
    enabled: source.enabled === true,
    baseUrl: normalizeBaseUrl(source.baseUrl),
    model:
      typeof source.model === 'string' && source.model.trim()
        ? source.model.trim()
        : DEFAULT_MODEL,
    numCtx: Number.isFinite(numCtx) ? Math.min(32768, Math.max(1024, numCtx)) : DEFAULT_NUM_CTX,
  };
}

export function loadAiSettings() {
  const store = storage();
  if (!store) return { ...DEFAULT_AI_SETTINGS };
  try {
    const raw = store.getItem(AI_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AI_SETTINGS };
    return normalizeAiSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export const aiSettings = writable(loadAiSettings());

export const aiReady = derived(aiSettings, ($settings) => $settings.enabled);

export function saveAiSettings(patch = {}) {
  const next = normalizeAiSettings({ ...get(aiSettings), ...patch });
  aiSettings.set(next);
  const store = storage();
  if (store) {
    try {
      store.setItem(AI_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Quota or private mode: the in-memory setting still works this session.
    }
  }
  return next;
}

export function resetAiSettings() {
  const next = { ...DEFAULT_AI_SETTINGS };
  aiSettings.set(next);
  const store = storage();
  if (store) {
    try {
      store.removeItem(AI_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  return next;
}
