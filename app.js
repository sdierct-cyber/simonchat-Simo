(() => {
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const nowISO = () => new Date().toISOString();

  function safeJSONParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }
  function asObject(v, fallback){
    return (v && typeof v === "object") ? v : fallback;
  }
  function stripCodeFences(text){
    const fence = /```(?:html)?\s*([\s\S]*?)```/i.exec(text || "");
    if (fence && fence[1]) return fence[1].trim();
    return null;
  }
  function looksLikeHTML(s){
    if(!s) return false;
    const t = s.trim().toLowerCase();
    return t.startsWith("<!doctype html") || t.startsWith("<html") || t.includes("<head") || t.includes("<body");
  }
  function makeFilename(){
    const d = new Date();
    const pad = (n)=>String(n).padStart(2,"0");
    return `simo_build_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.html`;
  }

  const STATE_KEY = "simo_state_v11";
  const PRO_KEY   = "simo_pro_v1";
  const LIB_KEY   = "simo_library_v1";

  const defaultState = {
    mode: "building",
    topic: "",
    lastUser: "",
    lastAssistant: "",
    draftHtml: "",
    draftName: "",
    draftUpdatedAt: "",
    buildHistory: []
  };

  let state = asObject(safeJSONParse(localStorage.getItem(STATE_KEY), null), defaultState);
  state = Object.assign({}, defaultState, state);

  let pro = asObject(safeJSONParse(localStorage.getItem(PRO_KEY), null), { pro:false, key:"" });
  if (typeof pro.pro !== "boolean") pro.pro = false;
  if (typeof pro.key !== "string") pro.key = "";

  const el = {
    logEl: $("log"),
    inputEl: $("input"),
    sendBtn: $("sendBtn"),
    previewBtn: $("previewBtn"),
    downloadBtn: $("downloadBtn"),
    saveBtn: $("saveBtn"),
    libraryBtn: $("libraryBtn"),
    frameEl: $("frame"),
    statusText: $("statusText"),
    previewLabel: $("previewLabel"),

    resetBtn: $("resetBtn"),

    proChip: $("proChip"),
    proText: $("proText"),
    proBtn: $("proBtn"),
    proModal: $("proModal"),
    proClose: $("proClose"),
    proKey: $("proKey"),
    proVerify: $("proVerify"),
    proMsg: $("proMsg"),

    libModal: $("libModal"),
    libClose: $("libClose"),
    libList: $("libList"),
    libClear: $("libClear"),

    modeChip: $("modeChip"),
    modeText: $("modeText"),
    topicTag: $("topicTag"),
    draftTag: $("draftTag"),
  };

  const required = ["logEl","inputEl","sendBtn","frameEl","statusText","modeChip","modeText","proChip","proText","proBtn","resetBtn"];
  for (const k of required){
    if(!el[k]){
      console.error("Simo boot failed: missing element", k);
      return;
    }
  }

  function placeholderPreview(){
    return "<!doctype html><html><head><meta charset='utf-8'><style>body{margin:0;font-family:system-ui;background:#0b1020;color:#a9b6d3;display:grid;place-items:center;height:100vh}.box{border:1px solid rgba(255,255,255,.12);padding:14px 16px;border-radius:14px;background:rgba(255,255,255,.05)}</style></head><body><div class='box'>No preview yet.</div></body></html>";
  }

  function saveState(){ localStorage.setItem(STATE_KEY, JSON.stringify(state)); }
  function setStatus(s){ el.statusText.textContent = s; }

  function setMode(mode){
    state.mode = mode;
    saveState();
    el.modeText.textContent = mode;
    if(mode === "building") el.modeChip.classList.add("good");
    else el.modeChip.classList.remove("good");
  }

  function setTopic(t){
    state.topic = (t || "").trim();
    saveState();
    if(el.topicTag) el.topicTag.textContent = `topic: ${state.topic || "none"}`;
  }

  function setDraftMeta(){
    if(el.draftTag) el.draftTag.textContent = `draft: ${state.draftName || "none"}`;
    if(el.previewLabel) el.previewLabel.textContent = state.draftUpdatedAt ? `Updated ${state.draftUpdatedAt}` : "No preview yet";
  }

  function setProUI(){
    const isPro = !!pro.pro;
    el.proText.textContent = isPro ? "ON" : "OFF";
    el.proChip.classList.toggle("good", isPro);
    el.proBtn.textContent = isPro ? "Pro Enabled" : "Unlock Pro";
    el.proBtn.classList.toggle("locked", isPro);

    el.saveBtn?.classList.toggle("locked", !isPro);
    el.libraryBtn?.classList.toggle("locked", !isPro);
    if(el.saveBtn) el.saveBtn.title = isPro ? "" : "Pro required";
    if(el.libraryBtn) el.libraryBtn.title = isPro ? "" : "Pro required";
  }

  function addMsg(who, text){
    const row = document.createElement("div");
    row.className = "msg " + (who === "me" ? "me" : "simo");
    const whoEl = document.createElement("div");
    whoEl.className = "who";
    whoEl.textContent = who === "me" ? "You" : "S";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;
    row.appendChild(whoEl);
    row.appendChild(bubble);
    el.logEl.appendChild(row);
    el.logEl.scrollTop = el.logEl.scrollHeight;
  }

  function setPreview(html){
    if(!html || !looksLikeHTML(html)) return false;
    el.frameEl.srcdoc = html;
    state.draftHtml = html;
    state.draftUpdatedAt = new Date().toLocaleString();
    if(!state.draftName) state.draftName = "untitled";
    saveState();
    setDraftMeta();
    return true;
  }

  // -------- Intent inference ----------
  function inferMode(text){
    const t = (text || "").toLowerCase().trim();
    if(!t) return state.mode;

    if(/\bvent(ing)?\b/.test(t)) return "venting";
    if(/\bsolv(ing|e)?\b/.test(t)) return "solving";
    if(/\bbuild(ing)?\b/.test(t)) return "building";

    if(/\b(stressed|anxious|sad|tired|overwhelmed|hurt|upset|mad|angry|depressed|lonely)\b/.test(t)) return "venting";
    if(/\b(help me|what should i do|how do i|steps|fix|debug|error|issue|problem|troubleshoot|why)\b/.test(t)) return "solving";
    if(/\b(build|make|create|design|landing page|website|app|ui|mockup|preview|html|css|pricing|testimonials|faq)\b/.test(t)) return "building";
    return state.mode;
  }

  function inferTopic(text){
    const t = (text || "").trim();
    if(!t) return state.topic;
    const low = t.toLowerCase();
    if(low.startsWith("switch topics")){
      return t.replace(/switch topics[:,]?\s*/i, "").trim() || "";
    }
    if(/landing page/i.test(t)) return "landing page";
    if(/\bfitness\b/i.test(t)) return "fitness site";
    if(/\bspace renting\b/i.test(t)) return "space renting app";
    if(/\bresume\b/i.test(t)) return "resume";
    if(/\b2 story\b|\bfloor plan\b|\bhome layout\b/i.test(t)) return "home layout";
    if(/\bbook cover\b/i.test(t)) return "book cover";
    return state.topic;
  }

  function userWantsPreview(text){
    const t = (text || "").toLowerCase();
    return /\b(show|open|render|update)\b.*\bpreview\b/.test(t) || /\bpreview\b/.test(t);
  }

  function shouldAutoPreview(text){
    const wants = userWantsPreview(text);
    if(state.mode !== "building") return wants;

    const t = (text || "").toLowerCase();
    if(wants) return true;

    const editCmd =
      t.startsWith("headline:") ||
      t.startsWith("cta:") ||
      t.startsWith("price:") ||
      t.includes("add faq") || t.includes("remove faq") ||
      t.includes("add pricing") || t.includes("remove pricing") ||
      t.includes("add testimonials") || t.includes("remove testimonials") ||
      t.includes("continue") || t.includes("update") || t.includes("revise") ||
      t.includes("build me") || t.includes("build a") || t.includes("create a") || t.includes("design a");

    return editCmd;
  }

  // -------- Library ----------
  function getLibrary(){ return safeJSONParse(localStorage.getItem(LIB_KEY), []) || []; }
  function setLibrary(items){ localStorage.setItem(LIB_KEY, JSON.stringify(items || [])); }

  function renderLibrary(){
    const items = getLibrary();
    el.libList.innerHTML = "";
    if(!items.length){
      const li = document.createElement("li");
      li.innerHTML = `<div><div class="name">No saved builds</div><div class="meta">Save something first.</div></div>`;
      el.libList.appendChild(li);
      return;
    }
    items.forEach((it, idx) => {
      const li = document.createElement("li");
      const left = document.createElement("div");
      left.innerHTML = `<div class="name">${it.name || "untitled"}</div><div class="meta">${it.savedAt || ""}</div>`;
      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.gap = "8px";

      const loadBtn = document.createElement("button");
      loadBtn.className = "btn ghost small";
      loadBtn.type = "button";
      loadBtn.textContent = "Load";
      loadBtn.onclick = () => {
        state.draftHtml = it.html || "";
        state.draftName = it.name || "untitled";
        state.draftUpdatedAt = new Date().toLocaleString();
        setTopic(it.topic || state.topic);
        saveState();
        if(state.draftHtml) setPreview(state.draftHtml);
        closeLib();
        addMsg("simo", `Loaded “${state.draftName}”. What do you want to change?`);
      };

      const delBtn = document.createElement("button");
      delBtn.className = "btn ghost small danger";
      delBtn.type = "button";
      delBtn.textContent = "Delete";
      delBtn.onclick = () => {
        const next = getLibrary().filter((_, i) => i !== idx);
        setLibrary(next);
        renderLibrary();
      };

      right.appendChild(loadBtn);
      right.appendChild(delBtn);

      li.appendChild(left);
      li.appendChild(right);
      el.libList.appendChild(li);
    });
  }

  function openLib(){
    if(!pro.pro) return;
    renderLibrary();
    el.libModal.style.display = "flex";
  }
  function closeLib(){ el.libModal.style.display = "none"; }

  // -------- Pro ----------
  function openProModal(){
    el.proMsg.textContent = "";
    el.proKey.value = "";
    el.proModal.style.display = "flex";
    setTimeout(()=>el.proKey.focus(), 50);
  }
  function closeProModal(){ el.proModal.style.display = "none"; }

  async function verifyProKey(key){
    const res = await fetch("/.netlify/functions/pro", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ key })
    });
    const data = await res.json().catch(()=> ({}));
    if(!res.ok) throw new Error(data?.error || "Verification failed");
    return data;
  }

  // -------- Backend ----------
  async function sendToBackend(userText){
    const payload = {
      message: userText,
      mode: state.mode,
      topic: state.topic,
      draft_html: state.draftHtml || "",
      draft_name: state.draftName || "",
      last_user: state.lastUser || "",
      last_assistant: state.lastAssistant || "",
      pro: !!pro.pro
    };

    const res = await fetch("/.netlify/functions/simon", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(()=> ({}));
    if(!res.ok){
      const msg = data?.error || data?.details || "OpenAI error";
      throw new Error(typeof msg === "string" ? msg : "OpenAI error");
    }
    return data;
  }

  function normalizeAssistantText(data){
    if(!data) return "";
    if(typeof data === "string") return data;
    return data.reply || data.text || data.message || data.output || "";
  }

  function extractHtmlFromResponse(text){
    const fenced = stripCodeFences(text);
    if(fenced && looksLikeHTML(fenced)) return fenced;
    if(looksLikeHTML(text)) return text.trim();
    return null;
  }

  // -------- Reset ----------
  function hardReset(){
    // Keep Pro + Library intact. Clear session state + chat + preview.
    state = Object.assign({}, defaultState, { mode: "building" });
    saveState();

    el.logEl.innerHTML = "";
    el.frameEl.srcdoc = placeholderPreview();

    setMode("building");
    setTopic("");
    state.draftHtml = "";
    state.draftName = "";
    state.draftUpdatedAt = "";
    saveState();
    setDraftMeta();
    setStatus("Ready");

    addMsg("simo", "Reset. I’m here.\n\nTell me what you want right now — venting, solving, or building.");
    el.inputEl.focus();
  }

  // -------- Actions ----------
  function manualPreview(){
    if(state.draftHtml && looksLikeHTML(state.draftHtml)){
      setPreview(state.draftHtml);
      addMsg("simo", "Preview refreshed.");
    }else{
      addMsg("simo", "No draft HTML yet. Ask me to build something (or say: show me a preview).");
    }
  }

  function downloadHTML(){
    if(!state.draftHtml || !looksLikeHTML(state.draftHtml)){
      addMsg("simo", "Nothing to download yet. Build a page/app first.");
      return;
    }
    const blob = new Blob([state.draftHtml], {type:"text/html;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = makeFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  function saveBuild(){
    if(!pro.pro) return;
    if(!state.draftHtml || !looksLikeHTML(state.draftHtml)){
      addMsg("simo", "Nothing to save yet. Build something first.");
      return;
    }
    const name = (state.draftName || state.topic || "untitled").trim();
    const item = { name, topic: state.topic || "", savedAt: new Date().toLocaleString(), html: state.draftHtml };
    const items = getLibrary();
    items.unshift(item);
    setLibrary(items.slice(0, 25));
    addMsg("simo", `Saved “${name}” to your Library.`);
  }

  // -------- Send ----------
  let sending = false;

  async function attemptPreviewFollowupOnce(){
    // Ask the backend explicitly for HTML once (no loops).
    const data2 = await sendToBackend("show me a preview");
    const assistant2 = normalizeAssistantText(data2) || "";
    const html2 = (data2 && typeof data2.html === "string" && looksLikeHTML(data2.html)) ? data2.html : extractHtmlFromResponse(assistant2);

    if(html2){
      if(!state.draftName) state.draftName = state.topic ? `${state.topic}` : "untitled";
      setPreview(html2);
      return true;
    }
    return false;
  }

  async function onSend(){
    if(sending) return;
    const userText = (el.inputEl.value || "").trim();
    if(!userText) return;

    setMode(inferMode(userText));
    const nextTopic = inferTopic(userText);
    if(nextTopic !== state.topic) setTopic(nextTopic);

    addMsg("me", userText);
    el.inputEl.value = "";
    setStatus("Thinking…");
    sending = true;
    el.sendBtn.classList.add("locked");
    el.sendBtn.textContent = "…";

    try{
      const data = await sendToBackend(userText);
      const assistantText = normalizeAssistantText(data) || "(no response)";
      addMsg("simo", assistantText);

      state.lastUser = userText;
      state.lastAssistant = assistantText;
      state.buildHistory = (state.buildHistory || []).slice(-8);
      state.buildHistory.push({ t: nowISO(), mode: state.mode, topic: state.topic });
      saveState();

      const doPreview = shouldAutoPreview(userText);
      let html = null;

      if(data && typeof data.html === "string" && looksLikeHTML(data.html)) html = data.html;
      if(!html) html = extractHtmlFromResponse(assistantText);

      if(html && doPreview){
        if(!state.draftName) state.draftName = state.topic ? `${state.topic}` : "untitled";
        setPreview(html);
      } else if (doPreview) {
        // ✅ KEY FIX: auto-follow-up once for HTML if assistant didn't return it
        const ok = await attemptPreviewFollowupOnce();
        if(!ok){
          addMsg("simo", "I didn’t receive HTML to render. Try: “show me a preview” (or I can regenerate the HTML).");
        }
      }

      setStatus("Ready");
    }catch(err){
      addMsg("simo", `⚠️ ${err?.message || "Error"}`);
      setStatus("Ready");
    }finally{
      sending = false;
      el.sendBtn.classList.remove("locked");
      el.sendBtn.textContent = "Send";
    }
  }

  // -------- Boot ----------
  function boot(){
    setMode(state.mode || "building");
    setTopic(state.topic || "");
    setDraftMeta();
    setProUI();

    if(state.draftHtml && looksLikeHTML(state.draftHtml)){
      el.frameEl.srcdoc = state.draftHtml;
    }

    // Seed message (proof JS is alive)
    addMsg("simo", "Reset. I’m here.\n\nTell me what you want right now — venting, solving, or building.");

    el.resetBtn.addEventListener("click", hardReset);

    el.sendBtn.addEventListener("click", onSend);
    el.inputEl.addEventListener("keydown", (e) => {
      if(e.key === "Enter" && !e.shiftKey){
        e.preventDefault();
        onSend();
      }
    });

    el.previewBtn?.addEventListener("click", manualPreview);
    el.downloadBtn?.addEventListener("click", downloadHTML);

    el.saveBtn?.addEventListener("click", () => { if(pro.pro) saveBuild(); });
    el.libraryBtn?.addEventListener("click", () => { if(pro.pro) openLib(); });

    el.proBtn.addEventListener("click", () => { if(!pro.pro) openProModal(); });
    el.proClose?.addEventListener("click", closeProModal);
    el.proModal?.addEventListener("click", (e) => { if(e.target === el.proModal) closeProModal(); });

    el.proVerify?.addEventListener("click", async () => {
      const key = (el.proKey?.value || "").trim();
      if(!key){ el.proMsg.textContent = "Enter a key."; return; }
      el.proMsg.textContent = "Verifying…";
      try{
        const data = await verifyProKey(key);
        const ok = !!data?.ok && !!data?.pro;
        if(ok){
          pro = { pro:true, key };
          localStorage.setItem(PRO_KEY, JSON.stringify(pro));
          setProUI();
          el.proMsg.textContent = "✅ Pro enabled.";
          await sleep(250);
          closeProModal();
          addMsg("simo", "Pro is ON. Save + Library unlocked.");
        }else{
          el.proMsg.textContent = "❌ Invalid key.";
        }
      }catch(err){
        el.proMsg.textContent = `⚠️ ${err?.message || "Verification failed"}`;
      }
    });

    el.libClose?.addEventListener("click", closeLib);
    el.libModal?.addEventListener("click", (e) => { if(e.target === el.libModal) closeLib(); });
    el.libClear?.addEventListener("click", () => { setLibrary([]); renderLibrary(); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
