const BACKEND = "http://127.0.0.1:8787";

const state = {
  sessionId: null,
  tabId: null,
  paused: false,
  mode: "copy",
  lastSnapshot: null,
  pendingActions: null,
  feedbackAbort: null,
  chatAbort: null,
};

const $ = (id) => document.getElementById(id);

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `s-${Date.now()}-${Math.random()}`;
}

async function ensureSession() {
  const stored = await chrome.storage.session.get(["sessionId"]);
  if (stored.sessionId) {
    state.sessionId = stored.sessionId;
  } else {
    state.sessionId = uuid();
    await chrome.storage.session.set({ sessionId: state.sessionId });
  }
}

async function resolveActiveTab() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "LPC_ACTIVE_TAB" }, (res) => {
      resolve(res?.tab || null);
    });
  });
}

function sendToTab(payload) {
  return new Promise((resolve) => {
    if (!state.tabId) {
      resolve({ ok: false, error: "No active tab" });
      return;
    }
    chrome.runtime.sendMessage(
      { type: "LPC_TO_TAB", tabId: state.tabId, payload },
      (res) => resolve(res || { ok: false })
    );
  });
}

function setConn(ok, label) {
  const el = $("connStatus");
  el.textContent = label;
  el.className = ok ? "pill" : "pill warn";
}

function setCaptureStatus() {
  const el = $("captureStatus");
  if (state.paused) {
    el.textContent = "Paused";
    el.className = "pill warn";
  } else {
    el.textContent = "Capturing";
    el.className = "pill muted";
  }
}

function renderSnapshotMeta(snapshot) {
  if (!snapshot) return;
  $("pageMeta").textContent = `${snapshot.title || "(no title)"} — ${snapshot.url || ""}`;
  $("snapshotDebug").textContent = JSON.stringify(snapshot, null, 2);
}

function appendFeedback(item) {
  const feed = $("feedbackFeed");
  const empty = feed.querySelector(".empty");
  if (empty) empty.remove();

  const div = document.createElement("div");
  div.className = "item" + (item.stub ? " stub" : "");
  div.innerHTML = `<div class="kind">${escapeHtml(item.kind || "note")}</div><p>${escapeHtml(
    item.message || ""
  )}</p>`;
  if (item.selector && !item.stub) {
    div.addEventListener("click", () => {
      sendToTab({ type: "LPC_HIGHLIGHT", selector: item.selector });
    });
  }
  feed.prepend(div);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function postSnapshot(snapshot) {
  const res = await fetch(`${BACKEND}/api/snapshot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: state.sessionId,
      mode: state.mode,
      snapshot,
    }),
  });
  if (!res.ok) throw new Error(`snapshot ${res.status}`);
  return res.json();
}

async function streamSSE(url, body, { onEvent, signal }) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) {
      const lines = chunk.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      let parsed = data;
      try {
        parsed = JSON.parse(data);
      } catch {
        /* plain text */
      }
      onEvent(event, parsed);
    }
  }
}

async function runFeedbackStream() {
  if (state.mode !== "copy") {
    $("feedbackFeed").innerHTML =
      '<div class="item stub"><div class="kind">stub</div><p>This mode is a UI stub in MVP. Switch to Copy review for live streaming feedback.</p></div>';
    return;
  }
  if (!state.lastSnapshot) return;

  if (state.feedbackAbort) state.feedbackAbort.abort();
  state.feedbackAbort = new AbortController();

  try {
    await streamSSE(
      `${BACKEND}/api/feedback/stream`,
      {
        sessionId: state.sessionId,
        mode: state.mode,
        snapshot: state.lastSnapshot,
      },
      {
        signal: state.feedbackAbort.signal,
        onEvent: (event, data) => {
          if (event === "feedback" || event === "message") {
            appendFeedback(data);
          }
          if (event === "status") {
            setConn(true, data.message || "Streaming");
          }
        },
      }
    );
    setConn(true, "Connected");
  } catch (err) {
    if (err.name === "AbortError") return;
    setConn(false, "Backend offline");
  }
}

let feedbackDebounce = null;
function scheduleFeedback() {
  clearTimeout(feedbackDebounce);
  feedbackDebounce = setTimeout(() => runFeedbackStream(), 1200);
}

async function onSnapshot(snapshot, tabId) {
  if (tabId) state.tabId = tabId;
  state.lastSnapshot = snapshot;
  renderSnapshotMeta(snapshot);
  if (state.paused) return;
  try {
    await postSnapshot(snapshot);
    setConn(true, "Connected");
    scheduleFeedback();
  } catch {
    setConn(false, "Backend offline");
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "LPC_SNAPSHOT" && msg.snapshot) {
    onSnapshot(msg.snapshot, msg.tabId);
  }
});

$("pauseBtn").addEventListener("click", async () => {
  state.paused = !state.paused;
  $("pauseBtn").textContent = state.paused ? "Resume" : "Pause";
  $("pauseBtn").classList.toggle("paused", state.paused);
  setCaptureStatus();
  await sendToTab({ type: "LPC_SET_PAUSED", paused: state.paused });
});

document.querySelectorAll(".mode").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mode").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.mode = btn.dataset.mode;
    $("feedbackFeed").innerHTML = "";
    scheduleFeedback();
  });
});

$("refreshFeedback").addEventListener("click", () => {
  $("feedbackFeed").innerHTML = "";
  runFeedbackStream();
});

function showNavPreview(plan) {
  const box = $("navPreview");
  box.classList.remove("hidden");
  const actions = plan.actions || [];
  state.pendingActions = actions;
  const needsConfirm = actions.some((a) => a.requiresConfirm);
  box.innerHTML = `
    <strong>${escapeHtml(plan.summary || "Planned actions")}</strong>
    <ul>${actions
      .map(
        (a) =>
          `<li>${escapeHtml(a.kind)} → ${escapeHtml(
            a.text || a.selector || a.value || ""
          )}${a.requiresConfirm ? " <em>(needs confirm)</em>" : ""}</li>`
      )
      .join("")}</ul>
    <div class="actions">
      <button type="button" class="btn secondary" id="runNav">${
        needsConfirm ? "Preview only / Confirm to run" : "Run"
      }</button>
      ${
        needsConfirm
          ? '<button type="button" class="btn danger" id="confirmNav">Confirm & run</button>'
          : ""
      }
      <button type="button" class="btn ghost" id="cancelNav">Cancel</button>
    </div>
  `;
  $("cancelNav").onclick = () => {
    box.classList.add("hidden");
    state.pendingActions = null;
  };
  $("runNav").onclick = () => executeNav(false);
  const confirmBtn = $("confirmNav");
  if (confirmBtn) confirmBtn.onclick = () => executeNav(true);
}

async function executeNav(confirmed) {
  if (!state.pendingActions?.length) return;
  const res = await sendToTab({
    type: "LPC_RUN_ACTIONS",
    actions: state.pendingActions,
    confirmed,
  });
  const results = res?.results || [];
  const blocked = results.find((r) => r.error === "confirmation_required");
  if (blocked && !confirmed) {
    showNavPreview({
      summary: "Confirmation required before this action",
      actions: state.pendingActions.map((a) =>
        a.kind === blocked.action?.kind ? { ...a, requiresConfirm: true } : a
      ),
    });
    return;
  }
  $("navPreview").innerHTML = `<strong>Done</strong><ul>${results
    .map((r) => `<li>${r.ok ? "✓" : "✗"} ${escapeHtml(JSON.stringify(r.action?.kind))} ${escapeHtml(r.error || r.selector || "")}</li>`)
    .join("")}</ul>`;
  state.pendingActions = null;
}

$("navForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const command = $("navInput").value.trim();
  if (!command) return;
  try {
    const res = await fetch(`${BACKEND}/api/navigate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: state.sessionId,
        command,
        snapshot: state.lastSnapshot,
      }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const plan = await res.json();
    showNavPreview(plan);
    setConn(true, "Connected");
  } catch {
    setConn(false, "Backend offline");
  }
});

