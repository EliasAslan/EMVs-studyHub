/**
 * Derived note helpers. The link index is built once per state
 * change and reused by every link in reading mode / connections.
 */
import { derived } from 'svelte/store';
import { appState } from './app.js';
import { linkIndex, outgoingLinks, backlinks, unlinkedMentions } from '../data/wikiLinks.js';

export const noteLinkIndex = derived(appState, ($s) => linkIndex($s));

export const noteConnections = derived([appState, noteLinkIndex], ([$s, index]) => ({
  outgoing: (noteId) => outgoingLinks($s, noteId, index),
  backlinks: (noteId) => backlinks($s, noteId),
  mentions: (noteId) => unlinkedMentions($s, noteId),
}));
