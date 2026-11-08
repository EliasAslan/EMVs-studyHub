import { writable } from 'svelte/store';

/** Global command palette visibility, shared by the shell and page chrome. */
export const paletteOpen = writable(false);

export function openPalette() {
  paletteOpen.set(true);
}

export function closePalette() {
  paletteOpen.set(false);
}

export function togglePalette() {
  paletteOpen.update((open) => !open);
}

/** Last page that was not the assistant, used by @seite and inline AI links. */
export const lastNonAssistantRoute = writable(null);

export function rememberRoute(nextRoute) {
  if (!nextRoute || nextRoute.name === 'assistant') return;
  lastNonAssistantRoute.set(nextRoute);
}
