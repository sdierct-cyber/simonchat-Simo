(() => {
  // ==========================================================
  // Simo chat.js — Checkpoint V1 (STABLE)
  //
  // Fixes:
  // - Enter/Send never break (IDs match + listeners mounted once)
  // - No “stuck Thinking…” (fetch timeout + finally un-busy)
  // - Library never “Invalid Date” (normalize timestamps)
  // - Standardize library: simo_library_v2 + migrate legacy keys
  // - Export/Import backup in Library (Pro gated)
  // - Undo/Redo for previews
  // ==========================================================

  const REQ = [
    "msgs","input","send","statusHint",
    "tierPills","tierFreeLabel","tierProLabel",
    "btnReset","btnSave","btnDownload","btnLibrary",
    "previewFrame","previewLabel","previewMeta",
    "modalBack","closeModal","libHint","libList","clearLib","exportLib","importLib","importFile"
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
    listenersMounted: false,
  };

  // -------------------------
  // INIT
  // -------------------------
  els.tierFreeLabel.textContent = `$${PRICING.free}`;
  els.tierProLabel.textContent  = `$${PRICING.pro}`;

  migrateLibraryToV2();

  state.tier = resolveTier();
  applyTierUI();

  mountOnce();
  renderHistory();
  restorePreview();
  setStatus("Ready");

  if (!state.conversation.length) systemMsg("Simo: Reset. I’m here.");

  // -------------------------
  // Mount listeners once
  // -------------------------
  function mountOnce() {
    if (state.listenersMounted) return;
    state.listenersMounted = true;

    els.tierPills.addEventListener("click", (e) => {
      const pill = e.target.closest(".pill");
      if (!pill) return;
      setTier(pill.dataset.tier, true);
    });

    // keep tier consistent if multiple tabs
    window.addEventListener("storage", (e) => {
      if (e.key === LS.tier) {
        const t = resolveTier();
        if (t !== state.tier) setTier(t, false);
      }
    });

    // composer
    els.send.addEventListener("click", onSend);
    els.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    });

    // buttons
    els.btnReset.addEventListener("click", onReset);
    els.btnSave.addEventListener("click", () => gated(() => saveToLibraryAuto()));
    els.btnDownload.addEventListener("click", () => gated(downloadPreview));
    els.btnLibrary.addEventListener("click", () => gated(openLibrary));

    // modal
    els.closeModal.addEventListener("click", closeLibrary);
    els.modalBack.addEventListener("click", (e) => { if (e.target === els.modalBack) closeLibrary(); });

    els.clearLib.addEventListener("click", () => gated(clearLibrary));
    els.exportLib.addEventListener("click", () => gated(exportLibraryBackup));
    els.importLib.addEventListener("click", () => gated(() => { els.importFile.value = ""; els.importFile.click(); }));
    els.importFile.addEventListener("change", () => gated(() => handleImportFile(els.importFile.files?.[0])));
  }

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
    const merged = Array.isArray(current) ? current.slice() : [];
    const usedIds = new Set(merged.map(x => x?.id).filter(Boolean));

    for (const k of LS.legacyLibraries) {
      const legacy = loadJson(k, null);
      if (!legacy || !Array.isArray(legacy) || legacy.length === 0) continue;

      for (const raw of legacy) {
        const it = normalizeLibraryItem(raw);
        if (!it) continue;
        if (usedIds.has(it.id)) it.id = cryptoId();
        usedIds.add(it.id);
        merged.push(it);
      }
    }

    // normalize any existing items too (fix Invalid Date / missing preview)
    const normalizedAll = merged.map(normalizeLibraryItem).filter(Boolean);

    // de-dupe by id
    const seen = new Set();
    const deduped = [];
    for (const it of normalizedAll) {
      if (!it.id) it.id = cryptoId();
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      deduped.push(it);
    }

    deduped.sort((a, b) => (b.when || 0) - (a.when || 0));

    const hadV2 = localStorage.getItem(LS.library) != null;
    const hadLegacy = LS.legacyLibraries.some(k => localStorage.getItem(k) != null);

    if (!hadV2 && hadLegacy) saveJson(LS.library, deduped);
    else saveJson(LS.library, deduped);
  }

  function normalizeLibraryItem(it) {
    try {
      if (!it || typeof it !== "object") return null;

      const id = it.id || cryptoId();
      const name = (it.name || "Untitled").toString();

      // timestamps: prefer number; if string date, parse; else now
      let when = Date.now();
      if (typeof it.when === "number" && isFinite(it.when)) when = it.when;
      else if (typeof it.savedAt === "number" && isFinite(it.savedAt)) when = it.savedAt;
      else if (typeof it.when === "string") {
        const t = Date.parse(it.when);
        if (!Number.isNaN(t)) when = t;
      } else if (typeof it.savedAt === "string") {
        const t = Date.parse(it.savedAt);
        if (!Number.isNaN(t)) when = t;
      }

      // preview object can be: it.preview {html} or raw html in it.html
      let p = it.preview || it.lastPreview || null;

      if (p && typeof p === "object" && typeof p.html === "string" && p.html.trim()) {
        p = {
          kind: p.kind || "html",
          html: p.html,
          title: p.title || "Preview",
          meta: p.meta || "Saved",
          ts: (typeof p.ts === "number" && isFinite(p.ts)) ? p.ts : when
        };
      } else if (typeof p === "string" && p.trim()) {
        p = { kind: "html", html: p, title: "Preview", meta: "Saved", ts: when };
      } else if (typeof it.html === "string" && it.html.trim()) {
        p = { kind: it.kind || "html", html: it.html, title: "Preview", meta: "Saved", ts: when };
      } else {
        return null;
      }

      const conversation = Array.isArray(it.conversation) ? it.conversation : [];

      return { id, name, when, preview: p, conversation };
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
  // Library
  // -------------------------
  function getLibrary() {
    const raw = loadJson(LS.library, []);
    if (!Array.isArray(raw)) return [];
    // normalize on read (so you never see Invalid Date)
    const n = raw.map(normalizeLibraryItem).filter(Boolean);
    n.sort((a, b) => (b.when || 0) - (a.when || 0));
    // write back normalized (self-heal)
    saveJson(LS.library, n);
    return n;
  }
  function setLibrary(items) { saveJson(LS.library, Array.isArray(items) ? items : []); }

  function deriveBaseName(preview) {
    const kind = preview?.kind || "html";
    if (kind === "cover") return "Book Cover";
    return "Landing Page";
  }

  function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

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
      const d = new Date(it.when || Date.now());
      when.textContent = isNaN(d.getTime()) ? "Older save" : d.toLocaleString();
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
      loadBtn.className = "miniBtn primary";
      loadBtn.type = "button";
      loadBtn.onclick = () => {
        if (it.preview?.html) {
          if (state.lastPreview?.html) pushUndo(state.lastPreview);
          renderPreview({ ...it.preview, meta: "Loaded from Library" });
        }
        if (Array.isArray(it.conversation) && it.conversation.length) {
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
      delBtn.className = "miniBtn danger";
      delBtn.type = "button";
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

        const normalized = incoming.map(normalizeLibraryItem).filter(Boolean);

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
  // Reset / Download
  // -------------------------
  function onReset() {
    state.conversation = [];
    saveJson(LS.conversation, state.conversation);
    els.msgs.innerHTML = "";
    systemMsg("Simo: Reset. I’m here.");
    setStatus("Ready");
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

  // -------------------------
  // Fetch with timeout (prevents “stuck”)
  // -------------------------
  async function fetchWithTimeout(url, options, ms = 25000) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      return res;
    } finally {
      clearTimeout(t);
    }
  }

  // -------------------------
  // Send handler
  // -------------------------
  async function onSend() {
    const text = normalize(els.input.value);
    if (!text || state.busy) return;

    els.input.value = "";
    addMsg("user", text);

    state.conversation.push({ role: "user", content: text });
    saveJson(LS.conversation, state.conversation);

    if (isUndoCmd(text)) return handleUndo();
    if (isRedoCmd(text)) return handleRedo();

    setBusy(true);
    try {
      const payload = {
        text,
        tier: state.tier,
        conversation: state.conversation.slice(-16),
        lastPreview: state.lastPreview ? { kind: state.lastPreview.kind, html: state.lastPreview.html } : null,
      };

      const r = await fetchWithTimeout("/.netlify/functions/simon", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }, 25000);

      // If backend returns HTML or non-JSON, this won't crash the UI
      const j = await r.json().catch(() => ({ ok:false, error:`Bad response (${r.status})` }));

      if (!j || j.ok === false) {
        addMsg("assistant", j?.error ? `Error: ${j.error}` : `Error: Request failed (${r.status}).`);
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
      const msg = (err?.name === "AbortError")
        ? "Error: Request timed out. Try again."
        : `Error: ${err?.message || "Request failed"}`;
      addMsg("assistant", msg);
    } finally {
      setBusy(false);
    }
  }

  // -------------------------
  // Preview meta helper
  // -------------------------
  function setTier(nextTier, announce = true) {
    state.tier = (nextTier === "pro") ? "pro" : "free";
    localStorage.setItem(LS.tier, state.tier);
    applyTierUI();
    if (announce) systemMsg(state.tier === "pro" ? "Pro mode enabled." : "Free mode enabled.");
  }
// === PRO KEY CHECK - ADDED BY GROK FOR SIMO ===
async function handleProKey(message) {
  const text = message.toUpperCase().trim();
  if (text.includes("KEY") || text.includes("-") || text.includes("PRO")) {
    
    const key = text.replace(/[^A-Z0-9-]/g, "");   // clean the key
    
    // Send to our Netlify function
    const response = await fetch("/.netlify/functions/verify-pro", {
      method: "POST",
      body: JSON.stringify({ key: key })
    });
    
    const data = await response.json();
    
    if (data.valid === true) {
      // Unlock the UI
      document.getElementById("pro-status").innerHTML = "✅ Pro Active";
      document.querySelectorAll("#save-btn, #download-btn, #library-btn").forEach(btn => {
        btn.disabled = false;
        btn.style.backgroundColor = "#22c55e";
      });
      addMessage("Simo", "🎉 Pro unlocked forever! Save, Download and Library are ready.", "success");
    } else {
      addMessage("Simo", "❌ Invalid key. Try again.\n\nTest key: SIMO-PRO-2026", "error");
    }
    return true;
  }
  return false;
}

// Add this to your send message function (look for where you do sendMessage or form submit)
document.getElementById("send-button").addEventListener("click", async () => {
  const input = document.getElementById("chat-input").value;
  if (input) {
    await handleProKey(input);   // ← This line makes the key work
    // your existing chat code continues below...
  }
});
