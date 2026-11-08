import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_SETTINGS, normalizeAiSettings } from '../src/lib/stores/ai.js';

describe('AI settings normalization', () => {
  it('falls back to safe defaults', () => {
    expect(normalizeAiSettings(null)).toEqual(DEFAULT_AI_SETTINGS);
    expect(normalizeAiSettings('nope')).toEqual(DEFAULT_AI_SETTINGS);
    expect(normalizeAiSettings({})).toEqual(DEFAULT_AI_SETTINGS);
  });

  it('keeps valid values and repairs the base URL', () => {
    expect(
      normalizeAiSettings({
        enabled: true,
        baseUrl: 'localhost:11434/',
        model: '  qwen3:8b ',
        numCtx: '4096',
      }),
    ).toEqual({
      enabled: true,
      baseUrl: 'http://localhost:11434',
      model: 'qwen3:8b',
      numCtx: 4096,
    });
  });

  it('clamps the context window and rejects a blank model', () => {
    expect(normalizeAiSettings({ numCtx: 999999 }).numCtx).toBe(32768);
    expect(normalizeAiSettings({ numCtx: 1 }).numCtx).toBe(1024);
    expect(normalizeAiSettings({ numCtx: 'x' }).numCtx).toBe(DEFAULT_AI_SETTINGS.numCtx);
    expect(normalizeAiSettings({ model: '   ' }).model).toBe(DEFAULT_AI_SETTINGS.model);
  });

  it('only enables on a real true', () => {
    expect(normalizeAiSettings({ enabled: 'true' }).enabled).toBe(false);
    expect(normalizeAiSettings({ enabled: true }).enabled).toBe(true);
  });
});
