/**
 * [[Wiki links]] — parse, resolve and compute backlinks.
 * Pure and DOM-free.
 */

const WIKI_RE = /\[\[([^\[\]\n]{1,120})\]\]/g;

export function parseWikiLinks(body) {
  const text = String(body || '');
  const out = [];
  let match;
  WIKI_RE.lastIndex = 0;
  while ((match = WIKI_RE.exec(text)) !== null) {
    out.push({
      raw: match[0],
      target: match[1].trim(),
      index: match.index,
    });
  }
  return out;
}

function norm(value) {
  return String(value || '').toLowerCase().trim();
}

/** Map of normalized name -> {kind, id, label}. Later entries win deterministically. */
export function linkIndex(state) {
  const index = new Map();
  const add = (name, entry) => {
    const key = norm(name);
    if (key && !index.has(key)) index.set(key, entry);
  };
  for (const n of state.notes || []) add(n.title, { kind: 'note', id: n.id, label: n.title });
  for (const m of state.modules || []) {
    add(m.code, { kind: 'module', id: m.id, label: m.title || m.code });
    add(m.title, { kind: 'module', id: m.id, label: m.title || m.code });
  }
  for (const h of state.homework || []) add(h.title, { kind: 'homework', id: h.id, label: h.title });
  for (const e of state.exams || []) add(e.title, { kind: 'exam', id: e.id, label: e.title });
  return index;
}

export function resolveLink(state, target) {
  return linkIndex(state).get(norm(target)) || null;
}

/** Notes whose body links to the given note title. */
export function backlinks(state, noteId) {
  const note = (state.notes || []).find((n) => n.id === noteId);
  if (!note || !note.title) return [];
  const target = norm(note.title);
  return (state.notes || []).filter(
    (n) => n.id !== noteId && parseWikiLinks(n.body).some((l) => norm(l.target) === target),
  );
}

/** Split a body into text and link segments for rendering. */
export function bodySegments(body) {
  const text = String(body || '');
  const segments = [];
  let cursor = 0;
  for (const link of parseWikiLinks(text)) {
    if (link.index > cursor) segments.push({ type: 'text', text: text.slice(cursor, link.index) });
    segments.push({ type: 'link', target: link.target, raw: link.raw });
    cursor = link.index + link.raw.length;
  }
  if (cursor < text.length) segments.push({ type: 'text', text: text.slice(cursor) });
  return segments;
}
