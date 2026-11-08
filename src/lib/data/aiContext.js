/**
 * AI context assembly: @-mention parsing, reference resolution and the prompt
 * block. Pure and DOM-free so Node tests can import it.
 */

import { todayKey, daysUntil, relativeDayLabel, formatDate } from './dates.js';
import { pickStartHere, openHomework, doneHomework } from './startHere.js';
import { checklistForDay } from './checklist.js';
import { upcomingDeadlines } from './deadlines.js';
import { nextLesson, lessonLabel, sortedLessons } from './schedule.js';
import { describeRecurrence } from './recurrence.js';

export const MAX_REF_CHARS = 8000;
export const MAX_TOTAL_CHARS = 24000;

export const SYSTEM_PROMPT = [
  'Du bist der lokale Lernassistent in Study Hub.',
  'Antworte auf Deutsch, ruhig und knapp.',
  'Nutze ausschließlich den bereitgestellten Kontext. Erfinde keine Termine, Noten oder Fakten.',
  'Wenn eine Information nicht im Kontext steht, antworte: „Nicht im Kontext.“',
  'Nenne die Abschnittsnamen, auf die du dich stützt. Fasse dich kurz, außer die Frage verlangt mehr.',
].join(' ');

const BUILTIN_ALIASES = {
  heute: 'heute',
  today: 'heute',
  hausaufgaben: 'hausaufgaben',
  homework: 'hausaufgaben',
  module: 'module',
  modules: 'module',
  modul: 'module',
  notizen: 'notizen',
  notes: 'notizen',
  prüfungen: 'prüfungen',
  pruefungen: 'prüfungen',
  prüfung: 'prüfungen',
  pruefung: 'prüfungen',
  exams: 'prüfungen',
  kalender: 'kalender',
  calendar: 'kalender',
  links: 'links',
  fokus: 'fokus',
  focus: 'fokus',
  seite: 'seite',
  page: 'seite',
  hub: 'hub',
  alles: 'hub',
};

const BUILTIN_REFS = [
  { ref: 'heute', token: '@heute', label: 'Heute', group: 'Seiten' },
  { ref: 'hausaufgaben', token: '@hausaufgaben', label: 'Hausaufgaben', group: 'Seiten' },
  { ref: 'module', token: '@module', label: 'Module', group: 'Seiten' },
  { ref: 'notizen', token: '@notizen', label: 'Notizen', group: 'Seiten' },
  { ref: 'prüfungen', token: '@prüfungen', label: 'Prüfungen', group: 'Seiten' },
  { ref: 'kalender', token: '@kalender', label: 'Kalender', group: 'Seiten' },
  { ref: 'links', token: '@links', label: 'Links', group: 'Seiten' },
  { ref: 'fokus', token: '@fokus', label: 'Fokus', group: 'Seiten' },
  { ref: 'seite', token: '@seite', label: 'Letzte Seite', group: 'Seiten' },
  { ref: 'hub', token: '@hub', label: 'Ganzer Hub', group: 'Überblick' },
];

function fold(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss');
}

/** Turn an @token into a stable reference string, or null when unknown. */
export function canonicalRef(raw) {
  const token = String(raw || '').replace(/^@/, '').trim();
  if (!token) return null;
  const lower = token.toLowerCase();
  if (BUILTIN_ALIASES[lower]) return BUILTIN_ALIASES[lower];
  if (BUILTIN_ALIASES[fold(lower)]) return BUILTIN_ALIASES[fold(lower)];

  const note = /^(?:notiz|note)\/([A-Za-z0-9_-]+)$/i.exec(token);
  if (note) return `notiz/${note[1]}`;
  const module = /^(?:modul|module)\/([A-Za-z0-9_-]+)$/i.exec(token);
  if (module) return `modul/${module[1]}`;
  const exam = /^(?:prüfung|pruefung|exam)\/([A-Za-z0-9_-]+)$/i.exec(token);
  if (exam) return `prüfung/${exam[1]}`;
  if (/^[A-Za-z]{1,6}\d{1,4}$/.test(token)) return `code:${lower}`;
  return null;
}

