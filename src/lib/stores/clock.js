/**
 * A shared, low-frequency clock for date-sensitive UI.
 *
 * Views derive "today", due labels and upcoming lists from this store so they
 * roll over at midnight without needing their own interval. The value is
 * intentionally coarse: one update every 30 seconds is enough for calendar
 * days and keeps re-renders cheap.
 */

import { readable } from 'svelte/store';

const TICK_MS = 30_000;

export const now = readable(Date.now(), (set) => {
  if (typeof window === 'undefined') return;

  let timer = null;

  const tick = () => set(Date.now());
  const start = () => {
    tick();
    if (timer) clearInterval(timer);
    timer = setInterval(tick, TICK_MS);
  };
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  const onVisibility = () => {
    if (document.visibilityState === 'visible') start();
    else stop();
  };

  start();
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
  };
});
