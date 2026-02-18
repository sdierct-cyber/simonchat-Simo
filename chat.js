     (() => {
  // ==========================================================
  // Simo chat.js — Checkpoint V1 (STABLE, NO HANG, NO BROKEN UI)
  //
  // Keeps:
  // - UI ids exactly as index.html
  // - Pro gating
  // - Preview iframe
  // - Save/Download/Library
  //
  // Fixes:
  // - "Thinking..." hang forever -> timeout + abort + always clear busy
  // - Library migration -> always use simo_library_v2 and merge old keys
  // - Export/Import backup in Library modal (Pro)
  // ==========================================================

  const REQ = [
    "msgs","input","send","statusHint",
    "tierPills","tierFreeLabel","tierProLabel",
    "btnReset","btnSave","btnDownload","btnLibrary",
    "previewFrame","previewLabel","previewMeta",
    // modal elements exist in index.html
    "modalBack","closeModal","libList","libHint","clearLib","exportLib","importLib","importFile"
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

  const LS = {
    tier: "simo_tier",
    library: "simo_library_v2",
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

  migrateLibraryToV2();

  state.tier = resolveTier();
  applyTierUI();

  initTierHandlers();
  initComposer();
  initActions();
  initModal();

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

  function persist(role, text) {
    state.conversation.push({ role, content: text });
    saveJson(LS.conversation, state.conversation);
  }

  function normalize(s) { return String(s || "").trim(); }
  function lower(s) { return normalize(s).toLowerCase(); }

  function cryptoId() {
    const a = new Uint32Array(4);
    crypto.getRandomValues(a);
    return [...a].map(n => n.toString(16)).join("");
  }

  // -------------------------
  // Library migration (to v2)
  // -------------------------
  function migrateLibraryToV2() {
    const current = loadJson(LS.library, []);
    const usedIds = new Set(Array.isArray(current) ? current.map(x => x?.id).filter(Boolean) : []);
    let merged = Array.isArray(current) ? current.slice() : [];

    for (const k of LS.legacyLibraries) {
      const legacy = loadJson(k, null);
      if (!legacy || !Array.isArray(legacy) || legacy.length === 0) continue;

      const normalized = legacy
        .map((it) => normalizeLibraryItem(it))
        .filter(Boolean);

      for (const it of normalized) {
        if (usedIds.has(it.id)) it.id = cryptoId();
        usedIds.add(it.id);
        merged.push(it);
      }
    }

    const seen = new Set();
    merged = merged.filter(it => {
      if (!it?.id) it.id = cryptoId();
      if (seen.has(it.id)) return false;
      seen.add(it.id);
      return true;
    });

    merged.sort((a, b) => (b.when || 0) - (a.when || 0));

    const v2Exists = localStorage.getItem(LS.library) != null;
    const anyLegacyExists = LS.legacyLibraries.some(k => localStorage.getItem(k) != null);

    if (!v2Exists && anyLegacyExists) {
      saveJson(LS.library, merged);
    } else if (Array.isArray(current) && merged.length !== current.length) {
      saveJson(LS.library, merged);
    }
  }

  function normalizeLibraryItem(it) {
    try {
      const id = it?.id || cryptoId();
      const name = (it?.name || "Untitled").toString();

      const when =
        (typeof it?.when === "number" && isFinite(it.when)) ? it.when :
        (typeof it?.savedAt === "number" && isFinite(it.savedAt)) ? it.savedAt :
        Date.now();

      const preview = it?.preview || it?.lastPreview || null;

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
    persist("assistant", text);
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
    els.importFile.value = "";
    els.importFile.click();
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
  // Library modal
  // -------------------------
  function initModal() {
    els.closeModal.onclick = closeLibrary;
    els.modalBack.onclick = (e) => { if (e.target === els.modalBack) closeLibrary(); };

    els.clearLib.onclick = () => gated(clearLibrary);
    els.exportLib.onclick = () => gated(exportLibraryBackup);
    els.importLib.onclick = () => gated(openImportPicker);
    els.importFile.onchange = () => gated(() => handleImportFile(els.importFile.files?.[0]));
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
    els.libHint.textContent = items.length
      ? `${items.length} saved item(s).`
      : "No saves yet. Click Save after you generate a preview.";

    for (const it of items) {
      const row = document.createElement("div");
      row.className = "libItem";

      const left = document.createElement("div");

      const name = document.createElement("div");
      name.className = "name";
      name.textContent = it.name || "Untitled";

      const when = document.createElement("div");
      when.className = "when";
      if (it.when) {
        const d = new Date(it.when);
        when.textContent = isNaN(d.getTime()) ? "Older save" : d.toLocaleString();
      } else {
        when.textContent = "Older save";
      }

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
          systemMsg(`Loaded: ${it.name || "Saved item"}`);
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

  // -------------------------
  // Composer (Enter + Send)
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
    persist("user", text);

    if (isUndoCmd(text)) return handleUndo();
    if (isRedoCmd(text)) return handleRedo();

    const saveAsName = parseSaveAs(text);
    if (saveAsName) {
      if (!isPro()) return replyLocal("🔒 Pro feature. Toggle Pro to use Save / Download / Library.");
      saveToLibraryAuto(saveAsName);
      return replyLocal(`Saved as: ${saveAsName}`);
    }

    // -------------------------
    // NET SMART: prevent "Thinking..." hang forever
    // -------------------------
    setBusy(true);

    const TIMEOUT_MS = 12000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

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
        signal: controller.signal,
      });

      const j = await r.json().catch(() => null);

      if (!r.ok || !j) {
        const msg = !r.ok
          ? `Server error (${r.status}). Try again.`
          : "Server returned invalid response. Try again.";
        addMsg("assistant", msg);
        persist("assistant", msg);
        return;
      }

      if (j.ok === false) {
        const msg = j?.error ? `Error: ${j.error}` : "Error: Request failed.";
        addMsg("assistant", msg);
        persist("assistant", msg);
        return;
      }

      const reply = normalize(j.text || j.reply);
      if (reply) {
        addMsg("assistant", reply);
        persist("assistant", reply);
      }

      if (j.preview && typeof j.preview.html === "string" && j.preview.html.trim()) {
        renderPreview({
          kind: j.preview.kind || "html",
          html: j.preview.html,
          title: j.preview.title || "Preview updated",
          meta: j.preview.meta || "Updated",
        });
      }
    } catch (err) {
      const aborted = err && err.name === "AbortError";
      const msg = aborted
        ? "Server timed out. Try again."
        : `Network error. Try again.`;
      addMsg("assistant", msg);
      persist("assistant", msg);
    } finally {
      clearTimeout(timer);
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
