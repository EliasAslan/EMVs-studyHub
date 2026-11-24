import "./index.css";
import { Settings, Widget } from "@seelen-ui/lib";

const widget = Widget.self;
const $ = (id) => document.getElementById(id);
const DEFAULT_APP_URL = "https://em-vs-study-hub.vercel.app";
const STATE_KEY = "studyhub-seelen-ui-state-v1";
const DEFAULT_STATE = { expanded: false, pinned: false };

// --- settings: read once, defensively ---
const settings = (() => {
  try {
    const config = Settings.getCurrentWidgetConfig?.();
    return config && typeof config === "object" ? config : {};
  } catch (error) {
    console.warn("[StudyHub] could not read settings, using defaults");
    return {};
  }
})();
const setting = (key, fallback) => {
  const value = settings?.[key];
  return value === undefined || value === null ? fallback : value;
};

const appUrl = safeUrl(setting("app-url", DEFAULT_APP_URL));
const showDeadlines = setting("show-deadlines", true) !== false;
const refreshSeconds = Math.max(15, Number(setting("refresh-seconds", 60)) || 60);
document.documentElement.style.setProperty("--accent", setting("accent", "#7770f5"));

let snapshot = loadSnapshot();
let timer = loadTimer();
let timerInterval = null;
let refreshHandle = null;
let uiState = loadUiState();

const rootEl = document.documentElement;
const bodyBtn = $("sbx-body");

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : DEFAULT_APP_URL;
  } catch {
    return DEFAULT_APP_URL;
  }
}
function loadSnapshot() {
  try {
    const data = JSON.parse(localStorage.getItem("studyhub-seelen-snapshot-v1") || "null");
    return data?.version === 1 ? data : null;
  } catch {
    return null;
  }
}
function loadTimer() {
  try {
    const saved = JSON.parse(localStorage.getItem("studyhub-seelen-timer-v1") || "null");
    if (!saved) return { mode: "focus", remaining: 1500, running: false, endsAt: null };
    if (saved.running && saved.endsAt) {
      const remaining = Math.max(0, Math.ceil((saved.endsAt - Date.now()) / 1000));
      return { ...saved, remaining, running: remaining > 0 };
    }
    return saved;
  } catch {
    return { mode: "focus", remaining: 1500, running: false, endsAt: null };
  }
}
function saveTimer() {
  localStorage.setItem("studyhub-seelen-timer-v1", JSON.stringify(timer));
}
function dateLabel(days) {
  if (typeof days !== "number") return "Date not set";
  if (days < 0) return Math.abs(days) + "d overdue";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return "In " + days + " days";
}
function formatTimer(t) {
  const minutes = Math.floor(t.remaining / 60);
  const seconds = t.remaining % 60;
  return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
}
function showStatus(message, error = false) {
  const el = $("status-message");
  el.textContent = message;
  el.classList.toggle("error", error);
  clearTimeout(showStatus.timeout);
  showStatus.timeout = setTimeout(() => (el.textContent = ""), 4500);
}

function openApp() {
  window.open(appUrl, "_blank");
}

// --- UI state (sidebar vs expanded panel) ---
function loadUiState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || "null");
    return {
      expanded: Boolean(saved?.expanded),
      pinned: Boolean(saved?.pinned),
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}
function saveUiState() {
  localStorage.setItem(STATE_KEY, JSON.stringify({ expanded: uiState.expanded, pinned: uiState.pinned }));
}
function applyUiState({ save = false, expanded } = {}) {
  if (typeof expanded === "boolean") uiState.expanded = expanded;
  rootEl.dataset.state = uiState.expanded ? "expanded" : "sidebar";
  $("panel").setAttribute("aria-hidden", String(!uiState.expanded));
  bodyBtn.setAttribute("aria-expanded", String(uiState.expanded));
  $("pin").setAttribute("aria-pressed", String(uiState.pinned));
  $("pin").textContent = uiState.pinned ? "Unpin" : "Pin";
  if (save) saveUiState();
  renderSidebar();
  if (uiState.expanded) renderPanel();
}
function togglePanel() {
  applyUiState({ save: true, expanded: !uiState.expanded });
}
function dismissPanel() {
  if (!uiState.expanded || uiState.pinned) return;
  applyUiState({ save: true, expanded: false });
}
function togglePin() {
  uiState.pinned = !uiState.pinned;
  saveUiState();
  $("pin").setAttribute("aria-pressed", String(uiState.pinned));
  $("pin").textContent = uiState.pinned ? "Unpin" : "Pin";
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    dismissPanel();
  }
  if (e.key === "Enter" && document.activeElement?.id === "open-app") {
    openApp();
  }
});
$("sbx-body").addEventListener("click", togglePanel);
$("close").addEventListener("click", () => applyUiState({ save: true, expanded: false }));
$("pin").addEventListener("click", togglePin);
$("open-app").addEventListener("click", openApp);

// --- rendering ---
function currentTask() {
  return snapshot?.startHere?.title || "Nothing urgent — open the panel";
}
function examDaysLabel() {
  const exam = snapshot?.nextExam;
  if (!exam || typeof exam.days !== "number") return "—";
  return exam.days === 0 ? "Today" : exam.days < 0 ? "—" : String(exam.days);
}
function renderSidebar() {
  $("sbx-task").textContent = currentTask();
  $("sbx-exam").textContent = examDaysLabel();
  $("sbx-timer").textContent = formatTimer(timer);
}

