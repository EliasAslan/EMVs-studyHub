import { Widget } from "@seelen-ui/lib";

const widget = Widget.self;
const STORAGE_KEY = "studyhub-seelen-snapshot-v1";
const TIMER_KEY = "studyhub-seelen-timer-v1";
const DEFAULT_APP_URL = "https://em-vs-study-hub.vercel.app";
const $ = (id) => document.getElementById(id);
const settings = widget.settings ?? {};
const appUrl = safeUrl(settings["app-url"] || DEFAULT_APP_URL);
document.documentElement.style.setProperty("--accent", settings.accent || "#7770f5");

let snapshot = loadSnapshot();
let timer = loadTimer();
let timerInterval = null;

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : DEFAULT_APP_URL;
  } catch { return DEFAULT_APP_URL; }
}
function loadSnapshot() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return data?.version === 1 ? data : null;
  } catch { return null; }
}
function loadTimer() {
  try {
    const saved = JSON.parse(localStorage.getItem(TIMER_KEY) || "null");
    if (!saved) return { mode: "focus", remaining: 1500, running: false, endsAt: null };
    if (saved.running && saved.endsAt) {
      const remaining = Math.max(0, Math.ceil((saved.endsAt - Date.now()) / 1000));
      return { ...saved, remaining, running: remaining > 0 };
    }
    return saved;
  } catch { return { mode: "focus", remaining: 1500, running: false, endsAt: null }; }
}
function saveTimer() { localStorage.setItem(TIMER_KEY, JSON.stringify(timer)); }
function dateLabel(days) {
  if (typeof days !== "number") return "Date not set";
  if (days < 0) return Math.abs(days) + "d overdue";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return "In " + days + " days";
}
function renderSnapshot() {
  const start = snapshot?.startHere;
  $("start-title").textContent = start?.title || "Nothing urgent right now";
  $("start-meta").textContent = start
    ? [start.kind === "exam" ? "Exam" : "Homework", start.date, dateLabel(start.days)].filter(Boolean).join(" · ")
    : snapshot ? "No start-here item in your current plan." : "Import a StudyHub JSON snapshot to get started.";
  $("start-kind").textContent = start ? (start.overdue ? "OVERDUE" : "YOUR NEXT STEP") : "READY WHEN YOU ARE";
  $("start-kind").classList.toggle("warning", !!start?.overdue);
  $("homework-count").textContent = Number.isFinite(snapshot?.openHomeworkCount) ? snapshot.openHomeworkCount : "—";
  const exam = snapshot?.nextExam;
  $("exam-countdown").textContent = exam && typeof exam.days === "number" ? (exam.days === 0 ? "Today" : exam.days < 0 ? "—" : exam.days) : "—";
  const deadlines = settings["show-deadlines"] === false ? [] : (snapshot?.deadlines || []).slice(0, 3);
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
function showStatus(message, error = false) {
  const el = $("status-message");
  el.textContent = message;
  el.classList.toggle("error", error);
  clearTimeout(showStatus.timeout);
  showStatus.timeout = setTimeout(() => (el.textContent = ""), 3500);
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    renderSnapshot();
    showStatus("StudyHub snapshot imported.");
  } catch (error) {
    showStatus(error.message || "Could not read that file.", true);
  } finally { event.target.value = ""; }
});
$("refresh-button").addEventListener("click", () => {
  snapshot = loadSnapshot();
  renderSnapshot();
  showStatus(snapshot ? "Snapshot refreshed." : "No saved snapshot found.", !snapshot);
});
$("open-app").addEventListener("click", () => window.open(appUrl, "_blank"));

function renderTimer() {
  const minutes = Math.floor(timer.remaining / 60);
  const seconds = timer.remaining % 60;
  $("timer-display").textContent = String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
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
  }, 250);
  renderTimer();
}
$("timer-toggle").addEventListener("click", () => timer.running ? stopTimer() : startTimer());
$("timer-reset").addEventListener("click", () => {
  clearInterval(timerInterval);
  timerInterval = null;
  timer = { mode: "focus", remaining: 1500, running: false, endsAt: null };
  saveTimer();
  renderTimer();
});
const refreshMs = Math.max(15, Number(settings["refresh-seconds"]) || 60) * 1000;
const refreshHandle = setInterval(() => {
  const latest = loadSnapshot();
  if (latest?.generatedAt !== snapshot?.generatedAt) {
    snapshot = latest;
    renderSnapshot();
  }
}, refreshMs);
window.addEventListener("beforeunload", () => {
  clearInterval(refreshHandle);
  clearInterval(timerInterval);
});
renderSnapshot();
renderTimer();
await widget.init();
await widget.ready();
