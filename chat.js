(() => {
  // ---------- Required elements (must match index.html IDs exactly) ----------
  const el = {
    chatList: document.getElementById("chatList"),
    msg: document.getElementById("msg"),
    sendBtn: document.getElementById("sendBtn"),

    resetBtn: document.getElementById("resetBtn"),
    devBtn: document.getElementById("devBtn"),
    saveBtn: document.getElementById("saveBtn"),
    libraryBtn: document.getElementById("libraryBtn"),

    modeBuilding: document.getElementById("modeBuilding"),
    modeSolving: document.getElementById("modeSolving"),
    modeVenting: document.getElementById("modeVenting"),
    proToggle: document.getElementById("proToggle"),

    uiBadge: document.getElementById("uiBadge"),
    backendBadge: document.getElementById("backendBadge"),

    previewFrame: document.getElementById("previewFrame"),
    previewNameBadge: document.getElementById("previewNameBadge"),
    previewModeBadge: document.getElementById("previewModeBadge"),
    previewProBadge: document.getElementById("previewProBadge"),
    previewStatusBadge: document.getElementById("previewStatusBadge"),
    previewLine: document.getElementById("previewLine"),

    downloadBtn: document.getElementById("downloadBtn"),
    clearPreviewBtn: document.getElementById("clearPreviewBtn"),

    modeLine: document.getElementById("modeLine"),
    proLine: document.getElementById("proLine"),
  };

  const missing = Object.entries(el).filter(([,v]) => !v).map(([k]) => k);
  if (missing.length) {
    document.body.innerHTML = `
      <div style="padding:24px;font-family:system-ui;background:#000;color:#fff">
        <h1>Simo UI Error</h1>
        <p>This page is missing required elements (chat/input/sendBtn).</p>
        <pre style="background:#111;border:1px solid #333;padding:12px;border-radius:12px">${missing.join("\n")}</pre>
        <p>Fix: make sure <b>index.html</b> and <b>chat.js</b> are from the same matched set.</p>
      </div>
    `;
    return;
  }

  // ---------- State ----------
  const LS = {
    PRO: "simo_pro_on_v1",
    MODE: "simo_mode_v1",
    CHAT: "simo_chat_v1",
    PREVIEW: "simo_preview_v1",
    LIB: "simo_library_v1",
  };

  let state = {
    mode: localStorage.getItem(LS.MODE) || "building",
    pro: localStorage.getItem(LS.PRO) === "1",
    chat: [],
    preview: {
      name: "none",
      html: "",
      lastUpdated: 0,
    }
  };

  // ---------- Helpers ----------
  const now = () => Date.now();

  function saveLocal() {
    localStorage.setItem(LS.MODE, state.mode);
    localStorage.setItem(LS.PRO, state.pro ? "1" : "0");
    localStorage.setItem(LS.CHAT, JSON.stringify(state.chat.slice(-80)));
    localStorage.setItem(LS.PREVIEW, JSON.stringify(state.preview));
  }

  function loadLocal() {
    try {
      const c = JSON.parse(localStorage.getItem(LS.CHAT) || "[]");
      if (Array.isArray(c)) state.chat = c;
    } catch {}
    try {
      const p = JSON.parse(localStorage.getItem(LS.PREVIEW) || "{}");
      if (p && typeof p === "object") state.preview = { ...state.preview, ...p };
    } catch {}
  }

  function addBubble(role, text) {
    state.chat.push({ role, text, t: now() });
    renderChat();
    saveLocal();
  }

  function renderChat() {
    el.chatList.innerHTML = "";
    for (const m of state.chat) {
      const div = document.createElement("div");
      div.className = "bubble " + (m.role === "user" ? "me" : "simo");
      div.textContent = (m.role === "user" ? "You: " : "Simo: ") + m.text;
      el.chatList.appendChild(div);
    }
    el.chatList.scrollTop = el.chatList.scrollHeight;
  }

  function setActiveModeButtons() {
    el.modeBuilding.classList.toggle("active", state.mode === "building");
    el.modeSolving.classList.toggle("active", state.mode === "solving");
    el.modeVenting.classList.toggle("active", state.mode === "venting");
    el.modeLine.textContent = `Mode: ${state.mode}`;
    el.previewModeBadge.textContent = `mode: ${state.mode}`;
  }

  function setProUI() {
    el.proToggle.classList.toggle("active", state.pro);
    el.proToggle.setAttribute("aria-pressed", state.pro ? "true" : "false");
    el.proToggle.textContent = state.pro ? "Pro: ON" : "Pro: OFF";

    // Enable premium actions only when pro ON
    el.saveBtn.disabled = !state.pro;
    el.libraryBtn.disabled = !state.pro;
    el.downloadBtn.disabled = !state.pro || !state.preview.html;

    el.proLine.textContent = state.pro
      ? "Pro ON: Save build + Download enabled."
      : "Pro OFF: Save + Download disabled.";

    el.previewProBadge.textContent = `pro: ${state.pro ? "on" : "off"}`;
  }

  function setInputPlaceholder() {
    let text = "";
    if (state.mode === "venting") text = "Say what’s on your mind…";
    else if (state.mode === "solving") text = "What are we trying to fix?";
    else text = "Describe what you want to build. Say 'show me a preview' for visuals.";
    if (state.pro) text += "  (Pro ON: Save + Download enabled.)";
    el.msg.placeholder = text;
  }

  function setBackendBadge(label) {
    el.backendBadge.textContent = `backend: ${label || "?"}`;
  }

  function setPreview({ name, html }) {
    state.preview.name = name || "none";
    state.preview.html = html || "";
    state.preview.lastUpdated = now();

    el.previewNameBadge.textContent = state.preview.name || "none";
    el.previewLine.textContent = state.preview.html ? "Preview loaded." : "No preview yet.";

    if (state.preview.html) {
      // Use srcdoc to avoid hosting issues
      el.previewFrame.srcdoc = state.preview.html;
    } else {
      el.previewFrame.srcdoc = `<html><body style="margin:0;background:transparent"></body></html>`;
    }

    // Download button depends on pro + html
    el.downloadBtn.disabled = !state.pro || !state.preview.html;
    saveLocal();
  }

  function downloadHtml() {
    if (!state.pro || !state.preview.html) return;
    const blob = new Blob([state.preview.html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (state.preview.name || "preview") + ".html";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 250);
  }

  function getLibrary() {
    try { return JSON.parse(localStorage.getItem(LS.LIB) || "[]"); } catch { return []; }
  }
  function setLibrary(items) {
    localStorage.setItem(LS.LIB, JSON.stringify(items));
  }

  function saveBuildToLibrary() {
    if (!state.pro) return;
    if (!state.preview.html) {
      addBubble("assistant", "No preview to save yet. Ask for a preview first.");
      return;
    }
    const items = getLibrary();
    const entry = {
      id: "b_" + now(),
      name: state.preview.name || "preview",
      html: state.preview.html,
      savedAt: now()
    };
    items.unshift(entry);
    setLibrary(items.slice(0, 30));
    addBubble("assistant", `Saved to Library: ${entry.name}.`);
  }

  function openLibrary() {
    if (!state.pro) return;
    const items = getLibrary();
    if (!items.length) {
      addBubble("assistant", "Library is empty. Save a build first.");
      return;
    }
    // Simple: load the most recent (you can later expand to modal UI)
    const top = items[0];
    setPreview({ name: top.name, html: top.html });
    addBubble("assistant", `Loaded from Library: ${top.name}.`);
  }

  // ---------- API call ----------
  async function callSimo(text) {
    el.previewStatusBadge.textContent = "thinking…";

    const payload = {
      text,
      mode: state.mode,
      pro: state.pro,

      // current preview so the function can edit instead of rebuild
      current_preview_name: state.preview.name,
      current_preview_html: state.preview.html,
    };

    const res = await fetch("/.netlify/functions/simon", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    // Prefer server-provided debug label if present
    if (data && data.backend_label) setBackendBadge(data.backend_label);

    if (!res.ok || !data.ok) {
      el.previewStatusBadge.textContent = "error";
      const msg = data?.error || `Server error (${res.status})`;
      addBubble("assistant", msg + (data?.details ? ` — ${data.details}` : ""));
      return;
    }

    el.previewStatusBadge.textContent = "ready";

    if (data.reply) addBubble("assistant", data.reply);

    // Accept BOTH contracts:
    // - legacy: preview_html + preview_name
    // - new: preview: { name, html }
    const pName = data.preview?.name || data.preview_name;
    const pHtml = data.preview?.html || data.preview_html;

    if (pHtml) {
      setPreview({ name: pName || "preview", html: pHtml });
    }
  }

  // ---------- Router to avoid loops ----------
  // If user says "that's good" after a preview, don't ask title again. Just confirm & offer next.
  function isAffirmation(t) {
    const s = (t || "").trim().toLowerCase();
    return ["ok", "okay", "yes", "yep", "thats good", "that's good", "looks good", "perfect", "fine"].includes(s);
  }

  function onSend() {
    const text = (el.msg.value || "").trim();
    if (!text) return;

    el.msg.value = "";
    addBubble("user", text);

    // Tiny client-side guard: if they say "that's good" right after preview, keep it moving
    const lastAssistant = [...state.chat].reverse().find(m => m.role === "assistant");
    if (lastAssistant && isAffirmation(text) && state.preview.html) {
      addBubble("assistant", "Got it. Want to build something else or tweak this preview?");
      return;
    }

    callSimo(text);
  }

  // ---------- Events ----------
  el.sendBtn.addEventListener("click", onSend);
  el.msg.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onSend();
  });

  el.modeBuilding.addEventListener("click", () => {
    state.mode = "building"; setActiveModeButtons(); setInputPlaceholder(); saveLocal();
  });
  el.modeSolving.addEventListener("click", () => {
    state.mode = "solving"; setActiveModeButtons(); setInputPlaceholder(); saveLocal();
  });
  el.modeVenting.addEventListener("click", () => {
    state.mode = "venting"; setActiveModeButtons(); setInputPlaceholder(); saveLocal();
  });

  el.proToggle.addEventListener("click", () => {
    state.pro = !state.pro;
    setProUI();
    setInputPlaceholder();
    saveLocal();
  });

  el.resetBtn.addEventListener("click", () => {
    state.chat = [];
    renderChat();
    addBubble("assistant", "Reset. I’m here.");
  });

  el.clearPreviewBtn.addEventListener("click", () => {
    setPreview({ name: "none", html: "" });
    addBubble("assistant", "Preview cleared.");
  });

  el.downloadBtn.addEventListener("click", downloadHtml);
  el.saveBtn.addEventListener("click", saveBuildToLibrary);
  el.libraryBtn.addEventListener("click", openLibrary);

  el.devBtn.addEventListener("click", () => {
    const info = {
      mode: state.mode,
      pro: state.pro,
      preview: { name: state.preview.name, hasHtml: !!state.preview.html, lastUpdated: state.preview.lastUpdated },
    };
    addBubble("assistant", "Dev: " + JSON.stringify(info));
  });

  // ---------- Init ----------
  loadLocal();
  setBackendBadge("simo-backend-locked-v4");
  setActiveModeButtons();
  setProUI();
  setInputPlaceholder();
  renderChat();

  // Rehydrate preview
  if (state.preview && state.preview.html) {
    setPreview({ name: state.preview.name, html: state.preview.html });
  } else {
    setPreview({ name: "none", html: "" });
  }

  // Greeting if empty
  if (!state.chat.length) addBubble("assistant", "Reset. I’m here.");
})();
