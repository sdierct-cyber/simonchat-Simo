(() => {
  // ==========================================================
  // Simo chat.js — Market-ready Checkpoint V1+++ (LOCKED UI)
  //
  // Goals:
  // - Do NOT break working UI or message flow
  // - Keep Pro gating stable
  // - Keep Preview iframe stable
  // - Library: SHOW existing saves + never lose them
  // - Add Export/Import backup
  //
  // IMPORTANT FIX:
  // - Standardize library to simo_library_v2
  // - One-time migrate from old keys:
  //   simo_library, simo_library_v1, simo_build_library -> simo_library_v2
  // ==========================================================

  const REQ = [
    "msgs","input","send","statusHint",
    "tierPills","tierFreeLabel","tierProLabel",
    "btnReset","btnSave","btnDownload","btnLibrary",
    "previewFrame","previewLabel","previewMeta"
  ];

  const els = {};
  const missing = [];
  for (const id of REQ) {
    const el = document.getElementById(id);
    els[id] = el || null;
    if (!el) missing.push(id);
  }
  if (missing.length) {
    console.error("Simo UI missing required elements:", missing);
    return;
  }

  const PRICING = { free: 0, pro: 19 };

  // ---- Storage keys (STANDARDIZED) ----
  const LS = {
    tier: "simo_tier",
    // ✅ Standard library key:
    library: "simo_library_v2",
    // old/legacy keys that might exist in your browser:
    legacyLibraries: ["simo_library", "simo_library_v1", "simo_build_library"],
    lastPreview: "simo_last_preview_v1",
    conversation: "simo_conversation_v1",
    undoStack: "simo_preview_undo_v1",
    redoStack: "simo_preview_redo_v1",
  };

  const state = {
    busy: false,
    tier: "free",
    conversation: loadJson(LS.conversation, []),
    lastPreview: loadJson(LS.lastPreview, null),
    undoStack: loadJson(LS.undoStack, []),
    redoStack: loadJson(LS.redoStack, []),
  };

  // -------------------------
  // INIT
  // -------------------------
  els.tierFreeLabel.textContent = `$${PRICING.free}`;
  els.tierProLabel.textContent  = `$${PRICING.pro}`;

  // ✅ One-time library migration before UI renders it
  migrateLibraryToV2();

  state.tier = resolveTier();
  applyTierUI();

  initTierHandlers();
  initComposer();
  initActions();

  renderHistory();
  restorePreview();
  setStatus("Ready");

  if (!state.conversation.length) systemMsg("Simo: Reset. I’m here.");

  // -------------------------
  // Storage helpers
  // -------------------------
  function loadJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
    catch { return fallback; }
  }
  function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

  // -------------------------
  // UI helpers
  // -------------------------
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

  function normalize(s) { return String(s || "").trim(); }
  function lower(s) { return normalize(s).toLowerCase(); }

  function cryptoId() {
    const a = new Uint32Array(4);
    crypto.getRandomValues(a);
    return [...a].map(n => n.toString(16)).join("");
  }

  // -------------------------
  // ✅ Library migration
  // -------------------------
  function migrateLibraryToV2() {
    const current = loadJson(LS.library, []);
    const usedIds = new Set(Array.isArray(current) ? current.map(x => x?.id).filter(Boolean) : []);

    let merged = Array.isArray(current) ? current.slice() : [];

    // Pull from each legacy key, normalize, merge
    for (const k of LS.legacyLibraries) {
      const legacy = loadJson(k, null);
      if (!legacy) continue;

      // Some older builds stored [] or an object shape; accept array only
      if (!Array.isArray(legacy) || legacy.length === 0) continue;

      const normalized = legacy
        .map((it) => normalizeLibraryItem(it))
        .filter(Boolean);

      for (const it of normalized) {
        if (usedIds.has(it.id)) it.id = cryptoId();
        usedIds.add(it.id);
        merged.push(it);
      }
    }

    // De-dup by id (keep first occurrence)
    const seen = new Set();
    merged = merged.filter(it => {
      if (!it?.id) it.id = cryptoId();
      if (seen.has(it.id)) return false;
      seen.add(it.id);
      return true;
    });

    // Sort newest first
    merged.sort((a, b) => (b.when || 0) - (a.when || 0));

    // If anything was merged, write to v2
    // Always write if v2 missing but legacy exists
    const v2Exists = localStorage.getItem(LS.library) != null;
    const anyLegacyExists = LS.legacyLibraries.some(k => localStorage.getItem(k) != null);

    if (!v2Exists && anyLegacyExists) {
      saveJson(LS.library, merged);
    } else if (merged.length !== (Array.isArray(current) ? current.length : 0)) {
      saveJson(LS.library, merged);
    }

    // Optional: do NOT delete legacy keys automatically (safer).
    // If you want cleanup later, we’ll add a “Cleanup old keys” button.
  }

  function normalizeLibraryItem(it) {
    try {
      const id = it?.id || cryptoId();
      const name = (it?.name || "Untitled").toString();

      // Different versions used different timestamp keys
      const when =
        (typeof it?.when === "number" && isFinite(it.when)) ? it.when :
        (typeof it?.savedAt === "number" && isFinite(it.savedAt)) ? it.savedAt :
        Date.now();

      const preview = it?.preview || it?.lastPreview || null;

      // Preview can be stored as { html, kind } or raw html
      let previewObj = null;
      if (preview && typeof preview === "object" && typeof preview.html === "string") {
        previewObj = {
          kind: preview.kind || "html",
          html: preview.html,
          title: preview.title || "Preview",
          meta: preview.meta || "Saved",
          ts: preview.ts || when
        };
      } else if (typeof preview === "string" && preview.trim()) {
        previewObj = { kind: "html", html: preview, title: "Preview", meta: "Saved", ts: when };
      }

      // Some older builds stored html under it.html
      if (!previewObj && typeof it?.html === "string" && it.html.trim()) {
        previewObj = { kind: it.kind || "html", html: it.html, title: "Preview", meta: "Saved", ts: when };
      }

      if (!previewObj || !previewObj.html || !previewObj.html.trim()) return null;

      const conversation = Array.isArray(it?.conversation) ? it.conversation : [];

      return { id, name, when, preview: previewObj, conversation };
    } catch {
      return null;
    }
  }

  // -------------------------
  // Tier (Free/Pro)
  // -------------------------
  function resolveTier() {
    const stored = localStorage.getItem(LS.tier);
    if (stored === "pro" || stored === "free") return stored;

    const active = els.tierPills.querySelector(".pill.active");
    const domTier = active?.dataset?.tier;
    if (domTier === "pro" || domTier === "free") return domTier;

    return "free";
  }

  function isPro() { return state.tier === "pro"; }

  function applyTierUI() {
    [...els.tierPills.querySelectorAll(".pill")].forEach(p => {
      p.classList.toggle("active", p.dataset.tier === state.tier);
    });

    els.btnSave.classList.toggle("locked", !isPro());
    els.btnDownload.classList.toggle("locked", !isPro());
    els.btnLibrary.classList.toggle("locked", !isPro());
  }

  function setTier(nextTier, announce = true) {
    state.tier = (nextTier === "pro") ? "pro" : "free";
    localStorage.setItem(LS.tier, state.tier);
    applyTierUI();
    if (announce) systemMsg(state.tier === "pro" ? "Pro mode enabled." : "Free mode enabled.");
  }

  function initTierHandlers() {
    els.tierPills.addEventListener("click", (e) => {
      const pill = e.target.closest(".pill");
      if (!pill) return;
      setTier(pill.dataset.tier, true);
    });

    window.addEventListener("focus", () => {
      const t = resolveTier();
      if (t !== state.tier) setTier(t, false);
    });
  }

  function gated(fn) {
    if (!isPro()) {
      systemMsg("🔒 Pro feature. Toggle Pro to use Save / Download / Library.");
      return;
    }
    fn();
  }

  // -------------------------
  // Undo / Redo
  // -------------------------
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

  function isUndoCmd(text) {
    const t = lower(text);
    return t === "undo" || t === "undo last edit" || t === "undo last" || t === "undo edit";
  }

  function isRedoCmd(text) {
    const t = lower(text);
    return t === "redo" || t === "redo last" || t === "redo edit";
  }

  function replyLocal(text) {
    addMsg("assistant", text);
    state.conversation.push({ role: "assistant", content: text });
    saveJson(LS.conversation, state.conversation);
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

  // -------------------------
  // Library / Saves
  // -------------------------
  function getLibrary() { return loadJson(LS.library, []); }
  function setLibrary(items) { saveJson(LS.library, items); }

  function deriveBaseName(preview) {
    const kind = preview?.kind || "html";
    if (kind === "cover") return "Book Cover";
    return "Landing Page";
  }

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

  function parseSaveAs(text) {
    const raw = normalize(text);
    const m = raw.match(/^save\s+as\s*:\s*(.+)$/i);
    if (!m) return null;
    return (m[1] || "").trim() || null;
  }

  // -------------------------
  // Preview
  // -------------------------
  function setPreviewMeta(label, meta) {
    els.previewLabel.textContent = label || "Idle";
    els.previewMeta.textContent  = meta || "No preview";
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

  // -------------------------
  // Backup Export/Import (Pro)
  // -------------------------
  function exportLibraryBackup() {
    const payload = {
      schema: "simo_library_backup_v1",
      exportedAt: new Date().toISOString(),
      site: location.origin,
      data: getLibrary(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "simo-library-backup.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    systemMsg("Exported library backup.");
  }

  function openImportPicker() {
    ensureLibraryModal();
    const input = document.getElementById("importFile");
    if (!input) {
      systemMsg("Import control missing. Refresh and try again.");
      return;
    }
    input.value = "";
    input.click();
  }

  function handleImportFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        let incoming = null;

        if (Array.isArray(parsed)) incoming = parsed;
        else if (parsed && Array.isArray(parsed.data)) incoming = parsed.data;

        if (!incoming) throw new Error("Invalid backup format.");

        const normalized = incoming
          .map((it) => normalizeLibraryItem(it))
          .filter(Boolean);

        const current = getLibrary();
        const used = new Set(current.map(x => x.id));
        for (const it of normalized) {
          if (used.has(it.id)) it.id = cryptoId();
          used.add(it.id);
        }

        setLibrary([...normalized, ...current]);
        systemMsg(`Imported ${normalized.length} item(s) into Library.`);
        renderLibrary();
      } catch (e) {
        systemMsg(`Import failed: ${e?.message || "Invalid file"}`);
      }
    };
    reader.readAsText(file);
  }

  // -------------------------
  // Library modal (self-heal)
  // -------------------------
  function ensureLibraryModal() {
    let back  = document.getElementById("modalBack");
    let close = document.getElementById("closeModal");
    let list  = document.getElementById("libList");
    let hint  = document.getElementById("libHint");
    let clear = document.getElementById("clearLib");

    // If core pieces missing: create full modal
    if (!back || !close || !list || !hint || !clear) {
      back = document.createElement("div");
      back.id = "modalBack";
      back.style.position = "fixed";
      back.style.inset = "0";
      back.style.background = "rgba(0,0,0,.55)";
      back.style.display = "none";
      back.style.alignItems = "center";
      back.style.justifyContent = "center";
      back.style.padding = "18px";
      back.style.zIndex = "9999";

      const modal = document.createElement("div");
      modal.style.width = "min(820px, 100%)";
      modal.style.background = "rgba(10,16,32,.92)";
      modal.style.border = "1px solid rgba(255,255,255,.14)";
      modal.style.borderRadius = "18px";
      modal.style.boxShadow = "0 12px 28px rgba(0,0,0,.45)";
      modal.style.overflow = "hidden";

      const head = document.createElement("div");
      head.style.display = "flex";
      head.style.alignItems = "center";
      head.style.justifyContent = "space-between";
      head.style.padding = "12px";
      head.style.borderBottom = "1px solid rgba(255,255,255,.12)";
      head.style.background = "rgba(0,0,0,.18)";

      const title = document.createElement("div");
      title.textContent = "Library";
      title.style.fontWeight = "900";
      title.style.color = "#eaf0ff";

      close = document.createElement("button");
      close.id = "closeModal";
      close.textContent = "Close";
      close.style.cursor = "pointer";
      close.style.border = "1px solid rgba(255,255,255,.16)";
      close.style.background = "rgba(255,255,255,.06)";
      close.style.color = "#eaf0ff";
      close.style.borderRadius = "12px";
      close.style.padding = "8px 10px";
      close.style.fontWeight = "900";

      head.appendChild(title);
      head.appendChild(close);

      const body = document.createElement("div");
      body.style.padding = "12px";

      hint = document.createElement("div");
      hint.id = "libHint";
      hint.textContent = "Saved items appear here (Pro).";
      hint.style.color = "rgba(233,240,255,.72)";
      hint.style.fontSize = "12px";
      hint.style.fontWeight = "800";
      hint.style.marginBottom = "10px";

      list = document.createElement("div");
      list.id = "libList";
      list.style.display = "flex";
      list.style.flexDirection = "column";
      list.style.gap = "8px";
      list.style.maxHeight = "360px";
      list.style.overflow = "auto";

      const footer = document.createElement("div");
      footer.id = "libFooter";
      footer.style.display = "flex";
      footer.style.justifyContent = "space-between";
      footer.style.alignItems = "center";
      footer.style.marginTop = "10px";
      footer.style.gap = "10px";
      footer.style.flexWrap = "wrap";

      const actions = document.createElement("div");
      actions.id = "libActions";
      actions.style.display = "flex";
      actions.style.gap = "8px";
      actions.style.flexWrap = "wrap";

      clear = document.createElement("button");
      clear.id = "clearLib";
      clear.textContent = "Clear All";
      clear.style.cursor = "pointer";
      clear.style.border = "1px solid rgba(255,77,77,.25)";
      clear.style.background = "rgba(255,77,77,.12)";
      clear.style.color = "#eaf0ff";
      clear.style.borderRadius = "12px";
      clear.style.padding = "8px 10px";
      clear.style.fontWeight = "900";

      footer.appendChild(actions);
      footer.appendChild(clear);

      body.appendChild(hint);
      body.appendChild(list);
      body.appendChild(footer);

      modal.appendChild(head);
      modal.appendChild(body);

      back.appendChild(modal);
      document.body.appendChild(back);
    }

    // Ensure actions container exists
    let footer = document.getElementById("libFooter");
    if (!footer) {
      footer = document.createElement("div");
      footer.id = "libFooter";
      footer.style.display = "flex";
      footer.style.justifyContent = "space-between";
      footer.style.alignItems = "center";
      footer.style.marginTop = "10px";
      footer.style.gap = "10px";
      footer.style.flexWrap = "wrap";
      const parent = list?.parentElement;
      if (parent) parent.appendChild(footer);
    }

    let actions = document.getElementById("libActions");
    if (!actions) {
      actions = document.createElement("div");
      actions.id = "libActions";
      actions.style.display = "flex";
      actions.style.gap = "8px";
      actions.style.flexWrap = "wrap";
      footer.prepend(actions);
    }

    // Ensure Export / Import / hidden file input exist
    let exportBtn = document.getElementById("exportLib");
    if (!exportBtn) {
      exportBtn = document.createElement("button");
      exportBtn.id = "exportLib";
      exportBtn.textContent = "Export Backup";
      exportBtn.style.cursor = "pointer";
      exportBtn.style.border = "1px solid rgba(42,102,255,.35)";
      exportBtn.style.background = "rgba(42,102,255,.18)";
      exportBtn.style.color = "#eaf0ff";
      exportBtn.style.borderRadius = "12px";
      exportBtn.style.padding = "8px 10px";
      exportBtn.style.fontWeight = "900";
      actions.appendChild(exportBtn);
    }

    let importBtn = document.getElementById("importLib");
    if (!importBtn) {
      importBtn = document.createElement("button");
      importBtn.id = "importLib";
      importBtn.textContent = "Import Backup";
      importBtn.style.cursor = "pointer";
      importBtn.style.border = "1px solid rgba(57,217,138,.25)";
      importBtn.style.background = "rgba(57,217,138,.14)";
      importBtn.style.color = "#eaf0ff";
      importBtn.style.borderRadius = "12px";
      importBtn.style.padding = "8px 10px";
      importBtn.style.fontWeight = "900";
      actions.appendChild(importBtn);
    }

    let importFile = document.getElementById("importFile");
    if (!importFile) {
      importFile = document.createElement("input");
      importFile.id = "importFile";
      importFile.type = "file";
      importFile.accept = "application/json,.json";
      importFile.style.display = "none";
      actions.appendChild(importFile);
    }

    // Wire (idempotent)
    close.onclick = closeLibrary;
    back.onclick = (e) => { if (e.target === back) closeLibrary(); };
    clear.onclick = () => gated(clearLibrary);

    exportBtn.onclick = () => gated(exportLibraryBackup);
    importBtn.onclick = () => gated(openImportPicker);
    importFile.onchange = () => gated(() => handleImportFile(importFile.files?.[0]));

    // Cache
    els.modalBack = back;
    els.closeModal = close;
    els.libList = list;
    els.libHint = hint;
    els.clearLib = clear;
  }

  function openLibrary() {
    ensureLibraryModal();
    document.getElementById("modalBack").style.display = "flex";
    renderLibrary();
  }

  function closeLibrary() {
    const back = document.getElementById("modalBack");
    if (back) back.style.display = "none";
  }

  function renderLibrary() {
    ensureLibraryModal();
    const items = getLibrary();

    els.libList.innerHTML = "";
    els.libHint.textContent = items.length
      ? `${items.length} saved item(s).`
      : "No saves yet. Click Save after you generate a preview.";

    for (const it of items) {
      const row = document.createElement("div");
      row.style.border = "1px solid rgba(255,255,255,.12)";
      row.style.background = "rgba(0,0,0,.18)";
      row.style.borderRadius = "14px";
      row.style.padding = "10px";
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.justifyContent = "space-between";
      row.style.gap = "10px";
      row.style.color = "#eaf0ff";

      const left = document.createElement("div");

      const name = document.createElement("div");
      name.textContent = it.name || "Untitled";
      name.style.fontWeight = "900";

      const when = document.createElement("div");
      if (it.when) {
        const d = new Date(it.when);
        when.textContent = isNaN(d.getTime()) ? "Older save" : d.toLocaleString();
      } else {
        when.textContent = "Older save";
      }
      when.style.fontSize = "12px";
      when.style.color = "rgba(233,240,255,.72)";
      when.style.fontWeight = "800";

      left.appendChild(name);
      left.appendChild(when);

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.gap = "8px";

      const loadBtn = document.createElement("button");
      loadBtn.textContent = "Load";
      loadBtn.style.cursor = "pointer";
      loadBtn.style.border = "1px solid rgba(42,102,255,.35)";
      loadBtn.style.background = "rgba(42,102,255,.18)";
      loadBtn.style.color = "#eaf0ff";
      loadBtn.style.borderRadius = "12px";
      loadBtn.style.padding = "8px 10px";
      loadBtn.style.fontWeight = "900";
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
          systemMsg(`Loaded: ${it.name || "Saved item"}`);
        }
        closeLibrary();
      };

      const delBtn = document.createElement("button");
      delBtn.textContent = "Delete";
      delBtn.style.cursor = "pointer";
      delBtn.style.border = "1px solid rgba(255,77,77,.25)";
      delBtn.style.background = "rgba(255,77,77,.12)";
      delBtn.style.color = "#eaf0ff";
      delBtn.style.borderRadius = "12px";
      delBtn.style.padding = "8px 10px";
      delBtn.style.fontWeight = "900";
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

  // -------------------------
  // Composer
  // -------------------------
  function initComposer() {
    els.send.onclick = onSend;
    els.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    });
  }

  async function onSend() {
    const text = normalize(els.input.value);
    if (!text || state.busy) return;

    els.input.value = "";
    addMsg("user", text);

    state.conversation.push({ role: "user", content: text });
    saveJson(LS.conversation, state.conversation);

    if (isUndoCmd(text)) return handleUndo();
    if (isRedoCmd(text)) return handleRedo();

    const saveAsName = parseSaveAs(text);
    if (saveAsName) {
      if (!isPro()) return replyLocal("🔒 Pro feature. Toggle Pro to use Save / Download / Library.");
      saveToLibraryAuto(saveAsName);
      return replyLocal(`Saved as: ${saveAsName}`);
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

      const reply = normalize(j.text || j.reply);
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

  // -------------------------
  // Buttons
  // -------------------------
  function initActions() {
    els.btnReset.onclick = () => {
      state.conversation = [];
      saveJson(LS.conversation, state.conversation);
      els.msgs.innerHTML = "";
      systemMsg("Simo: Reset. I’m here.");
      setStatus("Ready");
    };

    els.btnSave.onclick = () => gated(() => saveToLibraryAuto());
    els.btnDownload.onclick = () => gated(downloadPreview);
    els.btnLibrary.onclick = () => gated(openLibrary);
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

  // -------------------------
  // History restore
  // -------------------------
  function renderHistory() {
    for (const turn of state.conversation) {
      if (turn.role === "user") addMsg("user", turn.content);
      if (turn.role === "assistant") addMsg("assistant", turn.content);
    }
    els.msgs.scrollTop = els.msgs.scrollHeight;
  }
})();
