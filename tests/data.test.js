import { describe, expect, it } from 'vitest';
import {
  dateKey,
  todayKey,
  parseDateKey,
  isValidDateKey,
  addDays,
  daysBetween,
  daysUntil,
  formatDate,
  monthGrid,
  monthRange,
  startOfWeek,
  weekDateKeys,
  relativeDayLabel,
} from '../src/lib/data/dates.js';
import { pickStartHere, openHomework } from '../src/lib/data/startHere.js';
import { checklistForDay, checkedForDay, remainingCount } from '../src/lib/data/checklist.js';
import { upcomingDeadlines } from '../src/lib/data/deadlines.js';
import { monthModel, itemsOnDate } from '../src/lib/data/calendar.js';
import { searchAll, totalResults } from '../src/lib/data/search.js';
import {
  parseWikiLinks,
  linkIndex,
  resolveLink,
  resolveIn,
  backlinks,
  bodySegments,
  outgoingLinks,
  unlinkedMentions,
  rewriteWikiTargets,
  linkFirstMention,
  norm,
} from '../src/lib/data/wikiLinks.js';
import { lessonsForDay, nextLesson, daysUntilLesson } from '../src/lib/data/schedule.js';

const NOW = new Date(2026, 10, 4, 10, 30); // Wed 4 Nov 2026, local time

function baseState(overrides = {}) {
  return {
    programs: [{ id: 'program-emvs', name: 'EMVs', code: 'EMVs', accent: '#4f46e5', order: 0 }],
    modules: [
      { id: 'm1', programId: 'program-emvs', code: 'M294', title: 'Datenbanken', accent: '#4f46e5', order: 0 },
    ],
    topics: [],
    notes: [],
    homework: [],
    exams: [],
    links: [],
    lessons: [],
    checklistItems: [{ id: 'studied', text: 'studiert heute', kind: 'studied', order: 0 }],
    checklist: { date: null, checked: {} },
    tombstones: [],
    settings: { changeCount: 0, lastExportAt: null },
    ...overrides,
  };
}

describe('dates', () => {
  it('formats and parses local date keys', () => {
    expect(dateKey(new Date(2026, 10, 4))).toBe('2026-11-04');
    expect(parseDateKey('2026-11-04')?.getDate()).toBe(4);
    expect(isValidDateKey('2026-11-04')).toBe(true);
    expect(isValidDateKey('2026-02-30')).toBe(false);
    expect(isValidDateKey('04.11.2026')).toBe(false);
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-11-04', 3)).toBe('2026-11-07');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-11-01', '2026-11-04')).toBe(3);
    expect(daysUntil('2026-11-06', NOW)).toBe(2);
  });

  it('formats de-CH dates and relative labels', () => {
    expect(formatDate('2026-11-04')).toBe('04.11.2026');
    expect(formatDate('2026-11-04', 'short')).toContain('Nov');
    expect(relativeDayLabel('2026-11-04', NOW)).toBe('heute');
    expect(relativeDayLabel('2026-11-05', NOW)).toBe('morgen');
    expect(relativeDayLabel('2026-11-03', NOW)).toBe('gestern');
    expect(relativeDayLabel('2026-11-01', NOW)).toBe('3 Tage überfällig');
  });

  it('builds a Monday-first month grid', () => {
    const weeks = monthGrid(2026, 10);
    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toHaveLength(7);
    expect(weeks[0][0]).toBe('2026-10-26');
    expect(monthRange(2026, 10)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(startOfWeek(new Date(2026, 10, 4)).getDay()).toBe(1);
    expect(weekDateKeys(new Date(2026, 10, 4))[0]).toBe('2026-11-02');
  });
});

describe('start here', () => {
  it('picks the earliest open homework, overdue first', () => {
    const state = baseState({
      homework: [
        { id: 'a', title: 'später', dueDate: '2026-11-10', done: false, createdAt: 1 },
        { id: 'b', title: 'überfällig', dueDate: '2026-11-02', done: false, createdAt: 2 },
        { id: 'c', title: 'erledigt', dueDate: '2026-11-01', done: true, createdAt: 3 },
      ],
    });
    const pick = pickStartHere(state, NOW);
    expect(pick.kind).toBe('homework');
    expect(pick.item.id).toBe('b');
    expect(pick.reason).toBe('overdue');
    expect(openHomework(state).map((h) => h.id)).toEqual(['b', 'a']);
  });

  it('falls back to an exam within 14 days', () => {
    const state = baseState({
      exams: [{ id: 'e1', title: 'Prüfung', date: '2026-11-12', createdAt: 1 }],
    });
    expect(pickStartHere(state, NOW).kind).toBe('exam');
  });

  it('returns null when nothing is urgent', () => {
    const state = baseState({
      exams: [{ id: 'e1', title: 'Später', date: '2026-12-12', createdAt: 1 }],
    });
    expect(pickStartHere(state, NOW)).toBeNull();
  });
});

