/* app.js — Simo UI Controller (bundle v2 / no-API demo)
   Goals:
   - Buttons always work (no null crashes)
   - Enter sends, Shift+Enter newline
   - Reset clears chat + preview without white panel
   - Preview uses iframe srcdoc; hidden until valid HTML exists
   - Pro gating ONLY gates Save/Download/Library (chat always works)
*/

(() => {
  const $ = (id) => document.getElementById(id);

  const state = {
    pro: false,
    lastHtml: "",
    busy: false,
    library: [],
  };

  // ---------- UI helpers ----------
  function setStatusLine(text){
    const el = $("statusLine");
    if (el) el.textContent = text;
  }

  function setModePill(label, isPro){
    const pill = $("modePill");
    const dot = $("modeDot");
    if (!pill) return;
    pill.classList.toggle("proOn", !!isPro);
    if (dot){
      dot.style.background = isPro ? "var(--good)" : "rgba(255,255,255,.25)";
      dot.style.boxShadow = isPro
        ? "0 0 0 3px rgba(57,255,122,.18), 0 0 26px rgba(57,255,122,.16)"
        : "0 0 0 3px rgba(255,255,255,.08)";
    }
    pill.innerHTML = `<strong>${isPro ? "Pro" : "Free"}</strong><span>${label}</span>`;
  }

  function setProUI(on){
    state.pro = !!on;

    const toggle = $("proToggle");
    if (toggle) toggle.checked = state.pro;

    const saveBtn = $("saveBtn");
    const dlBtn   = $("downloadBtn");
    const libBtn  = $("libraryBtn");

    if (saveBtn) saveBtn.disabled = !state.pro;
    if (dlBtn)   dlBtn.disabled   = !state.pro;
    if (libBtn)  libBtn.disabled  = !state.pro;

    setModePill(state.pro ? "Unlocked" : "Ready", state.pro);
    setStatusLine(state.pro
      ? "Status: Pro. Save/Download/Library unlocked."
      : "Status: Free. Chat works. Pro gates Save/Download/Library."
    );
  }

  function addMsg(who, text){
    const log = $("chatLog");
    if (!log) return;
    const wrap = document.createElement("div");
    wrap.className = `msg ${who === "You" ? "you" : "simo"}`;
    wrap.innerHTML = `
      <div class="who">${who}</div>
      <div class="bubble"></div>
    `;
    wrap.querySelector(".bubble").textContent = String(text || "");
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
  }

  function setPreview(html){
    state.lastHtml = html || "";
    const wrap = $("previewFrameWrap");
    const frame = $("previewFrame");
    const sub = $("previewSub");

    const has = typeof state.lastHtml === "string" && state.lastHtml.trim().length > 20;

    if (sub){
      sub.textContent = has
        ? "Updated. Edit with: headline: … | cta: … | price: 29 | add/remove faq/pricing/testimonials"
        : "No HTML cached yet. Ask for a build.";
    }

    if (!wrap || !frame) return;

    if (!has){
      // Hide completely — NO white panel
      wrap.classList.remove("on");
      frame.removeAttribute("srcdoc");
      return;
    }

    wrap.classList.add("on");
    frame.srcdoc = state.lastHtml;
  }

  function loadLibrary(){
    try{
      const raw = localStorage.getItem("simo_library_v1");
      state.library = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(state.library)) state.library = [];
    }catch{
      state.library = [];
    }
  }

  function saveLibrary(){
    localStorage.setItem("simo_library_v1", JSON.stringify(state.library));
  }

  function downloadFile(filename, content){
    const blob = new Blob([content], {type:"text/html;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------- Backend calls ----------
  async function callSimon(payload){
    const r = await fetch("/.netlify/functions/simon", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    let data;
    try{ data = JSON.parse(text); }
    catch{ data = { ok:false, error:"Backend returned non-JSON", raw:text }; }
    return { status:r.status, data };
  }

  // ---------- Actions ----------
  async function onSend(){
    if (state.busy) return;

    const input = $("chatInput");
    const raw = input ? input.value : "";
    const msg = (raw || "").trim();
    if (!msg) return;

    if (input) input.value = "";
    addMsg("You", msg);

    state.busy = true;
    setModePill("Working…", state.pro);

    // Decide mode: build vs edit
    const looksLikeEdit =
      /^headline\s*:|^cta\s*:|^price\s*:|^add\s+|^remove\s+|^continue\b/i.test(msg);

    const mode = (looksLikeEdit && state.lastHtml) ? "edit" : "build";

    const payload = {
      mode,
      input: msg,
      current_html: state.lastHtml || "",
      topic: "general",
    };

    try{
      const { status, data } = await callSimon(payload);
      if (!data || !data.ok){
        addMsg("Simo", `Backend error (${status}). ${data?.error || "Unknown error."}`);
        if (data?.raw) addMsg("Simo", data.raw.slice(0, 500));
        setModePill("Ready", state.pro);
        return;
      }

      if (data.text) addMsg("Simo", data.text);

      if (data.html && typeof data.html === "string"){
        setPreview(data.html);
      }

      setModePill("Ready", state.pro);
    }catch(e){
      addMsg("Simo", `Network error: ${e?.message || e}`);
      setModePill("Ready", state.pro);
    }finally{
      state.busy = false;
    }
  }

  function onReset(){
    // Clear chat UI
    const log = $("chatLog");
    if (log) log.innerHTML = "";
    // Clear preview (keeps hidden; no white block)
    setPreview("");
    state.lastHtml = "";
    addMsg("Simo", "Reset. I’m here.");
  }

  async function onVerifyPro(){
    const key = ($("proKey")?.value || "").trim();
    if (!key){
      addMsg("Simo", "Enter a Pro key to verify.");
      return;
    }
    try{
      const r = await fetch("/.netlify/functions/pro", {
        method:"POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ key }),
      });
      const t = await r.text();
      let data;
      try{ data = JSON.parse(t); }catch{ data = { ok:false, error:"Non-JSON from pro", raw:t }; }

      if (!data.ok){
        addMsg("Simo", `Pro verify failed: ${data.error || "Unknown error."}`);
        setProUI(false);
        return;
      }
      setProUI(!!data.pro);
      addMsg("Simo", data.pro ? "Pro verified. Unlocked." : "Key invalid. Staying Free.");
    }catch(e){
      addMsg("Simo", `Pro verify network error: ${e?.message || e}`);
      setProUI(false);
    }
  }

  function onDownload(){
    if (!state.pro) return addMsg("Simo", "Download is Pro. Verify Pro to unlock.");
    if (!state.lastHtml) return addMsg("Simo", "Nothing to download yet. Build something first.");
    downloadFile("simo-build.html", state.lastHtml);
    addMsg("Simo", "Downloaded: simo-build.html");
  }

  function onSave(){
    if (!state.pro) return addMsg("Simo", "Save is Pro. Verify Pro to unlock.");
    if (!state.lastHtml) return addMsg("Simo", "Nothing to save yet. Build something first.");

    const title = prompt("Name this build:", `Build ${new Date().toLocaleString()}`) || "";
    const name = title.trim();
    if (!name) return;

    loadLibrary();
    state.library.unshift({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      name,
      html: state.lastHtml,
      ts: Date.now(),
    });
    state.library = state.library.slice(0, 50);
    saveLibrary();
    addMsg("Simo", `Saved to Library: ${name}`);
  }

  function onLibrary(){
    if (!state.pro) return addMsg("Simo", "Library is Pro. Verify Pro to unlock.");

    loadLibrary();
    if (!state.library.length){
      addMsg("Simo", "Library is empty. Save a build first.");
      return;
    }

    // Simple picker
    const lines = state.library.map((x, i) => `${i+1}) ${x.name}`).join("\n");
    const pick = prompt(`Library:\n${lines}\n\nType a number to load:`) || "";
    const n = parseInt(pick, 10);
    if (!Number.isFinite(n) || n < 1 || n > state.library.length) return;

    const item = state.library[n-1];
    setPreview(item.html);
    addMsg("Simo", `Loaded: ${item.name}`);
  }

  // ---------- Bind once, never breaks ----------
  function bind(){
    $("sendBtn")?.addEventListener("click", onSend);
    $("resetBtn")?.addEventListener("click", onReset);
    $("verifyProBtn")?.addEventListener("click", onVerifyPro);
    $("downloadBtn")?.addEventListener("click", onDownload);
    $("saveBtn")?.addEventListener("click", onSave);
    $("libraryBtn")?.addEventListener("click", onLibrary);

    const input = $("chatInput");
    if (input){
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey){
          e.preventDefault();
          onSend();
        }
      });
    }

    $("proToggle")?.addEventListener("change", (e) => {
      // Toggle alone does NOT unlock; it just reflects state.
      // We keep it “truthy”: only verification changes pro.
      e.target.checked = state.pro;
      addMsg("Simo", "Verify a Pro key to unlock Pro features.");
    });

    // initial state
    setProUI(false);
    onReset();
  }

  document.addEventListener("DOMContentLoaded", bind);
})();
