import { writable } from 'svelte/store';

export const toasts = writable([]);
let seq = 0;

/**
 * @param {string} message
 * @param {{action?: {label:string, fn:Function}, duration?: number}} opts
 */
export function toast(message, opts = {}) {
  const id = ++seq;
  const entry = {
    id,
    message,
    action: opts.action || null,
    duration: opts.duration ?? (opts.action ? 6500 : 3800),
  };
  toasts.update((list) => [...list, entry]);
  if (entry.duration > 0) {
    setTimeout(() => dismissToast(id), entry.duration);
  }
  return id;
}

export function dismissToast(id) {
  toasts.update((list) => list.filter((t) => t.id !== id));
}
