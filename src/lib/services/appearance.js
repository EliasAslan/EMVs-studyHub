/**
 * Appearance service — applies CSS custom properties (CSS tokens) from
 * $preferences to the document element. Pure and DOM-free except for the
 * final `document.documentElement.style.setProperty` calls.
 *
 * Tokens applied:
 *   --accent-base, --accent-light, --accent-strong (via color-mix)
 *   --text-size (clamp)
 *   --spacing-density
 *   --reduce-motion
 */

import { get } from 'svelte/store';
import { $preferences } from '../stores/preferences.js';

function apply(prefs) {
  if (typeof document === 'undefined') return;

  const p = prefs || get($preferences);

  // ── Accent colour ─────────────────────────────────────────────────────
  const accentBase = p.accent.customHex || p.accent.value;
  document.documentElement.style.setProperty('--accent-base', accentBase);

  // Derive light/strong using color-mix (Svelte 5 CSS-friendly)
  // light: 70% base + 30% white; strong: 85% base + 15% black
  document.documentElement.style.setProperty(
    '--accent-light',
    `color-mix(in srgb, ${accentBase} 70%, #fff)`
  );
  document.documentElement.style.setProperty(
    '--accent-strong',
    `color-mix(in srgb, ${accentBase} 85%, #000)`
  );

  // ── Text size ─────────────────────────────────────────────────────────
  // 'default' → medium; 'compact' → smaller; 'large' → larger
  const sizeMap = { compact: '13px', default: '15px', large: '18px' };
  const size = sizeMap[p.textSize] || sizeMap.default;
  // clamp: 13px min … 20px max, with 1vw fallback
  document.documentElement.style.setProperty(
    '--text-size',
    `clamp(${size}, 1rem, 1.25rem)`
  );

  // ── Density / spacing ─────────────────────────────────────────────────
  // 'cozy' → larger spacing; 'compact' → tighter spacing
  const densityMap = { cozy: 'var(--space-5)', compact: 'var(--space-3)' };
  document.documentElement.style.setProperty(
    '--spacing-density',
    densityMap[p.density] || densityMap.cozy
  );

  // ── Reduce motion ─────────────────────────────────────────────────────
  document.documentElement.dataset.reduceMotion = String(p.reduceMotion);
}

export { apply, $preferences as preferences };