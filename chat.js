/* chat.js
   - Handles chat UI (send button + Enter key)
   - Calls Netlify function /.netlify/functions/simo
   - Intercepts preview requests and shows preview (tab or modal)
*/

(() => {
  "use strict";

  // ---- DOM ----
  const chatEl = document.getElementById("chat");
  const inputEl = document.getElementById("input");
  const sendBtn = document.getElementById("sendBtn");

  const statusTextEl = document.getElementById("statusText");
  const debugLogEl = document.getElementById("debugLog");

  const tabChat = document.getElementById("tabChat");
  const tabPreview = document.getElementById("tabPreview");
  const tabBuilder = document.getElementById("tabBuilder");

  const viewChat = document.getElementById("viewChat");
  const viewPreview = document.getElementById("viewPreview");
  const viewBuilder = document.getElementById("viewBuilder");

  // ---- Basic sanity ----
  if (!chatEl || !inputEl || !sendBtn) {
    alert("Missing required elements (#chat, #input, #sendBtn). Check index.html IDs.");
    return;
  }

  // ---- Config ----
  const ENDPOINT = "/.netlify/functions/simo";
  const MAX_LOCAL_MESSAGES = 40; // local memory sent to backend (trimmed server-side too)

  // ---- Local chat memory ----
  const messages = [];

  // ---- UI helpers ----
  function setStatus(text) {
    if (statusTextEl) statusTextEl.textContent = text;
  }

  function logDebug(line) {
    if (!debugLogEl) return;
    const ts = new Date().toLocaleTimeString();
    debugLogEl.textContent += `[${ts}] ${line}\n`;
    debugLogEl.scrollTop = debugLogEl.scrollHeight;
  }

  function scrollChatToBottom() {
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function addMessage(role, text) {
    const safe = escapeHtml(text);
    const wrap = document.createElement("div");
    wrap.className = `msg ${role === "user" ? "you" : "simo"}`;

    const who = document.createElement("div");
    who.className = "who";
    who.textContent = role === "user" ? "You" : "S";

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = safe.replace(/\n/g, "<br/>");

    wrap.appendChild(who);
    wrap.appendChild(bubble);
    chatEl.appendChild(wrap);
    scrollChatToBottom();
  }

  function setActiveView(which) {
    // Don’t fight app.js if it exists; but we can still do a safe fallback.
    if (!viewChat || !viewPreview || !viewBuilder) return;

    viewChat.style.display = which === "chat" ? "" : "none";
    viewPreview.style.display = which === "preview" ? "" : "none";
    viewBuilder.style.display = which === "builder" ? "" : "none";

    if (tabChat) tabChat.classList.toggle("active", which === "chat");
    if (tabPreview) tabPreview.classList.toggle("active", which === "preview");
    if (tabBuilder) tabBuilder.classList.toggle("active", which === "builder");
  }

  // ---- Preview interception ----
  function showPreviewFromText(userText) {
    const t = String(userText || "").trim();
    if (!t) return false;

    // Detect preview intent
    const wantsPreview =
      /\b(show\s+me\s+a\s+preview|show\s+me\s+preview|preview|mockup|wireframe|what\s+would\s+it\s+look\s+like|ui)\b/i.test(t) &&
      /\b(app|ui|screen|layout|bakery|store|shop|space|rent|parking|driveway)\b/i.test(t);

    if (!wantsPreview) return false;

    // 1) If preview.js is present, let it handle (modal with iframe)
    if (window.SimoPreview && typeof window.SimoPreview.maybeHandle === "function") {
      const res = window.SimoPreview.maybeHandle(t);
      if (res && res.handled) {
        setStatus("Showing preview…");
        logDebug("Preview handled by preview.js modal.");
        return true;
      }
    }

    // 2) Fallback: switch to the in-page preview tab
    if (tabPreview) {
      tabPreview.click();
      setStatus("Showing preview…");
      logDebug("Preview handled by switching to App Preview tab.");
      return true;
    }

    // 3) Absolute fallback: show the preview section directly
    setActiveView("preview");
    setStatus("Showing preview…");
    logDebug("Preview handled by fallback view switch.");
    return true;
  }

  // ---- Network ----
  async function callSimo(userText) {
    // Keep local messages trimmed
    const trimmed = messages.slice(-MAX_LOCAL_MESSAGES);

    const payload = {
      user_text: userText,
      messages: trimmed
    };

    logDebug(`POST ${ENDPOINT} (messages=${trimmed.length})`);

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const err = data?.error || `Request failed (${res.status})`;
      throw new Error(err);
    }

    return String(data?.reply || "").trim() || "Hey — I’m here. What’s going on?";
  }

  // ---- Send ----
  async function send() {
    const text = inputEl.value.trim();

    // Preview intercept FIRST (does not call backend)
    if (showPreviewFromText(text)) {
      inputEl.value = "";
      return;
    }

    if (!text) return;

    // UI: add user message
    addMessage("user", text);
    messages.push({ role: "user", content: text });

    // Clear input + lock send
    inputEl.value = "";
    sendBtn.disabled = true;
    setStatus("Simo is typing…");

    try {
      const reply = await callSimo(text);

      addMessage("assistant", reply);
      messages.push({ role: "assistant", content: reply });

      setStatus("Ready.");
      logDebug("Reply OK.");
    } catch (e) {
      const msg = e?.message || "Network error";
      addMessage("assistant", `I hit an error: ${msg}`);
      messages.push({ role: "assistant", content: `Error: ${msg}` });

      setStatus("Error.");
      logDebug(`ERROR: ${msg}`);
    } finally {
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  // ---- Events ----
  sendBtn.addEventListener("click", () => {
    send();
  });

  inputEl.addEventListener("keydown", (e) => {
    // Enter = send, Shift+Enter = newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  // ---- Optional: tab fallback if app.js isn’t handling it ----
  // We only attach these if the buttons exist; app.js can still override.
  if (tabChat) tabChat.addEventListener("click", () => setActiveView("chat"));
  if (tabPreview) tabPreview.addEventListener("click", () => setActiveView("preview"));
  if (tabBuilder) tabBuilder.addEventListener("click", () => setActiveView("builder"));

  // ---- Boot message ----
  addMessage("assistant", "Hey — I’m Simo. What’s going on?");
  messages.push({ role: "assistant", content: "Hey — I’m Simo. What’s going on?" });

  setStatus("Ready.");
  logDebug("chat.js loaded.");
})();