function renderPanel() {
  const start = snapshot?.startHere;
  $("start-title").textContent = start?.title || "Nothing urgent right now";
  $("start-meta").textContent = start
    ? [start.kind === "exam" ? "Exam" : "Homework", start.date, dateLabel(start.days)].filter(Boolean).join(" · ")
    : snapshot
      ? "No start-here item in your current plan."
      : "Import a StudyHub JSON snapshot to get started.";
  $("start-kind").textContent = start ? (start.overdue ? "OVERDUE" : "YOUR NEXT STEP") : "READY WHEN YOU ARE";
  $("start-kind").classList.toggle("warning", !!start?.overdue);
  $("homework-count").textContent = Number.isFinite(snapshot?.openHomeworkCount) ? snapshot.openHomeworkCount : "—";

  const exam = snapshot?.nextExam;
  $("exam-countdown").textContent =
    exam && typeof exam.days === "number" ? (exam.days === 0 ? "Today" : exam.days < 0 ? "—" : exam.days) : "—";

  const deadlines = showDeadlines ? (snapshot?.deadlines || []).slice(0, 3) : [];
  $("deadline-count").textContent = deadlines.length + (deadlines.length === 1 ? " deadline" : " deadlines");
  const list = $("deadline-list");
  list.replaceChildren();
  if (!deadlines.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = snapshot ? "No upcoming deadlines." : "Your upcoming deadlines will appear here.";
    list.append(empty);
  } else {
    for (const item of deadlines) {
      const row = document.createElement("div");
      row.className = "deadline-row";
      const title = document.createElement("span");
      title.className = "deadline-title";
      title.textContent = item.title || "Untitled";
      const due = document.createElement("span");
      due.className = "deadline-due" + (item.overdue ? " overdue" : "");
      due.textContent = dateLabel(item.days);
      row.append(title, due);
      list.append(row);
    }
  }

  $("updated-at").textContent = snapshot?.generatedAt
    ? "Updated " + new Date(snapshot.generatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "No snapshot loaded";
}

function validateSnapshot(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.deadlines) || !Number.isFinite(data.openHomeworkCount)) {
    throw new Error("This doesn't look like a StudyHub v1 snapshot.");
  }
  return data;
}

$("snapshot-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    snapshot = validateSnapshot(JSON.parse(await file.text()));
    localStorage.setItem("studyhub-seelen-snapshot-v1", JSON.stringify(snapshot));
    applyUiState();
    showStatus("StudyHub snapshot imported.");
  } catch (error) {
    showStatus(error.message || "Could not read that file.", true);
  } finally {
    event.target.value = "";
  }
});

// --- Pomodoro timer (shared between sidebar + panel) ---
function renderTimer() {
  $("timer-display").textContent = formatTimer(timer);
  $("timer-mode").textContent = timer.mode === "focus" ? "Focus · 25 min" : "Break · 5 min";
  $("timer-toggle").textContent = timer.running ? "Pause" : timer.remaining === 0 ? "Restart" : "Start";
}
function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timer.running = false;
  timer.endsAt = null;
  saveTimer();
  renderTimer();
  renderSidebar();
}
function startTimer() {
  if (timer.remaining <= 0) timer.remaining = timer.mode === "focus" ? 1500 : 300;
  timer.running = true;
  timer.endsAt = Date.now() + timer.remaining * 1000;
  saveTimer();
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timer.remaining = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
    if (timer.remaining <= 0) {
      const nextMode = timer.mode === "focus" ? "break" : "focus";
      timer = { mode: nextMode, remaining: nextMode === "focus" ? 1500 : 300, running: false, endsAt: null };
      clearInterval(timerInterval);
      timerInterval = null;
      showStatus(timer.mode === "break" ? "Focus complete. Take a break." : "Break finished. Ready for another round.");
    }
    saveTimer();
    renderTimer();
    renderSidebar();
  }, 250);
  renderTimer();
}
$("timer-toggle").addEventListener("click", () => (timer.running ? stopTimer() : startTimer()));
$("timer-reset").addEventListener("click", () => {
  clearInterval(timerInterval);
  timerInterval = null;
  timer = { mode: "focus", remaining: 1500, running: false, endsAt: null };
  saveTimer();
  renderTimer();
});

// --- auto-refresh ---
function scheduleRefresh() {
  clearInterval(refreshHandle);
  refreshHandle = setInterval(() => {
    const latest = loadSnapshot();
    if (latest?.generatedAt !== snapshot?.generatedAt) {
      snapshot = latest;
      applyUiState();
    }
  }, refreshSeconds * 1000);
}

window.addEventListener("beforeunload", () => {
  clearInterval(refreshHandle);
  clearInterval(timerInterval);
});

// --- startup ---
try {
  applyUiState({ save: false, expanded: uiState.expanded });
  renderSidebar();
  renderTimer();
  await widget.init({ saveAndRestoreLastRect: true });
  await widget.ready();
  await widget.focus?.();
  applyUiState({ save: false, expanded: uiState.expanded });
  scheduleRefresh();
  showStatus(uiState.expanded ? "StudyHub expanded." : "StudyHub ready.");
} catch (error) {
  console.error("[StudyHub] failed to init widget", error);
  showStatus("Could not load StudyHub card: " + (error?.message || String(error)), true);
}