describe('checklist', () => {
  it('derives homework due today, overdue, custom and studied items', () => {
    const state = baseState({
      homework: [
        { id: 'h1', title: 'Heute', dueDate: '2026-11-04', done: false },
        { id: 'h2', title: 'Alt', dueDate: '2026-11-01', done: false },
        { id: 'h3', title: 'Später', dueDate: '2026-11-10', done: false },
        { id: 'h4', title: 'Fertig', dueDate: '2026-11-04', done: true },
      ],
      checklistItems: [
        { id: 'studied', text: 'studiert heute', kind: 'studied', order: 0 },
        { id: 'c1', text: 'Trinkflasche', kind: 'custom', order: 1 },
      ],
      checklist: { date: '2026-11-04', checked: { c1: true } },
    });
    const day = checklistForDay(state, NOW);
    expect(day.items.map((i) => i.id)).toEqual(['hw:h2', 'hw:h1', 'c1', 'studied']);
    expect(day.items.find((i) => i.id === 'c1').checked).toBe(true);
    expect(day.items.find((i) => i.id === 'hw:h1').checked).toBe(false);
    expect(remainingCount(state, NOW)).toBe(3);
  });

  it('ignores checks from a previous day', () => {
    const state = baseState({
      checklistItems: [{ id: 'c1', text: 'Alt', kind: 'custom', order: 0 }],
      checklist: { date: '2026-11-03', checked: { c1: true } },
    });
    expect(checkedForDay(state, NOW)).toEqual({});
    expect(checklistForDay(state, NOW).items.find((i) => i.id === 'c1').checked).toBe(false);
  });
});

describe('deadlines', () => {
  it('sorts open homework and exams by date and excludes done homework', () => {
    const state = baseState({
      homework: [
        { id: 'h1', title: 'Spät', dueDate: '2026-11-09', done: false, createdAt: 1 },
        { id: 'h2', title: 'Alt', dueDate: '2026-11-01', done: false, createdAt: 2 },
        { id: 'h3', title: 'Fertig', dueDate: '2026-11-02', done: true, createdAt: 3 },
      ],
      exams: [{ id: 'e1', title: 'Prüfung', date: '2026-11-05', createdAt: 4 }],
    });
    const list = upcomingDeadlines(state, { now: NOW });
    expect(list.map((d) => `${d.kind}:${d.item.id}`)).toEqual(['homework:h2', 'exam:e1', 'homework:h1']);
    expect(list[0].days).toBe(-3);
    expect(list[1].days).toBe(1);
  });

  it('can hide overdue homework', () => {
    const state = baseState({
      homework: [{ id: 'h1', title: 'Alt', dueDate: '2026-11-01', done: false }],
    });
    expect(upcomingDeadlines(state, { now: NOW, includeOverdue: false })).toHaveLength(0);
  });
});

describe('calendar', () => {
  it('places homework and exams on the right day', () => {
    const state = baseState({
      homework: [
        { id: 'h1', title: 'HW', dueDate: '2026-11-04', done: false },
        { id: 'h2', title: 'Fertig', dueDate: '2026-11-04', done: true },
        { id: 'h3', title: 'Anderer Monat', dueDate: '2026-12-04', done: false },
      ],
      exams: [{ id: 'e1', title: 'Ex', date: '2026-11-04' }],
    });
    const weeks = monthModel(2026, 10, state, NOW);
    const day = weeks.flat().find((d) => d.key === '2026-11-04');
    expect(day.homework.map((h) => h.id)).toEqual(['h1']);
    expect(day.exams.map((e) => e.id)).toEqual(['e1']);
    expect(day.isToday).toBe(true);
    expect(weeks.flat().find((d) => d.key === '2026-12-04').inMonth).toBe(false);
    expect(itemsOnDate(state, '2026-11-04').homework).toHaveLength(2);
  });
});

