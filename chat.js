(() => {
  // ==========================================================
  // Simo chat.js — Stable V1 (ENTER/SEND guaranteed + anti-stuck preview)
  //
  // Guarantees:
  // - Enter + Send always work (even if backend errors)
  // - Preview NEVER feels stuck: local preview renders instantly for landing-page prompts
  // - Pro gating stable (Save/Export/My Pages)
  // - Library persists + export/import backup
  // ==========================================================

  const must = (id) => document.getElementById(id);

  const els = {
    msgs: must("msgs"),
    input: must("input"),
    send: must("send"),
    statusHint: must("statusHint"),
    tierPills: must("tierPills"),
    tierFreeLabel: must("tierFreeLabel"),
    tierProLabel: must("tierProLabel"),
    btnReset: must("btnReset"),
    btnSave: must("btnSave"),
    btnDownload: must("btnDownload"),
    btnLibrary: must("btnLibrary"),
    previewFrame: must("previewFrame"),
    previewLabel: must("previewLabel"),
    previewMeta: must("previewMeta"),
    modalBack: must("modalBack"),
    closeModal: must("closeModal"),
    libHint: must("libHint"),
    libList: must("libList"),
    libFooter: must("libFooter"),
    libActions: must("libActions"),
    clearLib: must("clearLib"),
    importFile: must("importFile"),
    starterRow: must("starterRow"),
    toastWrap: must("toastWrap"),
  };

  // If ANY required element is missing, fail loudly (so you see it immediately)
  for (const [k,v] of Object.entries(els)) {
    if (!v) {
      console.error("Simo missing element:", k);
      alert("Simo error: missing UI element: " + k + "\n\nYour index.html and chat.js must match. Replace both files exactly.");
      return;
    }
  }

  const PRICING = { free: 0, pro: 19 };

  const LS = {
    tier: "simo_tier",
    library: "simo_library_v2",
    legacyLibraries: ["simo_library", "simo_library_v1", "simo_build_library"],
    lastPreview: "simo_last_preview_v1",
    conversation: "simo_conversation_v1",
  };

  const state = {
    busy: false,
    tier: "free",
    conversation: loadJson(LS.conversation, []),
    lastPreview: loadJson(LS.lastPreview, null),
  };

  // -------------------------
  // Init
  // -------------------------
  els.tierFreeLabel.textContent = `$${PRICING.free}`;
  els.tierProLabel.textContent  = `$${PRICING.pro}`;

  migrateLibraryToV2();
  state.tier = resolveTier();
  applyTierUI();

  initTier();
  initComposer();
  initActions();
  initStarters();
  initModal();

  renderHistory();
  restorePreview();

  if (!state.conversation.length) {
    systemMsg("Simo: Fresh start. Tell me what you’re building (or tap an example).");
  }

  setStatus("Ready");

  // -------------------------
  // Helpers
  // -------------------------
  function loadJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
    catch { return fallback; }
  }
  function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

  function normalize(s){ return String(s || "").trim(); }
  function lower(s){ return normalize(s).toLowerCase(); }

  function setStatus(t){ els.statusHint.textContent = t || "Ready"; }

  function setBusy(on){
    state.busy = !!on;
    els.send.disabled = state.busy;
    els.input.disabled = state.busy;
    setStatus(state.busy ? "Thinking…" : "Ready");
  }

  function toast(text, kind="ok", ms=2200){
    const div = document.createElement("div");
    div.className = "toast" + (kind && kind !== "ok" ? " " + kind : "");
    div.textContent = text;
    els.toastWrap.appendChild(div);
    setTimeout(() => {
      div.style.opacity = "0";
      div.style.transform = "translateY(-4px)";
      div.style.transition = "all 180ms ease";
      setTimeout(() => div.remove(), 220);
    }, ms);
  }

  function addMsg(role, text){
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

  function systemMsg(text){
    const div = document.createElement("div");
    div.className = "sys";
    div.textContent = text;
    els.msgs.appendChild(div);
    els.msgs.scrollTop = els.msgs.scrollHeight;
  }

  function persist(role, content){
    state.conversation.push({ role, content });
    saveJson(LS.conversation, state.conversation);
  }

  function escapeHtml(s){
    return String(s || "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#39;");
  }

  function cryptoId(){
    const a = new Uint32Array(4);
    crypto.getRandomValues(a);
    return [...a].map(n => n.toString(16)).join("");
  }

  // -------------------------
  // Tier
  // -------------------------
  function resolveTier(){
    const stored = localStorage.getItem(LS.tier);
    if (stored === "pro" || stored === "free") return stored;
    return "free";
  }
  function isPro(){ return state.tier === "pro"; }

  function applyTierUI(){
    [...els.tierPills.querySelectorAll(".pill")].forEach(p => {
      p.classList.toggle("active", p.dataset.tier === state.tier);
    });

    els.btnSave.classList.toggle("locked", !isPro());
    els.btnDownload.classList.toggle("locked", !isPro());
    els.btnLibrary.classList.toggle("locked", !isPro());
  }

  function setTier(nextTier, announce=true){
    state.tier = (nextTier === "pro") ? "pro" : "free";
    localStorage.setItem(LS.tier, state.tier);
    applyTierUI();
    if (announce) toast(state.tier === "pro" ? "Pro enabled" : "Free mode", "ok");
  }

  function initTier(){
    els.tierPills.addEventListener("click", (e) => {
      const pill = e.target.closest(".pill");
      if (!pill) return;
      setTier(pill.dataset.tier, true);
    });
  }

  function gated(fn){
    if (!isPro()){
      toast("Pro feature — toggle Pro to use Save / Export / My Pages", "warn", 2600);
      return;
    }
    fn();
  }

  // -------------------------
  // Starters
  // -------------------------
  function initStarters(){
    els.starterRow.addEventListener("click", (e) => {
      const chip = e.target.closest(".starter");
      if (!chip) return;
      const text = chip.getAttribute("data-text") || "";
      els.input.value = text;
      els.input.focus();
    });
  }

  // -------------------------
  // Preview (anti-stuck)
  // -------------------------
  function setPreviewHeader(label){
    els.previewLabel.textContent = label || "Landing page";
    els.previewMeta.textContent = "Updated";
  }

  function renderPreview(html, label="Landing page"){
    els.previewFrame.srcdoc = html;
    state.lastPreview = { kind:"html", html, title: label, meta:"Updated", ts: Date.now() };
    saveJson(LS.lastPreview, state.lastPreview);
    setPreviewHeader(label);
  }

  function restorePreview(){
    if (state.lastPreview?.html){
      renderPreview(state.lastPreview.html, state.lastPreview.title || "Landing page");
    } else {
      els.previewFrame.srcdoc =
        `<!doctype html><html><head><meta charset="utf-8">
        <style>html,body{height:100%;margin:0;background:transparent}
        .c{height:100%;display:flex;align-items:center;justify-content:center;color:#a9b6d3;font-family:system-ui}</style>
        </head><body><div class="c">No preview yet</div></body></html>`;
      els.previewLabel.textContent = "Idle";
      els.previewMeta.textContent = "No preview yet";
    }
  }

  function shouldAutoPreview(text){
    const t = lower(text);
    return (
      t.includes("landing page") ||
      t.includes("waitlist") ||
      t.includes("saas") ||
      t.includes("coach") ||
      t.includes("dentist") ||
      t.startsWith("build ") ||
      t.startsWith("create ")
    );
  }

  function localLandingHTML(prompt){
    const title = "Landing Page";
    const h = "Your offer — made simple";
    const sub = "A clean landing page you can export as HTML. Ask me to change sections, CTA, or copy.";
    return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>
:root{--bg:#0b1020;--text:#eaf0ff;--muted:#a9b6d3;--line:rgba(255,255,255,.14);--acc:#39ff7a}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;background:radial-gradient(1200px 700px at 20% 0%, #162a66 0%, var(--bg) 55%);color:var(--text)}
.wrap{max-width:980px;margin:0 auto;padding:28px}
.nav{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:26px}
.logo{display:flex;align-items:center;gap:10px;font-weight:900}
.dot{width:10px;height:10px;border-radius:99px;background:var(--acc);box-shadow:0 0 18px rgba(57,255,122,.6)}
.pill{border:1px solid var(--line);background:rgba(255,255,255,.05);padding:8px 12px;border-radius:999px;font-weight:800;font-size:12px}
.hero{display:grid;grid-template-columns:1.1fr .9fr;gap:18px;align-items:start}
@media (max-width:860px){.hero{grid-template-columns:1fr}}
h1{font-size:46px;line-height:1.05;margin:0 0 10px}
p{color:var(--muted);font-weight:650;line-height:1.5}
.btns{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.btn{display:inline-flex;align-items:center;justify-content:center;padding:12px 14px;border-radius:14px;font-weight:900;border:1px solid rgba(255,255,255,.14);text-decoration:none;color:var(--text);background:rgba(255,255,255,.05)}
.btn.primary{border-color:rgba(57,255,122,.35);background:rgba(57,255,122,.14)}
.card{border:1px solid var(--line);background:rgba(0,0,0,.18);border-radius:18px;padding:16px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px}
@media (max-width:860px){.grid{grid-template-columns:1fr}}
.k{font-weight:900;margin:0 0 6px}
</style>
</head>
<body>
<div class="wrap">
  <div class="nav">
    <div class="logo"><span class="dot"></span> Simo Preview</div>
    <div class="pill">Preview</div>
  </div>

  <div class="hero">
    <div>
      <h1>${escapeHtml(h)}</h1>
      <p>${escapeHtml(sub)}</p>
      <div class="btns">
        <a class="btn primary" href="#">Get Started</a>
        <a class="btn" href="#">Learn More</a>
      </div>

      <div class="grid">
        <div class="card"><div class="k">Fast</div><p>Clean structure that converts.</p></div>
        <div class="card"><div class="k">Clear</div><p>Headline → value → call-to-action.</p></div>
        <div class="card"><div class="k">Exportable</div><p>Download HTML and ship.</p></div>
      </div>
    </div>

    <div class="card">
      <div class="k">Prompt</div>
      <p style="margin-top:6px">${escapeHtml(prompt)}</p>
      <p style="margin-top:10px">Ask: “Add pricing”, “Add testimonials”, “Add FAQ”, “Make it more premium”.</p>
    </div>
  </div>
</div>
</body></html>`;
  }

  // -------------------------
  // Library (persist)
  // -------------------------
  function getLibrary(){ return loadJson(LS.library, []); }
  function setLibrary(items){ saveJson(LS.library, items); }

  function migrateLibraryToV2(){
    const current = loadJson(LS.library, []);
    const usedIds = new Set(Array.isArray(current) ? current.map(x => x?.id).filter(Boolean) : []);
    let merged = Array.isArray(current) ? current.slice() : [];

    for (const k of LS.legacyLibraries){
      const legacy = loadJson(k, null);
      if (!legacy || !Array.isArray(legacy) || !legacy.length) continue;
      for (const it of legacy){
        const norm = normalizeLibraryItem(it);
        if (!norm) continue;
        if (usedIds.has(norm.id)) norm.id = cryptoId();
        usedIds.add(norm.id);
        merged.push(norm);
      }
    }

    const seen = new Set();
    merged = merged.filter(it => {
      if (!it?.id) it.id = cryptoId();
      if (seen.has(it.id)) return false;
      seen.add(it.id);
      return true;
    });

    merged.sort((a,b) => (b.when||0) - (a.when||0));

    const v2Exists = localStorage.getItem(LS.library) != null;
    const anyLegacyExists = LS.legacyLibraries.some(k => localStorage.getItem(k) != null);

    if (!v2Exists && anyLegacyExists) saveJson(LS.library, merged);
  }

  function normalizeLibraryItem(it){
    try{
      const id = it?.id || cryptoId();
      const name = (it?.name || "Untitled").toString();
      const when =
        (typeof it?.when === "number" && isFinite(it.when)) ? it.when :
        (typeof it?.savedAt === "number" && isFinite(it.savedAt)) ? it.savedAt :
        Date.now();

      const preview = it?.preview || it?.lastPreview || null;
      let html = null;

      if (preview && typeof preview === "object" && typeof preview.html === "string") html = preview.html;
      if (!html && typeof preview === "string") html = preview;
      if (!html && typeof it?.html === "string") html = it.html;

      if (!html || !html.trim()) return null;

      const conversation = Array.isArray(it?.conversation) ? it.conversation : [];
      return { id, name, when, preview: { kind:"html", html, title:"Landing page", meta:"Updated", ts: when }, conversation };
    } catch { return null; }
  }

  function saveToLibraryAuto(){
    if (!state.lastPreview?.html) return toast("Nothing to save yet — generate a preview first.", "warn", 2600);
    const items = getLibrary();
    const name = `Landing Page v${items.length + 1}`;
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

  function renderLibrary(){
    const items = getLibrary();
    els.libList.innerHTML = "";
    els.libHint.textContent = items.length ? `${items.length} saved page(s).` : "No saves yet. Generate a preview, then Save.";

    for (const it of items){
      const row = document.createElement("div");
      row.className = "libItem";

      const left = document.createElement("div");
      const nm = document.createElement("div");
      nm.className = "name";
      nm.textContent = it.name || "Untitled";

      const wh = document.createElement("div");
      wh.className = "when";
      const d = new Date(it.when || Date.now());
      wh.textContent = isNaN(d.getTime()) ? "Older save" : d.toLocaleString();

      left.appendChild(nm);
      left.appendChild(wh);

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.gap = "8px";

      const loadBtn = document.createElement("button");
      loadBtn.className = "miniBtn primary";
      loadBtn.type = "button";
      loadBtn.textContent = "Load";
      loadBtn.onclick = () => {
        if (it.preview?.html) renderPreview(it.preview.html, "Landing page");
        if (Array.isArray(it.conversation) && it.conversation.length){
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
      delBtn.type = "button";
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

  function exportLibraryBackup(){
    const payload = { schema:"simo_library_backup_v1", exportedAt:new Date().toISOString(), site:location.origin, data:getLibrary() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json;charset=utf-8" });
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

  function importLibraryBackup(file){
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const parsed = JSON.parse(String(reader.result || ""));
        const incoming = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.data) ? parsed.data : null);
        if (!incoming) throw new Error("Invalid backup format.");

        const normalized = incoming.map(normalizeLibraryItem).filter(Boolean);
        const current = getLibrary();
        const used = new Set(current.map(x => x.id));
        for (const it of normalized){ if (used.has(it.id)) it.id = cryptoId(); used.add(it.id); }

        setLibrary([...normalized, ...current]);
        toast(`Imported ${normalized.length} item(s)`, "ok", 2600);
        renderLibrary();
      } catch(e){
        toast("Import failed: " + (e?.message || "Invalid file"), "bad", 3000);
      }
    };
    reader.readAsText(file);
  }

  function clearLibrary(){
    if (!confirm("Clear all saved pages?")) return;
    setLibrary([]);
    renderLibrary();
    toast("Cleared", "ok");
  }

  // -------------------------
  // Modal
  // -------------------------
  function initModal(){
    els.closeModal.addEventListener("click", closeLibrary);
    els.modalBack.addEventListener("click", (e) => { if (e.target === els.modalBack) closeLibrary(); });

    // Add Export/Import buttons into libActions
    els.libActions.innerHTML = "";

    const exportBtn = document.createElement("button");
    exportBtn.type = "button";
    exportBtn.className = "miniBtn primary";
    exportBtn.textContent = "Export Backup";
    exportBtn.onclick = () => gated(exportLibraryBackup);

    const importBtn = document.createElement("button");
    importBtn.type = "button";
    importBtn.className = "miniBtn good";
    importBtn.textContent = "Import Backup";
    importBtn.onclick = () => gated(() => {
      els.importFile.value = "";
      els.importFile.click();
    });

    els.libActions.appendChild(exportBtn);
    els.libActions.appendChild(importBtn);

    els.importFile.addEventListener("change", () => gated(() => importLibraryBackup(els.importFile.files?.[0])));
    els.clearLib.addEventListener("click", () => gated(clearLibrary));
  }

  function openLibrary(){
    els.modalBack.style.display = "flex";
    renderLibrary();
  }
  function closeLibrary(){
    els.modalBack.style.display = "none";
  }

  // -------------------------
  // Composer (ENTER + SEND guaranteed)
  // -------------------------
  function initComposer(){
    els.send.addEventListener("click", onSend);

    els.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey){
        e.preventDefault();
        onSend();
      }
    });
  }

  async function onSend(){
    const text = normalize(els.input.value);
    if (!text || state.busy) return;

    els.input.value = "";
    addMsg("user", text);
    persist("user", text);

    // Instant local preview for landing prompts (prevents "Idle stuck")
    if (shouldAutoPreview(text)){
      renderPreview(localLandingHTML(text), "Landing page");
    }

    setBusy(true);
    try{
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

      if (!j || j.ok === false){
        const msg = j?.error ? `Error: ${j.error}` : "Error: Request failed.";
        addMsg("assistant", msg);
        persist("assistant", msg);
        toast("Backend error — local preview still works", "warn", 2800);
        return;
      }

      const reply = normalize(j.text || j.reply);
      if (reply){
        addMsg("assistant", reply);
        persist("assistant", reply);
      }

      // If backend provides preview, it overrides local
      if (j.preview && typeof j.preview.html === "string" && j.preview.html.trim()){
        renderPreview(j.preview.html, "Landing page");
      }
    } catch(err){
      const msg = `Error: ${err?.message || "Request failed"}`;
      addMsg("assistant", msg);
      persist("assistant", msg);
      toast("Network error — local preview still works", "warn", 2800);
    } finally {
      setBusy(false);
    }
  }

  // -------------------------
  // Actions
  // -------------------------
  function initActions(){
    els.btnReset.addEventListener("click", () => {
      state.conversation = [];
      saveJson(LS.conversation, state.conversation);
      els.msgs.innerHTML = "";
      systemMsg("Simo: Fresh start. Tap an example or describe your page.");
      restorePreview();
      toast("New chat", "ok");
    });

    els.btnSave.addEventListener("click", () => gated(saveToLibraryAuto));
    els.btnDownload.addEventListener("click", () => gated(downloadPreview));
    els.btnLibrary.addEventListener("click", () => gated(openLibrary));
  }

  function downloadPreview(){
    if (!state.lastPreview?.html) return toast("Nothing to export yet — generate a preview first.", "warn", 2600);
    const blob = new Blob([state.lastPreview.html], { type:"text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "landing-page.html";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Exported HTML", "ok");
  }

  // -------------------------
  // History
  // -------------------------
  function renderHistory(){
    for (const turn of state.conversation){
      if (turn.role === "user") addMsg("user", turn.content);
      if (turn.role === "assistant") addMsg("assistant", turn.content);
    }
    els.msgs.scrollTop = els.msgs.scrollHeight;
  }
})();
