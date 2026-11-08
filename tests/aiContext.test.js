import { describe, expect, it } from 'vitest';
import {
  MAX_REF_CHARS,
  MAX_TOTAL_CHARS,
  buildContextBlock,
  listContextRefs,
  parseMentions,
  resolveContext,
} from '../src/lib/data/aiContext.js';
import { defaultState } from '../src/lib/data/entities.js';

const NOW = new Date(2026, 10, 7, 10, 0, 0);

function sampleState() {
  const state = defaultState();
  state.modules = [
    { id: 'm1', programId: 'program-emvs', code: 'M294', title: 'Datenbanken', order: 0, createdAt: 1, updatedAt: 1 },
    { id: 'm2', programId: 'program-emvs', code: 'M295', title: 'Netzwerke', order: 1, createdAt: 1, updatedAt: 1 },
  ];
  state.topics = [{ id: 't1', moduleId: 'm1', name: 'SQL', order: 0, createdAt: 1, updatedAt: 1 }];
  state.notes = [
    {
      id: 'n1',
      moduleId: 'm1',
      title: 'SQL Joins',
      body: 'INNER JOIN verbindet Tabellen.'.repeat(10),
      type: 'note',
      attachments: [],
      createdAt: 1,
      updatedAt: 10,
    },
  ];
  state.homework = [
    {
      id: 'h1',
      moduleId: 'm1',
      title: 'Auftrag 4',
      dueDate: '2026-11-09',
      done: false,
      recurrence: { freq: 'weekly', interval: 1, until: null, seriesId: 'h1' },
      createdAt: 1,
      updatedAt: 1,
    },
    { id: 'h2', moduleId: 'm2', title: 'Alte Aufgabe', dueDate: '2026-11-01', done: true, createdAt: 1, updatedAt: 1 },
  ];
  state.exams = [
    { id: 'e1', moduleId: 'm1', title: 'Datenbanken Prüfung', date: '2026-11-20', notes: '', grade: null, createdAt: 1, updatedAt: 1 },
    { id: 'e2', moduleId: 'm2', title: 'Netzwerke Prüfung', date: '2026-10-01', notes: '', grade: 5.5, gradeNote: 'gut', createdAt: 1, updatedAt: 1 },
  ];
  state.links = [{ id: 'l1', moduleId: 'm1', label: 'Teams', kind: 'teams', url: 'https://teams.test', createdAt: 1, updatedAt: 1 }];
  state.lessons = [
    { id: 'les1', dayOfWeek: 2, start: '08:15', end: '09:45', moduleId: 'm1', label: 'DB', room: 'A1', createdAt: 1, updatedAt: 1 },
  ];
  return state;
}

describe('parseMentions', () => {
  it('extracts a known alias and removes it from the question', () => {
    const result = parseMentions('@prüfungen welche Prüfung ist am wichtigsten?');
    expect(result.refs).toEqual(['prüfungen']);
    expect(result.cleanText).toBe('welche Prüfung ist am wichtigsten?');
  });

  it('accepts folded and English aliases', () => {
    expect(parseMentions('@pruefungen @exams @homework').refs).toEqual(['prüfungen', 'hausaufgaben']);
  });

  it('recognizes module codes and note tokens', () => {
    const result = parseMentions('@M294 und @notiz/n1 @modul/m2 @prüfung/e1');
    expect(result.refs).toEqual(['code:m294', 'notiz/n1', 'modul/m2', 'prüfung/e1']);
    expect(result.cleanText).toBe('und');
  });

  it('leaves unknown mentions as plain text', () => {
    const result = parseMentions('@foo @bar/baz was nun?');
    expect(result.refs).toEqual([]);
    expect(result.cleanText).toBe('@foo @bar/baz was nun?');
  });

  it('deduplicates repeated mentions', () => {
    expect(parseMentions('@hub und @alles').refs).toEqual(['hub']);
  });
});

