/**
 * [[Wiki links]] — parse, resolve and compute backlinks.
 * Pure and DOM-free.
 *
 * Supports aliases: [[Target|Anzeige]] — resolution is always by Target,
 * the alias is only display text.
 */

const WIKI_RE = /\[\[([^\[\]\n]{1,200})\]\]/g;

function splitTargetAlias(inner) {
  const pipe = inner.indexOf('|');
  if (pipe < 0) return { target: inner.trim(), label: inner.trim() };
  const target = inner.slice(0, pipe).trim();
  const label = inner.slice(pipe + 1).trim() || target;
  return { target, label };
}

export function parseWikiLinks(body) {
  const text = String(body || '');
  const out = [];
  let match;
  WIKI_RE.lastIndex = 0;
  while ((match = WIKI_RE.exec(text)) !== null) {
    const { target, label } = splitTargetAlias(match[1]);
    if (!target) continue;
    out.push({
      raw: match[0],
      target,
      label,
      index: match.index,
    });
  }
  return out;
}

/** Case + diacritic insensitive normalization. */
export function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
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
  for (const l of state.links || []) add(l.label, { kind: 'link', id: l.id, label: l.label });
  for (const t of state.topics || []) {
    add(t.name, { kind: 'topic', id: t.id, label: t.name, moduleId: t.moduleId || null });
  }
  return index;
}

export function resolveIn(index, target) {
  if (!index) return null;
  return index.get(norm(target)) || null;
}

export function resolveLink(state, target) {
  return resolveIn(linkIndex(state), target);
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

/**
 * Unique outgoing links of a note, in body order.
 * -> [{target, label, raw, count, index, entry}]
 */
export function outgoingLinks(state, noteId, index) {
  const note = (state.notes || []).find((n) => n.id === noteId);
  if (!note) return [];
  const idx = index || linkIndex(state);
  const byKey = new Map();
  const out = [];
  for (const link of parseWikiLinks(note.body)) {
    const key = norm(link.target);
    if (byKey.has(key)) {
      byKey.get(key).count += 1;
      continue;
    }
    const entry = {
      target: link.target,
      label: link.label,
      raw: link.raw,
      count: 1,
      index: link.index,
      entry: resolveIn(idx, link.target),
    };
    byKey.set(key, entry);
    out.push(entry);
  }
  return out;
}

/** Body with all wiki-link markup removed (for plain-text mention checks). */
function stripWikiMarkup(body) {
  return String(body || '').replace(/\[\[[^\[\]\n]{1,200}\]\]/g, ' ');
}

/**
 * Notes whose plain text mentions the note title, without already
 * linking to it. Titles shorter than 3 chars are ignored (too noisy).
 * -> array of note objects
 */
export function unlinkedMentions(state, noteId) {
  const note = (state.notes || []).find((n) => n.id === noteId);
  if (!note || !note.title || note.title.trim().length < 3) return [];
  const needle = norm(note.title);
  if (!needle) return [];
  return (state.notes || []).filter((n) => {
    if (n.id === noteId) return false;
    if (parseWikiLinks(n.body).some((l) => norm(l.target) === needle)) return false;
    return norm(stripWikiMarkup(n.body)).includes(needle);
  });
}

function insideWikiLink(text, index) {
  const open = text.lastIndexOf('[[', index);
  const close = text.lastIndexOf(']]', index);
  return open > close;
}

/**
 * Bracket the first plain-text mention of `title` in a body.
 * Case-insensitive, skips occurrences already inside [[...]].
 * Returns the original body when nothing safe was found.
 */
export function linkFirstMention(body, title) {
  const text = String(body || '');
  const target = String(title || '').trim();
  if (!target) return text;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'gi');
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!insideWikiLink(text, m.index)) {
      return `${text.slice(0, m.index)}[[${m[0]}]]${text.slice(m.index + m[0].length)}`;
    }
    re.lastIndex = m.index + 1;
  }
  return text;
}

/**
 * Rewrite every [[oldTitle]] / [[oldTitle|alias]] to the new target.
 * Case-insensitive on the stored target; aliases are preserved.
 * Returns the new body string (unchanged when nothing matches).
 */
export function rewriteWikiTargets(body, oldTitle, newTitle) {
  const text = String(body || '');
  const oldKey = norm(oldTitle);
  const next = String(newTitle || '').trim();
  if (!oldKey || !next) return text;
  const links = parseWikiLinks(text);
  if (!links.length) return text;
  let out = '';
  let cursor = 0;
  let changed = false;
  for (const link of links) {
    if (norm(link.target) !== oldKey) continue;
    changed = true;
    out += text.slice(cursor, link.index);
    out += link.label && link.label !== link.target
      ? `[[${next}|${link.label}]]`
      : `[[${next}]]`;
    cursor = link.index + link.raw.length;
  }
  if (!changed) return text;
  out += text.slice(cursor);
  return out;
}

/** Split a body into text and link segments for rendering. */
export function bodySegments(body) {
  const text = String(body || '');
  const segments = [];
  let cursor = 0;
  for (const link of parseWikiLinks(text)) {
    if (link.index > cursor) segments.push({ type: 'text', text: text.slice(cursor, link.index) });
    segments.push({ type: 'link', target: link.target, label: link.label, raw: link.raw });
    cursor = link.index + link.raw.length;
  }
  if (cursor < text.length) segments.push({ type: 'text', text: text.slice(cursor) });
  return segments;
}
