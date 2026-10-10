/**
 * Utility helpers
 */

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function escapeAttr(s) {
  return escapeHtml(s).replace(/\n/g, '&#10;');
}

export function getWeakestObjective(state, moduleId = null) {
  const list = state.learningObjectives
    .filter(o => (moduleId ? o.moduleId === moduleId : true) && o.status !== 'done');
  if (!list.length) return null;
  return [...list].sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0))[0];
}

/**
 * Single home for "next exam" — per module, or across all modules when
 * moduleId is omitted. Only ungraded exams with a date count.
 * Mock exams never count: they are practice, not upcoming obligations.
 */
export function getNextExam(state, moduleId = null) {
  return state.exams
    .filter(e => !e.isMock && (moduleId ? e.moduleId === moduleId : true) && e.date && !getExamGrade(e))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0] || null;
}

/**
 * Single home for per-module stats.
 */
export function getModuleStats(state, moduleId) {
  const objectives = state.learningObjectives.filter(o => o.moduleId === moduleId);
  const resources = state.resources.filter(r => r.moduleId === moduleId);
  const sessions = state.studySessions.filter(s => s.moduleId === moduleId);

  const now = new Date();
  const { start: weekStart } = getWeekDateRange(getCurrentWeekNumber(now), now.getFullYear());

  const thisWeek = sessions.filter(s => new Date(s.startTime) >= weekStart);

  return {
    objectivesTotal: objectives.length,
    objectivesDone: objectives.filter(o => o.status === 'done').length,
    resourcesTotal: resources.length,
    // Library semantics: a resource counts as done when explicitly understood
    // (legacy status==='done' kept for back-compat). Usage alone never counts.
    resourcesDone: resources.filter(r => r.understood || r.status === 'done').length,
    totalStudyTime: sessions.reduce((sum, s) => sum + (s.duration || 0), 0),
    sessionsThisWeek: thisWeek.reduce((sum, s) => sum + (s.duration || 0), 0)
  };
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('de-CH', {
      day: '2-digit', month: 'long', year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

export function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleString('de-CH', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return isoStr;
  }
}

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.ceil((target - today) / 86400000);
}

export function countdownParts(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T08:00:00');
  const now = new Date();
  const diff = target - now;
  if (diff <= 0) return { d: 0, h: 0, m: 0, past: true };
  return {
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    past: false
  };
}

export function getExamGrade(exam) {
  if (exam.score === '' || exam.max === '' || !exam.max) return null;
  const s = parseFloat(exam.score), m = parseFloat(exam.max);
  if (isNaN(s) || isNaN(m) || m <= 0) return null;
  return 1 + 5 * (s / m);
}

export function calculateProjection(state, moduleId, targetGrade) {
  // Mock exams are zero-weight practice: excluded explicitly so a mock
  // result can never move the real grade projection.
  const exams = state.exams.filter(e => e.moduleId === moduleId && !e.isMock);
  const totalWeight = exams.reduce((s, e) => s + (+e.weight || 0), 0);
  const done = exams.filter(e => getExamGrade(e) !== null);
  const remaining = exams.filter(e => getExamGrade(e) === null && +e.weight > 0);
  const remWeight = remaining.reduce((s, e) => s + (+e.weight || 0), 0);
  if (!totalWeight || !remWeight) return null;
  const earned = done.reduce((s, e) => s + getExamGrade(e) * (+e.weight || 0), 0);
  const needed = (targetGrade * totalWeight - earned) / remWeight;
  return { needed, remainingWeight: remWeight, reachable: needed <= 6 && needed >= 1 };
}

/**
 * ISO 8601 week number (Thursday rule): week 1 contains the first Thursday.
 */
export function getCurrentWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - day + 3); // shift to Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const fday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fday + 3);
  return 1 + Math.round((d - firstThursday) / 6048e5);
}

/**
 * ISO week date range (Monday 00:00 → Sunday 23:59:59, local time).
 */
