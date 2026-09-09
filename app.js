// ---------- Config ----------
// Point this at your deployed proxy function (see api/openai-proxy.js + README).
const AI_PROXY_URL = "/api/openai-proxy";

// ---------- Storage (IndexedDB) ----------
const DB_NAME = "focus-tracker";
const DB_VERSION = 1;
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains("tasks")) {
        database.createObjectStore("tasks", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("checkins")) {
        database.createObjectStore("checkins", { keyPath: "date" });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e);
  });
}

function tx(storeName, mode) {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function dbGetAll(storeName) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, "readonly").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbPut(storeName, value) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, "readwrite").put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function dbDelete(storeName, key) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, "readwrite").delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---------- Helpers ----------
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------- Connection status ----------
function updateConnectionStatus() {
  const pill = document.getElementById("connection-status");
  const text = document.getElementById("status-text");
  const online = navigator.onLine;
  pill.classList.toggle("status-online", online);
  pill.classList.toggle("status-offline", !online);
  text.textContent = online ? "Online" : "Offline";
  document.querySelectorAll(".btn-ai").forEach((btn) => {
    btn.disabled = !online;
    btn.style.opacity = online ? "1" : "0.5";
  });
  document.getElementById("ai-hint").textContent = online
    ? ""
    : "AI features need a connection — everything else still works offline.";
}
window.addEventListener("online", updateConnectionStatus);
window.addEventListener("offline", updateConnectionStatus);

// ---------- Tabs ----------
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
    if (tab.dataset.tab === "insights") renderInsights();
  });
});

// ---------- Timer ----------
let timerSeconds = 25 * 60;
let timerInterval = null;
let onBreak = false;

function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

function renderTimer() {
  document.getElementById("timer-display").textContent = formatTime(timerSeconds);
}

document.getElementById("timer-start").addEventListener("click", (e) => {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
    e.target.textContent = "Resume";
    return;
  }
  e.target.textContent = "Pause";
  timerInterval = setInterval(() => {
    timerSeconds--;
    renderTimer();
    if (timerSeconds <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      onBreak = !onBreak;
      timerSeconds = onBreak ? 5 * 60 : 25 * 60;
      document.getElementById("timer-mode-label").textContent = onBreak ? "5 min break" : "25 min focus";
      document.getElementById("timer-start").textContent = "Start focus sprint";
      renderTimer();
    }
  }, 1000);
});

document.getElementById("timer-reset").addEventListener("click", () => {
  clearInterval(timerInterval);
  timerInterval = null;
  onBreak = false;
  timerSeconds = 25 * 60;
  document.getElementById("timer-mode-label").textContent = "25 min focus";
  document.getElementById("timer-start").textContent = "Start focus sprint";
  renderTimer();
});

// ---------- Tasks ----------
async function renderTasks() {
  const tasks = await dbGetAll("tasks");
  tasks.sort((a, b) => a.createdAt - b.createdAt);
  const list = document.getElementById("task-list");
  const empty = document.getElementById("task-empty");
  list.innerHTML = "";
  empty.style.display = tasks.length ? "none" : "block";

  const done = tasks.filter((t) => t.done).length;
  document.getElementById("task-progress").textContent = `${done} of ${tasks.length}`;

  tasks.forEach((task) => {
    const li = document.createElement("li");
    li.className = "task-item" + (task.done ? " done" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.done;
    checkbox.addEventListener("change", async () => {
      task.done = checkbox.checked;
      await dbPut("tasks", task);
      renderTasks();
    });

    const textWrap = document.createElement("div");
    textWrap.className = "task-text";
    textWrap.textContent = task.text;

    if (task.steps && task.steps.length) {
      const stepsList = document.createElement("ul");
      stepsList.className = "task-steps";
      task.steps.forEach((s) => {
        const stepLi = document.createElement("li");
        stepLi.textContent = s;
        stepsList.appendChild(stepLi);
      });
      textWrap.appendChild(stepsList);
    }

    const del = document.createElement("button");
    del.className = "task-delete";
    del.textContent = "✕";
    del.addEventListener("click", async () => {
      await dbDelete("tasks", task.id);
      renderTasks();
    });

    li.appendChild(checkbox);
    li.appendChild(textWrap);
    li.appendChild(del);
    list.appendChild(li);
  });
}

document.getElementById("capture-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("capture-input");
  const text = input.value.trim();
  if (!text) return;
  await dbPut("tasks", { id: uid(), text, done: false, createdAt: Date.now(), steps: [] });
  input.value = "";
  renderTasks();
});

