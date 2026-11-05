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