export function getWeekDateRange(weekNum, year = new Date().getFullYear()) {
  // Monday of ISO week 1 = Monday of the week containing Jan 4
  const jan4 = new Date(year, 0, 4);
  const jan4Day = (jan4.getDay() + 6) % 7; // Mon=0
  const monday1 = new Date(year, 0, 4 - jan4Day);
  monday1.setHours(0, 0, 0, 0);
  const start = new Date(monday1);
  start.setDate(monday1.getDate() + (weekNum - 1) * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Weekly review evidence — facts for reflection, computed live from activity.
 * Returns everything the 5-minute review shows beside its three questions:
 * time studied, sessions, objectives touched (via sessions), objectives
 * reviewed (via review history), and exam/mock results dated in the week.
 * Pass moduleId to scope to one module; omit for the global picture.
 */
export function getWeekActivity(state, week, year, moduleId = null) {
  const { start, end } = getWeekDateRange(week, year);
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const startStr = ymd(start);
  const endStr = ymd(end);

  const sessions = state.studySessions
    .filter(s => (!moduleId || s.moduleId === moduleId) &&
      new Date(s.startTime) >= start && new Date(s.startTime) <= end)
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  const studyTime = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);

  const touchedIds = new Set();
  sessions.forEach(s => (s.linkedObjectiveIds || []).forEach(id => touchedIds.add(id)));
  const touched = [...touchedIds]
    .map(id => state.learningObjectives.find(o => o.id === id))
    .filter(o => o && (!moduleId || o.moduleId === moduleId))
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));

  const reviewed = state.learningObjectives
    .filter(o => (!moduleId || o.moduleId === moduleId) &&
      (o.reviewHistory || []).some(e => {
        const ts = new Date(e.timestamp).getTime();
        return ts >= start.getTime() && ts <= end.getTime();
      }))
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));

  const exams = state.exams
    .filter(e => (!moduleId || e.moduleId === moduleId) && e.date && e.date >= startStr && e.date <= endStr)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .map(e => ({ id: e.id, name: e.name, date: e.date, grade: getExamGrade(e), isMock: !!e.isMock, moduleId: e.moduleId }));

  return { start, end, sessions, studyTime, sessionCount: sessions.length, touched, reviewed, exams };
}

/** True when a review already exists for the given week (optionally scoped). */
export function hasWeeklyReview(state, week, year, moduleId = null) {
  return state.weeklyReviews.some(r =>
    r.week === week && r.year === year &&
    (moduleId ? (r.moduleId === moduleId || !r.moduleId) : true));
}

/**
 * Forward-looking review input: what needs attention next.
 *
 * Pure read-only aggregation for weekly reviews — due (spaced) reviews,
 * top weakness signals, and unfinished past-week plan items — scoped to
 * one module or, when moduleId is null, across all modules.
 * Nothing here writes, merges, or deletes user data.
 */
export function getReviewAttention(state, { moduleId = null, limit = 5, now = Date.now() } = {}) {
  const allDue = getDueObjectives(state, moduleId, now);
  const weakSpots = getWeakSpots(state, { moduleId, limit: 3 });
  const scopes = moduleId ? [moduleId] : (state.modules || []).map(m => m.id);
  const leftovers = scopes
    .flatMap(id => getPlanLeftovers(state, id, new Date(now)))
    .sort((a, b) => (a.week - b.week) || ((a.createdAt || 0) - (b.createdAt || 0)))
    .slice(0, limit);
  return {
    due: allDue.slice(0, limit),
    dueCount: allDue.length,
    weakSpots,
    leftovers,
  };
}

/**
 * Adaptive plan — weeks are suggestions, not a cage.
 *
 * Drift detection: an open, non-dropped item whose suggested week's Sunday
 * has passed while "now" is in a later week is a leftover — reality has
 * diverged from the schedule. (Week numbers are ISO weeks of the current
 * year; a higher week number always reads as "upcoming suggestion".)
 */

/** Sunday (end of day) of an ISO week — the moment a suggestion expires. */
export function getPlanItemWeekEnd(weekNum, year = new Date().getFullYear()) {
  return getWeekDateRange(parseInt(weekNum) || 1, year).end;
}

export function isPlanItemLeftover(item, now = new Date()) {
  if (!item || item.done || item.dropped) return false;
  const currentWeek = getCurrentWeekNumber(now);
  const { start } = getWeekDateRange(currentWeek, now.getFullYear());
  return getPlanItemWeekEnd(item.week, now.getFullYear()) < start;
}

