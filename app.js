/* app.js — Simo UI controller (failsafe-v4)
   Goals:
   - Buttons + Enter always work (bind after DOMContentLoaded)
   - Pro verification stable (POST, robust parse)
   - Preview NEVER white (iframe background + injected dark base)
   - Memory stability: store thread locally, send last N messages to backend
   - No regressions: defensive coding, retries, timeouts
*/

(() => {
  const STATE = {
    pro: false,
    mode: "ready", // ready | general | building
    threadId: null,
    messages: [], // {role:'user'|'assistant', text:string, ts:number}
    activeHTML: "", // last valid html doc
    busy: false,
  };

  const LS = {
    pro: "simo_pro_enabled",
    threadId: "simo_thread_id",
    messages: "simo_messages",
    activeHTML: "simo_active_html",
    library: "simo_library", // pro only
  };

  const $ = (id) => document.getElementById(id);

  function nowTs(){ return Date.now(); }
  function fmtTime(ts){
    const d = new Date(ts);
    let h = d.getHours(), m = d.getMinutes();
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12; if (h === 0) h = 12;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")} ${ampm}`;
  }

  function safeJSONParse(text){
    try { return JSON.parse(text); } catch { return null; }
  }

  function setMode(mode){
    STATE.mode = mode;
    const label = $("modeLabel");
    if (label) label.textContent = `mode: ${mode}`;
  }

  function setDot(ok){
    const dot = $("dot");
    if (!dot) return;
    dot.style.background = ok ? "var(--good)" : "var(--bad)";
    dot.style.boxShadow = ok
      ? "0 0 0 3px rgba(57,255,122,.15)"
      : "0 0 0 3px rgba(255,77,77,.15)";
  }

  function setMiniStatus(text){
    const el = $("miniStatus");
    if (el) el.textContent = text;
  }

  function setChatSub(text){
    const el = $("chatSub");
    if (el) el.textContent = text;
  }

  function setProUI(on){
    STATE.pro = !!on;
    localStorage.setItem(LS.pro, on ? "1" : "0");

    const tag = $("proTag");
    if (tag){
      tag.textContent = on ? "Pro: ON" : "Pro: OFF";
      tag.classList.toggle("on", on);
      tag.classList.toggle("off", !on);
    }
    const proBtn = $("btnPro");
    if (proBtn){
      proBtn.classList.toggle("pro-on", on);
    }

    // Gate buttons
    const downloadBtn = $("downloadBtn");
    const saveBtn = $("saveBtn");
    const libraryBtn = $("libraryBtn");
    if (downloadBtn) downloadBtn.disabled = !on;
    if (saveBtn) saveBtn.disabled = !on;
    if (libraryBtn) libraryBtn.disabled = !on;
  }

  function loadState(){
    STATE.pro = localStorage.getItem(LS.pro) === "1";
    STATE.threadId = localStorage.getItem(LS.threadId) || makeThreadId();
    const msgs = safeJSONParse(localStorage.getItem(LS.messages) || "[]");
    STATE.messages = Array.isArray(msgs) ? msgs : [];
    STATE.activeHTML = localStorage.getItem(LS.activeHTML) || "";
  }

  function persistState(){
    localStorage.setItem(LS.threadId, STATE.threadId);
    localStorage.setItem(LS.messages, JSON.stringify(STATE.messages.slice(-120)));
    localStorage.setItem(LS.activeHTML, STATE.activeHTML || "");
  }

  function makeThreadId(){
    return `t_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  }

  function addMsg(role, text){
    STATE.messages.push({ role, text, ts: nowTs() });
    persistState();
    renderLog();
  }

  function escapeHTML(s){
    return s.replace(/[&<>"]/g, (c) => (
      c === "&" ? "&amp;" :
      c === "<" ? "&lt;" :
      c === ">" ? "&gt;" : "&quot;"
    ));
  }

  function renderLog(){
    const log = $("log");
    if (!log) return;

    log.innerHTML = STATE.messages.map(m => {
      const who = m.role === "user" ? "You" : "Simo";
      const cls = m.role === "user" ? "msg you" : "msg";
      const body = formatBody(m.text);
      return `
        <div class="${cls}">
          <div class="meta">
            <div>${escapeHTML(who)} • ${escapeHTML(fmtTime(m.ts))}</div>
          </div>
          <div class="body">${body}</div>
        </div>
      `;
    }).join("");

    // scroll to bottom
    log.scrollTop = log.scrollHeight;
  }

  function formatBody(text){
    // render ```code``` blocks
    const parts = String(text).split(/```/);
    if (parts.length === 1) return escapeHTML(text);
    let out = "";
    for (let i=0;i<parts.length;i++){
      if (i % 2 === 0){
        out += escapeHTML(parts[i]);
      } else {
        const code = parts[i].replace(/^\w+\n/, ""); // drop "html\n" label if present
        out += `<pre><code>${escapeHTML(code)}</code></pre>`;
      }
    }
    return out;
  }

  function openModal(){
    const wrap = $("modalWrap");
    if (wrap) wrap.style.display = "grid";
    const status = $("proStatus");
    if (status) status.textContent = "";
    const key = $("proKey");
    if (key) key.focus();
  }

  function closeModal(){
    const wrap = $("modalWrap");
    if (wrap) wrap.style.display = "none";
  }

  function setPreviewHTML(html){
    STATE.activeHTML = html || "";
    persistState();

    const frame = $("previewFrame");
    const empty = $("emptyPreview");
    if (!frame) return;

    if (!html){
      frame.srcdoc = buildDarkBlank("No HTML cached yet. Ask for a build first.");
      if (empty) empty.style.display = "grid";
      return;
    }

    // Inject a guaranteed dark base to prevent white flashes inside user HTML too.
    const hardened = hardenHTML(html);

    frame.srcdoc = hardened;
    if (empty) empty.style.display = "none";
  }

  function buildDarkBlank(msg){
    return `<!doctype html>
<html><head>
<meta charset="utf-8"/>
<meta name="color-scheme" content="dark"/>
<style>
  html,body{height:100%;margin:0;background:#0b1020;color:#eaf0ff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
  .wrap{height:100%;display:grid;place-items:center;text-align:center;opacity:.85}
  .card{border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:18px 20px;background:rgba(0,0,0,.22)}
  .t{font-weight:900;font-size:18px;margin-bottom:6px}
</style>
</head>
<body><div class="wrap"><div class="card"><div class="t">Preview</div><div>${escapeHTML(msg)}</div></div></div></body></html>`;
  }

  function hardenHTML(html){
    const s = String(html);
    const hasDoctype = /^\s*<!doctype html>/i.test(s);
    const doc = hasDoctype ? s : `<!doctype html>\n${s}`;

    // Ensure color-scheme + dark base exists in <head>
    if (/<head[^>]*>/i.test(doc)){
      return doc.replace(/<head[^>]*>/i, (m) => `${m}
<meta name="color-scheme" content="dark">
<style>
  html,body{background:#0b1020;color:#eaf0ff;margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
</style>
`);
    }
    // If no head, wrap
    return `<!doctype html>
<html><head>
<meta charset="utf-8"/>
<meta name="color-scheme" content="dark"/>
<style>
  html,body{background:#0b1020;color:#eaf0ff;margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
</style>
</head><body>${doc}</body></html>`;
  }

  function isValidHTMLDoc(text){
    const t = String(text || "");
    return /^\s*<!doctype html>/i.test(t) && /<html[\s>]/i.test(t) && /<\/html>\s*$/i.test(t.trim());
  }

  function latestConversationSlice(max=24){
    // Send last N turns only for speed/stability
    return STATE.messages.slice(-max).map(m => ({
      role: m.role,
      content: m.text
    }));
  }

  async function fetchWithTimeout(url, opts={}, ms=25000){
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try{
      const r = await fetch(url, { ...opts, signal: ctrl.signal });
      return r;
    } finally {
      clearTimeout(t);
    }
  }

  async function callSimo(userText){
    const body = {
      mode: STATE.mode,
      pro: STATE.pro,
      threadId: STATE.threadId,
      messages: latestConversationSlice(28),
      activeHTML: STATE.activeHTML || "",
      input: userText
    };

    // Two-attempt retry for transient Netlify/edge hiccups (502/504)
    for (let attempt=1; attempt<=2; attempt++){
      try{
        const r = await fetchWithTimeout("/.netlify/functions/simon", {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify(body)
        }, attempt === 1 ? 25000 : 32000);

        const text = await r.text();
        const data = safeJSONParse(text) || { ok:false, raw:text };

        if (!r.ok || !data.ok){
          const msg = data.error || `HTTP ${r.status}`;
          return { ok:false, error: msg, details: data.details || data.raw || "" };
        }
        return { ok:true, reply: data.reply || "", html: data.html || "" };
      } catch (e){
        if (attempt === 2){
          return { ok:false, error: "Network/timeout error", details: String(e && e.message ? e.message : e) };
        }
      }
    }
  }

  function inferModeFromText(text){
    const t = String(text).toLowerCase();
    const buildWords = ["build ", "make a ", "create a ", "landing page", "website", "app preview", "show me a preview", "add pricing", "add testimonials", "change image", "continue"];
    const ventWords = ["i'm upset", "i am upset", "i'm mad", "i am mad", "we're fighting", "she says", "my wife", "my husband", "i feel"];
    if (buildWords.some(w => t.includes(w))) return "building";
    if (ventWords.some(w => t.includes(w))) return "general";
    return "general";
  }

  function setBusy(on){
    STATE.busy = !!on;
    const send = $("send");
    const reset = $("reset");
    if (send) send.disabled = on;
    if (reset) reset.disabled = false;
    setChatSub(on ? "Thinking..." : "Ready");
    setDot(!on);
  }

  async function onSend(){
    const input = $("input");
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    addMsg("user", text);

    // Mode handling: stable and predictable
    setMode(inferModeFromText(text));
    setBusy(true);
    setMiniStatus("Working…");

    const res = await callSimo(text);

    if (!res.ok){
      addMsg("assistant", `Error: ${res.error}`);
      setMiniStatus(`Error: ${res.error}`);
      setBusy(false);
      return;
    }

    addMsg("assistant", res.reply);

    if (res.html && isValidHTMLDoc(res.html)){
      setPreviewHTML(res.html);
      setMiniStatus("Preview updated.");
    } else {
      // If no HTML returned, don’t touch preview (prevents white flashes/regressions)
      setMiniStatus(res.html ? "Got response (no valid HTML to render)." : "Done.");
    }

    setBusy(false);
  }

  function onReset(){
    // Reset chat thread only — keep Pro state
    STATE.threadId = makeThreadId();
    STATE.messages = [];
    STATE.activeHTML = "";
    persistState();
    renderLog();
    setPreviewHTML("");
    setMode("ready");
    setMiniStatus("Reset.");
    addMsg("assistant", "Reset. I’m here.");
  }

  function onClearMemory(){
    // Clears rolling context but keeps current preview (optional: we keep it for user)
    STATE.messages = [];
    persistState();
    renderLog();
    addMsg("assistant", "Memory cleared (rolling context reset).");
    setMiniStatus("Memory cleared.");
  }

  function onNewThread(){
    STATE.threadId = makeThreadId();
    STATE.messages = [];
    STATE.activeHTML = "";
    persistState();
    renderLog();
    setPreviewHTML("");
    addMsg("assistant", "New thread started.");
    setMode("ready");
    setMiniStatus("New thread.");
  }

  function onPreview(){
    if (!STATE.activeHTML){
      setPreviewHTML("");
      setMiniStatus("No HTML cached yet.");
      return;
    }
    setPreviewHTML(STATE.activeHTML);
    setMiniStatus("Preview refreshed.");
  }

  function downloadHTML(){
    if (!STATE.pro){
      addMsg("assistant","Pro is required for Download.");
      return;
    }
    if (!STATE.activeHTML){
      addMsg("assistant","No HTML to download yet. Build something first.");
      return;
    }
    const blob = new Blob([STATE.activeHTML], { type:"text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "simo-build.html";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function saveToLibrary(){
    if (!STATE.pro){
      addMsg("assistant","Pro is required for Save/Library.");
      return;
    }
    if (!STATE.activeHTML){
      addMsg("assistant","No HTML to save yet. Build something first.");
      return;
    }
    const lib = safeJSONParse(localStorage.getItem(LS.library) || "[]") || [];
    lib.unshift({
      id: `b_${Date.now()}`,
      ts: Date.now(),
      title: deriveTitleFromHTML(STATE.activeHTML),
      html: STATE.activeHTML
    });
    localStorage.setItem(LS.library, JSON.stringify(lib.slice(0, 30)));
    addMsg("assistant","Saved to Library.");
    setMiniStatus("Saved.");
  }

  function openLibrary(){
    if (!STATE.pro){
      addMsg("assistant","Pro is required for Library.");
      return;
    }
    const lib = safeJSONParse(localStorage.getItem(LS.library) || "[]") || [];
    if (!lib.length){
      addMsg("assistant","Library is empty. Save a build first.");
      return;
    }
    const lines = lib.slice(0,8).map((x,i)=>`${i+1}) ${x.title} (${new Date(x.ts).toLocaleString()})`).join("\n");
    addMsg("assistant", `Library:\n${lines}\n\nSay: "load 1" to load a saved build.`);
  }

  function deriveTitleFromHTML(html){
    const m = String(html).match(/<title>([^<]+)<\/title>/i);
    if (m && m[1]) return m[1].trim().slice(0,60);
    return "Simo Build";
  }

  async function verifyProKey(){
    const keyEl = $("proKey");
    const status = $("proStatus");
    const key = (keyEl ? keyEl.value : "").trim();
    if (!key){
      if (status){
        status.textContent = "Enter a key.";
        status.className = "bad";
      }
      return;
    }

    if (status){
      status.textContent = "Verifying…";
      status.className = "";
    }

    try{
      const r = await fetchWithTimeout("/.netlify/functions/pro", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ key })
      }, 12000);

      const text = await r.text();
      const data = safeJSONParse(text);

      if (!r.ok || !data || data.ok !== true){
        if (status){
          status.textContent = "Verify failed.";
          status.className = "bad";
        }
        return;
      }

      if (data.pro){
        setProUI(true);
        if (status){
          status.textContent = "Pro unlocked.";
          status.className = "good";
        }
        closeModal();
      } else {
        setProUI(false);
        if (status){
          status.textContent = "Invalid key.";
          status.className = "bad";
        }
      }
    } catch {
      if (status){
        status.textContent = "Network error while verifying.";
        status.className = "bad";
      }
    }
  }

  function tryHandleLibraryCommand(text){
    const t = String(text).trim().toLowerCase();
    const m = t.match(/^load\s+(\d+)$/);
    if (!m) return false;
    if (!STATE.pro){
      addMsg("assistant","Pro is required for Library.");
      return true;
    }
    const idx = Number(m[1]) - 1;
    const lib = safeJSONParse(localStorage.getItem(LS.library) || "[]") || [];
    if (!lib[idx]){
      addMsg("assistant","That save slot doesn’t exist.");
      return true;
    }
    STATE.activeHTML = lib[idx].html || "";
    persistState();
    setPreviewHTML(STATE.activeHTML);
    addMsg("assistant", `Loaded: ${lib[idx].title}`);
    return true;
  }

  function bind(){
    // Elements
    const send = $("send");
    const reset = $("reset");
    const previewBtn = $("previewBtn");
    const downloadBtn = $("downloadBtn");
    const saveBtn = $("saveBtn");
    const libraryBtn = $("libraryBtn");

    const btnPro = $("btnPro");
    const btnClearMemory = $("btnClearMemory");
    const btnNewThread = $("btnNewThread");

    const modalWrap = $("modalWrap");
    const closeModalBtn = $("closeModal");
    const verifyKeyBtn = $("verifyKey");
    const input = $("input");

    // Hard bind (no optional chaining here — if missing, we want it obvious)
    if (send) send.addEventListener("click", onSend);
    if (reset) reset.addEventListener("click", onReset);
    if (previewBtn) previewBtn.addEventListener("click", onPreview);

    if (downloadBtn) downloadBtn.addEventListener("click", downloadHTML);
    if (saveBtn) saveBtn.addEventListener("click", saveToLibrary);
    if (libraryBtn) libraryBtn.addEventListener("click", openLibrary);

    if (btnPro) btnPro.addEventListener("click", openModal);
    if (btnClearMemory) btnClearMemory.addEventListener("click", onClearMemory);
    if (btnNewThread) btnNewThread.addEventListener("click", onNewThread);

    if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
    if (modalWrap) modalWrap.addEventListener("click", (e) => {
      if (e.target === modalWrap) closeModal();
    });
    if (verifyKeyBtn) verifyKeyBtn.addEventListener("click", verifyProKey);

    if (input){
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey){
          e.preventDefault();

          // library command handled client-side instantly (no API call)
          const text = input.value.trim();
          if (tryHandleLibraryCommand(text)){
            input.value = "";
            return;
          }
          onSend();
        }
      });
    }

    // Initial UI
    setProUI(STATE.pro);
    setDot(true);
    setMode(STATE.mode);
    renderLog();

    if (STATE.activeHTML){
      setPreviewHTML(STATE.activeHTML);
      setMiniStatus("Preview ready.");
    } else {
      setPreviewHTML("");
      setMiniStatus("Build something to render in Preview.");
    }

    // First assistant greeting if empty
    if (STATE.messages.length === 0){
      addMsg("assistant", "Hey. What’s on your mind?");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadState();
    bind();
    // Debug line you can see in console
    console.log("[Simo] app.js bound OK: failsafe-v4");
  });
})();
