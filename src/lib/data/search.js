/**
 * In-memory search over every collection. Pure and DOM-free.
 * Deliberately simple: substring matching is enough for 100–500 notes.
 */

function norm(value) {
  return String(value || '').toLowerCase().trim();
}

function matches(haystack, needle) {
  return norm(haystack).includes(needle);
}

function score(title, needle) {
  const t = norm(title);
  if (!t) return 0;
  if (t === needle) return 100;
  if (t.startsWith(needle)) return 60;
  if (t.includes(needle)) return 30;
  return 0;
}

/**
 * @returns {{notes:Array, homework:Array, modules:Array, exams:Array, links:Array}}
 */
export function searchAll(state, query, limit = 8) {
  const q = norm(query);
  const empty = { notes: [], homework: [], modules: [], exams: [], links: [] };
  if (!q) return empty;

  const modulesById = new Map((state.modules || []).map((m) => [m.id, m]));

  const notes = (state.notes || [])
    .map((n) => ({ item: n, s: score(n.title, q) + (matches(n.body, q) ? 10 : 0) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || (b.item.updatedAt || 0) - (a.item.updatedAt || 0))
    .slice(0, limit)
    .map((r) => r.item);

  const homework = (state.homework || [])
    .map((h) => ({ item: h, s: score(h.title, q) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((r) => r.item);

  const modules = (state.modules || [])
    .map((m) => ({ item: m, s: score(m.title, q) + score(m.code, q) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((r) => r.item);

  const exams = (state.exams || [])
    .map((e) => ({
      item: e,
      s: score(e.title, q) + (matches(modulesById.get(e.moduleId)?.title, q) ? 10 : 0),
    }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || (a.item.date < b.item.date ? -1 : 1))
    .slice(0, limit)
    .map((r) => r.item);

  const links = (state.links || [])
    .map((l) => ({ item: l, s: score(l.label, q) + (matches(l.url, q) ? 5 : 0) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((r) => r.item);

  return { notes, homework, modules, exams, links };
}

export function totalResults(result) {
  return Object.values(result).reduce((n, arr) => n + arr.length, 0);
}
