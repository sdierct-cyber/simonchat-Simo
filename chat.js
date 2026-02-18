(() => {
  const reqIds = [
    "msgs","input","send","statusHint",
    "tierPills","tierFreeLabel","tierProLabel",
    "btnReset","btnSave","btnDownload","btnLibrary",
    "previewFrame","previewLabel","previewMeta",
    "modalBack","closeModal","libList","libHint","clearLib"
  ];

  const els = {};
  const missing = [];
  for (const id of reqIds) {
    const el = document.getElementById(id);
    if (!el) missing.push(id);
    els[id] = el || null;
  }
  if (missing.length) {
    console.error("Simo UI missing required elements:", missing);
    return;
  }

  const PRICING = { free: 0, pro: 19 };
  const LS = {
    tier: "simo_tier",
    library: "simo_library_v1",
    lastPreview: "simo_last_preview_v1",
    conversation: "simo_conversation_v1",
    undoStack: "simo_preview_undo_v1",
    redoStack: "simo_preview_redo_v1",
  };

  const state = {
    tier: (localStorage.getItem(LS.tier) === "pro") ? "pro" : "free",
    busy: false,
    conversation: loadJson(LS.conversation, []),
    lastPreview: loadJson(LS.lastPreview, null),
    undoStack: loadJson(LS.undoStack, []), // newest first
    redoStack: loadJson(LS.redoStack, []), // newest first
  };

  // ---- init labels ----
  els.tierFreeLabel.textContent = `$${PRICING.free}`;
  els.tierProLabel.textContent = `$${PRICING.pro}`;
  syncTierUI();
  syncGates();
  initComposer();
  initActions();
  renderHistory();
  restorePreview();
  setStatus("Ready");
  if (!state.conversation.length) systemMsg("Simo: Reset. I’m here.");

  function loadJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
    catch { return fallback; }
  }
  function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function setStatus(t) { els.statusHint.textContent = t || "Ready"; }

  function setBusy(on) {
    state.busy = !!on;
    els.send.disabled = state.busy;
    els.input.disabled = state.busy;
    setStatus(state.busy ? "Thinking…" : "Ready");
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
    els.msgs.scrollTop = els.msgs.scrollHeight;
  }

  function systemMsg(text) {
    const div = document.createElement("div");
    div.className = "sys";
    div.textContent = text;
    els.msgs.appendChild(div);
    els.msgs.scrollTop = els.msgs.scrollHeight;
  }

  // ---- tier pills ----
  function syncTierUI() {
    [...els.tierPills.querySelectorAll(".pill")].forEach(p => {
      p.classList.toggle("active", p.dataset.tier === state.tier);
      p.onclick = () => {
        state.tier = p.dataset.tier;
        localStorage.setItem(LS.tier, state.tier);
        syncTierUI();
        syncGates();
        systemMsg(state.tier === "pro" ? "Pro mode enabled." : "Free mode enabled.");
      };
    });
  }
  function isPro() { return state.tier === "pro"; }

  function syncGates() {
    toggleLocked(els.btnSave, !isPro());
    toggleLocked(els.btnDownload, !isPro());
    toggleLocked(els.btnLibrary, !isPro());
  }
  function toggleLocked(el, locked) { el.classList.toggle("locked", !!locked); }

  // ---- history helpers (undo/redo) ----
  function capStacks() {
    state.undoStack = state.undoStack.slice(0, 12);
    state.redoStack = state.redoStack.slice(0, 12);
    saveJson(LS.undoStack, state.undoStack);
    saveJson(LS.redoStack, state.redoStack);
  }

  function pushUndo(snapshot) {
    if (!snapshot?.html) return;
    state.undoStack.unshift(snapshot);
    saveJson(LS.undoStack, state.undoStack);
    // new change clears redo
    state.redoStack = [];
    saveJson(LS.redoStack, state.redoStack);
    capStacks();
  }

  function pushRedo(snapshot) {
    if (!snapshot?.html) return;
    state.redoStack.unshift(snapshot);
    saveJson(LS.redoStack, state.redoStack);
    capStacks();
  }

  function popUndo() {
    const s = state.undoStack.shift() || null;
    saveJson(LS.undoStack, state.undoStack);
    return s;
  }

  function popRedo() {
    const s = state.redoStack.shift() || null;
    saveJson(LS.redoStack, state.redoStack);
    return s;
  }

  function normalizeCmd(s) { return String(s || "").trim(); }
  function normalizeLower(s) { return normalizeCmd(s).toLowerCase(); }

  function isUndoCommand(text) {
    const t = normalizeLower(text);
    return t === "undo" || t === "undo last edit" || t === "undo last" || t === "undo edit";
  }
  function isRedoCommand(text) {
    const t = normalizeLower(text);
    return t === "redo" || t === "redo last" || t === "redo edit";
  }

  // NEW: "save as:" chat command (optional)
  function parseSaveAs(text) {
    const raw = normalizeCmd(text);
    const m = raw.match(/^save\s+as\s*:\s*(.+)$/i);
    if (!m) return null;
    return m[1].trim() || null;
  }

  function handleUndo() {
    if (!state.lastPreview?.html) return replyLocal("Nothing to undo yet — generate a preview first.");
    const prev = popUndo();
    if (!prev?.html) return replyLocal("No previous version found to undo.");

    pushRedo(state.lastPreview);

    state.lastPreview = prev;
    saveJson(LS.lastPreview, state.lastPreview);
    els.previewFrame.srcdoc = prev.html;
    setPreviewMeta(prev.title || "Preview", "Undone to previous version");

    replyLocal("Undone. Preview reverted to the previous version.");
  }

  function handleRedo() {
    if (!state.lastPreview?.html) return replyLocal("Nothing to redo yet — generate a preview first.");
    const next = popRedo();
    if (!next?.html) return replyLocal("No redo version found.");

    state.undoStack.unshift(state.lastPreview);
    saveJson(LS.undoStack, state.undoStack);

    state.lastPreview = next;
    saveJson(LS.lastPreview, state.lastPreview);
    els.previewFrame.srcdoc = next.html;
    setPreviewMeta(next.title || "Preview", "Redone to next version");

    replyLocal("Redone. Preview moved forward to the next version.");
    capStacks();
  }

  function replyLocal(text) {
    addMsg("assistant", text);
    state.conversation.push({ role: "assistant", content: text });
    saveJson(LS.conversation, state.conversation);
  }

  // ---- Auto-versioned Save ----
  function getLibrary() { return loadJson(LS.library, []); }
  function setLibrary(items) { saveJson(LS.library, items); }

  function deriveBaseName(preview) {
    const kind = preview?.kind || "html";
    if (kind === "cover") return "Book Cover";
    // default: landing page / html preview
    return "Landing Page";
  }

  function nextVersionName(base) {
    const items = getLibrary();
    const re = new RegExp("^" + escapeRegExp(base) + "\\s+v(\\d+)$", "i");
    let maxV = 0;
    for (const it of items) {
      const m = String(it.name || "").match(re);
      if (m) {
        const v = parseInt(m[1], 10);
        if (!Number.isNaN(v)) maxV = Math.max(maxV, v);
      }
    }
    return `${base} v${maxV + 1}`;
  }

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function saveToLibraryAuto(optionalName = null) {
    if (!state.lastPreview?.html) return systemMsg("Nothing to save yet. Generate a preview first.");

    const name = (optionalName && optionalName.trim())
      ? optionalName.trim()
      : nextVersionName(deriveBaseName(state.lastPreview));

    const items = getLibrary();
    items.unshift({
      id: cryptoId(),
      name,
      when: Date.now(),
      preview: state.lastPreview,
      conversation: state.conversation.slice(-24),
    });
    setLibrary(items);
    systemMsg(`Saved: ${name}`);
  }

  // ---- composer send ----
  function initComposer() {
    els.send.onclick = onSend;
    els.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
    });
  }

  async function onSend() {
    const text = (els.input.value || "").trim();
    if (!text || state.busy) return;

    els.input.value = "";
    addMsg("user", text);
    state.conversation.push({ role: "user", content: text });
    saveJson(LS.conversation, state.conversation);

    // local commands
    if (isUndoCommand(text)) { handleUndo(); return; }
    if (isRedoCommand(text)) { handleRedo(); return; }

    const saveAsName = parseSaveAs(text);
    if (saveAsName) {
      if (!isPro()) { replyLocal("🔒 Pro feature. Toggle Pro to use Save / Download / Library."); return; }
      saveToLibraryAuto(saveAsName);
      replyLocal(`Saved as: ${saveAsName}`);
      return;
    }

    setBusy(true);
    try {
      const payload = {
        text,
        tier: state.tier,
        conversation: state.conversation.slice(-16),
        lastPreview: state.lastPreview ? { kind: state.lastPreview.kind, html: state.lastPreview.html } : null,
      };

      const r = await fetch("/.netlify/functions/simon", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json().catch(() => null);

      if (!j || j.ok === false) {
        addMsg("assistant", j?.error ? `Error: ${j.error}` : "Error: Request failed.");
        return;
      }

      const reply = (j.text || j.reply || "").trim();
      if (reply) {
        addMsg("assistant", reply);
        state.conversation.push({ role: "assistant", content: reply });
        saveJson(LS.conversation, state.conversation);
      }

      if (j.preview && typeof j.preview.html === "string" && j.preview.html.trim()) {
        renderPreview(j.preview);
      }

    } catch (err) {
      addMsg("assistant", `Error: ${err?.message || "Request failed"}`);
    } finally {
      setBusy(false);
    }
  }

  // ---- preview ----
  function setPreviewMeta(label, meta) {
    els.previewLabel.textContent = label || "Idle";
    els.previewMeta.textContent = meta || "No preview";
  }

  function renderPreview(preview) {
    const kind = preview.kind || "html";
    const title = preview.title || "Preview";
    const meta = preview.meta || "Updated";

    if (state.lastPreview?.html) pushUndo(state.lastPreview);

    els.previewFrame.srcdoc = preview.html;

    state.lastPreview = { kind, html: preview.html, title, meta, ts: Date.now() };
    saveJson(LS.lastPreview, state.lastPreview);

    setPreviewMeta(title, meta);
  }

  function restorePreview() {
    if (state.lastPreview?.html) {
      els.previewFrame.srcdoc = state.lastPreview.html;
      setPreviewMeta(state.lastPreview.title || "Preview", state.lastPreview.meta || "Restored");
    } else {
      els.previewFrame.srcdoc =
        `<!doctype html><html><head><meta charset="utf-8">
        <style>html,body{height:100%;margin:0;background:transparent}
        .c{height:100%;display:flex;align-items:center;justify-content:center;color:#a9b6d3;font-family:system-ui}</style>
        </head><body><div class="c">No preview yet</div></body></html>`;
      setPreviewMeta("Idle", "No preview yet");
    }
  }

  // ---- actions ----
  function initActions() {
    els.btnReset.onclick = () => {
      state.conversation = [];
      saveJson(LS.conversation, state.conversation);
      els.msgs.innerHTML = "";
      systemMsg("Simo: Reset. I’m here.");
      setStatus("Ready");
    };

    // CHANGED: Save is now auto-versioned (no prompt)
    els.btnSave.onclick = () => gated(() => saveToLibraryAuto());

    els.btnDownload.onclick = () => gated(downloadPreview);
    els.btnLibrary.onclick = () => gated(openLibrary);

    els.closeModal.onclick = closeLibrary;
    els.modalBack.onclick = (e) => { if (e.target === els.modalBack) closeLibrary(); };
    els.clearLib.onclick = () => gated(clearLibrary);
  }

  function gated(fn) {
    if (!isPro()) { systemMsg("🔒 Pro feature. Toggle Pro to use Save / Download / Library."); return; }
    fn();
  }

  function downloadPreview() {
    if (!state.lastPreview?.html) return systemMsg("Nothing to download yet. Generate a preview first.");
    const filename = (state.lastPreview.kind === "cover") ? "book-cover.html" : "preview.html";
    const blob = new Blob([state.lastPreview.html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    systemMsg(`Downloaded: ${filename}`);
  }

  function openLibrary() { els.modalBack.style.display = "flex"; renderLibrary(); }
  function closeLibrary() { els.modalBack.style.display = "none"; }

  function renderLibrary() {
    const items = getLibrary();
    els.libList.innerHTML = "";
    els.libHint.textContent = items.length ? `${items.length} saved item(s).` : "No saves yet. Use Save after you generate a preview.";

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
          if (state.lastPreview?.html) pushUndo(state.lastPreview);
          renderPreview({ ...it.preview, meta: "Loaded from Library" });
        }
        if (Array.isArray(it.conversation)) {
          state.conversation = it.conversation;
          saveJson(LS.conversation, state.conversation);
          els.msgs.innerHTML = "";
          renderHistory();
          systemMsg(`Loaded conversation: ${it.name}`);
        }
        closeLibrary();
      };

      const delBtn = document.createElement("button");
      delBtn.className = "miniBtn danger";
      delBtn.textContent = "Delete";
      delBtn.onclick = () => {
        setLibrary(getLibrary().filter(x => x.id !== it.id));
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

  function renderHistory() {
    for (const turn of state.conversation) {
      if (turn.role === "user") addMsg("user", turn.content);
      if (turn.role === "assistant") addMsg("assistant", turn.content);
    }
    els.msgs.scrollTop = els.msgs.scrollHeight;
  }

  function cryptoId() {
    const a = new Uint32Array(4);
    crypto.getRandomValues(a);
    return [...a].map(n => n.toString(16)).join("");
  }
})();