describe('search', () => {
  it('finds notes, homework, modules, exams and links', () => {
    const state = baseState({
      modules: [
        { id: 'm1', programId: 'program-emvs', code: 'M294', title: 'SQL Datenbanken', accent: '#4f46e5', order: 0 },
      ],
      notes: [{ id: 'n1', title: 'SQL Joins', body: 'INNER JOIN erklärt', updatedAt: 5 }],
      homework: [{ id: 'h1', title: 'SQL Auftrag', done: false }],
      exams: [{ id: 'e1', title: 'SQL Prüfung', moduleId: 'm1', date: '2026-11-20' }],
      links: [{ id: 'l1', label: 'SQL Tutorial', url: 'https://example.com/sql' }],
    });
    const result = searchAll(state, 'sql');
    expect(result.notes[0].id).toBe('n1');
    expect(result.homework[0].id).toBe('h1');
    expect(result.modules[0].id).toBe('m1');
    expect(result.exams[0].id).toBe('e1');
    expect(result.links[0].id).toBe('l1');
    expect(totalResults(result)).toBe(5);
  });

  it('returns empty collections for an empty query', () => {
    expect(totalResults(searchAll(baseState(), '   '))).toBe(0);
  });
});

describe('wiki links', () => {
  const state = baseState({
    notes: [
      { id: 'n1', title: 'SQL Basics', body: 'Siehe [[Datenbanken]] und [[Joins]].' },
      { id: 'n2', title: 'Joins', body: 'Zurück zu [[SQL Basics]].' },
    ],
  });

  it('parses wiki links and segments text', () => {
    const links = parseWikiLinks('A [[Ziel]] B [[Zwei]]');
    expect(links.map((l) => l.target)).toEqual(['Ziel', 'Zwei']);
    const segments = bodySegments('A [[Ziel]] B');
    expect(segments).toEqual([
      { type: 'text', text: 'A ' },
      { type: 'link', target: 'Ziel', label: 'Ziel', raw: '[[Ziel]]' },
      { type: 'text', text: ' B' },
    ]);
  });

  it('resolves notes and modules, and computes backlinks', () => {
    expect(resolveLink(state, 'sql basics')).toEqual({ kind: 'note', id: 'n1', label: 'SQL Basics' });
    expect(resolveLink(state, 'Datenbanken')).toEqual({ kind: 'module', id: 'm1', label: 'Datenbanken' });
    expect(resolveLink(state, 'Fehlt')).toBeNull();
    expect(backlinks(state, 'n1').map((n) => n.id)).toEqual(['n2']);
    expect(linkIndex(state).size).toBeGreaterThan(0);
  });

  it('resolves homework, exams, links and topics too', () => {
    const s = baseState({
      notes: [
        {
          id: 'n1',
          title: 'Plan',
          body: '[[Aufgabe 3]] [[Prüfung M294]] [[Moodle]] [[Normalisierung]] [[M294|DB]]',
        },
      ],
      homework: [{ id: 'h1', title: 'Aufgabe 3' }],
      exams: [{ id: 'e1', title: 'Prüfung M294' }],
      links: [{ id: 'l1', label: 'Moodle' }],
      topics: [{ id: 't1', name: 'Normalisierung', moduleId: 'm1' }],
    });

    expect(resolveLink(s, 'aufgabe 3')).toEqual({ kind: 'homework', id: 'h1', label: 'Aufgabe 3' });
    expect(resolveLink(s, 'Prüfung M294')).toEqual({ kind: 'exam', id: 'e1', label: 'Prüfung M294' });
    expect(resolveLink(s, 'Moodle')).toEqual({ kind: 'link', id: 'l1', label: 'Moodle' });
    expect(resolveLink(s, 'Normalisierung')).toEqual({
      kind: 'topic',
      id: 't1',
      label: 'Normalisierung',
      moduleId: 'm1',
    });
    expect(resolveLink(s, 'M294')).toMatchObject({ kind: 'module', id: 'm1' });

    expect(outgoingLinks(s, 'n1').map((o) => o.entry?.kind)).toEqual([
      'homework',
      'exam',
      'link',
      'topic',
      'module',
    ]);
  });

  it('parses aliases and resolves by target only', () => {
    const links = parseWikiLinks('A [[SQL Basics|Grundlagen]] B');
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ target: 'SQL Basics', label: 'Grundlagen' });
    expect(resolveLink(state, 'SQL Basics')).toEqual({ kind: 'note', id: 'n1', label: 'SQL Basics' });
    expect(resolveLink(state, 'Grundlagen')).toBeNull();
    const segs = bodySegments('A [[SQL Basics|Grundlagen]]');
    expect(segs).toContainEqual({ type: 'link', target: 'SQL Basics', label: 'Grundlagen', raw: '[[SQL Basics|Grundlagen]]' });
    const index = linkIndex(state);
    expect(resolveIn(index, 'sql basics')?.id).toBe('n1');
    expect(linkIndex(state).has(norm('SQL Basics'))).toBe(true);
  });

  it('computes outgoing links unique with counts', () => {
    const out = outgoingLinks(state, 'n1');
    expect(out.map((o) => o.target)).toEqual(['Datenbanken', 'Joins']);
    expect(out.find((o) => o.target === 'Joins')?.entry?.id).toBe('n2');
    expect(out.find((o) => o.target === 'Joins')?.count).toBe(1);
    const dup = baseState({
      notes: [{ id: 'a', title: 'A', body: '[[B]] und [[B|anders]] und [[Fehlt]]' }, { id: 'b', title: 'B', body: '' }],
    });
    const dupOut = outgoingLinks(dup, 'a');
    expect(dupOut).toHaveLength(2);
    expect(dupOut[0]).toMatchObject({ target: 'B', count: 2 });
    expect(dupOut[1].entry).toBeNull();
  });

  it('finds unlinked mentions without double counting linked notes', () => {
    const s = baseState({
      notes: [
        { id: 'n1', title: 'Joins', body: '' },
        { id: 'n2', title: 'A', body: 'Die Joins sind wichtig.' },
        { id: 'n3', title: 'B', body: 'Siehe [[Joins]].' },
        { id: 'n4', title: 'C', body: 'kein Treffer' },
      ],
    });
    expect(unlinkedMentions(s, 'n1').map((n) => n.id)).toEqual(['n2']);
    expect(unlinkedMentions(s, 'n4')).toEqual([]);
    const short = baseState({ notes: [{ id: 'a', title: 'ab', body: 'ab ab' }, { id: 'b', title: 'B', body: 'ab hier' }] });
    expect(unlinkedMentions(short, 'a')).toEqual([]);
  });

  it('brackets the first safe plain mention only', () => {
    expect(linkFirstMention('Die Joins sind wichtig', 'Joins')).toBe('Die [[Joins]] sind wichtig');
    expect(linkFirstMention('schon [[Joins]] verlinkt, Joins hier', 'Joins')).toBe(
      'schon [[Joins]] verlinkt, [[Joins]] hier',
    );
    expect(linkFirstMention('kein Treffer', 'Joins')).toBe('kein Treffer');
    expect(linkFirstMention('JOINS gross', 'joins')).toBe('[[JOINS]] gross');
    expect(linkFirstMention('x', '')).toBe('x');
  });

  it('rewrites targets and preserves aliases', () => {
    expect(rewriteWikiTargets('[[Old]] und [[Old|Alias]] und [[Andere]]', 'old', 'Neu')).toBe(
      '[[Neu]] und [[Neu|Alias]] und [[Andere]]',
    );
    expect(rewriteWikiTargets('kein link', 'Old', 'Neu')).toBe('kein link');
    expect(rewriteWikiTargets('[[Old]]', '', 'Neu')).toBe('[[Old]]');
    expect(rewriteWikiTargets('[[Old]]', 'Old', '')).toBe('[[Old]]');
  });
});

describe('schedule', () => {
  it('finds the next lesson across the week boundary', () => {
    const state = baseState({
      lessons: [
        { id: 'l1', dayOfWeek: 1, start: '09:00', end: '10:00', label: 'Montag', room: 'A1' },
        { id: 'l2', dayOfWeek: 3, start: '09:00', end: '10:00', label: 'Mittwoch', room: 'A2' },
        { id: 'l3', dayOfWeek: 3, start: '14:00', end: '15:00', label: 'Später', room: 'A3' },
      ],
    });
    const next = nextLesson(state, NOW);
    expect(next.lesson.id).toBe('l3');
    expect(next.date).toBe('2026-11-04');
    expect(lessonsForDay(state, 3).map((l) => l.id)).toEqual(['l2', 'l3']);
    expect(daysUntilLesson(state.lessons[0], NOW)).toBe(5);
  });
});
