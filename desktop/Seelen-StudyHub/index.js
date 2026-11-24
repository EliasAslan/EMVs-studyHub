import "./index.css";
import { Settings, Widget } from "@seelen-ui/lib";
import { LogicalSize } from "@seelen-ui/lib/tauri";

const widget = Widget.self;
const $ = (id) => document.getElementById(id);

const DEFAULT_APP_URL = "https://em-vs-study-hub.vercel.app";
const SNAPSHOT_KEY = "studyhub-seelen-snapshot-v1";
const TIMER_KEY = "studyhub-seelen-timer-v1";
const STATE_KEY = "studyhub-seelen-ui-state-v1";
const DURATIONS = { focus: 25 * 60, break: 5 * 60 };
const WINDOW_SIZE = { width: 340, compactHeight: 68, expandedHeight: 560 };

function readSettings() {
  try {
    const config = Settings.getCurrentWidgetConfig?.();
    return config && typeof config === "object" ? config : {};
  } catch (error) {
    console.warn("[StudyHub] Could not read widget settings:", error);
    return {};
  }
}

const settings = readSettings();
const setting = (key, fallback) => settings[key] ?? fallback;
const appUrl = safeUrl(setting("app-url", DEFAULT_APP_URL));
const showDeadlines = setting("show-deadlines", true) !== false;
const refreshSeconds = Math.max(15, Number(setting("refresh-seconds", 60)) || 60);
const configuredAccent = String(setting("accent", "#7770f5"));
document.documentElement.style.setProperty(
  "--accent",
  CSS.supports("color", configuredAccent) ? configuredAccent : "#7770f5",
);

let snapshot = loadSnapshot();
let timer = loadTimer();
let timerInterval = null;
let refreshHandle = null;
let statusTimeout = null;
let uiState = loadUiState();
let widgetInitialized = false;
let resizeQueue = Promise.resolve();

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
    const data = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "null");
    return data?.version === 1 ? data : null;
  } catch (error) {
    console.warn("[StudyHub] Saved snapshot could not be read:", error);
    return null;
  }
}

function validateSnapshot(data) {
  if (
    !data ||
    data.version !== 1 ||
    !Array.isArray(data.deadlines) ||
    !Number.isFinite(data.openHomeworkCount)
  ) {
    throw new Error("This doesn't look like a StudyHub v1 snapshot.");
  }

  return {
    ...data,
    openHomeworkCount: Math.max(0, Math.floor(data.openHomeworkCount)),
    deadlines: data.deadlines.slice(0, 50).filter((item) => item && typeof item === "object"),
  };
}

function loadTimer() {
  const fallback = { mode: "focus", remaining: DURATIONS.focus, running: false, endsAt: null };

  try {
    const saved = JSON.parse(localStorage.getItem(TIMER_KEY) || "null");
    if (!saved || !["focus", "break"].includes(saved.mode)) return fallback;

    const mode = saved.mode;
    const duration = DURATIONS[mode];
    const endsAt = Number(saved.endsAt);
    const isRunning = saved.running === true && Number.isFinite(endsAt);

    if (isRunning) {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      if (remaining > 0) return { mode, remaining, running: true, endsAt };

      const nextMode = mode === "focus" ? "break" : "focus";
      return { mode: nextMode, remaining: DURATIONS[nextMode], running: false, endsAt: null };
    }

    const remaining = Number.isFinite(saved.remaining)
      ? Math.min(duration, Math.max(0, Math.floor(saved.remaining)))
      : duration;

    return { mode, remaining, running: false, endsAt: null };
  } catch (error) {
    console.warn("[StudyHub] Saved timer could not be read:", error);
    return fallback;
  }
}

function saveTimer() {
  try {
    localStorage.setItem(TIMER_KEY, JSON.stringify(timer));
  } catch (error) {
    console.warn("[StudyHub] Could not save timer:", error);
  }
}

function loadUiState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || "null");
    return { expanded: Boolean(saved?.expanded), pinned: Boolean(saved?.pinned) };
  } catch {
    return { expanded: false, pinned: false };
  }
}

