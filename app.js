/* app.js — Simo UI controller (baseline stable)
   Goals:
   - No white panel preview
   - Buttons + Enter always work
   - Reset clears without flashing white
   - Preview renders only when valid HTML exists
   - Pro verify hits /.netlify/functions/pro
   - Save/Download/Library gated behind Pro
*/

(() => {
  const $ = (id) => document.getElementById(id);

  const chatBody = $("chatBody");
  const chatInput = $("chatInput");
  const sendBtn = $("sendBtn");
  const resetBtn = $("resetBtn");

  const proToggle = $("proToggle");
  const proStatus = $("proStatus");

  const previewFrame = $("previewFrame");
  const previewEmpty = $("previewEmpty");

  const downloadBtn = $("downloadBtn");
  const saveBtn = $("saveBtn");
  const libraryBtn = $("libraryBtn");
  const libraryPanel = $("libraryPanel");
  const hint = $("hint");

  const BACKEND_URL = "/.netlify/functions/simon";
  const PRO_URL = "/.netlify/functions/pro";

  const state = {
    pro: false,
    proKey: "",
    lastHTML: "",
    conversation: [] // minimal memory (client-side)
  };

  function esc(s){
    return String(s).replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }

  function addMsg(who, text){
    const wrap = document.createElement("div");
    wrap.className = "msg";
    wrap.innerHTML = `
      <div class="who">${esc(who)}</div>
      <div class="bubble ${who === "You" ? "you" : "simo"}">${esc(text)}</div>
    `;
    chatBody.appendChild(wrap);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function setStatus(ok, text){
    proStatus.classList.remove("good","bad");
    if (ok === true) proStatus.classList.add("good");
    if (ok === false) proStatus.classList.add("bad");
    proStatus.textContent = text;
  }

  function setProUI(on){
    state.pro = !!on;
    proToggle.classList.toggle("on", state.pro);
    proToggle.setAttribute("aria-checked", state.pro ? "true" : "false");
    setStatus(state.pro ? true : null, state.pro ? "Pro" : "Free");
  }

  function showPreview(html){
    state.lastHTML = html || "";
    if (!state.lastHTML) {
      // hide iframe, show dark empty state
      previewFrame.classList.remove("show");
      previewFrame.removeAttribute("srcdoc");
      previewEmpty.classList.remove("hide");
      return;
    }
    // Force iframe to stay non-white by using transparent background + srcdoc
    previewFrame.setAttribute("srcdoc", state.lastHTML);
    previewEmpty.classList.add("hide");
    previewFrame.classList.add("show");
  }

  function isProbablyHTML(s){
    if (!s) return false;
    const t = String(s).trim();
    return t.startsWith("<!doctype html") || t.startsWith("<html") || /<body[\s>]/i.test(t) || /<main[\s>]/i.test(t);
  }

  function extractHTML(payload){
    // backend returns { ok, text, html }
    if (!payload) return "";
    if (payload.html && isProbablyHTML(payload.html)) return payload.html;
    // fallback: try to find html inside text
    if (payload.text && isProbablyHTML(payload.text)) return payload.text;
    return "";
  }

  function gatePro(actionName){
    if (!state.pro) {
      addMsg("Simo", `“${actionName}” is Pro. Toggle Pro and verify a key.`);
      return false;
    }
    return true;
  }

  function saveToLibrary(){
    if (!gatePro("Save")) return;
    if (!state.lastHTML) {
      addMsg("Simo", "No HTML cached yet. Build something first, then Save.");
      return;
    }
    const items = JSON.parse(localStorage.getItem("simo_library") || "[]");
    const stamp = new Date().toISOString();
    const name = `Build ${items.length + 1}`;
    items.unshift({ name, stamp, html: state.lastHTML });
    localStorage.setItem("simo_library", JSON.stringify(items));
    addMsg("Simo", `Saved to Library: ${name}`);
    renderLibrary(true);
  }

  function downloadHTML(){
    if (!gatePro("Download")) return;
    if (!state.lastHTML) {
      addMsg("Simo", "No HTML cached yet. Build something first, then Download.");
      return;
    }
    const blob = new Blob([state.lastHTML], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "simo-build.html";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  function renderLibrary(forceOpen){
    if (!gatePro("Library")) return;

    const items = JSON.parse(localStorage.getItem("simo_library") || "[]");
    libraryPanel.innerHTML = "";

    if (items.length === 0) {
      libraryPanel.innerHTML = `<div class="small">Library is empty. Save a build first.</div>`;
    } else {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const row = document.createElement("div");
        row.className = "libItem";
        row.innerHTML = `
          <div>
            <b>${esc(it.name)}</b><br/>
            <span>${esc(new Date(it.stamp).toLocaleString())}</span>
          </div>
          <div class="row">
            <button class="btn ghost" data-action="load" data-idx="${i}">Load</button>
            <button class="btn ghost" data-action="del" data-idx="${i}">Delete</button>
          </div>
        `;
        libraryPanel.appendChild(row);
      }
    }

    if (forceOpen) libraryPanel.classList.add("show");
    libraryPanel.classList.toggle("show", libraryPanel.classList.contains("show"));
  }

  function toggleLibrary(){
    if (!gatePro("Library")) return;
    libraryPanel.classList.toggle("show");
    if (libraryPanel.classList.contains("show")) renderLibrary(false);
  }

  function loadFromLibrary(idx){
    const items = JSON.parse(localStorage.getItem("simo_library") || "[]");
    const it = items[idx];
    if (!it) return;
    state.lastHTML = it.html || "";
    showPreview(state.lastHTML);
    addMsg("Simo", `Loaded: ${it.name}`);
  }

  function deleteFromLibrary(idx){
    const items = JSON.parse(localStorage.getItem("simo_library") || "[]");
    items.splice(idx, 1);
    localStorage.setItem("simo_library", JSON.stringify(items));
    renderLibrary(true);
  }

  async function callBackend(userText){
    // keep chat responsive
    sendBtn.disabled = true;

    try {
      const body = {
        input: userText,
        pro: state.pro,
        history: state.conversation.slice(-12) // tiny rolling context
      };

      const r = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const raw = await r.text();
      let payload;
      try { payload = JSON.parse(raw); }
      catch { payload = { ok:false, text: raw }; }

      if (!r.ok || payload.ok === false) {
        addMsg("Simo", payload.error || payload.text || `Backend error (${r.status})`);
        return;
      }

      const replyText = payload.text || "Done.";
      addMsg("Simo", replyText);

      // update local “brain”
      state.conversation.push({ role:"user", content:userText });
      state.conversation.push({ role:"assistant", content:replyText });

      const html = extractHTML(payload);
      if (html) {
        showPreview(html);
        hint.textContent = "Preview updated. Ask for edits like: “headline: …” or “add faq”.";
      }

    } catch (e) {
      addMsg("Simo", `Network error: ${e?.message || e}`);
    } finally {
      sendBtn.disabled = false;
    }
  }

  async function verifyPro(){
    const key = prompt("Enter Pro key:");
    if (!key) return;

    try {
      const r = await fetch(PRO_URL, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ key })
      });
      const data = await r.json().catch(()=>({ ok:false, pro:false }));
      if (r.ok && data.ok && data.pro) {
        state.proKey = key;
        setProUI(true);
        addMsg("Simo", "Pro verified. Save/Download/Library unlocked.");
      } else {
        setProUI(false);
        addMsg("Simo", "Invalid key. Still in Free mode.");
      }
    } catch (e) {
      setProUI(false);
      addMsg("Simo", `Pro verify error: ${e?.message || e}`);
    }
  }

  function resetAll(){
    // NO white panel: this just hides iframe + shows dark empty state
    chatBody.innerHTML = "";
    chatInput.value = "";
    state.conversation = [];
    state.lastHTML = "";
    showPreview("");
    hint.textContent = "Build something first (example: “build a landing page for a fitness coach”).";
    addMsg("Simo", "Reset. I’m here.");
  }

  // Events (buttons will not “mysteriously stop” because we bind once)
  sendBtn.addEventListener("click", () => {
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = "";
    addMsg("You", text);
    callBackend(text);
  });

  resetBtn.addEventListener("click", resetAll);

  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });

  downloadBtn.addEventListener("click", downloadHTML);
  saveBtn.addEventListener("click", saveToLibrary);
  libraryBtn.addEventListener("click", toggleLibrary);

  libraryPanel.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const idx = Number(btn.getAttribute("data-idx"));
    const action = btn.getAttribute("data-action");
    if (action === "load") loadFromLibrary(idx);
    if (action === "del") deleteFromLibrary(idx);
  });

  function togglePro(){
    // if switching ON, verify. if switching OFF, just disable.
    if (!state.pro) verifyPro();
    else {
      setProUI(false);
      addMsg("Simo", "Pro disabled.");
    }
  }

  proToggle.addEventListener("click", togglePro);
  proToggle.addEventListener("keydown", (e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); togglePro(); } });

  // Init
  setProUI(false);
  showPreview("");
  addMsg("Simo", "Hey. Tell me what you want to build.");
})();
