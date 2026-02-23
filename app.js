/* app.js — Simo UI controller (V1.3 FULL STABLE)
   Guaranteed:
   - Your typed text will ALWAYS show in chat (chatLog is hard-wired in index.html)
   - Enter sends, Shift+Enter newline
   - Backend JSON {reply, html} is parsed correctly (no raw JSON bubble)
   - Preview iframe updates via srcdoc
   - Pro toggle verifies key via /.netlify/functions/pro and gates buttons
*/

(() => {
  const $ = (id) => document.getElementById(id);

  const chatLog = $("chatLog");
  const input = $("userInput");
  const sendBtn = $("sendBtn");
  const resetBtn = $("resetBtn");
  const previewFrame = $("previewFrame");
  const previewEmpty = $("previewEmpty");

  const proToggle = $("proToggle");
  const saveBtn = $("saveBtn");
  const dlBtn = $("downloadBtn");
  const libBtn = $("libraryBtn");

  const statusEl = $("status");
  const statusWrap = $("statusWrap");

  const state = {
    pro: false,
    lastHTML: "",
    lastReply: "",
    proKey: localStorage.getItem("PRO_KEY") || ""
  };

  function setStatus(text, ok = true) {
    if (statusEl) statusEl.textContent = text;
    if (statusWrap) {
      statusWrap.classList.toggle("ok", !!ok);
      statusWrap.classList.toggle("bad", !ok);
    }
  }

  function addMsg(who, text) {
    const wrap = document.createElement("div");
    wrap.className = "msg " + (who === "You" ? "you" : "simo");

    const name = document.createElement("div");
    name.className = "who";
    name.textContent = who;

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;

    wrap.appendChild(name);
    wrap.appendChild(bubble);
    chatLog.appendChild(wrap);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function setPreviewHTML(html) {
    state.lastHTML = (html || "").toString();

    if (!state.lastHTML.trim()) {
      previewFrame.style.display = "none";
      previewEmpty.style.display = "flex";
      previewFrame.srcdoc = "";
      return;
    }

    previewEmpty.style.display = "none";
    previewFrame.style.display = "block";
    previewFrame.srcdoc = state.lastHTML;
  }

  function setProUI(on) {
    state.pro = !!on;
    setStatus(on ? "Pro" : "Ready", true);

    saveBtn.disabled = !on;
    dlBtn.disabled = !on;
    libBtn.disabled = !on;
  }

  async function verifyProKey(key) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);

    try {
      const r = await fetch("/.netlify/functions/pro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
        signal: ctrl.signal
      });

      const data = await r.json().catch(() => null);
      return !!(data && data.ok && data.pro);
    } catch {
      return false;
    } finally {
      clearTimeout(t);
    }
  }

  async function ensureProOn() {
    let key = (state.proKey || "").trim();
    if (!key) key = (prompt("Enter your Pro license key:") || "").trim();
    if (!key) return false;

    setStatus("Verifying…", true);
    const ok = await verifyProKey(key);

    if (ok) {
      state.proKey = key;
      localStorage.setItem("PRO_KEY", key);
      setProUI(true);
      return true;
    } else {
      setProUI(false);
      alert("Key not valid. Pro stayed OFF.");
      return false;
    }
  }

  function safeJSON(text) {
    try { return JSON.parse(text); } catch { return null; }
  }

  async function callBackend(userText) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);

    try {
      const r = await fetch("/.netlify/functions/simon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: userText, lastHTML: state.lastHTML }),
        signal: ctrl.signal
      });

      const raw = await r.text();
      const obj = safeJSON(raw);

      // Preferred: backend returns JSON with reply/html
      if (obj && (typeof obj.reply === "string" || typeof obj.html === "string")) {
        return { reply: (obj.reply || "").toString(), html: (obj.html || "").toString(), raw };
      }

      // Fallback: backend returns pure HTML or pure text
      const looksLikeHTML = raw.includes("<!doctype") || raw.includes("<html");
      return {
        reply: looksLikeHTML ? "Done. I updated the preview on the right." : raw,
        html: looksLikeHTML ? raw : "",
        raw
      };
    } finally {
      clearTimeout(t);
    }
  }

  async function onSend() {
    const text = (input.value || "").trim();
    if (!text) return;

    addMsg("You", text);
    input.value = "";

    try {
      setStatus("Thinking…", true);
      const res = await callBackend(text);

      const reply = (res.reply || "").trim() || "Done.";
      addMsg("Simo", reply);
      state.lastReply = reply;

      if (res.html && res.html.trim()) setPreviewHTML(res.html);

      setStatus(state.pro ? "Pro" : "Ready", true);
    } catch {
      addMsg("Simo", "Something failed. Try again.");
      setStatus("Error", false);
    }
  }

  function onReset() {
    chatLog.innerHTML = "";
    setPreviewHTML("");
    addMsg("Simo", "Reset. I’m here.");
    setStatus(state.pro ? "Pro" : "Ready", true);
  }

  // Pro buttons (simple placeholders — won’t break anything)
  function downloadHTML() {
    if (!state.pro) return;
    if (!state.lastHTML.trim()) return alert("No HTML to download yet.");
    const blob = new Blob([state.lastHTML], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "simo-build.html";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function saveBuild() {
    if (!state.pro) return;
    if (!state.lastHTML.trim()) return alert("No HTML to save yet.");
    const name = prompt("Save name:", "Build " + new Date().toLocaleString());
    if (!name) return;
    const items = JSON.parse(localStorage.getItem("SIMO_LIBRARY") || "[]");
    items.unshift({ name, html: state.lastHTML, ts: Date.now() });
    localStorage.setItem("SIMO_LIBRARY", JSON.stringify(items.slice(0, 50)));
    alert("Saved.");
  }

  function openLibrary() {
    if (!state.pro) return;
    const items = JSON.parse(localStorage.getItem("SIMO_LIBRARY") || "[]");
    if (!items.length) return alert("Library is empty.");
    const list = items.map((x, i) => `${i + 1}. ${x.name}`).join("\n");
    const pick = prompt("Choose a number:\n\n" + list);
    const idx = parseInt(pick, 10) - 1;
    if (!Number.isFinite(idx) || !items[idx]) return;
    setPreviewHTML(items[idx].html || "");
    addMsg("Simo", `Loaded: ${items[idx].name}`);
  }

  // Wiring
  sendBtn.addEventListener("click", onSend);
  resetBtn.addEventListener("click", onReset);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  });

  proToggle.addEventListener("change", async () => {
    if (proToggle.checked) {
      const ok = await ensureProOn();
      if (!ok) proToggle.checked = false;
    } else {
      setProUI(false);
    }
  });

  dlBtn.addEventListener("click", downloadHTML);
  saveBtn.addEventListener("click", saveBuild);
  libBtn.addEventListener("click", openLibrary);

  // Boot
  setProUI(false);
  addMsg("Simo", "Reset. I’m here.");
  setStatus("Ready", true);
})();