/**
 * @returns {{refs:string[], cleanText:string}}
 */
export function parseMentions(text) {
  const input = String(text || '');
  const refs = [];
  let clean = '';
  let last = 0;
  const re = /(^|\s)@([A-Za-zÀ-ÿ0-9_./-]+)/g;
  let match;
  while ((match = re.exec(input)) !== null) {
    const ref = canonicalRef(match[2]);
    if (!ref) continue;
    refs.push(ref);
    clean += input.slice(last, match.index) + match[1];
    last = match.index + match[0].length;
  }
  clean += input.slice(last);
  return {
    refs: [...new Set(refs)],
    cleanText: clean.replace(/[ \t]{2,}/g, ' ').trim(),
  };
}

/** Entries for the mention picker. */
export function listContextRefs(state, route, now = new Date()) {
  const refs = [...BUILTIN_REFS];
  for (const m of state?.modules || []) {
    const label = [m.code, m.title].filter(Boolean).join(' · ') || 'Modul';
    if (m.code) refs.push({ ref: `code:${m.code.toLowerCase()}`, token: `@${m.code}`, label, group: 'Module' });
    else refs.push({ ref: `modul/${m.id}`, token: `@modul/${m.id}`, label, group: 'Module' });
  }
  for (const n of [...(state?.notes || [])].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 40)) {
    refs.push({ ref: `notiz/${n.id}`, token: `@notiz/${n.id}`, label: n.title || 'Ohne Titel', group: 'Notizen' });
  }
  return refs;
}

function moduleLabel(state, id) {
  const mod = (state?.modules || []).find((m) => m.id === id);
  if (!mod) return '';
  return [mod.code, mod.title].filter(Boolean).join(' · ');
}

function short(text, max) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function line(...parts) {
  return parts.filter((p) => p !== null && p !== undefined && p !== '').join(' · ');
}

function dueLabel(date, now) {
  if (!date) return 'ohne Datum';
  return `${formatDate(date, 'short')} (${relativeDayLabel(date, now)})`;
}

function heuteText(state, now) {
  const lines = ['# Heute'];
  const start = pickStartHere(state, now);
  if (start) {
    lines.push(`Nächster Schritt: ${start.kind === 'exam' ? 'Prüfung' : 'Hausaufgabe'} „${start.item.title}“`);
    if (start.days !== null) lines.push(`Abstand: ${start.days} Tage`);
  } else {
    lines.push('Kein nächster Schritt.');
  }
  const checklist = checklistForDay(state, now);
  lines.push('', '## Tagesliste');
  for (const item of checklist.items) lines.push(`- [${item.checked ? 'x' : ' '}] ${item.text}`);

  const deadlines = upcomingDeadlines(state, { now, limit: 5 });
  if (deadlines.length) {
    lines.push('', '## Nächste Fristen');
    for (const entry of deadlines) lines.push(`- ${dueLabel(entry.date, now)}: ${entry.item.title}`);
  }
  const lesson = nextLesson(state, now);
  if (lesson) {
    lines.push('', `## Nächste Lektion`, `- ${lessonLabel(state, lesson.lesson)} · ${lesson.date} · ${lesson.lesson.start}–${lesson.lesson.end}`);
  }
  return lines.join('\n');
}

function homeworkText(state, now) {
  const open = openHomework(state).slice(0, 50);
  const done = doneHomework(state).slice(0, 20);
  const lines = ['# Hausaufgaben'];
  lines.push('', `## Offen (${open.length})`);
  if (!open.length) lines.push('Keine offenen Hausaufgaben.');
  for (const hw of open) {
    lines.push(
      `- ${line(hw.title, moduleLabel(state, hw.moduleId), `fällig ${dueLabel(hw.dueDate, now)}`, describeRecurrence(hw.recurrence))}`,
    );
  }
  lines.push('', `## Kürzlich erledigt (${done.length})`);
  if (!done.length) lines.push('Noch nichts erledigt.');
  for (const hw of done) {
    lines.push(`- ${line(hw.title, moduleLabel(state, hw.moduleId), hw.dueDate ? dueLabel(hw.dueDate, now) : '')}`);
  }
  return lines.join('\n');
}

