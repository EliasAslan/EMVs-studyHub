/**
 * Markdown-lite parser for note reading.
 * Structure-only, DOM-free, no HTML — output is segments a Svelte
 * component renders as text (never {@html}).
 *
 * Supports: headings 1-3, paragraphs, ul/ol lists, task lines,
 * blockquotes, fenced code, hr; inline **bold**, *italic*,
 * `code`, [[wiki links]] (+ aliases), #tags.
 */

const FENCE_RE = /^\s*```(\w*)\s*$/;
const HEADING_RE = /^\s*(#{1,3})\s+(.+?)\s*$/;
const HR_RE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const TASK_RE = /^(\s*[-*]\s+\[)([ xX])(\]\s+)(.*)$/;
const UL_RE = /^\s*[-*]\s+(.*)$/;
const OL_RE = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;

const INLINE_RE = /(\[\[[^\[\]\n]{1,200}\]\]|`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|#[\p{L}0-9_][\p{L}0-9_\-]*)/gu;

/** Inline tokens for one line of text. */
export function parseInline(text) {
  const out = [];
  const s = String(text || '');
  let last = 0;
  let m;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(s)) !== null) {
    if (m.index > last) out.push({ type: 'text', text: s.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith('[[')) {
      const inner = tok.slice(2, -2);
      const pipe = inner.indexOf('|');
      const target = (pipe < 0 ? inner : inner.slice(0, pipe)).trim();
      const label = (pipe < 0 ? inner : inner.slice(pipe + 1) || inner).trim() || target;
      out.push({ type: 'link', target, label, raw: tok, text: label });
    } else if (tok.startsWith('`')) {
      out.push({ type: 'code', text: tok.slice(1, -1) });
    } else if (tok.startsWith('**')) {
      out.push({ type: 'bold', text: tok.slice(2, -2) });
    } else if (tok.startsWith('*')) {
      out.push({ type: 'italic', text: tok.slice(1, -1) });
    } else if (tok.startsWith('#')) {
      out.push({ type: 'tag', tag: tok.slice(1), text: tok });
    }
    last = m.index + tok.length;
  }
  if (last < s.length) out.push({ type: 'text', text: s.slice(last) });
  return out;
}

function foldTag(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Unique tags (lowercase, diacritic-folded, no #), first-occurrence order, outside code/headings. */
export function extractTags(body) {
  const lines = String(body || '').split('\n');
  const seen = new Set();
  const tags = [];
  let inCode = false;
  for (const raw of lines) {
    if (FENCE_RE.test(raw)) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    if (HEADING_RE.test(raw)) continue;
    const withoutLinks = raw.replace(/\[\[[^\[\]\n]{1,200}\]\]/g, ' ');
    const withoutCode = withoutLinks.replace(/`[^`\n]+`/g, ' ');
    let m;
    const re = /(?<![#\p{L}0-9_])#([\p{L}0-9_][\p{L}0-9_\-]*)/gu;
    while ((m = re.exec(withoutCode)) !== null) {
      const tag = foldTag(m[1]);
      if (!seen.has(tag)) {
        seen.add(tag);
        tags.push(tag);
      }
    }
  }
  return tags;
}

/**
 * Parse a body into blocks:
 * [{type:'heading',level,text,line} |
 *  {type:'paragraph',text,line} |
 *  {type:'list',ordered,items:[{text,line}]} |
 *  {type:'task',checked,text,line} |
 *  {type:'quote',text,line} |
 *  {type:'code',code,lang,line} |
 *  {type:'hr',line}]
 */
export function parseMarkdown(body) {
  const lines = String(body || '').split('\n');
  const blocks = [];
  let i = 0;

  let para = [];
  let paraLine = 0;
  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: 'paragraph', text: para.join('\n'), line: paraLine });
      para = [];
    }
  };

  while (i < lines.length) {
    const raw = lines[i];
    const lineNo = i;

    const fence = raw.match(FENCE_RE);
    if (fence) {
      flushPara();
      const lang = fence[1] || '';
      const start = i;
      i += 1;
      const buf = [];
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1; // closing fence
      blocks.push({ type: 'code', code: buf.join('\n'), lang, line: start });
      continue;
    }

    if (/^\s*$/.test(raw)) {
      flushPara();
      i += 1;
      continue;
    }

    const heading = raw.match(HEADING_RE);
    if (heading) {
      flushPara();
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim(), line: lineNo });
      i += 1;
      continue;
    }

    if (HR_RE.test(raw)) {
      flushPara();
      blocks.push({ type: 'hr', line: lineNo });
      i += 1;
      continue;
    }

    const task = raw.match(TASK_RE);
    if (task) {
      flushPara();
      blocks.push({ type: 'task', checked: task[2].toLowerCase() === 'x', text: task[4], line: lineNo });
      i += 1;
      continue;
    }

    if (UL_RE.test(raw) || OL_RE.test(raw)) {
      flushPara();
      const ordered = OL_RE.test(raw);
      const items = [];
      while (i < lines.length) {
        const ul = lines[i].match(UL_RE);
        const ol = lines[i].match(OL_RE);
        if (!ul && !ol) break;
        items.push({ text: (ul || ol)[1], line: i });
        i += 1;
      }
      blocks.push({ type: 'list', ordered, items, line: items[0]?.line ?? lineNo });
      continue;
    }

    if (QUOTE_RE.test(raw)) {
      flushPara();
      const start = i;
      const buf = [];
      while (i < lines.length) {
        const q = lines[i].match(QUOTE_RE);
        if (!q) break;
        buf.push(q[1]);
        i += 1;
      }
      blocks.push({ type: 'quote', text: buf.join('\n'), line: start });
      continue;
    }

    if (!para.length) paraLine = lineNo;
    para.push(raw);
    i += 1;
  }
  flushPara();
  return blocks;
}

/** Rewrite one task line's checkbox. Returns the new body. */
export function setTaskChecked(body, lineIndex, checked) {
  const lines = String(body || '').split('\n');
  if (lineIndex < 0 || lineIndex >= lines.length) return body;
  const m = lines[lineIndex].match(TASK_RE);
  if (!m) return body;
  lines[lineIndex] = `${m[1]}${checked ? 'x' : ' '}${m[3]}${m[4]}`;
  return lines.join('\n');
}
