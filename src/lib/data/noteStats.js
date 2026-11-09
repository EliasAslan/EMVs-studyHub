/**
 * Cheap knowledge summary for the notes list. Pure and DOM-free.
 * Counts notes, wiki links, tags, unresolved targets and notes that
 * have no note-to-note connection at all ("orphans").
 */
import { parseWikiLinks, linkIndex, resolveIn } from './wikiLinks.js';
import { extractTags } from './markdown.js';

export function noteStats(state) {
  const notes = state.notes || [];
  const index = linkIndex(state);
  const linked = new Set();
  const unresolved = new Set();
  const tags = new Set();
  let linkCount = 0;

  for (const note of notes) {
    for (const link of parseWikiLinks(note.body)) {
      linkCount += 1;
      const entry = resolveIn(index, link.target);
      if (!entry) {
        unresolved.add(link.target);
        continue;
      }
      if (entry.kind === 'note' && entry.id !== note.id) {
        linked.add(note.id);
        linked.add(entry.id);
      }
    }
    for (const tag of extractTags(note.body)) tags.add(tag);
  }

  return {
    noteCount: notes.length,
    linkCount,
    tags: [...tags],
    unresolved: [...unresolved],
    orphans: notes.filter((n) => !linked.has(n.id)),
  };
}
