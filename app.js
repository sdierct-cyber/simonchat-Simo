/* app.js — Simo UI controller (stable + no white preview + durable memory)
   Fixes:
   - Reset never shows white panel (iframe always gets dark placeholder)
   - Continuing requests stop "brain loss" by sending rolling memory
   - Send / Enter / Buttons stay wired
   - Pro gating uses existing /.netlify/functions/pro (leave your pro.js as-is)
*/

(() => {
  const $ = (id) => document.getElementById(id);

  const els = {
    log: $("log"),
    input: $("input"),
    send: $("send"),
    reset: $("reset"),
    previewBtn: $("previewBtn"),
    download: $("download"),
    save: $("save"),
    library: $("library"),
    subStatus: $("subStatus"),
    tinyStatus: $("tinyStatus"),
    modeLabel: $("modeLabel"),
    proDot: $("proDot"),
    previewFrame: $("previewFrame"),
    previewStatus: $("previewStatus"),

    btnPro: $("btnPro"),
    btnClearMemory: $("btnClearMemory"),
    btnNewThread: $("btnNewThread"),

    modalWrap: $("modalWrap"),
    closeModal: $("closeModal"),
    proKey: $("proKey"),
    verifyKey: $("verifyKey"),
    proStatus: $("proStatus")
  };

  const STORAGE = {
    pro: "simo_pro_enabled",
    proKey: "simo_pro_key",
    threadId: "simo_thread_id",
    memory: "simo_memory_v1",
    html: "simo_last_html"
  };

  const API = {
    simon: "/.netlify/functions/simon",
    pro: "/.netlify/functions/pro"
  };

  const MAX_TURNS = 12; // rolling memory depth (user+assistant pairs)

  const darkPlaceholder = (label = "Preview") => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="color-scheme" content="dark">
<style>
  html,body{height:100%;margin:0}
  body{
    background:#0b1020;
    color:#a9b6d3;
    font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
    display:flex;align-items:center;justify-content:center;
  }
  .box{
    border:1px solid rgba(255,255,255,.12);
    border-radius:16px;
    padding:18px 20px;
    background:rgba(255,255,255,.04);
    max-width:460px;
    text-align:center;
    line-height:1.4;
  }
  b{color:#eaf0ff}
</style></head>
<body>
  <div class="box">
    <b>${escapeHtml(label)}</b><br>
    Build something to render here.
  </div>
</body></html>`;

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  function nowTime(){
    const d = new Date();
    return d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
  }

  function getThreadId(){
    let id = localStorage.getItem(STORAGE.threadId);
    if (!id){
      id = "t_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
      localStorage.setItem(STORAGE.threadId, id);
    }
    return id;
  }

  function newThread(){
    const id = "t_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
    localStorage.setItem(STORAGE.threadId, id);
    localStorage.setItem(STORAGE.memory, JSON.stringify([]));
    pushSystem("New thread started.");
    els.modeLabel.textContent = "mode: ready";
    els.subStatus.textContent = "Ready";
    setPreviewPlaceholder();
    els.previewStatus.textContent = "No HTML cached yet.";
  }

  function loadMemory(){
    try{
      return JSON.parse(localStorage.getItem(STORAGE.memory) || "[]");
    }catch{
      return [];
    }
  }

  function saveMemory(mem){
    localStorage.setItem(STORAGE.memory, JSON.stringify(mem));
  }

  function trimMemory(mem){
    // keep last MAX_TURNS*2 entries (user+assistant messages)
    const max = MAX_TURNS * 2;
    if (mem.length > max) return mem.slice(mem.length - max);
    return mem;
  }

  function pushMsg(role, text){
    const div = document.createElement("div");
    div.className = "msg " + (role === "user" ? "you" : "simo");
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = (role === "user" ? "You" : "Simo") + " • " + nowTime();
    const body = document.createElement("div");
    body.className = "txt";
    body.textContent = text;
    div.appendChild(meta);
    div.appendChild(body);
    els.log.appendChild(div);
    els.log.scrollTop = els.log.scrollHeight;
  }

  function pushSystem(text){
    pushMsg("assistant", text);
    const mem = loadMemory();
    mem.push({ role:"assistant", content: text });
    saveMemory(trimMemory(mem));
  }

  function setPreviewPlaceholder(){
    // NEVER blank the iframe; blank causes white.
    els.previewFrame.srcdoc = darkPlaceholder("Preview");
  }

  function setPreviewHtml(html){
    els.previewFrame.srcdoc = html;
    localStorage.setItem(STORAGE.html, html);
  }

  function loadCachedHtml(){
    const html = localStorage.getItem(STORAGE.html);
    if (html && html.trim().length > 30){
      setPreviewHtml(html);
      els.previewStatus.textContent = "Loaded cached HTML.";
      return true;
    }
    return false;
  }

  function isPro(){
    return localStorage.getItem(STORAGE.pro) === "true";
  }

  function setPro(on){
    localStorage.setItem(STORAGE.pro, on ? "true" : "false");
    els.proDot.classList.toggle("pro", on);
  }

  function updateProButtons(){
    const on = isPro();
    [els.download, els.save, els.library].forEach(b => {
      b.disabled = !on;
      b.title = on ? "" : "Pro required";
    });
  }

  function openModal(){
    els.modalWrap.style.display = "flex";
    els.proStatus.textContent = "";
    els.proKey.value = localStorage.getItem(STORAGE.proKey) || "";
    els.proKey.focus();
  }
  function closeModal(){
    els.modalWrap.style.display = "none";
  }

  async function verifyProKey(){
    const key = (els.proKey.value || "").trim();
    if (!key){
      els.proStatus.textContent = "Enter a key first.";
      return;
    }
    els.proStatus.textContent = "Verifying…";
    try{
      const r = await fetch(API.pro, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ key })
      });
      const j = await r.json().catch(() => ({}));
      if (j && j.ok && j.pro){
        localStorage.setItem(STORAGE.proKey, key);
        setPro(true);
        updateProButtons();
        els.proStatus.textContent = "Pro unlocked ✅";
        closeModal();
      } else {
        setPro(false);
        updateProButtons();
        els.proStatus.textContent = "Invalid key ❌";
      }
    }catch(e){
      els.proStatus.textContent = "Verify failed: " + (e?.message || "error");
    }
  }

  function detectMode(userText){
    const t = (userText || "").toLowerCase();
    if (/(me and|my wife|my husband|girlfriend|boyfriend|relationship|fight|argu|mad at|upset)/.test(t)) return "venting";
    if (/(how do i|help me|fix|debug|error|issue|broken|why|what is)/.test(t)) return "solving";
    if (/(build|design|create|make|landing page|app|website|preview|ui|wireframe)/.test(t)) return "building";
    return "general";
  }

  async function send(){
    const input = (els.input.value || "").trim();
    if (!input) return;

    // UI
    els.input.value = "";
    pushMsg("user", input);
    els.subStatus.textContent = "Thinking…";
    els.tinyStatus.textContent = "";
    els.send.disabled = true;

    // memory
    const mem = loadMemory();
    mem.push({ role:"user", content: input });
    saveMemory(trimMemory(mem));

    const mode = detectMode(input);
    els.modeLabel.textContent = "mode: " + mode;

    const payload = {
      threadId: getThreadId(),
      mode,
      input,
      // send rolling memory so backend never "forgets"
      memory: trimMemory(loadMemory()),
      pro: isPro()
    };

    try{
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20000);

      const r = await fetch(API.simon, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal
      });

      clearTimeout(t);

      const j = await r.json().catch(() => null);
      if (!j || !j.ok){
        const err = j?.error || `HTTP ${r.status}`;
        pushMsg("assistant", "Error: " + err);
        els.subStatus.textContent = "Ready";
        return;
      }

      const msg = j.message || "";
      pushMsg("assistant", msg);

      // store assistant reply in memory
      const mem2 = loadMemory();
      mem2.push({ role:"assistant", content: msg });
      saveMemory(trimMemory(mem2));

      // preview html if any
      if (j.html && j.html.trim().length > 30){
        setPreviewHtml(j.html);
        els.previewStatus.textContent = "Updated by Simo.";
      } else {
        // do NOT blank the iframe
        els.previewStatus.textContent = "No HTML returned.";
      }

      els.subStatus.textContent = "Ready";
    }catch(e){
      pushMsg("assistant", "Network/timeout error: " + (e?.message || "unknown"));
      els.subStatus.textContent = "Ready";
    }finally{
      els.send.disabled = false;
    }
  }

  function reset(){
    // Clear visible chat only; keep memory unless user chooses Clear Memory
    els.log.innerHTML = "";
    pushMsg("assistant", "Reset. I’m here.");
    els.subStatus.textContent = "Ready";
    els.tinyStatus.textContent = "";
    els.modeLabel.textContent = "mode: ready";
    // IMPORTANT: never blank preview
    setPreviewPlaceholder();
    els.previewStatus.textContent = "No HTML cached yet.";
  }

  function clearMemory(){
    localStorage.setItem(STORAGE.memory, JSON.stringify([]));
    pushSystem("Memory cleared (rolling context reset).");
  }

  function preview(){
    const ok = loadCachedHtml();
    if (!ok){
      setPreviewPlaceholder();
      els.previewStatus.textContent = "No HTML cached yet. Ask for a build first.";
    }
  }

  function downloadHtml(){
    if (!isPro()){ openModal(); return; }
    const html = localStorage.getItem(STORAGE.html) || "";
    if (!html.trim()){
      pushSystem("No HTML cached to download yet.");
      return;
    }
    const blob = new Blob([html], { type:"text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "simo_build.html";
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  }

  function saveBuild(){
    if (!isPro()){ openModal(); return; }
    const html = localStorage.getItem(STORAGE.html) || "";
    if (!html.trim()){
      pushSystem("No HTML cached to save yet.");
      return;
    }
    const name = prompt("Save name:", "Build " + new Date().toLocaleString());
    if (!name) return;
    const libKey = "simo_library_v1";
    const lib = JSON.parse(localStorage.getItem(libKey) || "[]");
    lib.unshift({ name, html, savedAt: Date.now() });
    localStorage.setItem(libKey, JSON.stringify(lib.slice(0, 50)));
    pushSystem(`Saved: ${name}`);
  }

  function openLibrary(){
    if (!isPro()){ openModal(); return; }
    const libKey = "simo_library_v1";
    const lib = JSON.parse(localStorage.getItem(libKey) || "[]");
    if (!lib.length){
      pushSystem("Library empty.");
      return;
    }
    const list = lib.map((x, i) => `${i+1}) ${x.name}`).join("\n");
    const pick = prompt("Pick a number to load:\n\n" + list);
    const idx = (parseInt(pick, 10) || 0) - 1;
    if (idx < 0 || idx >= lib.length) return;
    setPreviewHtml(lib[idx].html);
    els.previewStatus.textContent = "Loaded from Library: " + lib[idx].name;
    pushSystem("Loaded: " + lib[idx].name);
  }

  // events
  els.send.addEventListener("click", send);
  els.reset.addEventListener("click", reset);
  els.previewBtn.addEventListener("click", preview);

  els.download.addEventListener("click", downloadHtml);
  els.save.addEventListener("click", saveBuild);
  els.library.addEventListener("click", openLibrary);

  els.btnPro.addEventListener("click", openModal);
  els.closeModal.addEventListener("click", closeModal);
  els.modalWrap.addEventListener("click", (e) => { if (e.target === els.modalWrap) closeModal(); });
  els.verifyKey.addEventListener("click", verifyProKey);

  els.btnClearMemory.addEventListener("click", clearMemory);
  els.btnNewThread.addEventListener("click", newThread);

  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey){
      e.preventDefault();
      send();
    }
  });

  // init
  setPro(localStorage.getItem(STORAGE.pro) === "true");
  updateProButtons();

  // start: never show white preview
  setPreviewPlaceholder();

  // greet if empty
  if (!loadMemory().length){
    pushSystem("Hey. What’s on your mind?");
  } else {
    pushSystem("Back again — pick up where we left off.");
  }
})();
