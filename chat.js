/* chat.js — V1 checkpoint
   - Plan tiers + Pro pill
   - Save/Download/Library gated
   - Stable message flow
   - Preview iframe (srcdoc) working
*/

(() => {
  const $ = (id) => document.getElementById(id);

  const els = {
    msgs: $("msgs"),
    input: $("input"),
    send: $("send"),
    statusHint: $("statusHint"),

    tierPills: $("tierPills"),
    tierFreeLabel: $("tierFreeLabel"),
    tierProLabel: $("tierProLabel"),

    btnReset: $("btnReset"),
    btnSave: $("btnSave"),
    btnDownload: $("btnDownload"),
    btnLibrary: $("btnLibrary"),

    previewFrame: $("previewFrame"),
    previewLabel: $("previewLabel"),
    previewMeta: $("previewMeta"),

    modalBack: $("modalBack"),
    closeModal: $("closeModal"),
    libList: $("libList"),
    libHint: $("libHint"),
    clearLib: $("clearLib"),
  };

  // --- State ---
  const PRICING = { free: 0, pro: 19 };
  const LS_KEYS = {
    tier: "simo_tier",
    library: "simo_library_v1",
    lastPreview: "simo_last_preview_v1",
    conversation: "simo_conversation_v1",
  };

  let state = {
    tier: loadTier(),
    conversation: loadConversation(),
    lastPreview: loadLastPreview(),
    busy: false,
  };

  // --- Init ---
  initTierUI();
  initActions();
  initComposer();
  initConversationRender();
  initPreviewFromStorage();
  setStatus("Ready");

  if (state.conversation.length === 0) {
    systemMsg("Simo: Reset. I’m here.");
  }

  // --- UI helpers ---
  function setStatus(text) {
    els.statusHint.textContent = text || "Ready";
  }

  function scrollToBottom() {
    els.msgs.scrollTop = els.msgs.scrollHeight;
  }

  function systemMsg(text) {
    const div = document.createElement("div");
    div.className = "sys";
    div.textContent = text;
    els.msgs.appendChild(div);
    scrollToBottom();
  }

  function addMsg(role, text) {
    const row = document.createElement("div");
    row.className = "msg " + (role === "user" ? "me" : "simo");

    const av = document.createElement("div");
    av.className = "avatar";
    av.textContent = role === "user" ? "You" : "S";

    const b = document.createElement("div");
    b.className = "bubble";
    b.textContent = text;

    row.appendChild(av);
    row.appendChild(b);
    els.msgs.appendChild(row);
    scrollToBottom();
  }

  function setBusy(on) {
    state.busy = !!on;
    els.send.disabled = state.busy;
    els.input.disabled = state.busy;
    setStatus(state.busy ? "Thinking…" : "Ready");
  }

  // --- Tier ---
  function loadTier() {
    const v = localStorage.getItem(LS_KEYS.tier);
    return (v === "pro" || v === "free") ? v : "free";
  }
  function saveTier(tier) {
    localStorage.setItem(LS_KEYS.tier, tier);
  }

  function initTierUI() {
    els.tierFreeLabel.textContent = `$${PRICING.free}`;
    els.tierProLabel.textContent = `$${PRICING.pro}`;

    [...els.tierPills.querySelectorAll(".pill")].forEach(p => {
      p.classList.toggle("active", p.dataset.tier === state.tier);
      p.addEventListener("click", () => {
        const next = p.dataset.tier;
        state.tier = next;
        saveTier(next);
        [...els.tierPills.querySelectorAll(".pill")].forEach(x => x.classList.toggle("active", x.dataset.tier === state.tier));
        refreshGates();
        systemMsg(next === "pro" ? "Pro mode enabled." : "Free mode enabled.");
      });
    });

    refreshGates();
  }

  function isPro() { return state.tier === "pro"; }

  function refreshGates() {
    const pro = isPro();
    setChipLocked(els.btnSave, !pro);
    setChipLocked(els.btnDownload, !pro);
    setChipLocked(els.btnLibrary, !pro);
  }

  function setChipLocked(el, locked) {
    el.classList.toggle("locked", !!locked);
    // keep labels intact (we already show 🔒 in HTML). No UI reflow.
  }

  // --- Composer ---
  function initComposer() {
    els.send.addEventListener("click", onSend);

    els.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    });
  }

  async function onSend() {
    const text = (els.input.value || "").trim();
    if (!text || state.busy) return;

    els.input.value = "";
    addMsg("user", text);
    state.conversation.push({ role: "user", content: text });
    persistConversation();

    setBusy(true);
    try {
      const resp = await callBackend(text);
      if (!resp || resp.ok === false) {
        addMsg("assistant", resp?.error ? `Error: ${resp.error}` : "Error: Something went wrong.");
        return;
      }

      const replyText = resp.text || resp.reply || "";
      if (replyText) {
        addMsg("assistant", replyText);
        state.conversation.push({ role: "assistant", content: replyText });
        persistConversation();
      }

      // Preview contract: resp.preview can be { kind, html, title, meta }
      if (resp.preview && resp.preview.html) {
        renderPreview(resp.preview);
      } else if (resp.preview && resp.preview.kind === "none") {
        // explicit no preview
        setPreviewMeta("Idle", "No preview");
      }

    } catch (err) {
      addMsg("assistant", `Error: ${err?.message || "Request failed"}`);
    } finally {
      setBusy(false);
    }
  }

  // --- Backend call ---
  async function callBackend(userText) {
    const body = {
      text: userText,
      tier: state.tier,
      // send a lightweight context (last 16 turns) to preserve flow
      conversation: state.conversation.slice(-16),
      lastPreview: state.lastPreview ? { kind: state.lastPreview.kind, html: state.lastPreview.html } : null,
    };

    const r = await fetch("/.netlify/functions/simon", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => null);
    return j;
  }

  // --- Preview ---
  function setPreviewMeta(label, meta) {
    els.previewLabel.textContent = label || "Idle";
    els.previewMeta.textContent = meta || "No preview";
  }

  function renderPreview(preview) {
    const kind = preview.kind || "html";
    const title = preview.title || (kind === "cover" ? "Book cover" : "Preview");
    const meta = preview.meta || "Updated";

    // Kill white block: srcdoc + transparent iframe background already set in CSS
    els.previewFrame.srcdoc = preview.html;

    state.lastPreview = { kind, html: preview.html, title, meta, ts: Date.now() };
    localStorage.setItem(LS_KEYS.lastPreview, JSON.stringify(state.lastPreview));

    setPreviewMeta(title, meta);
  }

  function initPreviewFromStorage() {
    if (state.lastPreview?.html) {
      els.previewFrame.srcdoc = state.lastPreview.html;
      setPreviewMeta(state.lastPreview.title || "Preview", state.lastPreview.meta || "Restored");
    } else {
      // Set a dark default blank to avoid “white flash”
      els.previewFrame.srcdoc =
        `<!doctype html><html><head><meta charset="utf-8"><style>
          html,body{height:100%;margin:0;background:transparent}
          .c{height:100%;display:flex;align-items:center;justify-content:center;
             color:#a9b6d3;font-family:system-ui}
        </style></head><body><div class="c">No preview yet</div></body></html>`;
      setPreviewMeta("Idle", "No preview yet");
    }
  }

  function loadLastPreview() {
    try { return JSON.parse(localStorage.getItem(LS_KEYS.lastPreview) || "null"); }
    catch { return null; }
  }

  // --- Conversation persistence ---
  function loadConversation() {
    try { return JSON.parse(localStorage.getItem(LS_KEYS.conversation) || "[]"); }
    catch { return []; }
  }
  function persistConversation() {
    localStorage.setItem(LS_KEYS.conversation, JSON.stringify(state.conversation));
  }

  function initConversationRender() {
    // render prior chat
    for (const turn of state.conversation) {
      if (turn.role === "user") addMsg("user", turn.content);
      if (turn.role === "assistant") addMsg("assistant", turn.content);
    }
    scrollToBottom();
  }

  // --- Actions: Reset / Save / Download / Library ---
  function initActions() {
    els.btnReset.addEventListener("click", () => {
      state.conversation = [];
      persistConversation();
      els.msgs.innerHTML = "";
      systemMsg("Simo: Reset. I’m here.");
      setStatus("Ready");
    });

    els.btnSave.addEventListener("click", () => gated(() => saveToLibrary()));
    els.btnDownload.addEventListener("click", () => gated(() => downloadCurrentPreview()));
    els.btnLibrary.addEventListener("click", () => gated(() => openLibrary()));

    els.closeModal.addEventListener("click", closeLibrary);
    els.modalBack.addEventListener("click", (e) => {
      if (e.target === els.modalBack) closeLibrary();
    });
    els.clearLib.addEventListener("click", () => gated(() => clearLibrary(), true));
  }

  function gated(fn, allowIfProOnly = true) {
    if (allowIfProOnly && !isPro()) {
      systemMsg("🔒 Pro feature. Toggle Pro to use Save / Download / Library.");
      return;
    }
    fn();
  }

  function getLibrary() {
    try { return JSON.parse(localStorage.getItem(LS_KEYS.library) || "[]"); }
    catch { return []; }
  }
  function setLibrary(items) {
    localStorage.setItem(LS_KEYS.library, JSON.stringify(items));
  }

  function saveToLibrary() {
    if (!state.lastPreview?.html) {
      systemMsg("Nothing to save yet. Generate a preview first.");
      return;
    }
    const items = getLibrary();
    const name = prompt("Name this save:", state.lastPreview.title || "Preview") || "";
    const trimmed = name.trim();
    if (!trimmed) return;

    items.unshift({
      id: cryptoRandomId(),
      name: trimmed,
      when: Date.now(),
      preview: state.lastPreview,
      conversation: state.conversation.slice(-24),
    });
    setLibrary(items);
    systemMsg(`Saved: ${trimmed}`);
  }

  function downloadCurrentPreview() {
    if (!state.lastPreview?.html) {
      systemMsg("Nothing to download yet. Generate a preview first.");
      return;
    }
    const filename = (state.lastPreview.kind === "cover") ? "book-cover.html" : "preview.html";
    const blob = new Blob([state.lastPreview.html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    systemMsg(`Downloaded: ${filename}`);
  }

  function openLibrary() {
    els.modalBack.style.display = "flex";
    renderLibrary();
  }
  function closeLibrary() {
    els.modalBack.style.display = "none";
  }

  function renderLibrary() {
    const items = getLibrary();
    els.libList.innerHTML = "";

    if (!items.length) {
      els.libHint.textContent = "No saves yet. Use Save after you generate a preview.";
      return;
    }

    els.libHint.textContent = `${items.length} saved item(s).`;

    for (const it of items) {
      const row = document.createElement("div");
      row.className = "libItem";

      const left = document.createElement("div");
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = it.name;

      const when = document.createElement("div");
      when.className = "when";
      when.textContent = new Date(it.when).toLocaleString();

      left.appendChild(name);
      left.appendChild(when);

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.gap = "8px";

      const loadBtn = document.createElement("button");
      loadBtn.className = "miniBtn primary";
      loadBtn.textContent = "Load";
      loadBtn.onclick = () => {
        if (it.preview?.html) {
          renderPreview({ ...it.preview, meta: "Loaded from Library" });
        }
        if (Array.isArray(it.conversation) && it.conversation.length) {
          state.conversation = it.conversation;
          persistConversation();
          els.msgs.innerHTML = "";
          initConversationRender();
          systemMsg(`Loaded conversation: ${it.name}`);
        }
        closeLibrary();
      };

      const delBtn = document.createElement("button");
      delBtn.className = "miniBtn danger";
      delBtn.textContent = "Delete";
      delBtn.onclick = () => {
        const next = getLibrary().filter(x => x.id !== it.id);
        setLibrary(next);
        renderLibrary();
      };

      right.appendChild(loadBtn);
      right.appendChild(delBtn);

      row.appendChild(left);
      row.appendChild(right);

      els.libList.appendChild(row);
    }
  }

  function clearLibrary() {
    if (!confirm("Clear all saved items?")) return;
    setLibrary([]);
    renderLibrary();
    systemMsg("Library cleared.");
  }

  function cryptoRandomId() {
    // simple stable id
    const a = new Uint32Array(4);
    crypto.getRandomValues(a);
    return [...a].map(n => n.toString(16)).join("");
  }
})();