/** Unfinished past-week items, oldest suggestion first. Never a wall of shame — callers consolidate these into one reality check. */
export function getPlanLeftovers(state, moduleId, now = new Date()) {
  return state.planItems
    .filter(p => p.moduleId === moduleId && isPlanItemLeftover(p, now))
    .sort((a, b) => (a.week - b.week) || ((a.createdAt || 0) - (b.createdAt || 0)));
}

/**
 * How reality treats a plan item: session minutes logged against its linked
 * objectives since it was planned, plus linked-objective progress.
 * Suggests completion only when the linked work is actually done or solid —
 * never from mere activity alone.
 */
export function getPlanItemActivity(state, item) {
  const linkedIds = item?.linkedObjectiveIds || [];
  const linked = linkedIds
    .map(id => state.learningObjectives.find(o => o.id === id))
    .filter(Boolean);
  let minutesSincePlan = 0;
  let sessionCount = 0;
  if (linked.length) {
    const since = item.createdAt || 0;
    for (const s of state.studySessions) {
      if (s.moduleId !== item.moduleId) continue;
      if (new Date(s.startTime).getTime() < since) continue;
      if (!(s.linkedObjectiveIds || []).some(id => linkedIds.includes(id))) continue;
      minutesSincePlan += s.duration || 0;
      sessionCount += 1;
    }
  }
  const linkedDone = linked.filter(o => o.status === 'done').length;
  const allDone = linked.length > 0 && linkedDone === linked.length;
  const wellCovered = linked.length > 0 && minutesSincePlan > 0 &&
    linked.every(o => (o.confidence ?? 0) >= 4);
  const suggestedDone = allDone || wellCovered;
  let hint = null;
  if (!item.done && !item.dropped && suggestedDone) {
    hint = allDone
      ? 'Verknüpfte Ziele sind gemeistert — festhalten?'
      : 'Verknüpfte Ziele sitzen (Confidence ≥ 4), Sitzungen vorhanden — festhalten?';
  } else if (!item.done && !item.dropped && minutesSincePlan > 0 && linked.length) {
    hint = `${minutesSincePlan} Min seit Planung an verknüpften Zielen`;
  }
  return { minutesSincePlan, sessionCount, linkedTotal: linked.length, linkedDone, suggestedDone, hint };
}

/** One summary for the plan header: where now meets the schedule. */
export function getPlanReality(state, moduleId, now = new Date()) {
  const items = state.planItems.filter(p => p.moduleId === moduleId);
  const currentWeek = getCurrentWeekNumber(now);
  const leftovers = getPlanLeftovers(state, moduleId, now);
  const openThisWeek = items.filter(p => !p.done && !p.dropped && String(p.week) === String(currentWeek));
  const upcoming = items.filter(p => {
    if (p.done || p.dropped) return false;
    return getPlanItemWeekEnd(p.week, now.getFullYear()) >= getWeekDateRange(currentWeek, now.getFullYear()).start
      && String(p.week) !== String(currentWeek);
  });
  const doneCount = items.filter(p => p.done).length;
  return { currentWeek, leftovers, openThisWeek, upcoming, doneCount, totalCount: items.length };
}

/**
 * Most overdue spaced-repetition review: the objective whose
 * reviewSchedule.nextReview lies furthest in the past. Null when
 * nothing is scheduled or nothing is overdue.
 *
 * History-first: includes status === 'done'. Understood objectives
 * resurface here instead of disappearing ("things marked done first
 * are often forgotten first").
 */
export function getMostOverdueObjective(state) {
  const now = Date.now();
  const overdue = state.learningObjectives
    .filter(o => o.reviewSchedule?.nextReview && o.reviewSchedule.nextReview < now)
    .sort((a, b) => a.reviewSchedule.nextReview - b.reviewSchedule.nextReview);
  return overdue[0] || null;
}

/**
 * All due objectives (incl. done), oldest first. Thin wrapper so views
 * don't need to know the store import.
 */
export function getDueObjectives(state, moduleId = null, now = Date.now()) {
  return state.learningObjectives
    .filter(o => (moduleId ? o.moduleId === moduleId : true)
      && o.reviewSchedule?.nextReview && o.reviewSchedule.nextReview <= now)
    .sort((a, b) => a.reviewSchedule.nextReview - b.reviewSchedule.nextReview);
}

