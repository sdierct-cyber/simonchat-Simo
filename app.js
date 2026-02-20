/* app.js — Simo UI controller (V1.2.1)
   Fixes:
   - Textbox height stable (CSS in index.html)
   - Empty preview no longer shows white iframe sheet (iframe hidden until HTML)
*/

(() => {
  const $ = (id) => document.getElementById(id);

  const chatEl = $("chat");
  const inputEl = $("input");
  const sendBtn = $("sendBtn");
  const resetBtn = $("resetBtn");
  const statusText = $("statusText");

  const modePill = $("modePill");
  const modeLabel = $("modeLabel");

  const proPill = $("proPill");
  const proLabel = $("proLabel");
  const unlockBtn = $("unlockBtn");

  const previewBtn = $("previewBtn");
  const downloadBtn = $("downloadBtn");
  const saveBtn = $("saveBtn");
  const libraryBtn = $("libraryBtn");

  const topicChip = $("topicChip");
  const draftChip = $("draftChip");

  const iframe = $("iframe");
  const previewEmpty = $("previewEmpty");
  const previewMeta = $("previewMeta");

  const modalBack = $("modalBack");
  const proKeyEl = $("proKey");
  const cancelPro = $("cancelPro");
  const verifyPro = $("verifyPro");

  const state = {
    busy: false,
    mode: "building",
    pro: false,
    topic: "none",
    lastHtml: "",
    messages: [],
  };

  const LS_PRO = "simo_pro_enabled";
  const LS_MODE = "simo_mode";
  const LS_LIB = "simo_library_v1";
  const LS_LASTHTML = "simo_last_html";

  function nowTime() {
    const d = new Date();
    return d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
  }

  function setBusy(v) {
    state.busy = v;
    statusText.textContent = v ? "Working…" : "Ready";
    sendBtn.disabled = v;
    resetBtn.disabled = v;
    previewBtn.disabled = v;
    downloadBtn.disabled = v;
    verifyPro.disabled = v;
    sendBtn.style.opacity = v ? .7 : 1;
  }

  function escapeHtml(s="") {
    return s.replace(/[&<>"]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
  }

  function addMsg(role, text) {
    state.messages.push({ role, text, ts: nowTime() });
    renderChat();
  }

  function renderChat() {
    chatEl.innerHTML = "";
    for (const m of state.messages) {
      const row = document.createElement("div");
      row.className = "msg " + (m.role === "you" ? "you" : "ai");
      row.innerHTML = `
        <div class="avatar">${m.role === "you" ? "You" : "S"}</div>
        <div class="bubble">${escapeHtml(m.text)}</div>
      `;
      chatEl.appendChild(row);
    }
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function setMode(next) {
    state.mode = next;
    localStorage.setItem(LS_MODE, next);
    modeLabel.textContent = `Mode: ${next}`;
    modePill.classList.add("on");
  }

  function setPro(v) {
    state.pro = !!v;
    localStorage.setItem(LS_PRO, v ? "1" : "0");
    proLabel.textContent = v ? "Pro: ON" : "Pro: OFF";
    proPill.classList.toggle("on", v);
    saveBtn.style.opacity = v ? "1" : ".45";
    libraryBtn.style.opacity = v ? "1" : ".45";
  }

  function setTopic(t) {
    state.topic = t || "none";
    topicChip.textContent = `topic: ${state.topic}`;
  }

  function setDraftLabel(label) {
    draftChip.textContent = `draft: ${label || "none"}`;
  }

  function openModal() {
    modalBack.classList.add("show");
    setTimeout(() => proKeyEl.focus(), 50);
  }
  function closeModal() {
    modalBack.classList.remove("show");
    proKeyEl.value = "";
  }

  function extractHtmlFromText(t = "") {
    const m = t.match(/```html\s*([\s\S]*?)```/i);
    return m ? m[1].trim() : "";
  }

  function renderPreview(html) {
    if (!html || !html.trim()) {
      iframe.srcdoc = "";
      iframe.classList.remove("show");       // ✅ hide iframe when empty
      previewEmpty.classList.remove("hidden");
      previewMeta.textContent = "No preview yet";
      return;
    }
    iframe.srcdoc = html;
    iframe.classList.add("show");            // ✅ show only when real HTML
    previewEmpty.classList.add("hidden");
    previewMeta.textContent = "Updated";
  }

  function download(filename, content, mime="text/html") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function loadLibrary() {
    try { return JSON.parse(localStorage.getItem(LS_LIB) || "[]"); }
    catch { return []; }
  }

  function saveToLibrary(item) {
    const lib = loadLibrary();
    lib.unshift(item);
    localStorage.setItem(LS_LIB, JSON.stringify(lib.slice(0, 30)));
  }

  function showLibraryPicker() {
    if (!state.pro) {
      addMsg("ai", "Save/Library are Pro features. Tap “Unlock Pro”.");
      return;
    }
    const lib = loadLibrary();
    if (!lib.length) {
      addMsg("ai", "Library is empty. Build something, then hit Save.");
      return;
    }
    const lines = lib.map((x, i) => `${i+1}) ${x.title} — ${x.when}`);
    const pick = prompt("Library:\n\n" + lines.join("\n") + "\n\nType a number to load:");
    const idx = Number(pick);
    if (!idx || idx < 1 || idx > lib.length) return;

    const item = lib[idx - 1];
    state.lastHtml = item.html || "";
    localStorage.setItem(LS_LASTHTML, state.lastHtml);
    setTopic(item.topic || "none");
    setDraftLabel(item.title || "saved");
    renderPreview(state.lastHtml);
    addMsg("ai", `Loaded: ${item.title}`);
  }

  async function callSimo(userText) {
    const payload = {
      message: userText,
      mode: state.mode,
      topic: state.topic,
      last_html: state.lastHtml || "",
      pro: state.pro,
    };

    const res = await fetch("/.netlify/functions/simon", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  function classifyTopic(text) {
    const t = (text || "").toLowerCase();
    if (/landing page|website|homepage|site\b/.test(t)) return "landing page";
    if (/resume|cv\b/.test(t)) return "resume";
    if (/logo|brand|branding/.test(t)) return "branding";
    if (/app\b|saas|dashboard/.test(t)) return "app";
    if (/house|floor plan|layout/.test(t)) return "home design";
    return state.topic === "none" ? "general" : state.topic;
  }

  async function onSend() {
    const text = (inputEl.value || "").trim();
    if (!text || state.busy) return;

    inputEl.value = "";
    addMsg("you", text);
    setBusy(true);
    setTopic(classifyTopic(text));

    try {
      const { res, data } = await callSimo(text);

      const replyText =
        (typeof data.text === "string" && data.text) ||
        (typeof data.message === "string" && data.message) ||
        (typeof data.output === "string" && data.output) ||
        (res.ok ? "Done." : "Something went wrong.");

      addMsg("ai", replyText);

      const htmlCandidate =
        (typeof data.html === "string" && data.html.trim()) ||
        (typeof data.preview_html === "string" && data.preview_html.trim()) ||
        extractHtmlFromText(replyText);

      if (htmlCandidate) {
        state.lastHtml = htmlCandidate;
        localStorage.setItem(LS_LASTHTML, state.lastHtml);
        setDraftLabel("updated");
        renderPreview(state.lastHtml);
      }

      const askedPreview = /show me (a )?preview|preview\b/i.test(text);
      if (askedPreview && !state.lastHtml) {
        addMsg("ai", "I didn’t receive any HTML to render. That means the backend didn’t send HTML back yet.");
      }
    } catch {
      addMsg("ai", "Network error talking to backend.");
    } finally {
      setBusy(false);
    }
  }

  sendBtn.addEventListener("click", onSend);

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  });

  resetBtn.addEventListener("click", () => {
    state.messages = [];
    state.topic = "none";
    state.lastHtml = "";
    localStorage.removeItem(LS_LASTHTML);
    setDraftLabel("none");
    setTopic("none");
    renderPreview("");
    addMsg("ai", "Reset. I’m here.");
  });

  modePill.addEventListener("click", () => {
    const order = ["building", "venting", "solving"];
    const i = order.indexOf(state.mode);
    setMode(order[(i + 1) % order.length]);
    addMsg("ai", `Mode set to ${state.mode}.`);
  });

  unlockBtn.addEventListener("click", openModal);
  cancelPro.addEventListener("click", closeModal);
  modalBack.addEventListener("click", (e) => { if (e.target === modalBack) closeModal(); });

  verifyPro.addEventListener("click", async () => {
    const key = (proKeyEl.value || "").trim();
    if (!key || state.busy) return;

    setBusy(true);
    try {
      const res = await fetch("/.netlify/functions/pro", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data && data.ok && data.pro) {
        setPro(true);
        addMsg("ai", "Pro unlocked ✅");
        closeModal();
      } else {
        setPro(false);
        addMsg("ai", "Invalid key.");
      }
    } catch {
      addMsg("ai", "Could not verify Pro right now.");
    } finally {
      setBusy(false);
    }
  });

  previewBtn.addEventListener("click", () => {
    if (state.lastHtml) {
      renderPreview(state.lastHtml);
      addMsg("ai", "Preview updated on the right.");
    } else {
      addMsg("ai", "No HTML cached yet. Ask for a build first (example: “build a landing page for a fitness coach”).");
    }
  });

  downloadBtn.addEventListener("click", () => {
    if (!state.lastHtml) {
      addMsg("ai", "Nothing to download yet. Build something first.");
      return;
    }
    download("simo-build.html", state.lastHtml, "text/html");
    addMsg("ai", "Downloaded ✅");
  });

  saveBtn.addEventListener("click", () => {
    if (!state.pro) {
      addMsg("ai", "Save is a Pro feature. Tap “Unlock Pro”.");
      return;
    }
    if (!state.lastHtml) {
      addMsg("ai", "Nothing to save yet. Build something first.");
      return;
    }
    const title = prompt("Name this save:", `Build — ${state.topic}`);
    if (!title) return;
    saveToLibrary({
      title,
      when: new Date().toLocaleString(),
      topic: state.topic,
      html: state.lastHtml,
    });
    addMsg("ai", `Saved: ${title} ✅`);
  });

  libraryBtn.addEventListener("click", showLibraryPicker);

  (function init() {
    setMode(localStorage.getItem(LS_MODE) || "building");
    setPro(localStorage.getItem(LS_PRO) === "1");
    setTopic("none");
    setDraftLabel("none");

    const cached = localStorage.getItem(LS_LASTHTML) || "";
    if (cached.trim()) {
      state.lastHtml = cached;
      renderPreview(state.lastHtml);
      setDraftLabel("cached");
    } else {
      renderPreview("");
    }

    addMsg("ai", "Tell me what you want right now — venting, solving, or building.");
  })();
})();
