import { describe, expect, it } from 'vitest';
import {
  normalizeRecurrence,
  nextOccurrence,
  nextHomeworkFrom,
  nextInstanceToAdd,
  describeRecurrence,
  recurrenceFromValue,
  recurrenceValue,
} from '../src/lib/data/recurrence.js';

describe('recurrence normalization', () => {
  it('rejects invalid rules and clamps intervals', () => {
    expect(normalizeRecurrence(null)).toBeNull();
    expect(normalizeRecurrence({ freq: 'hourly' })).toBeNull();
    expect(normalizeRecurrence({ freq: 'weekly', interval: 0 })).toMatchObject({
      freq: 'weekly',
      interval: 1,
    });
    expect(normalizeRecurrence({ freq: 'weekly', interval: 99 })).toMatchObject({
      interval: 12,
    });
    expect(normalizeRecurrence({ freq: 'daily', interval: 'x' })).toMatchObject({ interval: 1 });
  });

  it('fills seriesId from the homework id and keeps a valid one', () => {
    expect(normalizeRecurrence({ freq: 'daily' }, 'h1').seriesId).toBe('h1');
    expect(normalizeRecurrence({ freq: 'daily', seriesId: 's1' }, 'h1').seriesId).toBe('s1');
    expect(normalizeRecurrence({ freq: 'daily', until: '2026-02-30' })).toMatchObject({
      until: null,
    });
  });

  it('maps UI values in both directions', () => {
    expect(recurrenceFromValue('none')).toBeNull();
    expect(recurrenceFromValue('weekly', 'h1')).toMatchObject({
      freq: 'weekly',
      interval: 1,
      seriesId: 'h1',
    });
    expect(recurrenceValue({ freq: 'weekly', interval: 2 })).toBe('biweekly');
    expect(recurrenceValue(null)).toBe('none');
  });
});

describe('nextOccurrence', () => {
  it('advances daily, weekly and monthly rules', () => {
    expect(nextOccurrence('2026-11-04', { freq: 'daily', interval: 1 })).toBe('2026-11-05');
    expect(nextOccurrence('2026-11-04', { freq: 'daily', interval: 3 })).toBe('2026-11-07');
    expect(nextOccurrence('2026-11-04', { freq: 'weekly', interval: 1 })).toBe('2026-11-11');
    expect(nextOccurrence('2026-11-04', { freq: 'weekly', interval: 2 })).toBe('2026-11-18');
    expect(nextOccurrence('2026-11-04', { freq: 'monthly', interval: 1 })).toBe('2026-12-04');
  });

  it('clamps monthly dates to the end of the target month', () => {
    expect(nextOccurrence('2026-01-31', { freq: 'monthly', interval: 1 })).toBe('2026-02-28');
    expect(nextOccurrence('2028-01-31', { freq: 'monthly', interval: 1 })).toBe('2028-02-29');
    expect(nextOccurrence('2026-08-31', { freq: 'monthly', interval: 1 })).toBe('2026-09-30');
    expect(nextOccurrence('2026-01-30', { freq: 'monthly', interval: 1 })).toBe('2026-02-28');
    expect(nextOccurrence('2026-12-31', { freq: 'monthly', interval: 2 })).toBe('2027-02-28');
  });

  it('respects an inclusive until date', () => {
    expect(
      nextOccurrence('2026-11-01', { freq: 'weekly', interval: 1, until: '2026-11-08' }),
    ).toBe('2026-11-08');
    expect(
      nextOccurrence('2026-11-01', { freq: 'weekly', interval: 1, until: '2026-11-07' }),
    ).toBeNull();
    expect(
      nextOccurrence('2026-11-01', { freq: 'daily', interval: 1, until: '2026-11-01' }),
    ).toBeNull();
  });

  it('returns null for invalid input', () => {
    expect(nextOccurrence('2026-02-30', { freq: 'daily' })).toBeNull();
    expect(nextOccurrence('2026-11-04', null)).toBeNull();
    expect(nextOccurrence(null, { freq: 'daily' })).toBeNull();
  });
});

describe('nextHomeworkFrom', () => {
  it('copies the item and carries the series id forward', () => {
    const next = nextHomeworkFrom({
      id: 'h1',
      title: 'Vokabeln',
      moduleId: 'm1',
      topicId: 't1',
      dueDate: '2026-11-04',
      done: true,
      recurrence: { freq: 'weekly', interval: 1, until: null, seriesId: null },
    });
    expect(next).toMatchObject({
      title: 'Vokabeln',
      moduleId: 'm1',
      topicId: 't1',
      dueDate: '2026-11-11',
      done: false,
      doneAt: null,
    });
    expect(next.recurrence).toMatchObject({ seriesId: 'h1', freq: 'weekly', interval: 1 });
  });

  it('returns null when the series has ended or has no date', () => {
    expect(
      nextHomeworkFrom({
        id: 'h1',
        dueDate: '2026-11-04',
        recurrence: { freq: 'weekly', until: '2026-11-01' },
      }),
    ).toBeNull();
    expect(nextHomeworkFrom({ id: 'h1', dueDate: null, recurrence: { freq: 'weekly' } })).toBeNull();
    expect(nextHomeworkFrom({ id: 'h1', dueDate: '2026-11-04', recurrence: null })).toBeNull();
  });
});

describe('nextInstanceToAdd', () => {
  const hw = {
    id: 'h1',
    title: 'Vokabeln',
    dueDate: '2026-11-04',
    recurrence: { freq: 'weekly', interval: 1, until: null, seriesId: 'h1' },
  };

  it('returns one instance when the date is free', () => {
    expect(nextInstanceToAdd({ homework: [hw] }, hw)).toMatchObject({ dueDate: '2026-11-11' });
  });

  it('does not duplicate an existing occurrence', () => {
    const existing = {
      id: 'h2',
      title: 'Vokabeln',
      dueDate: '2026-11-11',
      recurrence: { freq: 'weekly', interval: 1, until: null, seriesId: 'h1' },
    };
    expect(nextInstanceToAdd({ homework: [hw, existing] }, hw)).toBeNull();
  });
});

describe('describeRecurrence', () => {
  it('uses short German labels', () => {
    expect(describeRecurrence(null)).toBe('');
    expect(describeRecurrence({ freq: 'daily' })).toBe('↻ täglich');
    expect(describeRecurrence({ freq: 'weekly' })).toBe('↻ wöchentlich');
    expect(describeRecurrence({ freq: 'weekly', interval: 2 })).toBe('↻ alle 2 Wochen');
    expect(describeRecurrence({ freq: 'monthly', interval: 3 })).toBe('↻ alle 3 Monate');
  });
});
