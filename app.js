/* app.js — Simo Stable V2
   Goals:
   - UI never clips (textbox/buttons always visible)
   - Pro modal always centered overlay
   - Pro gating works through /.netlify/functions/pro
   - “Brain doesn’t lose it” via rolling memory sent every request
   - Preview never flashes white (iframe always has dark placeholder)
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

  const API = {
    simon: "/.netlify/functions/simon",
    pro: "/.netlify/functions/pro"
  };

  const STORAGE = {
    pro: "simo_pro_enabled",
    proKey: "simo_pro_key",
    threadId: "simo_thread_id",
    memory: "simo_memory_v2",
    html: "simo_last_html_v2"
  };

  const MAX_TURNS = 14; // last 14 user+assistant turns (ChatGPT-like continuity)

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  const darkPlaceholder = (label="Preview") => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="color-scheme" content="dark">
<style>
  html,body{height:100%;margin:0}
  body{
    background:#0b1020;color:#a9b6d3;
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
<body><div class="box"><b>${escapeHtml(label)}</b><br>Build something to render here.</div></body></html>`;

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

  function loadMemory(){
    try { return JSON.parse(localStorage.getItem(STORAGE.memory) || "[]"); }
    catch { return []; }
  }
  function saveMemory(mem){
    localStorage.setItem(STORAGE.memory, JSON.stringify(mem));
  }
  function trimMemory(mem){
    const max = MAX_TURNS * 2;
    return mem.length > max ? mem.slice(mem.length - max) : mem;
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

  function systemSay(text){
    pushMsg("assistant", text);
    const mem = loadMemory();
    mem.push({ role:"assistant", content:text });
    saveMemory(trimMemory(mem));
  }

  function setPreviewPlaceholder(){
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
    setTimeout(() => els.proKey.focus(), 0);
  }
  function closeModal(){
    els.modalWrap.style.display = "none";
  }

  async function verifyProKey(){
    const key = (els.proKey.value || "").trim();
    if (!key){ els.proStatus.textContent = "Enter a key first."; return; }
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
    if (/(wife|husband|girlfriend|boyfriend|relationship|fight|argu|mad at|upset|vent)/.test(t)) return "venting";
    if (/(how do i|help me|fix|debug|error|issue|broken|why|what is)/.test(t)) return "solving";
    if (/(build|design|create|make|landing page|app|website|preview|ui|wireframe)/.test(t)) return "building";
    return "general";
  }

  async function send(){
    const input = (els.input.value || "").trim();
    if (!input) return;

    els.input.value = "";
    pushMsg("user", input);
    els.subStatus.textContent = "Thinking…";
    els.send.disabled = true;

    // store user message
    const mem = loadMemory();
    mem.push({ role:"user", content: input });
    saveMemory(trimMemory(mem));

    const mode = detectMode(input);
    els.modeLabel.textContent = "mode: " + mode;

    const payload = {
      threadId: getThreadId(),
      mode,
      input,
      pro: isPro(),
      memory: trimMemory(loadMemory())
    };

    try{
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 25000);

      const r = await fetch(API.simon, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal
      });

      clearTimeout(t);
      const j = await r.json().catch(() => null);

      if (!j || !j.ok){
        pushMsg("assistant", "Error: " + (j?.error || `HTTP ${r.status}`));
        els.subStatus.textContent = "Ready";
        return;
      }

      const msg = j.message || "I’m here. What do you want to do next?";
      pushMsg("assistant", msg);

      // store assistant message
      const mem2 = loadMemory();
      mem2.push({ role:"assistant", content: msg });
      saveMemory(trimMemory(mem2));

      // preview
      if (j.html && j.html.trim().length > 30){
        setPreviewHtml(j.html);
        els.previewStatus.textContent = "Updated by Simo.";
      } else {
        els.previewStatus.textContent = "No HTML cached yet.";
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
    els.log.innerHTML = "";
    systemSay("Reset. I’m here.");
    els.subStatus.textContent = "Ready";
    els.modeLabel.textContent = "mode: ready";
    els.previewStatus.textContent = "No HTML cached yet.";
    setPreviewPlaceholder();
  }

  function preview(){
    if (!loadCachedHtml()){
      setPreviewPlaceholder();
      els.previewStatus.textContent = "No HTML cached yet. Ask for a build first.";
    }
  }

  function clearMemory(){
    localStorage.setItem(STORAGE.memory, JSON.stringify([]));
    systemSay("Memory cleared (rolling context reset).");
  }

  function newThread(){
    const id = "t_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
    localStorage.setItem(STORAGE.threadId, id);
    localStorage.setItem(STORAGE.memory, JSON.stringify([]));
    systemSay("New thread started.");
    setPreviewPlaceholder();
    els.previewStatus.textContent = "No HTML cached yet.";
  }

  function downloadHtml(){
    if (!isPro()){ openModal(); return; }
    const html = localStorage.getItem(STORAGE.html) || "";
    if (!html.trim()){ systemSay("No HTML cached to download yet."); return; }
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
    if (!html.trim()){ systemSay("No HTML cached to save yet."); return; }
    const name = prompt("Save name:", "Build " + new Date().toLocaleString());
    if (!name) return;
    const libKey = "simo_library_v2";
    const lib = JSON.parse(localStorage.getItem(libKey) || "[]");
    lib.unshift({ name, html, savedAt: Date.now() });
    localStorage.setItem(libKey, JSON.stringify(lib.slice(0, 50)));
    systemSay(`Saved: ${name}`);
  }

  function openLibrary(){
    if (!isPro()){ openModal(); return; }
    const libKey = "simo_library_v2";
    const lib = JSON.parse(localStorage.getItem(libKey) || "[]");
    if (!lib.length){ systemSay("Library empty."); return; }
    const list = lib.map((x, i) => `${i+1}) ${x.name}`).join("\n");
    const pick = prompt("Pick a number to load:\n\n" + list);
    const idx = (parseInt(pick, 10) || 0) - 1;
    if (idx < 0 || idx >= lib.length) return;
    setPreviewHtml(lib[idx].html);
    systemSay("Loaded: " + lib[idx].name);
    els.previewStatus.textContent = "Loaded from Library: " + lib[idx].name;
  }

  // Wire events
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

  // Init
  setPro(localStorage.getItem(STORAGE.pro) === "true");
  updateProButtons();
  setPreviewPlaceholder();

  if (!loadMemory().length){
    systemSay("Hey. What’s on your mind?");
  } else {
    systemSay("Back again — pick up where we left off.");
  }
})();