function saveUiState() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(uiState));
  } catch (error) {
    console.warn("[StudyHub] Could not save panel state:", error);
  }
}

function resizeWidget() {
  if (!widgetInitialized) return Promise.resolve();

  const height = uiState.expanded
    ? WINDOW_SIZE.expandedHeight
    : WINDOW_SIZE.compactHeight;

  resizeQueue = resizeQueue
    .catch(() => {})
    .then(() => widget.window.setSize(new LogicalSize(WINDOW_SIZE.width, height)))
    .catch((error) => {
      console.error("[StudyHub] Could not resize widget:", error);
      showStatus("Could not resize the widget window.", true);
    });

  return resizeQueue;
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
  void resizeWidget();
}

function togglePanel() {
  applyUiState({ save: true, expanded: !uiState.expanded });
}

function dismissPanel() {
  if (!uiState.expanded || uiState.pinned) return;
  applyUiState({ save: true, expanded: false });
  bodyBtn.focus();
}

function togglePin() {
  uiState.pinned = !uiState.pinned;
  saveUiState();
  $("pin").setAttribute("aria-pressed", String(uiState.pinned));
  $("pin").textContent = uiState.pinned ? "Unpin" : "Pin";
}

function dateLabel(days) {
  if (typeof days !== "number" || !Number.isFinite(days)) return "Date not set";
  if (days < 0) return Math.abs(days) + "d overdue";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return "In " + days + " days";
}

function formatTimer(value = timer) {
  const total = Math.max(0, Math.floor(value.remaining || 0));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
}

function showStatus(message, error = false) {
  const el = $("status-message");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("error", error);
  clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => {
    el.textContent = "";
    el.classList.remove("error");
  }, 4500);
}

function openApp() {
  window.open(appUrl, "_blank", "noopener,noreferrer");
}

// --- Sidebar and expanded panel ---
function currentTask() {
  return snapshot?.startHere?.title || "No urgent task — open your plan";
}

function examDaysLabel() {
  const days = snapshot?.nextExam?.days;
  if (typeof days !== "number" || !Number.isFinite(days) || days < 0) return "—";
  return days === 0 ? "Today" : String(days) + "d";
}

function renderSidebar() {
  $("sbx-task").textContent = currentTask();
  $("sbx-exam").textContent = examDaysLabel();
  $("sbx-timer").textContent = formatTimer();
}

function renderPanel() {
  const start = snapshot?.startHere;
  $("start-title").textContent = start?.title || "Nothing urgent right now";
  $("start-meta").textContent = start
    ? [
        start.kind === "exam" ? "Exam" : "Homework",
        start.date,
        dateLabel(start.days),
      ].filter(Boolean).join(" · ")
    : snapshot
      ? "No start-here item in your current plan."
      : "Import a StudyHub JSON snapshot to get started.";

  $("start-kind").textContent = start
    ? start.overdue ? "OVERDUE" : "YOUR NEXT STEP"
    : "READY WHEN YOU ARE";
  $("start-kind").classList.toggle("warning", Boolean(start?.overdue));
  $("homework-count").textContent = Number.isFinite(snapshot?.openHomeworkCount)
    ? snapshot.openHomeworkCount
    : "—";

  const exam = snapshot?.nextExam;
  $("exam-countdown").textContent =
    exam && typeof exam.days === "number" && exam.days >= 0
      ? exam.days === 0 ? "Today" : exam.days
      : "—";

  const deadlines = showDeadlines ? (snapshot?.deadlines || []).slice(0, 3) : [];
  $("deadline-count").textContent =
    deadlines.length + (deadlines.length === 1 ? " deadline" : " deadlines");

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
    ? "Updated " + new Date(snapshot.generatedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "No snapshot loaded";

  renderTimer();
}

// --- Keyboard and controls ---
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && uiState.expanded && !uiState.pinned) {
    event.preventDefault();
    dismissPanel();
  }
});