function addChat(role, text) {
  const log = $("chatLog");
  const div = document.createElement("div");
  div.className = `chat-bubble ${role}`;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

$("chatForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = $("chatInput").value.trim();
  if (!message) return;
  $("chatInput").value = "";
  addChat("user", message);
  const bubble = addChat("assistant", "");
  if (state.chatAbort) state.chatAbort.abort();
  state.chatAbort = new AbortController();
  try {
    await streamSSE(
      `${BACKEND}/api/chat`,
      {
        sessionId: state.sessionId,
        message,
        snapshot: state.lastSnapshot,
      },
      {
        signal: state.chatAbort.signal,
        onEvent: (event, data) => {
          if (event === "token") {
            bubble.textContent += typeof data === "string" ? data : data.token || "";
            $("chatLog").scrollTop = $("chatLog").scrollHeight;
          }
          if (event === "done" && data?.message) {
            bubble.textContent = data.message;
          }
        },
      }
    );
    setConn(true, "Connected");
  } catch (err) {
    if (err.name !== "AbortError") {
      bubble.textContent = "Could not reach backend.";
      setConn(false, "Backend offline");
    }
  }
});

async function init() {
  await ensureSession();
  $("feedbackFeed").innerHTML = '<div class="empty">Waiting for page changes…</div>';
  setCaptureStatus();

  const tab = await resolveActiveTab();
  if (tab?.id) {
    state.tabId = tab.id;
    const snap = await sendToTab({ type: "LPC_GET_SNAPSHOT" });
    if (snap?.snapshot) onSnapshot(snap.snapshot, tab.id);
  }

  // Health check
  try {
    const res = await fetch(`${BACKEND}/health`);
    setConn(res.ok, res.ok ? "Connected" : "Backend error");
  } catch {
    setConn(false, "Backend offline");
  }
}

init();