export function isDue(obj, now = Date.now()) {
  return !!(obj?.reviewSchedule?.nextReview && obj.reviewSchedule.nextReview <= now);
}

export function linkedResourceCount(state, obj) {
  if (!obj) return 0;
  return state.resources.filter(r => r.linkedObjectiveIds?.includes(obj.id)).length;
}

/**
 * Library usage — used ≠ understood.
 *
 * Session links are the primary "used" signal (derived live, no writes):
 * every session with this resource in linkedResourceIds counts as one use.
 * Manual marks (resource.usageHistory) cover reads/views outside sessions.
 * Understanding (resource.understood) is never derived here.
 *
 * Returns { sessions, manual, totalUses, lastUsedTs }.
 */
export function getResourceUsage(state, res) {
  if (!res) return { sessions: [], manual: [], totalUses: 0, lastUsedTs: null };
  const sessions = state.studySessions
    .filter(s => s.linkedResourceIds?.includes(res.id))
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  const manual = [...(res.usageHistory || [])].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const lastSessionTs = sessions.length ? (new Date(sessions[0].startTime).getTime() || null) : null;
  const lastManualTs = manual.length ? (manual[0].timestamp || null) : null;
  const lastUsedTs = Math.max(lastSessionTs || 0, lastManualTs || 0, res.lastUsed || 0) || null;
  return { sessions, manual, totalUses: sessions.length + manual.length, lastUsedTs };
}

export function formatLastUsed(ts) {
  if (!ts) return 'nie benutzt';
  return `zuletzt ${new Date(ts).toLocaleDateString('de-CH')}`;
}

export function resourcesForObjective(state, obj) {
  if (!obj) return [];
  return state.resources.filter(r => r.linkedObjectiveIds?.includes(obj.id));
}

export function sessionsForObjective(state, obj, limit = 50) {
  if (!obj) return [];
  return state.studySessions
    .filter(s => s.linkedObjectiveIds?.includes(obj.id))
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
    .slice(0, limit);
}

export function examsForObjective(state, obj) {
  if (!obj) return [];
  return state.exams.filter(e => e.linkedObjectiveIds?.includes(obj.id));
}

