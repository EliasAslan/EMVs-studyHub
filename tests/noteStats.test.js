import { describe, expect, it } from 'vitest';
import { noteStats } from '../src/lib/data/noteStats.js';

function state(notes) {
  return {
    modules: [{ id: 'm1', code: 'M294', title: 'Datenbanken' }],
    notes,
  };
}

describe('noteStats', () => {
  it('counts notes, links, tags and unresolved targets', () => {
    const stats = noteStats(
      state([
        { id: 'a', title: 'A', body: 'Siehe [[B|die andere]] und [[M294]]. #sql' },
        { id: 'b', title: 'B', body: 'Keine Links.' },
        { id: 'c', title: 'C', body: 'Nur [[Fehlt]] und #sql #prüfung' },
        { id: 'd', title: 'D', body: '' },
      ]),
    );

    expect(stats.noteCount).toBe(4);
    expect(stats.linkCount).toBe(3);
    // Tags are folded like the notes filter does it.
    expect(stats.tags.sort()).toEqual(['prufung', 'sql']);
    expect(stats.unresolved).toEqual(['Fehlt']);
  });

  it('marks notes without note-to-note links as orphans', () => {
    const stats = noteStats(
      state([
        { id: 'a', title: 'A', body: '[[B]]' },
        { id: 'b', title: 'B', body: '' },
        { id: 'c', title: 'C', body: '[[M294]]' },
        { id: 'd', title: 'D', body: '' },
      ]),
    );
    expect(stats.orphans.map((n) => n.id)).toEqual(['c', 'd']);
  });

  it('handles an empty state', () => {
    expect(noteStats({})).toMatchObject({
      noteCount: 0,
      linkCount: 0,
      tags: [],
      unresolved: [],
      orphans: [],
    });
  });
});
