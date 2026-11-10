import { describe, expect, it } from 'vitest';
import {
  SNAPSHOT_VERSION,
  buildSnapshot,
  snapshotToJson,
  snapshotToText,
} from '../src/lib/data/widgetSnapshot.js';

const NOW = new Date(2026, 10, 7, 10, 0, 0); // 7 Nov 2026

function stateWith(homework = [], exams = []) {
  return { homework, exams };
}

describe('buildSnapshot', () => {
  it('does not throw on null, undefined or empty state', () => {
    expect(() => buildSnapshot(null)).not.toThrow();
    expect(() => buildSnapshot(undefined)).not.toThrow();
    expect(() => buildSnapshot({})).not.toThrow();
  });

  it('returns a versioned empty snapshot for no data', () => {
    const snap = buildSnapshot(stateWith(), NOW);
    expect(snap.version).toBe(SNAPSHOT_VERSION);
    expect(snap.generatedAt).toBe(NOW.toISOString());
    expect(snap.startHere).toBeNull();
    expect(snap.deadlines).toEqual([]);
    expect(snap.openHomeworkCount).toBe(0);
    expect(snap.nextExam).toBeNull();
  });

  it('reports overdue homework as Start Here and first deadline', () => {
    const snap = buildSnapshot(
      stateWith([{ id: 'h1', title: 'Alte Aufgabe', dueDate: '2026-11-05', done: false }]),
      NOW,
    );
    expect(snap.startHere).toMatchObject({
      kind: 'homework',
      title: 'Alte Aufgabe',
      date: '2026-11-05',
      days: -2,
      overdue: true,
    });
    expect(snap.deadlines).toHaveLength(1);
    expect(snap.deadlines[0].overdue).toBe(true);
    expect(snap.openHomeworkCount).toBe(1);
  });

  it('caps deadlines at three and sorts by date', () => {
    const homework = [
      { id: 'h1', title: 'Drei', dueDate: '2026-11-10', done: false },
      { id: 'h2', title: 'Eins', dueDate: '2026-11-08', done: false },
      { id: 'h3', title: 'Vier', dueDate: '2026-11-11', done: false },
      { id: 'h4', title: 'Zwei', dueDate: '2026-11-09', done: false },
    ];
    const exams = [{ id: 'e1', title: 'Prüfung', date: '2026-11-12', notes: '', grade: null }];
    const snap = buildSnapshot(stateWith(homework, exams), NOW);
    expect(snap.deadlines).toHaveLength(3);
    expect(snap.deadlines.map((d) => d.title)).toEqual(['Eins', 'Zwei', 'Drei']);
    expect(snap.openHomeworkCount).toBe(4);
  });

  it('shows next exam even beyond the 14-day Start Here window', () => {
    const snap = buildSnapshot(
      stateWith([], [{ id: 'e1', title: 'Späte Prüfung', date: '2026-11-27', notes: '', grade: null }]),
      NOW,
    );
    expect(snap.startHere).toBeNull();
    expect(snap.nextExam).toMatchObject({
      title: 'Späte Prüfung',
      date: '2026-11-27',
      days: 20,
      overdue: false,
    });
  });

  it('treats done homework as closed', () => {
    const snap = buildSnapshot(
      stateWith([{ id: 'h1', title: 'Erledigt', dueDate: '2026-11-08', done: true }]),
      NOW,
    );
    expect(snap.startHere).toBeNull();
    expect(snap.openHomeworkCount).toBe(0);
    expect(snap.deadlines).toEqual([]);
  });

  it('is deterministic with a fixed now', () => {
    const entry = { id: 'h1', title: 'X', dueDate: '2026-11-09', done: false };
    const a = buildSnapshot(stateWith([entry]), NOW);
    const b = buildSnapshot(stateWith([entry]), NOW);
    expect(a).toEqual(b);
    expect(a.startHere.days).toBe(2);
  });

  it('keeps umlauts and special characters in JSON', () => {
    const snap = buildSnapshot(
      stateWith([
        { id: 'h1', title: 'Müller — Prüfung "Physik" | test', dueDate: '2026-11-09', done: false },
      ]),
      NOW,
    );
    const parsed = JSON.parse(snapshotToJson(snap));
    expect(parsed.startHere.title).toBe('Müller — Prüfung "Physik" | test');
  });

  it('escapes pipes and collapses newlines in the text serialization', () => {
    const snap = buildSnapshot(
      stateWith([{ id: 'h1', title: 'Zeile 1\nZeile 2 | Rohr', dueDate: '2026-11-09', done: false }]),
      NOW,
    );
    const text = snapshotToText(snap);
    expect(text).not.toContain('|');
    expect(text).toContain('startTitle=Zeile 1 Zeile 2 ¦ Rohr');
  });

  it('truncates long titles to 80 characters', () => {
    const snap = buildSnapshot(
      stateWith([{ id: 'h1', title: 'x'.repeat(120), dueDate: '2026-11-09', done: false }]),
      NOW,
    );
    expect(snap.startHere.title).toHaveLength(80);
    expect(snap.startHere.title).toBe('x'.repeat(80));
  });

  it('skips malformed entries without throwing', () => {
    const snap = buildSnapshot(
      stateWith(
        [
          null,
          { id: 'h1', title: 123, dueDate: '2026-11-09', done: false },
          { title: 'OK', dueDate: '2026-11-08', done: false },
        ],
        [null, { id: 'e1', title: 'Exam', date: '2026-11-08', notes: '', grade: null }],
      ),
      NOW,
    );
    expect(snap.openHomeworkCount).toBe(2);
    expect(snap.deadlines).toHaveLength(3);
    expect(snap.startHere.title).toBe('OK');
    expect(snap.nextExam.title).toBe('Exam');
  });
});

describe('snapshotToText', () => {
  it('produces simple key=value lines', () => {
    const snap = buildSnapshot(
      stateWith(
        [{ id: 'h1', title: 'Hausaufgabe', dueDate: '2026-11-09', done: false }],
        [{ id: 'e1', title: 'Prüfung', date: '2026-11-08', notes: '', grade: null }],
      ),
      NOW,
    );
    const text = snapshotToText(snap);
    expect(text).toContain('version=1');
    expect(text).toContain('startTitle=Hausaufgabe');
    expect(text).toContain('openCount=1');
    expect(text).toContain('deadline1Title=Prüfung');
    expect(text).toContain('nextExamTitle=Prüfung');
    expect(text.split('\n').every((line) => line.includes('='))).toBe(true);
  });

  it('returns empty string for non-object input', () => {
    expect(snapshotToText(null)).toBe('');
    expect(snapshotToText(undefined)).toBe('');
    expect(snapshotToText('')).toBe('');
  });
});