function moduleText(state, moduleId, now) {
  const mod = (state?.modules || []).find((m) => m.id === moduleId);
  if (!mod) return null;
  const topics = (state.topics || []).filter((t) => t.moduleId === mod.id).map((t) => t.name);
  const open = openHomework({ homework: (state.homework || []).filter((h) => h.moduleId === mod.id) });
  const exams = (state.exams || []).filter((e) => e.moduleId === mod.id).sort((a, b) => (a.date < b.date ? -1 : 1));
  const notes = (state.notes || [])
    .filter((n) => n.moduleId === mod.id)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 10);

  const lines = [`# Modul ${line(mod.code, mod.title)}`];
  if (topics.length) lines.push('', `## Themen`, ...topics.map((t) => `- ${t}`));
  lines.push('', '## Offene Hausaufgaben');
  if (!open.length) lines.push('Keine.');
  for (const hw of open) lines.push(`- ${line(hw.title, `fällig ${dueLabel(hw.dueDate, now)}`)}`);
  lines.push('', '## Prüfungen');
  if (!exams.length) lines.push('Keine.');
  for (const exam of exams) {
    lines.push(`- ${line(exam.title, exam.date ? dueLabel(exam.date, now) : '', exam.grade != null ? `Note ${exam.grade}` : '')}`);
  }
  lines.push('', '## Notizen');
  if (!notes.length) lines.push('Keine.');
  for (const note of notes) lines.push(`- ${note.title}: ${short(note.body, 400)}`);
  return lines.join('\n');
}

function modulesText(state) {
  const lines = ['# Programme und Module'];
  for (const program of state.programs || []) {
    lines.push('', `## ${program.name}${program.code ? ` (${program.code})` : ''}`);
    const mods = (state.modules || []).filter((m) => m.programId === program.id);
    if (!mods.length) lines.push('Keine Module.');
    for (const mod of mods) {
      const topics = (state.topics || []).filter((t) => t.moduleId === mod.id).map((t) => t.name);
      const open = (state.homework || []).filter((h) => h.moduleId === mod.id && !h.done).length;
      const notes = (state.notes || []).filter((n) => n.moduleId === mod.id).length;
      const exams = (state.exams || []).filter((e) => e.moduleId === mod.id).length;
      lines.push(
        `- ${line(mod.code, mod.title)}: ${topics.length} Themen, ${open} offene Hausaufgaben, ${notes} Notizen, ${exams} Prüfungen`,
      );
      if (topics.length) lines.push(`  Themen: ${topics.join(', ')}`);
    }
  }
  return lines.join('\n');
}

