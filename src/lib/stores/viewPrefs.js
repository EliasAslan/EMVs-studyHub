import { writable } from 'svelte/store';

/** Device-level view preference (filters, layout) persisted in localStorage. */
export function persistedStore(key, initial) {
  let start = initial;
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) start = JSON.parse(raw);
  } catch {
    start = initial;
  }
  const store = writable(start);
  store.subscribe((value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* preferences are best-effort */
    }
  });
  return store;
}
