/**
 * Persisted preferences store — device-local only, no cloud sync.
 * Uses the same persistedStore pattern as viewPrefs.js.
 * Keeps prefs outside appState to avoid cloud sync conflicts.
 */

import { writable } from 'svelte/store';
import { persistedStore } from './viewPrefs.js';

// ── DEFAULTS ──────────────────────────────────────────────────────────────

const DEFAULTS = {
  // Appearance
  accent: { value: 'indigo', customHex: '#4f46e5' },
  textSize: 'default',
  density: 'cozy',
  reduceMotion: false,

  // Home section visibility (boolean per section)
  home: {
    hero: true,
    nextExam: true,
    focusStrip: true,
    checklist: true,
    nextLesson: true,
    recentNotes: true,
    links: true,
  },

  // Home section order (up/down reorder)
  homeOrder: ['hero', 'nextExam', 'focusStrip', 'checklist', 'nextLesson', 'recentNotes', 'links'],

  // Checklist
  checklistHorizon: 5,
  includeOverdue: true,

  // Grade bands (Swiss scale 1–6)
  gradeBands: { midMin: 2.5, highMin: 4 },

  // Date configuration
  dateFormat: 'ch',
  weekStart: 'monday',
};

// ── STORE ──────────────────────────────────────────────────────────────────

export const $preferences = persistedStore('studyhub_preferences_v1', DEFAULTS);