export function capturesForObjective(state, obj) {
  if (!obj) return [];
  return state.captures
    .filter(c => c.objectiveId === obj.id)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

export function isImportantCapture(c) {
  const tags = (c.tags || []).map(t => String(t).toLowerCase());
  return tags.some(t => ['wichtig', 'wiederholen', 'prüfung', 'pruefung', 'klausur', 'merken'].includes(t))
    || c.type === 'mistake';
}

/**
 * Rhythm badge for an objective — derived from history, not from a
 * manually ticked status. Keeps the UI from reading like a checklist.
 * Returns { key, label, detail } with key in
 * 'due' | 'soon' | 'resting' | 'active' | 'fresh'.
 */
export function rhythmOf(obj, now = Date.now()) {
  const day = 86400000;
  const next = obj?.reviewSchedule?.nextReview ?? null;
  if (next && next <= now) {
    const days = Math.max(0, Math.floor((now - next) / day));
    return {
      key: 'due',
      label: 'Wieder fällig',
      detail: days === 0 ? 'Review ist heute fällig' : days === 1 ? 'seit gestern fällig' : `seit ${days} Tagen fällig`,
    };
  }
  if (obj?.status === 'done' && next) {
    const days = Math.ceil((next - now) / day);
    return {
      key: 'resting',
      label: 'Verstanden · ruht',
      detail: days <= 1 ? 'Review morgen' : `Review in ${days} Tagen`,
    };
  }
  if (next && next - now <= 3 * day) {
    const days = Math.ceil((next - now) / day);
    return { key: 'soon', label: 'Bald fällig', detail: days <= 1 ? 'Review morgen' : `Review in ${days} Tagen` };
  }
  const touched = obj?.lastTouched || obj?.updatedAt || obj?.createdAt;
  if (!touched) return { key: 'fresh', label: 'Neu', detail: 'noch unberührt' };
  const staleDays = Math.floor((now - touched) / day);
  if ((obj?.totalStudyTime || 0) === 0 && (obj?.reviewHistory?.length || 0) === 0 && staleDays > 14) {
    return { key: 'fresh', label: 'Neu', detail: `angelegt vor ${staleDays} Tagen` };
  }
  if (staleDays <= 0) return { key: 'active', label: 'In Bewegung', detail: 'heute berührt' };
  if (staleDays === 1) return { key: 'active', label: 'In Bewegung', detail: 'gestern berührt' };
  return { key: 'active', label: 'In Bewegung', detail: `vor ${staleDays} Tagen berührt` };
}

export function formatLastTouched(obj) {
  const t = obj?.lastTouched || obj?.updatedAt || obj?.createdAt;
  if (!t) return 'nie';
  return new Date(t).toLocaleDateString('de-CH');
}

export function formatNextReview(obj) {
  const n = obj?.reviewSchedule?.nextReview;
  if (!n) return '—';
  const now = Date.now();
  const date = new Date(n).toLocaleDateString('de-CH');
  if (n <= now) {
    const days = Math.max(0, Math.floor((now - n) / 86400000));
    return days === 0 ? `heute (${date})` : `überfällig seit ${days}d (${date})`;
  }
  return date;
}

/**
 * Unified history timeline for one objective, newest first.
 * Merges: creation, sessions, confidence changes, reviews (incl. the
 * scheduled next review), linked-resource links, linked exams with grades,
 * and linked captures. Views render this — no view re-implements merging.
 *
 * Event: { ts, kind, title, detail?, tone? }
 * kind in 'created' | 'session' | 'confidence' | 'review' | 'scheduled'
 *        | 'resource' | 'exam' | 'capture' | 'note'
 */
export function buildObjectiveTimeline(state, obj) {
  if (!obj) return [];
  const events = [];
  const resById = new Map(state.resources.map(r => [r.id, r]));

  if (obj.createdAt) {
    events.push({ ts: obj.createdAt, kind: 'created', title: 'Angelegt', detail: obj.description || '', tone: 'quiet' });
  }

  for (const s of sessionsForObjective(state, obj, 50)) {
    const ts = new Date(s.startTime).getTime() || s.createdAt || 0;
    const usedRes = (s.linkedResourceIds || []).map(id => resById.get(id)?.name).filter(Boolean);
    events.push({
      ts,
      kind: 'session',
      title: `Sitzung · ${s.duration || 0} Min`,
      detail: [s.note || '', usedRes.length ? `mit ${usedRes.slice(0, 2).join(', ')}${usedRes.length > 2 ? ` +${usedRes.length - 2}` : ''}` : ''].filter(Boolean).join(' — '),
      tone: 'accent',
      refId: s.id,
    });
  }

  for (const h of (obj.confidenceHistory || [])) {
    if (!h.timestamp) continue;
    events.push({
      ts: h.timestamp, kind: 'confidence',
      title: `Confidence → ${h.value}/5`,
      detail: '',
      tone: 'quiet',
    });
  }

  for (const r of (obj.reviewHistory || [])) {
    if (!r.timestamp) continue;
    const label = r.outcome === 'solid' ? 'Review · sitzt' : r.outcome === 'shaky' ? 'Review · wackelig' : 'Review · verloren';
    events.push({
      ts: r.timestamp, kind: 'review', title: label,
      detail: [`nächster Abstand: ${r.interval}d`, r.note || ''].filter(Boolean).join(' — '),
      tone: r.outcome === 'solid' ? 'green' : r.outcome === 'shaky' ? 'amber' : 'red',
    });
  }

  if (obj.reviewSchedule?.nextReview) {
    events.push({
      ts: obj.reviewSchedule.nextReview, kind: 'scheduled',
      title: `Nächstes Review in ${obj.reviewSchedule.interval}d`,
      detail: `Rhythmus #${(obj.reviewHistory?.length || 0) + 1} · ${new Date(obj.reviewSchedule.nextReview).toLocaleDateString('de-CH')}`,
      tone: obj.reviewSchedule.nextReview <= Date.now() ? 'amber' : 'quiet',
      future: obj.reviewSchedule.nextReview > Date.now(),
    });
  }

  for (const r of resourcesForObjective(state, obj)) {
    events.push({
      ts: r.updatedAt || r.createdAt || 0, kind: 'resource',
      title: `Ressource: ${r.name}`,
      detail: [r.type || '', r.url ? 'verlinkt' : ''].filter(Boolean).join(' · '),
      tone: 'quiet', refId: r.id,
    });
  }

  for (const e of examsForObjective(state, obj)) {
    const g = getExamGrade(e);
    // Diagnosis over judgment: the grade stays as data (neutral tone).
    // Only this objective's own rating colours the event — warm, never red/green.
    const rating = e.objectiveResults?.find(r => r.objectiveId === obj.id)?.rating;
    const ratingLabel = rating ? ` · ${EXAM_RATING_LABELS[rating]}` : '';
    events.push({
      ts: e.date ? new Date(e.date + 'T00:00:00').getTime() : (e.updatedAt || 0),
      kind: 'exam',
      title: `Prüfung: ${e.name}${g !== null ? ` · Note ${g.toFixed(2)}` : ''}${ratingLabel}`,
      detail: [e.date || '', e.weight ? `${e.weight}%` : ''].filter(Boolean).join(' · '),
      tone: rating === 'weak' ? 'amber' : 'quiet',
      refId: e.id,
    });
  }

  for (const c of capturesForObjective(state, obj)) {
    const ts = new Date(c.timestamp).getTime() || c.createdAt || 0;
    events.push({
      ts, kind: 'capture',
      title: `${isImportantCapture(c) ? '★ ' : ''}${(CAPTURE_TYPE_LABELS[c.type] || c.type)} festgehalten`,
      detail: String(c.content || '').slice(0, 140),
      tone: isImportantCapture(c) ? 'amber' : 'quiet',
      refId: c.id,
    });
  }

  if (obj.notes) {
    events.push({ ts: obj.updatedAt || 0, kind: 'note', title: 'Notiz', detail: String(obj.notes).slice(0, 200), tone: 'quiet' });
  }

  return events
    .filter(e => typeof e.ts === 'number' && !isNaN(e.ts))
    .sort((a, b) => b.ts - a.ts);
}

/**
 * Composite risk score for "what am I probably getting wrong":
 * low confidence + staleness + weak exam diagnosis.
 *
 * Exam signal comes from per-objective ratings (weak/okay/strong), not from
 * the overall grade: a bad exam tells WHERE the user is weak. Exams without
 * any ratings fall back to the legacy whole-grade signal so old data keeps
 * working (grade below 4.0 counts for every covered objective).
 */
export function getObjectiveExamSignal(state, obj) {
  let weak = 0, okay = 0, strong = 0, legacyFails = 0;
  for (const e of state.exams) {
    if (e.moduleId !== obj.moduleId) continue;
    if (!e.linkedObjectiveIds?.includes(obj.id)) continue;
    const entry = e.objectiveResults?.find(r => r.objectiveId === obj.id);
    const hasAnyRating = (e.objectiveResults || []).some(r => r.rating === 'weak' || r.rating === 'okay' || r.rating === 'strong');
    if (entry?.rating === 'weak') weak += 1;
    else if (entry?.rating === 'okay') okay += 1;
    else if (entry?.rating === 'strong') strong += 1;
    else if (!hasAnyRating && getExamGrade(e) !== null && getExamGrade(e) < 4) legacyFails += 1;
  }
  // weak weighs like a fail, okay is a nudge, strong offsets (floored).
  const points = Math.max(-3, weak * 3 + okay * 1 + legacyFails * 2 - strong * 2);
  return { weak, okay, strong, legacyFails, points };
}

/**
 * Weak Spots — transparent weakness estimate, not exact science.
 *
 * getWeaknessBreakdown() combines independent signals into one ranked score
 * and, crucially, explains itself: every entry in `signals` is a
 * human-readable reason with its point contribution. `stabilizers` lists
 * mitigating facts (e.g. strong exam results) that do not add points.
 *
 * Signals:
 *  - confidence: low self-assessed confidence (gap to 5, when >= 3)
 *  - stale:      not touched for 7+ days
 *  - exam:       weak/okay per-objective exam ratings (legacy unrated fails)
 *  - review:     never reviewed, or no review for 14+/21+ days
 *  - studytime:  high linked exam weight but below-median study time
 *  - mistakes / questions: repeated mistake/question captures
 */
export function getWeaknessBreakdown(state, obj) {
  const now = Date.now();
  const day = 86400000;
  const signals = [];
  const stabilizers = [];

  // 1. Low confidence
  const conf = obj.confidence ?? 0;
  const gap = 5 - conf;
  if (gap >= 3) {
    signals.push({ key: 'confidence', label: `Confidence ${conf}/5`, points: gap });
  }

  // 2. Staleness
  const touched = obj.lastTouched || obj.updatedAt || obj.createdAt;
  if (touched) {
    const staleDays = Math.floor((now - touched) / day);
    if (staleDays >= 7) {
      signals.push({
        key: 'stale',
        label: `Vor ${staleDays} Tagen berührt`,
        points: Math.round(Math.min(staleDays, 30) / 30 * 4 * 10) / 10,
      });
    }
  }

  // 3. Poor exam performance (per-objective diagnosis, not the bare grade)
  const sig = getObjectiveExamSignal(state, obj);
  if (sig.points > 0) {
    const parts = [];
    if (sig.weak) parts.push(sig.weak === 1 ? '1× schwach geprüft' : `${sig.weak}× schwach geprüft`);
    if (sig.okay) parts.push(sig.okay === 1 ? '1× okay geprüft' : `${sig.okay}× okay geprüft`);
    if (sig.legacyFails) parts.push(sig.legacyFails === 1 ? '1 Prüfung unter 4.0 ohne Aufschlüsselung' : `${sig.legacyFails} Prüfungen unter 4.0 ohne Aufschlüsselung`);
    signals.push({ key: 'exam', label: parts.join(' · '), points: sig.points });
  }
  if (sig.strong) {
    stabilizers.push(sig.strong === 1 ? '1× stark geprüft — stabilisiert' : `${sig.strong}× stark geprüft — stabilisiert`);
  }

  // 4. Insufficient recent review
  if (!obj.lastReviewed) {
    const age = obj.createdAt ? Math.floor((now - obj.createdAt) / day) : 0;
    if (age > 7) signals.push({ key: 'review', label: 'Noch nie reviewt', points: 2 });
  } else {
    const daysSince = Math.floor((now - obj.lastReviewed) / day);
    if (daysSince > 21) signals.push({ key: 'review', label: `Seit ${daysSince} Tagen kein Review`, points: 2 });
    else if (daysSince > 14) signals.push({ key: 'review', label: `Seit ${daysSince} Tagen kein Review`, points: 1 });
  }

  // 5. Low study time relative to importance (linked exam weight vs. module median)
  const linkedWeight = state.exams
    .filter(e => e.moduleId === obj.moduleId && e.linkedObjectiveIds?.includes(obj.id))
    .reduce((sum, e) => sum + (Number(e.weight) || 0), 0);
  const median = getModuleStudyMedian(state, obj.moduleId);
  const time = obj.totalStudyTime || 0;
  if (linkedWeight > 0 && median > 0 && time < median) {
    signals.push({ key: 'studytime', label: `Viel Gewicht (${linkedWeight}%), wenig Zeit (${time} Min)`, points: 2 });
  }

  // 6. Repeated mistakes / open questions captured against this objective
  const caps = capturesForObjective(state, obj);
  const mistakes = caps.filter(c => c.type === 'mistake').length;
  const questions = caps.filter(c => c.type === 'question').length;
  if (mistakes > 0) {
    signals.push({
      key: 'mistakes',
      label: mistakes === 1 ? '1× Fehler festgehalten' : `${mistakes}× Fehler festgehalten`,
      points: Math.min(mistakes, 3),
    });
  }
  if (questions >= 3) {
    signals.push({ key: 'questions', label: `${questions} offene Fragen`, points: 1 });
  }

  const score = Math.round(signals.reduce((s, x) => s + x.points, 0) * 10) / 10;
  const level = score >= 7 ? 'hoch' : score >= 3.5 ? 'mittel' : 'niedrig';
  return { score, level, signals, stabilizers };
}

/**
 * Median study time per objective within a module (minutes).
 * Reference point for "low study time relative to importance".
 */
export function getModuleStudyMedian(state, moduleId) {
  const times = state.learningObjectives
    .filter(o => o.moduleId === moduleId)
    .map(o => o.totalStudyTime || 0)
    .sort((a, b) => a - b);
  if (!times.length) return 0;
  const mid = Math.floor(times.length / 2);
  return times.length % 2 ? times[mid] : (times[mid - 1] + times[mid]) / 2;
}

/**
 * Ranked weak spots across all (or one) module(s): every objective with a
 * weakness score above zero, highest first. Includes done objectives —
 * verstandene Ziele can be forgotten too.
 */
export function getWeakSpots(state, { moduleId = null, limit = 20 } = {}) {
  return state.learningObjectives
    .filter(o => (moduleId ? o.moduleId === moduleId : true))
    .map(objective => ({ objective, breakdown: getWeaknessBreakdown(state, objective) }))
    .filter(x => x.breakdown.score > 0)
    .sort((a, b) => b.breakdown.score - a.breakdown.score || ((a.objective.number ?? 0) - (b.objective.number ?? 0)))
    .slice(0, limit);
}

export function scoreObjectiveRisk(state, obj) {
  return getWeaknessBreakdown(state, obj).score;
}

export function riskReasons(state, obj) {
  const reasons = [];
  reasons.push(`Confidence ${obj.confidence ?? 0}/5`);
  const touched = obj.lastTouched || obj.updatedAt || obj.createdAt;
  if (touched) {
    const days = Math.floor((Date.now() - touched) / 86400000);
    reasons.push(days <= 0 ? 'heute berührt' : days === 1 ? 'gestern berührt' : `vor ${days} Tagen berührt`);
  }
  const { signals } = getWeaknessBreakdown(state, obj);
  for (const s of signals) {
    if (s.key === 'confidence' || s.key === 'stale') continue; // already covered above
    reasons.push(s.label);
  }
  return reasons;
}

/**
 * Riskiest non-done objective across all modules, optionally
 * excluding ids (so Today can show a different card than Fokus).
 */
export function getRiskiestObjective(state, excludeIds = []) {
  const list = state.learningObjectives.filter(o => o.status !== 'done' && !excludeIds.includes(o.id));
  if (!list.length) return null;
  return [...list].sort((a, b) => scoreObjectiveRisk(state, b) - scoreObjectiveRisk(state, a))[0];
}

/**
 * Last n sessions, newest first.
 */
export function getRecentSessions(state, n = 3) {
  return [...state.studySessions]
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
    .slice(0, n);
}

/**
 * Relative day label in German: Heute / Gestern / vor N Tagen / date.
 */
export function relativeDay(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d)) return '—';
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - day) / 86400000);
  if (diff <= 0) return 'Heute';
  if (diff === 1) return 'Gestern';
  if (diff < 7) return `vor ${diff} Tagen`;
  return d.toLocaleDateString('de-CH', { day: '2-digit', month: 'short' });
}

