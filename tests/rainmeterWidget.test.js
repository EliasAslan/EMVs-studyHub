import { readFileSync } from 'node:fs';
import { buildSnapshot, snapshotToText } from '../src/lib/data/widgetSnapshot.js';
import { describe, expect, it } from 'vitest';

const SKIN = readFileSync(new URL('../desktop/StudyHub/StudyHub.ini', import.meta.url), 'utf8');

function extract(text, regex) {
  const m = regex.exec(text);
  return m ? m.slice(1) : [];
}

function iniSections() {
  const map = {};
  let current = '';
  for (const rawLine of SKIN.split(/\r?\n/)) {
    const line = rawLine.trim();
    const sec = /^\[([^\]]+)\]$/.exec(line);
    if (sec) {
      current = sec[1];
      map[current] = {};
      continue;
    }
    const kv = /^([^=]+)=(.*)$/.exec(line);
    if (kv && current) map[current][kv[1].trim()] = kv[2].trim();
  }
  return map;
}

const NOW = new Date(2026, 10, 10, 8, 15, 0);

function snapshotText(state) {
  return snapshotToText(buildSnapshot(state, NOW));
}

describe('Study Hub Rainmeter widget skin', () => {
  it('reads the snapshot with WebParser and UTF-8 encoding', () => {
    expect(SKIN).toContain('Measure=WebParser');
    expect(SKIN).toContain('CodePage=65001');
    expect(SKIN).toContain('URL=file://#SnapshotFile#');
  });

  it('has a configurable snapshot path variable', () => {
    expect(SKIN).toContain('[Variables]');
    expect(SKIN).toMatch(/^SnapshotFile=.*$/m);
  });

  it('refreshes on right click and opens Study Hub on left click', () => {
    expect(SKIN).toContain('RightMouseUpAction=[!Refresh]');
    expect(SKIN).toContain('LeftMouseUpAction=');
  });

  it('references only existing WebParser parent measures from child measures', () => {
    const sections = iniSections();
    const webParser = Object.entries(sections).filter(([, opts]) => opts.Measure === 'WebParser');
    const parents = new Set(webParser.filter(([, opts]) => opts.RegExp).map(([name]) => name));
    for (const [name, opts] of webParser) {
      if (!opts.URL) continue; // parent measures carry the RegExp and no URL
      const ref = /^\[Measure([^\]]+)\]$/.exec(opts.URL);
      if (!ref) continue; // file://…#SnapshotFile# variable URL -> no parent needed
      expect(sections, `WebParser child [${name}] must reference an existing section`).toHaveProperty(
        `Measure${ref[1]}`,
      );
      expect(sections[`Measure${ref[1]}`]).toMatchObject({ Measure: 'WebParser', RegExp: expect.any(String) });
      expect(parents).toContain(`Measure${ref[1]}`);
    }
  });

  it('does not hardcode a personal Windows path', () => {
    expect(SKIN).not.toContain('C:\\Users\\e3953');
    expect(SKIN).toContain('SnapshotFile=C:\\Users\\<you>\\Downloads\\study-hub-widget.txt');
  });

  it('captures the Start Here title, incl. umlauts and special characters', () => {
    const text = snapshotText({
      homework: [{ id: 'h1', title: 'Müller — Physik: Energie | Aufgabe 3', dueDate: '2026-11-12', done: false }],
      exams: [],
    });
    expect(extract(text, new RegExp('^startTitle=(.*)$', 'm'))[0]).toBe('Müller — Physik: Energie ¦ Aufgabe 3');
  });

  it('captures the open homework count', () => {
    const text = snapshotText({
      homework: [
        { id: 'h1', title: 'A', dueDate: '2026-11-10', done: false },
        { id: 'h2', title: 'B', dueDate: '2026-11-11', done: false },
      ],
      exams: [],
    });
    expect(extract(text, new RegExp('^openCount=(\\d+)$', 'm'))[0]).toBe('2');
  });

  it('captures the last updated date', () => {
    const text = snapshotText({ homework: [], exams: [] });
    expect(extract(text, new RegExp('^generatedAt=(\\d{4}-\\d{2}-\\d{2})', 'm'))[0]).toBe('2026-11-10');
  });

  it('captures upcoming deadline titles and overdue day counts', () => {
    const text = snapshotToText(
      buildSnapshot(
        {
          homework: [
            { id: 'h1', title: 'Klausurvorbereitung Bio — Zellatmung', dueDate: '2026-11-08', done: false },
            { id: 'h2', title: 'Müller — Physik: Energie ¦ Aufgabe 3', dueDate: '2026-11-12', done: false },
          ],
          exams: [],
        },
        NOW,
      ),
    );
    expect(extract(text, new RegExp('^deadline1Title=(.*)$', 'm'))[0]).toBe('Klausurvorbereitung Bio — Zellatmung');
    expect(extract(text, new RegExp('^deadline1Days=(-?\\d+)', 'm'))[0]).toBe('-2');
    expect(extract(text, new RegExp('^deadline2Title=(.*)$', 'm'))[0]).toBe('Müller — Physik: Energie ¦ Aufgabe 3');
  });

  it('falls back for empty snapshots', () => {
    const text = snapshotText({ homework: [], exams: [] });
    expect(extract(text, new RegExp('^startTitle=(.*)$', 'm'))[0]).toBe('');
    expect(extract(text, new RegExp('^openCount=(\\d+)$', 'm'))[0]).toBe('0');
    expect(extract(text, new RegExp('^deadline1Title=(.*)$', 'm'))[0]).toBeUndefined();
  });
});