describe('resolveContext', () => {
  it('sends only the referenced page', () => {
    const result = resolveContext(sampleState(), { name: 'assistant' }, ['prüfungen'], { now: NOW });
    const text = result.sections.map((s) => s.text).join('\n');
    expect(text).toContain('Datenbanken Prüfung');
    expect(text).toContain('Note 5.5');
    expect(text).not.toContain('INNER JOIN');
  });

  it('resolves a note reference with its body', () => {
    const result = resolveContext(sampleState(), { name: 'assistant' }, ['notiz/n1'], { now: NOW });
    expect(result.sections[0].text).toContain('INNER JOIN');
  });

  it('resolves module codes', () => {
    const result = resolveContext(sampleState(), { name: 'assistant' }, ['code:m294'], { now: NOW });
    expect(result.sections[0].text).toContain('Datenbanken');
    expect(result.sections[0].text).toContain('SQL');
  });

  it('resolves @seite from the last non-assistant route', () => {
    const result = resolveContext(sampleState(), { name: 'assistant' }, ['seite'], {
      now: NOW,
      lastRoute: { name: 'exams' },
    });
    expect(result.sections[0].text).toContain('Datenbanken Prüfung');
  });

  it('builds a compact hub without full note bodies', () => {
    const result = resolveContext(sampleState(), { name: 'assistant' }, ['hub'], { now: NOW });
    const text = result.sections[0].text;
    expect(text).toContain('SQL Joins');
    expect(text).not.toContain('INNER JOIN verbindet');
    expect(text).toContain('Auftrag 4');
  });

  it('skips unknown references and duplicates', () => {
    const result = resolveContext(sampleState(), { name: 'assistant' }, ['nope', 'hub', 'hub'], { now: NOW });
    expect(result.sections).toHaveLength(1);
  });

  it('caps a single section at a line boundary', () => {
    const state = sampleState();
    state.notes[0].body = `${'Zeile mit Inhalt\n'.repeat(2000)}ENDE`;
    const result = resolveContext(state, { name: 'assistant' }, ['notiz/n1'], { now: NOW });
    expect(result.sections[0].truncated).toBe(true);
    expect(result.sections[0].text.length).toBeLessThanOrEqual(MAX_REF_CHARS);
    expect(result.sections[0].text.endsWith('…')).toBe(true);
  });

  it('caps the total context', () => {
    const state = sampleState();
    state.notes = Array.from({ length: 5 }, (_, i) => ({
      id: `n${i}`,
      moduleId: 'm1',
      title: `Notiz ${i}`,
      body: 'x'.repeat(7000),
      type: 'note',
      attachments: [],
      createdAt: 1,
      updatedAt: 1,
    }));
    const refs = state.notes.map((n) => `notiz/${n.id}`);
    const result = resolveContext(state, { name: 'assistant' }, refs, { now: NOW });
    expect(result.totalChars).toBeLessThanOrEqual(MAX_TOTAL_CHARS);
    expect(result.truncated).toBe(true);
  });

  it('returns an empty result for no refs', () => {
    expect(resolveContext(sampleState(), { name: 'assistant' }, [], { now: NOW })).toEqual({
      sections: [],
      totalChars: 0,
      truncated: false,
    });
  });
});

describe('context helpers', () => {
  it('lists built-in, module and note refs', () => {
    const refs = listContextRefs(sampleState(), { name: 'assistant' }, NOW);
    const tokens = refs.map((r) => r.token);
    expect(tokens).toContain('@heute');
    expect(tokens).toContain('@M294');
    expect(tokens).toContain('@notiz/n1');
  });

  it('wraps sections in context delimiters', () => {
    const result = resolveContext(sampleState(), { name: 'assistant' }, ['hausaufgaben'], { now: NOW });
    const block = buildContextBlock(result);
    expect(block.startsWith('<context>')).toBe(true);
    expect(block).toContain('## Hausaufgaben');
    expect(block.endsWith('</context>')).toBe(true);
    expect(buildContextBlock({ sections: [] })).toContain('Kein Kontext');
  });
});