document.getElementById("ai-breakdown-btn").addEventListener("click", async () => {
  const input = document.getElementById("capture-input");
  const text = input.value.trim();
  const hint = document.getElementById("ai-hint");
  if (!text) {
    hint.textContent = "Type a task first, then tap this.";
    return;
  }
  hint.textContent = "Breaking it down...";
  try {
    const steps = await callAI({
      system:
        "Break the user's task into 3-5 tiny, concrete, ordered steps for someone with ADHD. Respond ONLY with JSON: {\"steps\": [\"step 1\", \"step 2\"]}.",
      user: text,
      json: true,
    });
    const parsed = JSON.parse(steps);
    await dbPut("tasks", {
      id: uid(),
      text,
      done: false,
      createdAt: Date.now(),
      steps: parsed.steps || [],
    });
    document.getElementById("capture-input").value = "";
    hint.textContent = "";
    renderTasks();
  } catch (err) {
    hint.textContent = "Couldn't reach AI — check your connection or API setup.";
    console.error(err);
  }
});

// ---------- Check-in ----------
let selectedMood = null;
document.querySelectorAll(".scale-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".scale-btn").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedMood = Number(btn.dataset.value);
  });
});

document.getElementById("cycle-start").addEventListener("change", (e) => {
  const display = document.getElementById("cycle-phase-display");
  if (!e.target.value) {
    display.textContent = "";
    return;
  }
  const start = new Date(e.target.value);
  const daysSince = Math.floor((Date.now() - start) / 86400000) % 28;
  let phase = "Follicular phase";
  if (daysSince >= 14 && daysSince < 21) phase = "Ovulation / early luteal";
  else if (daysSince >= 21) phase = "Luteal phase — focus may dip, plan lighter";
  display.textContent = `Estimated: ${phase}`;
});

document.getElementById("save-checkin").addEventListener("click", async () => {
  const sleep = parseFloat(document.getElementById("sleep-hours").value) || null;
  const cycleStart = document.getElementById("cycle-start").value || null;
  await dbPut("checkins", {
    date: todayKey(),
    mood: selectedMood,
    sleep,
    cycleStart,
  });
  document.getElementById("checkin-saved-msg").textContent = "Saved for today.";
  setTimeout(() => {
    document.getElementById("checkin-saved-msg").textContent = "";
  }, 2000);
});

// ---------- Insights ----------
async function renderInsights() {
  const tasks = await dbGetAll("tasks");
  const checkins = await dbGetAll("checkins");

  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  document.getElementById("stat-completion").textContent = total
    ? `${Math.round((done / total) * 100)}%`
    : "0%";

  const last7 = checkins
    .filter((c) => (Date.now() - new Date(c.date)) / 86400000 <= 7)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  let streak = 0;
  let cursor = new Date();
  for (let i = 0; i < 30; i++) {
    const key = cursor.toISOString().slice(0, 10);
    if (checkins.find((c) => c.date === key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else break;
  }
  document.getElementById("stat-streak").textContent = streak;

  const sleepVals = last7.map((c) => c.sleep).filter((v) => v !== null && v !== undefined);
  document.getElementById("stat-sleep").textContent = sleepVals.length
    ? (sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length).toFixed(1) + "h"
    : "–";

  const historyList = document.getElementById("history-list");
  historyList.innerHTML = "";
  last7.forEach((c) => {
    const li = document.createElement("li");
    const moodEmoji = ["", "😞", "😕", "😐", "🙂", "😄"][c.mood] || "–";
    li.innerHTML = `<span>${c.date}</span><span>${moodEmoji} ${c.sleep ? c.sleep + "h sleep" : ""}</span>`;
    historyList.appendChild(li);
  });
}

document.getElementById("ai-summary-btn").addEventListener("click", async () => {
  const output = document.getElementById("ai-summary-output");
  const tasks = await dbGetAll("tasks");
  const checkins = await dbGetAll("checkins");
  output.textContent = "Generating...";
  try {
    const summary = await callAI({
      system:
        "You are a supportive assistant summarizing a week of ADHD task/mood/sleep tracking data. Write a short, plain-language, encouraging summary (4-6 sentences) noting patterns. No JSON, just plain text.",
      user: JSON.stringify({ tasks, checkins }),
      json: false,
    });
    output.textContent = summary;
  } catch (err) {
    output.textContent = "Couldn't reach AI — check your connection or API setup.";
    console.error(err);
  }
});

// ---------- AI proxy call ----------
async function callAI({ system, user, json }) {
  const res = await fetch(AI_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, user, json }),
  });
  if (!res.ok) throw new Error("AI request failed");
  const data = await res.json();
  return data.content;
}

// ---------- Service worker registration ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => console.error("SW registration failed", err));
  });
}

// ---------- Init ----------
(async function init() {
  db = await openDB();
  updateConnectionStatus();
  renderTimer();
  renderTasks();
})();
