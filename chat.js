(() => {
  // ==========================================================
  // Simo chat.js — Market-ready V1 (anti-stuck + cache-safe)
  //
  // Fixes:
  // 1) If backend returns no preview, we generate a local preview (so it never "sticks").
  // 2) Hide internal meta like "Deterministic • theme: pro" from preview header.
  // 3) Keep Pro gating + library + export/import + undo/redo stable.
  // ==========================================================

  const REQ = [
    "msgs","input","send","statusHint",
    "tierPills","tierFreeLabel","tierProLabel",
    "btnReset","btnSave","btnDownload","btnLibrary",
    "previewFrame","previewLabel","previewMeta",
    "toastWrap"
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
  initStarters();

  renderHistory();
  restorePreview();
  setStatus("Ready");

  if (!state.conversation.length) {
    const hello =
      "What are you building?\n\n" +
      "Describe your landing page in one sentence (or click an example).";
    addAssistant(hello);
    persistAssistant(hello);
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

  function toast(text, kind = "ok", ms = 2200) {
    const div = document.createElement("div");
    div.className = "toast " + (kind || "ok");
    div.textContent = text;
    els.toastWrap.appendChild(div);
    setTimeout(() => {
      div.style.opacity = "0";
      div.style.transform = "translateY(-4px)";
      div.style.transition = "all 180ms ease";
      setTimeout(() => div.remove(), 220);
    }, ms);
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

  function addAssistant(text) { addMsg("assistant", text); }

  function persistAssistant(text) {
    state.conversation.push({ role: "assistant", content: text });
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
  // Starter chips
  // -------------------------
  function initStarters() {
    const row = document.getElementById("starterRow");
    if (!row) return;
    row.addEventListener("click", (e) => {
      const chip = e.target.closest(".starter");
      if (!chip) return;
      const text = chip.getAttribute("data-text") || "";
      if (!text.trim()) return;
      els.input.value = text;
      els.input.focus();
    });
  }

  // -------------------------
  // Library migration
  // -------------------------
  function migrateLibraryToV2() {
    const current = loadJson(LS.library, []);
    const usedIds = new Set(Array.isArray(current) ? current.map(x => x?.id).filter(Boolean) : []);
    let merged = Array.isArray(current) ? current.slice() : [];

    for (const k of LS.legacyLibraries) {
      const legacy = loadJson(k, null);
      if (!legacy) continue;
      if (!Array.isArray(legacy) || legacy.length === 0) continue;

      const normalized = legacy.map((it) => normalizeLibraryItem(it)).filter(Boolean);

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

    if (!v2Exists && anyLegacyExists) saveJson(LS.library, merged);
    else if (merged.length !== (Array.isArray(current) ? current.length : 0)) saveJson(LS.library, merged);
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
        previewObj = { kind: preview.kind || "html", html: preview.html, title: preview.title || "Preview", meta: preview.meta || "Saved", ts: preview.ts || when };
      } else if (typeof preview === "string" && preview.trim()) {
        previewObj = { kind: "html", html: preview, title: "Preview", meta: "Saved", ts: when };
      }
      if (!previewObj && typeof it?.html === "string" && it.html.trim()) {
        previewObj = { kind: it.kind || "html", html: it.html, title: "Preview", meta: "Saved", ts: when };
      }

      if (!previewObj?.html?.trim()) return null;
      const conversation = Array.isArray(it?.conversation) ? it.conversation : [];
      return { id, name, when, preview: previewObj, conversation };
    } catch {
      return null;
    }
  }

  // -------------------------
  // Tier
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
    if (announce) toast(state.tier === "pro" ? "Pro enabled" : "Free mode", "ok");
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
      toast("Pro feature — toggle Pro to use Save / Export / My Pages", "warn", 2600);
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
    addAssistant(text);
    persistAssistant(text);
  }

  function handleUndo() {
    if (!state.lastPreview?.html) return replyLocal("Nothing to undo yet — generate a preview first.");
    const prev = popUndo();
    if (!prev?.html) return replyLocal("No previous version found to undo.");
    pushRedo(state.lastPreview);
    state.lastPreview = prev;
    saveJson(LS.lastPreview, state.lastPreview);
    els.previewFrame.srcdoc = prev.html;
    setPreviewMeta(prev.title || "Preview", "Updated");
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
    setPreviewMeta(next.title || "Preview", "Updated");
    replyLocal("Redone. Preview moved forward to the next version.");
    capStacks();
  }

  // -------------------------
  // Preview (ANTI-STUCK)
  // -------------------------
  function setPreviewMeta(label, meta) {
    // HARD-STOP showing internal meta like "Deterministic • theme: pro"
    const cleanLabel = String(label || "Preview").trim() || "Preview";
    els.previewLabel.textContent = cleanLabel;
    els.previewMeta.textContent = "Updated";
  }

  function renderPreview(preview) {
    const kind = preview.kind || "html";
    const title = preview.title || "Landing page";

    if (state.lastPreview?.html) pushUndo(state.lastPreview);

    els.previewFrame.srcdoc = preview.html;

    state.lastPreview = { kind, html: preview.html, title, meta: "Updated", ts: Date.now() };
    saveJson(LS.lastPreview, state.lastPreview);

    setPreviewMeta(title, "Updated");
  }

  function restorePreview() {
    if (state.lastPreview?.html) {
      els.previewFrame.srcdoc = state.lastPreview.html;
      setPreviewMeta(state.lastPreview.title || "Preview", "Updated");
    } else {
      els.previewFrame.srcdoc =
        `<!doctype html><html><head><meta charset="utf-8">
        <style>html,body{height:100%;margin:0;background:transparent}
        .c{height:100%;display:flex;align-items:center;justify-content:center;color:#a9b6d3;font-family:system-ui}</style>
        </head><body><div class="c">No preview yet</div></body></html>`;
      setPreviewMeta("Idle", "Updated");
    }
  }

  // Local fallback preview generator (so it NEVER looks stuck)
  function shouldAutoPreview(text) {
    const t = lower(text);
    return (
      t.includes("landing page") ||
      t.includes("waitlist") ||
      t.includes("saas") ||
      t.includes("coach") ||
      t.includes("clinic") ||
      t.includes("dent") ||
      t.includes("gym") ||
      t.startsWith("build ") ||
      t.startsWith("create ")
    );
  }

  function guessProductName(text) {
    const t = normalize(text);
    // grab something like "for X" / "for a X"
    const m = t.match(/\bfor\s+(an?\s+)?(.+?)(\.|,|$)/i);
    if (m && m[2]) return m[2].trim().slice(0, 40);
    return "Your Offer";
  }

  function localPreviewHTML(prompt) {
    const product = guessProductName(prompt);
    const headline = `${product} — made simple`;
    const sub = "A clean landing page you can export as HTML. Ask me to change sections, CTA, or copy.";
    const cta1 = "Get Started";
    const cta2 = "Learn More";

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(product)}</title>
<style>
  :root{--bg:#0b1020;--text:#eaf0ff;--muted:#a9b6d3;--line:rgba(255,255,255,.14);--acc:#39ff7a}
  *{box-sizing:border-box} body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;background:radial-gradient(1200px 700px at 20% 0%, #162a66 0%, var(--bg) 55%);color:var(--text)}
  .wrap{max-width:980px;margin:0 auto;padding:28px}
  .nav{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:26px}
  .logo{display:flex;align-items:center;gap:10px;font-weight:900}
  .dot{width:10px;height:10px;border-radius:99px;background:var(--acc);box-shadow:0 0 18px rgba(57,255,122,.6)}
  .pill{border:1px solid var(--line);background:rgba(255,255,255,.05);padding:8px 12px;border-radius:999px;font-weight:800;font-size:12px}
  .hero{display:grid;grid-template-columns:1.1fr .9fr;gap:18px;align-items:start}
  @media (max-width:860px){.hero{grid-template-columns:1fr}}
  h1{font-size:48px;line-height:1.05;margin:0 0 10px}
  p{color:var(--muted);font-weight:650;line-height:1.5}
  .btns{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
  .btn{display:inline-flex;align-items:center;justify-content:center;padding:12px 14px;border-radius:14px;font-weight:900;border:1px solid rgba(255,255,255,.14);text-decoration:none;color:var(--text);background:rgba(255,255,255,.05)}
  .btn.primary{border-color:rgba(57,255,122,.35);background:rgba(57,255,122,.14)}
  .card{border:1px solid var(--line);background:rgba(0,0,0,.18);border-radius:18px;padding:16px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px}
  @media (max-width:860px){.grid{grid-template-columns:1fr}}
  .k{font-weight:900;margin:0 0 6px}
  .section{margin-top:22px}
  .section h2{margin:0 0 10px;font-size:20px}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  @media (max-width:860px){.row{grid-template-columns:1fr}}
</style>
</head>
<body>
  <div class="wrap">
    <div class="nav">
      <div class="logo"><span class="dot"></span> ${escapeHtml(product)}</div>
      <div class="pill">Preview</div>
    </div>

    <div class="hero">
      <div>
        <h1>${escapeHtml(headline)}</h1>
        <p>${escapeHtml(sub)}</p>
        <div class="btns">
          <a class="btn primary" href="#">${escapeHtml(cta1)}</a>
          <a class="btn" href="#">${escapeHtml(cta2)}</a>
        </div>

        <div class="grid">
          <div class="card"><div class="k">Fast</div><p>Clean structure that converts.</p></div>
          <div class="card"><div class="k">Clear</div><p>Headline → value → call to action.</p></div>
          <div class="card"><div class="k">Exportable</div><p>Download HTML and ship.</p></div>
        </div>
      </div>

      <div class="card">
        <div class="k">What you can ask</div>
        <p style="margin-top:6px">“Change the headline”, “Add pricing”, “Add testimonials”, “Add FAQ”, “Make it more premium”.</p>
        <div class="section">
          <h2>Quick notes</h2>
          <p>${escapeHtml(prompt)}</p>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Sections</h2>
      <div class="row">
        <div class="card"><div class="k">Features</div><p>3–6 bullets that explain why it’s worth it.</p></div>
        <div class="card"><div class="k">Testimonials</div><p>2–3 short reviews with names + outcomes.</p></div>
        <div class="card"><div class="k">Pricing</div><p>Simple tier cards with one recommended plan.</p></div>
        <div class="card"><div class="k">FAQ</div><p>5 common objections answered clearly.</p></div>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#39;");
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
    if (!state.lastPreview?.html) return toast("Nothing to save yet — generate a preview first.", "warn", 2600);

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
    toast(`Saved: ${name}`, "ok");
  }

  function parseSaveAs(text) {
    const raw = normalize(text);
    const m = raw.match(/^save\s+as\s*:\s*(.+)$/i);
    if (!m) return null;
    return (m[1] || "").trim() || null;
  }

  // -------------------------
  // Backup Export/Import (Pro)
  // -------------------------
  function exportLibraryBackup() {
    const payload = { schema: "simo_library_backup_v1", exportedAt: new Date().toISOString(), site: location.origin, data: getLibrary() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "simo-library-backup.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Backup exported", "ok");
  }

  function openImportPicker() {
    ensureLibraryModal();
    const input = document.getElementById("importFile");
    if (!input) return toast("Import control missing — refresh and try again.", "warn", 2800);
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

        const normalized = incoming.map((it) => normalizeLibraryItem(it)).filter(Boolean);
        const current = getLibrary();
        const used = new Set(current.map(x => x.id));
        for (const it of normalized) { if (used.has(it.id)) it.id = cryptoId(); used.add(it.id); }

        setLibrary([...normalized, ...current]);
        toast(`Imported ${normalized.length} item(s)`, "ok", 2600);
        renderLibrary();
      } catch (e) {
        toast(`Import failed: ${e?.message || "Invalid file"}`, "bad", 3000);
      }
    };
    reader.readAsText(file);
  }

  // -------------------------
  // Library modal (kept)
  // -------------------------
  function ensureLibraryModal() {
    let back  = document.getElementById("modalBack");
    let close = document.getElementById("closeModal");
    let list  = document.getElementById("libList");
    let hint  = document.getElementById("libHint");
    let clear = document.getElementById("clearLib");

    // If modal exists (from index.html), use it
    if (!back || !close || !list || !hint || !clear) return;

    // Ensure actions + file input exist
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
      list.parentElement.appendChild(footer);
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

    let exportBtn = document.getElementById("exportLib");
    if (!exportBtn) {
      exportBtn = document.createElement("button");
      exportBtn.id = "exportLib";
      exportBtn.className = "miniBtn primary";
      exportBtn.textContent = "Export Backup";
      actions.appendChild(exportBtn);
    }

    let importBtn = document.getElementById("importLib");
    if (!importBtn) {
      importBtn = document.createElement("button");
      importBtn.id = "importLib";
      importBtn.className = "miniBtn";
      importBtn.textContent = "Import Backup";
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

    // Wire
    close.onclick = closeLibrary;
    back.onclick = (e) => { if (e.target === back) closeLibrary(); };
    clear.onclick = () => gated(clearLibrary);

    exportBtn.onclick = () => gated(exportLibraryBackup);
    importBtn.onclick = () => gated(openImportPicker);
    importFile.onchange = () => gated(() => handleImportFile(importFile.files?.[0]));

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
      ? `${items.length} saved page(s).`
      : "No saves yet. Generate a preview, then Save.";

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
      } else when.textContent = "Older save";

      left.appendChild(name);
      left.appendChild(when);

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.gap = "8px";

      const loadBtn = document.createElement("button");
      loadBtn.className = "miniBtn primary";
      loadBtn.textContent = "Load";
      loadBtn.onclick = () => {
        if (it.preview?.html) renderPreview({ ...it.preview, title: "Landing page", meta: "Updated" });
        if (Array.isArray(it.conversation) && it.conversation.length) {
          state.conversation = it.conversation;
          saveJson(LS.conversation, state.conversation);
          els.msgs.innerHTML = "";
          renderHistory();
        }
        toast("Loaded", "ok");
        closeLibrary();
      };

      const delBtn = document.createElement("button");
      delBtn.className = "miniBtn danger";
      delBtn.textContent = "Delete";
      delBtn.onclick = () => {
        setLibrary(getLibrary().filter(x => x.id !== it.id));
        renderLibrary();
        toast("Deleted", "ok");
      };

      right.appendChild(loadBtn);
      right.appendChild(delBtn);

      row.appendChild(left);
      row.appendChild(right);
      els.libList.appendChild(row);
    }
  }

  function clearLibrary() {
    if (!confirm("Clear all saved pages?")) return;
    setLibrary([]);
    renderLibrary();
    toast("Cleared", "ok");
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
      if (!isPro()) return replyLocal("🔒 Pro feature. Toggle Pro to use Save / Export / My Pages.");
      saveToLibraryAuto(saveAsName);
      return replyLocal(`Saved as: ${saveAsName}`);
    }

    // 🔥 Instant local preview so it never "sticks"
    if (shouldAutoPreview(text)) {
      renderPreview({ kind: "html", title: "Landing page", meta: "Updated", html: localPreviewHTML(text) });
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
        const msg = j?.error ? `Error: ${j.error}` : "Error: Request failed.";
        addAssistant(msg);
        persistAssistant(msg);
        toast("Backend error — using local preview", "warn", 2800);
        return;
      }

      const reply = normalize(j.text || j.reply);
      if (reply) {
        addAssistant(reply);
        persistAssistant(reply);
      }

      // If backend provides a preview, it wins (overwrites local)
      if (j.preview && typeof j.preview.html === "string" && j.preview.html.trim()) {
        renderPreview({ ...j.preview, title: "Landing page", meta: "Updated" });
      }
    } catch (err) {
      const msg = `Error: ${err?.message || "Request failed"}`;
      addAssistant(msg);
      persistAssistant(msg);
      toast("Network error — using local preview", "warn", 2800);
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
      const hello =
        "What are you building?\n\n" +
        "Describe your landing page in one sentence (or click an example).";
      addAssistant(hello);
      persistAssistant(hello);
      setStatus("Ready");
      toast("New chat", "ok");
    };

    els.btnSave.onclick = () => gated(() => saveToLibraryAuto());
    els.btnDownload.onclick = () => gated(downloadPreview);
    els.btnLibrary.onclick = () => gated(openLibrary);
  }

  function downloadPreview() {
    if (!state.lastPreview?.html) return toast("Nothing to export yet — generate a preview first.", "warn", 2600);
    const filename = "landing-page.html";
    const blob = new Blob([state.lastPreview.html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast("Exported HTML", "ok");
  }

  function renderHistory() {
    for (const turn of state.conversation) {
      if (turn.role === "user") addMsg("user", turn.content);
      if (turn.role === "assistant") addMsg("assistant", turn.content);
    }
    els.msgs.scrollTop = els.msgs.scrollHeight;
  }
})();
