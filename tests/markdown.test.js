import { describe, expect, it } from 'vitest';
import { parseMarkdown, parseInline, extractTags, setTaskChecked } from '../src/lib/data/markdown.js';

describe('parseMarkdown', () => {
  it('parses headings, paragraphs and lists', () => {
    const blocks = parseMarkdown('# Titel\n\nIntro **fett**\n\n- eins\n- zwei\n\n1. a\n2. b');
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'list', 'list']);
    expect(blocks[0]).toMatchObject({ level: 1, text: 'Titel' });
    expect(blocks[2].items.map((i) => i.text)).toEqual(['eins', 'zwei']);
    expect(blocks[3].ordered).toBe(true);
  });

  it('parses tasks with line indices and toggles them', () => {
    const body = 'Intro\n\n- [ ] offen\n- [x] fertig';
    const blocks = parseMarkdown(body);
    const tasks = blocks.filter((b) => b.type === 'task');
    expect(tasks.map((t) => t.checked)).toEqual([false, true]);
    expect(tasks.map((t) => t.line)).toEqual([2, 3]);
    const toggled = setTaskChecked(body, tasks[0].line, true);
    expect(toggled).toContain('- [x] offen');
    expect(setTaskChecked(body, 99, true)).toBe(body);
    expect(setTaskChecked(body, 0, true)).toBe(body);
  });

  it('keeps fenced code literal (no headings inside)', () => {
    const blocks = parseMarkdown('```js\n# kein heading\n```\n\n# echt');
    expect(blocks.map((b) => b.type)).toEqual(['code', 'heading']);
    expect(blocks[0].code).toBe('# kein heading');
    expect(blocks[0].lang).toBe('js');
  });

  it('parses quotes and hr', () => {
    const blocks = parseMarkdown('> zitat\n> zweite\n\n---');
    expect(blocks.map((b) => b.type)).toEqual(['quote', 'hr']);
    expect(blocks[0].text).toBe('zitat\nzweite');
  });
});

describe('parseInline', () => {
  it('tokenises bold, italic, code, links with alias and tags', () => {
    const seg = parseInline('**fett** *kursiv* `code` [[Ziel|Anzeige]] #Tag');
    expect(seg).toEqual([
      { type: 'bold', text: 'fett' },
      { type: 'text', text: ' ' },
      { type: 'italic', text: 'kursiv' },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'code' },
      { type: 'text', text: ' ' },
      { type: 'link', target: 'Ziel', label: 'Anzeige', raw: '[[Ziel|Anzeige]]', text: 'Anzeige' },
      { type: 'text', text: ' ' },
      { type: 'tag', tag: 'Tag', text: '#Tag' },
    ]);
  });
});

describe('extractTags', () => {
  it('ignores headings, code fences and inline code', () => {
    const body = '# Titel #ignorier\n\nText #PrüfungsRelevant und #notiz\n\n`#code` hier\n\n```\n#block\n```\n\n#notiz doppelt';
    expect(extractTags(body)).toEqual(['prufungsrelevant', 'notiz']);
  });
});