export const REVIEW_PROMPTS = [
  'Was hast du heute wirklich verstanden — und woran merkst du das?',
  'Welcher Begriff würde dir in einer Prüfung noch fehlen?',
  'Was würdest du heute anders angehen als gestern?',
  'Welche Frage traust du dich noch nicht zu stellen?',
  'Was war heute Handwerk, was war Verständnis?',
  'Woran würdest du merken, dass ein Lernziel sitzt?',
  'Was lässt du heute bewusst liegen — und warum?'
];

/**
 * Deterministic daily rotation from the fixed prompt set.
 */
export function getDailyPrompt(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date - start) / 86400000);
  return REVIEW_PROMPTS[dayOfYear % REVIEW_PROMPTS.length];
}

export const RESOURCE_TYPES = ['Video', 'Exercise', 'Dataset', 'Project', 'Cheat Sheet', 'Article', 'Book', 'Other'];
export const EXAM_RATINGS = ['weak', 'okay', 'strong'];
export const EXAM_RATING_LABELS = { weak: 'Schwach', okay: 'Okay', strong: 'Stark' };
export const CAPTURE_TYPES = ['question', 'term', 'resource', 'mistake', 'thought'];
export const CAPTURE_TYPE_LABELS = {
  question: 'Frage',
  term: 'Begriff',
  resource: 'Ressource',
  mistake: 'Fehler',
  thought: 'Gedanke'
};
export const OBJECTIVE_STATUSES = ['todo', 'in-progress', 'done'];
export const RESOURCE_STATUSES = ['todo', 'in-progress', 'done'];
export const PLAN_ITEM_TYPES = ['task', 'milestone', 'review'];