bodyBtn.addEventListener("click", togglePanel);
$("close").addEventListener("click", () => {
  uiState.pinned = false;
  applyUiState({ save: true, expanded: false });
  bodyBtn.focus();
});
$("pin").addEventListener("click", togglePin);
$("open-app").addEventListener("click", openApp);

// --- Snapshot import ---
$("snapshot-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const imported = validateSnapshot(JSON.parse(await file.text()));
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(imported));
    snapshot = imported;
    renderSidebar();
    renderPanel();
    showStatus("StudyHub snapshot imported.");
  } catch (error) {
    showStatus(error?.message || "Could not read that file.", true);
  } finally {
    event.target.value = "";
  }
});

// --- Pomodoro timer ---
function renderTimer() {
  $("timer-display").textContent = formatTimer();
  $("timer-mode").textContent = timer.mode === "focus" ? "Focus · 25 min" : "Break · 5 min";
  $("timer-toggle").textContent = timer.running
    ? "Pause"
    : timer.remaining === 0 ? "Restart" : "Start";
  renderSidebar();
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timer.running = false;
  timer.endsAt = null;
  saveTimer();
  renderTimer();
}

function tickTimer() {
  if (!timer.running || !Number.isFinite(timer.endsAt)) return;

  timer.remaining = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
  if (timer.remaining === 0) {
    const completedMode = timer.mode;
    const nextMode = completedMode === "focus" ? "break" : "focus";
    timer = {
      mode: nextMode,
      remaining: DURATIONS[nextMode],
      running: false,
      endsAt: null,
    };
    clearInterval(timerInterval);
    timerInterval = null;
    showStatus(
      completedMode === "focus"
        ? "Focus complete. Take a break."
        : "Break finished. Ready for another round.",
    );
  }

  saveTimer();
  renderTimer();
}

function startTimer() {
  if (timer.remaining <= 0) timer.remaining = DURATIONS[timer.mode];
  timer.running = true;
  timer.endsAt = Date.now() + timer.remaining * 1000;
  saveTimer();
  clearInterval(timerInterval);
  timerInterval = setInterval(tickTimer, 1000);
  renderTimer();
}

$("timer-toggle").addEventListener("click", () => {
  if (timer.running) stopTimer();
  else startTimer();
});

$("timer-reset").addEventListener("click", () => {
  clearInterval(timerInterval);
  timerInterval = null;
  timer = {
    mode: "focus",
    remaining: DURATIONS.focus,
    running: false,
    endsAt: null,
  };
  saveTimer();
  renderTimer();
});

// --- Refresh imported snapshot ---
function scheduleRefresh() {
  clearInterval(refreshHandle);
  refreshHandle = setInterval(() => {
    const latest = loadSnapshot();
    if (latest?.generatedAt !== snapshot?.generatedAt) {
      snapshot = latest;
      renderSidebar();
      if (uiState.expanded) renderPanel();
    }
  }, refreshSeconds * 1000);
}

window.addEventListener("beforeunload", () => {
  clearInterval(refreshHandle);
  clearInterval(timerInterval);
  clearTimeout(statusTimeout);
});

// --- Startup ---
try {
  applyUiState({ save: false });
  renderTimer();

  await widget.init({ saveAndRestoreLastRect: true });
  await widget.window.setSize(
    new LogicalSize(
      WINDOW_SIZE.width,
      uiState.expanded ? WINDOW_SIZE.expandedHeight : WINDOW_SIZE.compactHeight,
    ),
  );
  widgetInitialized = true;
  await widget.ready();

  if (timer.running) {
    timerInterval = setInterval(tickTimer, 1000);
    tickTimer();
  }

  scheduleRefresh();
  console.info("[StudyHub] Widget ready.", {
    expanded: uiState.expanded,
    pinned: uiState.pinned,
  });
} catch (error) {
  console.error("[StudyHub] Widget initialization failed:", error);
  showStatus("Could not load StudyHub: " + (error?.message || String(error)), true);
}
