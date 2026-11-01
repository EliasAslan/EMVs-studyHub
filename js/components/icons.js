/**
 * Small inline icon set.
 *
 * The Pomodoro surfaces use line icons instead of emoji so their weight,
 * alignment and colour stay consistent with the editorial UI. Icons are
 * decorative: every button keeps its own text or aria-label.
 */

const PATHS = {
  play: '<path d="M8 5.5v13l10.5-6.5L8 5.5Z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none"/>',
  log: '<path d="M8 4h8a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2Z"/><path d="M9.5 9h5M9.5 13h5"/>',
  check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
  coffee: '<path d="M5 10h11v5.5A3.5 3.5 0 0 1 12.5 19h-4A3.5 3.5 0 0 1 5 15.5V10Z"/><path d="M16 11h2.2a2.3 2.3 0 0 1 0 4.6H16M7.5 4.5v2M11 4.5v2M14.5 4.5v2"/>',
  leaf: '<path d="M19 5c-7 0-12 3.2-12 9a5 5 0 0 0 5 5c5.8 0 7-6.5 7-14Z"/><path d="M7 18c2.5-4 5.5-6.5 9-8"/>',
  grip: '<circle cx="9" cy="7" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="7" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="17" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="1.2" fill="currentColor" stroke="none"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronUp: '<path d="m6 15 6-6 6 6"/>',
  x: '<path d="m7 7 10 10M17 7 7 17"/>',
  eyeOff: '<path d="m4 4 16 16"/><path d="M9.9 5.2A9.8 9.8 0 0 1 12 5c5.5 0 9 5.5 9 7a10.8 10.8 0 0 1-3.2 4.1M6.1 7.2C4.5 8.3 3.2 10 3 12c0 1.5 3.5 7 9 7a9.5 9.5 0 0 0 4.1-.9"/><path d="M10.3 10.3a2.4 2.4 0 0 0 3.4 3.4"/>',
  expand: '<path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4"/><path d="m4 9 5-5M15 4l5 5M20 15l-5 5M9 20l-5-5"/>',
  timer: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4.5l2.8 1.8M9.5 3h5"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  spark: '<path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/>',
};

export function icon(name, size = 16) {
  const body = PATHS[name];
  if (!body) return '';
  return `<svg class="ui-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/**
 * A circular progress ring. `progress` is 0–100; `pathLength="100"` keeps the
 * dash math independent of the rendered size.
 */
export function ring(progress, { size = 240, stroke = 5, className = '', time = '', label = '' } = {}) {
  const p = Math.min(100, Math.max(0, Number(progress) || 0));
  return `<div class="pomo-ring ${className}" style="--ring-size:${size}px">
    <svg class="pomo-ring-svg" viewBox="0 0 ${size} ${size}" aria-hidden="true" focusable="false">
      <circle class="pomo-ring-track" cx="${size / 2}" cy="${size / 2}" r="${(size - stroke) / 2}" stroke-width="${stroke}"/>
      <circle class="pomo-ring-progress" data-pomo-ring cx="${size / 2}" cy="${size / 2}" r="${(size - stroke) / 2}" stroke-width="${stroke}"
        pathLength="100" stroke-dasharray="100" stroke-dashoffset="${100 - p}"/>
    </svg>
    <div class="pomo-ring-inner">
      <div class="pomo-time" role="timer" aria-live="off" data-pomo-time>${time}</div>
      ${label ? `<div class="pomo-ring-label">${label}</div>` : ''}
    </div>
  </div>`;
}