function noteText(state, noteId) {
  const note = (state?.notes || []).find((n) => n.id === noteId);
  if (!note) return null;
  const attachments = (note.attachments || []).map((a) => a.name).filter(Boolean);
  return [
    `# ${note.title || 'Ohne Titel'}`,
    line(moduleLabel(state, note.moduleId), note.type ? `Typ: ${note.type}` : ''),
    attachments.length ? `Anhänge: ${attachments.join(', ')}` : '',
    '',
    note.body || '(kein Text)',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

function notesText(state) {
  const notes = [...(state.notes || [])]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 15);
  const lines = ['# Letzte Notizen'];
  if (!notes.length) lines.push('Keine Notizen.');
  for (const note of notes) {
    lines.push('', `## ${note.title || 'Ohne Titel'}`, line(moduleLabel(state, note.moduleId), note.type || ''), short(note.body, 400));
  }
  return lines.join('\n');
}

function examsText(state, now) {
  const today = todayKey(now);
  const exams = [...(state.exams || [])].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const upcoming = exams.filter((e) => e.date && e.date >= today).slice(0, 30);
  const past = exams.filter((e) => !e.date || e.date < today).reverse().slice(0, 30);
  const lines = ['# Prüfungen'];
  lines.push('', `## Anstehend (${upcoming.length})`);
  if (!upcoming.length) lines.push('Keine anstehenden Prüfungen.');
  for (const exam of upcoming) {
    lines.push(`- ${line(exam.title, moduleLabel(state, exam.moduleId), dueLabel(exam.date, now), exam.notes ? short(exam.notes, 200) : '')}`);
  }
  lines.push('', `## Vorbei (${past.length})`);
  if (!past.length) lines.push('Keine vergangenen Prüfungen.');
  for (const exam of past) {
    lines.push(
      `- ${line(exam.title, moduleLabel(state, exam.moduleId), exam.date ? dueLabel(exam.date, now) : '', exam.grade != null ? `Note ${exam.grade}` : '', exam.gradeNote ? short(exam.gradeNote, 160) : '')}`,
    );
  }
  return lines.join('\n');
}

function examText(state, examId, now) {
  const exam = (state?.exams || []).find((e) => e.id === examId);
  if (!exam) return null;
  return [
    `# Prüfung ${exam.title || ''}`,
    line(moduleLabel(state, exam.moduleId), exam.date ? dueLabel(exam.date, now) : 'ohne Datum'),
    exam.grade != null ? `Note: ${exam.grade}` : '',
    exam.gradeNote ? `Bemerkung: ${exam.gradeNote}` : '',
    '',
    exam.notes || '(keine Notizen)',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

function calendarText(state, now) {
  const deadlines = upcomingDeadlines(state, { now, limit: 200, includePastExams: false }).filter(
    (entry) => entry.days !== null && entry.days >= 0 && entry.days <= 30,
  );
  const lines = ['# Kalender'];
  lines.push('', '## Fristen in den nächsten 30 Tagen');
  if (!deadlines.length) lines.push('Keine Fristen.');
  for (const entry of deadlines) lines.push(`- ${dueLabel(entry.date, now)}: ${entry.item.title} (${entry.kind})`);

  lines.push('', '## Stundenplan');
  if (!(state.lessons || []).length) lines.push('Keine Lektionen.');
  for (const lesson of sortedLessons(state)) {
    lines.push(`- Wochentag ${lesson.dayOfWeek}: ${lesson.start}–${lesson.end} ${line(lessonLabel(state, lesson), lesson.room)}`);
  }
  return lines.join('\n');
}

function linksText(state) {
  const lines = ['# Links'];
  if (!(state.links || []).length) lines.push('Keine Links.');
  for (const link of state.links || []) {
    lines.push(`- ${line(link.label, link.kind, moduleLabel(state, link.moduleId))}: ${link.url}`);
  }
  return lines.join('\n');
}

function focusText(pomodoro) {
  if (!pomodoro) return '# Fokus\n\nKein Fokus-Timer aktiv.';
  return [
    '# Fokus',
    '',
    `Phase: ${pomodoro.phase || 'unbekannt'}`,
    `Status: ${pomodoro.status || 'unbekannt'}`,
    pomodoro.remainingMs != null ? `Verbleibend: ${Math.ceil(pomodoro.remainingMs / 60000)} Minuten` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function hubText(state, now) {
  const lines = ['# Study Hub Überblick'];
  for (const program of state.programs || []) {
    const mods = (state.modules || []).filter((m) => m.programId === program.id);
    lines.push('', `## ${program.name}`, `Module: ${mods.map((m) => line(m.code, m.title)).join(', ') || 'keine'}`);
  }

  const open = openHomework(state);
  lines.push('', `## Offene Hausaufgaben (${open.length})`);
  if (!open.length) lines.push('Keine.');
  for (const hw of open) {
    lines.push(`- ${line(hw.title, moduleLabel(state, hw.moduleId), hw.dueDate ? dueLabel(hw.dueDate, now) : 'ohne Datum')}`);
  }

  const today = todayKey(now);
  const exams = (state.exams || []).filter((e) => e.date && e.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));
  lines.push('', '## Anstehende Prüfungen');
  if (!exams.length) lines.push('Keine.');
  for (const exam of exams) lines.push(`- ${line(exam.title, moduleLabel(state, exam.moduleId), dueLabel(exam.date, now))}`);

  const past = (state.exams || []).filter((e) => e.grade != null).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10);
  if (past.length) {
    lines.push('', '## Frühere Noten');
    for (const exam of past) lines.push(`- ${line(exam.title, moduleLabel(state, exam.moduleId), `Note ${exam.grade}`)}`);
  }

  const deadlines = upcomingDeadlines(state, { now, limit: 50 }).filter((entry) => entry.days !== null && entry.days >= 0 && entry.days <= 14);
  lines.push('', '## Fristen in 14 Tagen');
  if (!deadlines.length) lines.push('Keine.');
  for (const entry of deadlines) lines.push(`- ${dueLabel(entry.date, now)}: ${entry.item.title}`);

  const noteTitles = [...(state.notes || [])].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 20).map((n) => n.title);
  lines.push('', '## Letzte Notizen');
  lines.push(noteTitles.length ? noteTitles.map((t) => `- ${t}`).join('\n') : 'Keine.');

  lines.push('', '## Stundenplan');
  const lessons = sortedLessons(state);
  lines.push(lessons.length ? lessons.map((l) => `- Wochentag ${l.dayOfWeek}: ${l.start}–${l.end} ${lessonLabel(state, l)}`).join('\n') : 'Keine Lektionen.');

  let text = lines.join('\n');
  if (text.length > MAX_TOTAL_CHARS) {
    // Drop note titles first, then the lesson grid, as agreed in the plan.
    const withoutNotes = text.replace(/\n\n## Letzte Notizen[\s\S]*?(?=\n\n## Stundenplan)/, '');
    text = withoutNotes.length > MAX_TOTAL_CHARS ? withoutNotes.replace(/\n\n## Stundenplan[\s\S]*$/, '') : withoutNotes;
  }
  return text;
}

function pageText(state, route, opts) {
  const now = opts.now;
  const name = opts.lastRoute?.name || route?.name;
  const id = opts.lastRoute?.id || route?.id;
  switch (name) {
    case 'homework':
      return { label: 'Letzte Seite: Hausaufgaben', text: homeworkText(state, now) };
    case 'modules':
      return { label: 'Letzte Seite: Module', text: modulesText(state) };
    case 'module': {
      const text = moduleText(state, id, now);
      return text ? { label: 'Letzte Seite: Modul', text } : null;
    }
    case 'notes':
      return { label: 'Letzte Seite: Notizen', text: notesText(state) };
    case 'note': {
      const text = noteText(state, id);
      return text ? { label: 'Letzte Seite: Notiz', text } : null;
    }
    case 'exams':
      return { label: 'Letzte Seite: Prüfungen', text: examsText(state, now) };
    case 'calendar':
      return { label: 'Letzte Seite: Kalender', text: calendarText(state, now) };
    case 'links':
      return { label: 'Letzte Seite: Links', text: linksText(state) };
    case 'focus':
      return { label: 'Letzte Seite: Fokus', text: focusText(opts.pomodoro) };
    default:
      return { label: 'Letzte Seite: Heute', text: heuteText(state, now) };
  }
}

function buildSection(state, ref, opts) {
  const now = opts.now;
  switch (ref) {
    case 'heute':
      return { ref, label: 'Heute', text: heuteText(state, now) };
    case 'hausaufgaben':
      return { ref, label: 'Hausaufgaben', text: homeworkText(state, now) };
    case 'module':
      return { ref, label: 'Module', text: modulesText(state) };
    case 'notizen':
      return { ref, label: 'Notizen', text: notesText(state) };
    case 'prüfungen':
      return { ref, label: 'Prüfungen', text: examsText(state, now) };
    case 'kalender':
      return { ref, label: 'Kalender', text: calendarText(state, now) };
    case 'links':
      return { ref, label: 'Links', text: linksText(state) };
    case 'fokus':
      return { ref, label: 'Fokus', text: focusText(opts.pomodoro) };
    case 'seite': {
      const page = pageText(state, opts.route, opts);
      return page ? { ref, label: page.label, text: page.text } : null;
    }
    case 'hub':
      return { ref, label: 'Ganzer Hub', text: hubText(state, now) };
    default:
      break;
  }
  if (ref.startsWith('notiz/')) {
    const text = noteText(state, ref.slice('notiz/'.length));
    return text ? { ref, label: `Notiz: ${(state.notes || []).find((n) => `notiz/${n.id}` === ref)?.title || 'Notiz'}`, text } : null;
  }
  if (ref.startsWith('modul/')) {
    const text = moduleText(state, ref.slice('modul/'.length), now);
    return text ? { ref, label: `Modul: ${moduleLabel(state, ref.slice('modul/'.length))}`, text } : null;
  }
  if (ref.startsWith('prüfung/')) {
    const text = examText(state, ref.slice('prüfung/'.length), now);
    return text ? { ref, label: 'Prüfung', text } : null;
  }
  if (ref.startsWith('code:')) {
    const code = ref.slice('code:'.length);
    const mod = (state.modules || []).find((m) => String(m.code || '').toLowerCase() === code);
    if (!mod) return null;
    const text = moduleText(state, mod.id, now);
    return text ? { ref, label: `Modul: ${moduleLabel(state, mod.id)}`, text } : null;
  }
  return null;
}

function truncateAtLine(text, max) {
  if (text.length <= max) return { text, truncated: false };
  let cut = text.slice(0, Math.max(0, max - 2));
  const newline = cut.lastIndexOf('\n');
  if (newline > max * 0.5) cut = cut.slice(0, newline);
  return { text: `${cut.trimEnd()}\n…`, truncated: true };
}

/**
 * @returns {{sections:Array<{ref:string,label:string,text:string,truncated:boolean}>, totalChars:number, truncated:boolean}}
 */
export function resolveContext(state, route, refs, opts = {}) {
  const now = opts.now || new Date();
  const options = { ...opts, now, route };
  const sections = [];
  const seen = new Set();

  for (const raw of refs || []) {
    const ref = canonicalRef(raw) || String(raw || '');
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    const section = buildSection(state, ref, options);
    if (section?.text) sections.push({ ...section, truncated: false });
  }

  const out = [];
  let used = 0;
  let truncated = false;
  for (const section of sections) {
    const remaining = MAX_TOTAL_CHARS - used;
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    let text = section.text;
    let cut = truncateAtLine(text, MAX_REF_CHARS);
    text = cut.text;
    let sectionTruncated = cut.truncated;
    if (text.length > remaining) {
      cut = truncateAtLine(text, remaining);
      text = cut.text;
      sectionTruncated = true;
      truncated = true;
    }
    out.push({ ...section, text, truncated: sectionTruncated });
    used += text.length;
  }
  if (out.some((s) => s.truncated)) truncated = true;

  return { sections: out, totalChars: used, truncated };
}

export function buildContextBlock(result) {
  const sections = result?.sections || [];
  if (!sections.length) return '<context>\nKein Kontext ausgewählt.\n</context>';
  const parts = ['<context>'];
  for (const section of sections) {
    parts.push('', `## ${section.label}${section.truncated ? ' (gekürzt)' : ''}`, section.text);
  }
  parts.push('', '</context>');
  return parts.join('\n');
}
