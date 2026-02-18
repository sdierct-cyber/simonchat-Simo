// chat.js — Simo UI logic (LOCKED)
// - Stable mode/pro switching + glowing pills
// - Deterministic preview lifecycle (keeps landing + book cover + generic preview)
// - Library + Save build + Download HTML
// - Avoids loops: if preview exists, “show landing page” switches back
// - Dynamic placeholder per mode + pro status

(() => {
  const $ = (id) => document.getElementById(id);

  // ---------- State ----------
  const state = {
    mode: "building",          // building | solving | venting
    pro: false,                // Pro toggle (enables preview attachments + save/download in UI)
    dev: false,                // Dev badge visibility toggle
    currentPreviewName: "",
    currentPreviewHtml: "",
    messages: [],
  };

  // ---------- DOM ----------
  const chatList = $("chatList");
  const msg = $("msg");
  const sendBtn = $("sendBtn");

  const buildingBtn = $("buildingBtn");
  const solvingBtn = $("solvingBtn");
  const ventingBtn = $("ventingBtn");
  const proBtn = $("proBtn");

  const resetBtn = $("resetBtn");
  const devBtn = $("devBtn");
  const saveBtn = $("saveBtn");
  const libraryBtn = $("libraryBtn");

  const uiBadge = $("uiBadge");
  const backendBadge = $("backendBadge");

  const previewFrame = $("previewFrame");
  const previewMeta = $("previewMeta");
  const downloadBtn = $("downloadBtn");
  const clearPreviewBtn = $("clearPreviewBtn");

  const libraryModal = $("libraryModal");
  const libraryList = $("libraryList");
  const libraryClose = $("libraryClose");

  // ---------- Helpers ----------
  function nowISO() {
    const d = new Date();
    return d.toISOString();
  }

  function safeFileName(name) {
    return (name || "preview")
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function setActivePills() {
    buildingBtn.classList.toggle("active", state.mode === "building");
    solvingBtn.classList.toggle("active", state.mode === "solving");
    ventingBtn.classList.toggle("active", state.mode === "venting");
    proBtn.classList.toggle("active", !!state.pro);

    // Glow: active pills get neon box shadow via CSS `.pill.active`
  }

  function setInputPlaceholder() {
    let text = "";
    if (state.mode === "venting") text = "Say what’s on your mind…";
    else if (state.mode === "solving") text = "What are we trying to fix?";
    else text = "Describe what you want to build. Say “show me a preview” for visuals.";

    if (state.pro) text += "  (Pro ON: Save + Download enabled.)";
    msg.placeholder = text;
  }

  function pushMessage(role, text) {
    const item = { role, text, ts: nowISO() };
    state.messages.push(item);

    const row = document.createElement("div");
    row.className = "bubble " + (role === "user" ? "user" : "bot");
    row.innerHTML =
      role === "user"
        ? `<div class="who">You:</div><div class="txt"></div>`
        : `<div class="who">Simo:</div><div class="txt"></div>`;
    row.querySelector(".txt").textContent = text;
    chatList.appendChild(row);
    chatList.scrollTop = chatList.scrollHeight;
  }

  function setPreview(name, html) {
    state.currentPreviewName = name || "";
    state.currentPreviewHtml = html || "";

    // Update iframe
    if (html) {
      previewFrame.srcdoc = html;
      previewMeta.textContent = `${name || "preview"} • mode: ${state.mode} • pro: ${state.pro ? "on" : "off"}`;
    } else {
      previewFrame.srcdoc = "";
      previewMeta.textContent = `none • mode: ${state.mode} • pro: ${state.pro ? "on" : "off"}`;
    }

    // Enable/disable download (UI policy: allow only when Pro ON and we have HTML)
    downloadBtn.disabled = !(state.pro && !!state.currentPreviewHtml);
  }

  function clearPreview() {
    setPreview("", "");
  }

  function loadFromLocalStorage() {
    try {
      const raw = localStorage.getItem("simo_library_v1");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveToLocalStorage(items) {
    localStorage.setItem("simo_library_v1", JSON.stringify(items));
  }

  function openLibrary() {
    const items = loadFromLocalStorage();
    libraryList.innerHTML = "";

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "libEmpty";
      empty.textContent = "Library is empty. Use “Save build” after you generate a preview.";
      libraryList.appendChild(empty);
    } else {
      items
        .sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""))
        .forEach((it, idx) => {
          const row = document.createElement("div");
          row.className = "libRow";

          const left = document.createElement("div");
          left.className = "libLeft";
          left.innerHTML = `
            <div class="libTitle">${it.name || "untitled"}</div>
            <div class="libMeta">${it.kind || "html"} • ${it.savedAt || ""}</div>
          `;

          const right = document.createElement("div");
          right.className = "libRight";

          const loadBtn = document.createElement("button");
          loadBtn.className = "btn";
          loadBtn.textContent = "Load";
          loadBtn.onclick = () => {
            setPreview(it.name || "", it.html || "");
            pushMessage("bot", `Loaded "${it.name || "build"}" from Library.`);
            closeLibrary();
          };

          const delBtn = document.createElement("button");
          delBtn.className = "btn danger";
          delBtn.textContent = "Delete";
          delBtn.onclick = () => {
            const next = items.filter((_, i) => i !== idx);
            saveToLocalStorage(next);
            openLibrary();
          };

          right.appendChild(loadBtn);
          right.appendChild(delBtn);

          row.appendChild(left);
          row.appendChild(right);
          libraryList.appendChild(row);
        });
    }

    libraryModal.classList.add("open");
  }

  function closeLibrary() {
    libraryModal.classList.remove("open");
  }

  function downloadCurrentHtml() {
    if (!state.currentPreviewHtml) return;
    const blob = new Blob([state.currentPreviewHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    const base = safeFileName(state.currentPreviewName || "preview");
    a.href = url;
    a.download = `${base}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  async function sendMessage(text) {
    const message = (text || "").trim();
    if (!message) return;

    pushMessage("user", message);

    // UI policy:
    // - In building mode, previews are expected.
    // - In venting/solving, previews only if user asks for “preview” or “book cover/landing”.
    // Backend also enforces this, but we still send current preview so edits work.
    const payload = {
      message,
      mode: state.mode,
      pro: state.pro,
      current_preview_name: state.currentPreviewName,
      current_preview_html: state.currentPreviewHtml,
    };

    // show “thinking”
    const thinkingId = "thinking_" + Math.random().toString(16).slice(2);
    const thinkingRow = document.createElement("div");
    thinkingRow.className = "bubble bot";
    thinkingRow.id = thinkingId;
    thinkingRow.innerHTML = `<div class="who">Simo:</div><div class="txt">…</div>`;
    chatList.appendChild(thinkingRow);
    chatList.scrollTop = chatList.scrollHeight;

    try {
      const res = await fetch("/.netlify/functions/simon", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      // remove thinking
      const tr = $(thinkingId);
      if (tr) tr.remove();

      // backend badge if present
      if (data?.version) backendBadge.textContent = `backend: ${data.version}`;

      const reply = (data?.reply || "").trim() || "Okay.";
      pushMessage("bot", reply);

      // Preview: prefer new contract, fallback to legacy
      const p = data?.preview;
      const name = p?.name || data?.preview_name || "";
      const html = p?.html || data?.preview_html || "";

      // Only set preview if we actually got HTML back (prevents “polluting” preview panel)
      if (html && name) setPreview(name, html);

    } catch (e) {
      const tr = $(thinkingId);
      if (tr) tr.remove();
      pushMessage("bot", "Something broke on the server call. Open DevTools → Network and check /.netlify/functions/simon.");
    }
  }

  // ---------- Events ----------
  function setMode(mode) {
    state.mode = mode;
    setActivePills();
    setInputPlaceholder();
  }

  buildingBtn.onclick = () => setMode("building");
  solvingBtn.onclick = () => setMode("solving");
  ventingBtn.onclick = () => setMode("venting");

  proBtn.onclick = () => {
    state.pro = !state.pro;
    setActivePills();
    setInputPlaceholder();
    // Enable download if we have HTML
    downloadBtn.disabled = !(state.pro && !!state.currentPreviewHtml);
  };

  devBtn.onclick = () => {
    state.dev = !state.dev;
    document.body.classList.toggle("devOn", state.dev);
  };

  resetBtn.onclick = () => {
    state.messages = [];
    chatList.innerHTML = "";
    pushMessage("bot", "Reset. I’m here.");
    // Keep preview (so you don’t lose work), but you can Clear Preview if you want.
  };

  saveBtn.onclick = () => {
    if (!state.pro) {
      pushMessage("bot", "Turn Pro ON to enable saving.");
      return;
    }
    if (!state.currentPreviewHtml) {
      pushMessage("bot", "Nothing to save yet. Generate a preview first.");
      return;
    }

    const items = loadFromLocalStorage();
    items.push({
      name: state.currentPreviewName || "build",
      kind: "html",
      html: state.currentPreviewHtml,
      savedAt: nowISO(),
    });
    saveToLocalStorage(items);
    pushMessage("bot", `Saved "${state.currentPreviewName || "build"}" to Library.`);
  };

  libraryBtn.onclick = () => openLibrary();
  libraryClose.onclick = () => closeLibrary();
  libraryModal.onclick = (e) => {
    if (e.target === libraryModal) closeLibrary();
  };

  downloadBtn.onclick = () => {
    if (!state.pro) {
      pushMessage("bot", "Turn Pro ON to enable downloads.");
      return;
    }
    downloadCurrentHtml();
  };

  clearPreviewBtn.onclick = () => {
    clearPreview();
    pushMessage("bot", "Preview cleared.");
  };

  sendBtn.onclick = () => {
    const v = msg.value;
    msg.value = "";
    sendMessage(v);
  };

  msg.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });

  // ---------- Boot ----------
  function boot() {
    uiBadge.textContent = "ui: neon-v1";
    backendBadge.textContent = "backend: …";
    setActivePills();
    setInputPlaceholder();

    // initial message
    pushMessage("bot", "Reset. I’m here.");

    // restore last preview if you want (optional):
    // We keep it OFF by default to avoid confusion.
    setPreview("", "");
  }

  boot();
})();
