(() => {
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const nowISO = () => new Date().toISOString();

  function safeJSONParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
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

  let state = Object.assign({}, defaultState, safeJSONParse(localStorage.getItem(STATE_KEY), {}));
  let pro   = safeJSONParse(localStorage.getItem(PRO_KEY), { pro:false, key:"" });

  // Elements
  const logEl = $("log");
  const inputEl = $("input");
  const sendBtn = $("sendBtn");
  const previewBtn = $("previewBtn");
  const downloadBtn = $("downloadBtn");
  const saveBtn = $("saveBtn");
  const libraryBtn = $("libraryBtn");
  const frameEl = $("frame");
  const statusText = $("statusText");
  const previewLabel = $("previewLabel");

  const proChip = $("proChip");
  const proText = $("proText");
  const proBtn = $("proBtn");
  const proModal = $("proModal");
  const proClose = $("proClose");
  const proKey = $("proKey");
  const proVerify = $("proVerify");
  const proMsg = $("proMsg");

  const libModal = $("libModal");
  const libClose = $("libClose");
  const libList = $("libList");
  const libClear = $("libClear");

  const modeChip = $("modeChip");
  const modeText = $("modeText");
  const topicTag = $("topicTag");
  const draftTag = $("draftTag");

  function saveState(){ localStorage.setItem(STATE_KEY, JSON.stringify(state)); }
  function setStatus(s){ statusText.textContent = s; }

  function setMode(mode){
    state.mode = mode;
    saveState();
    modeText.textContent = mode;
    if(mode === "building") modeChip.classList.add("good");
    else modeChip.classList.remove("good");
  }

  function setTopic(t){
    state.topic = (t || "").trim();
    saveState();
    topicTag.textContent = `topic: ${state.topic || "none"}`;
  }

  function setDraftMeta(){
    draftTag.textContent = `draft: ${state.draftName || "none"}`;
    previewLabel.textContent = state.draftUpdatedAt ? `Updated ${state.draftUpdatedAt}` : "No preview yet";
  }

  function setProUI(){
    const isPro = !!pro.pro;
    proText.textContent = isPro ? "ON" : "OFF";
    proChip.classList.toggle("good", isPro);
    proBtn.textContent = isPro ? "Pro Enabled" : "Unlock Pro";
    proBtn.classList.toggle("locked", isPro);

    saveBtn.classList.toggle("locked", !isPro);
    libraryBtn.classList.toggle("locked", !isPro);
    saveBtn.title = isPro ? "" : "Pro required";
    libraryBtn.title = isPro ? "" : "Pro required";
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
    logEl.appendChild(row);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setPreview(html){
    if(!html || !looksLikeHTML(html)) return false;
    frameEl.srcdoc = html;
    state.draftHtml = html;
    state.draftUpdatedAt = new Date().toLocaleString();
    if(!state.draftName) state.draftName = "untitled";
    saveState();
    setDraftMeta();
    return true;
  }

  // Intent inference
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
      t.includes("continue") || t.includes("update") || t.includes("revise");

    return editCmd;
  }

  // Library
  function getLibrary(){ return safeJSONParse(localStorage.getItem(LIB_KEY), []); }
  function setLibrary(items){ localStorage.setItem(LIB_KEY, JSON.stringify(items || [])); }

  function renderLibrary(){
    const items = getLibrary();
    libList.innerHTML = "";
    if(!items.length){
      const li = document.createElement("li");
      li.innerHTML = `<div><div class="name">No saved builds</div><div class="meta">Save something first.</div></div>`;
      libList.appendChild(li);
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
      libList.appendChild(li);
    });
  }

  function openLib(){
    if(!pro.pro) return;
    renderLibrary();
    libModal.style.display = "flex";
  }
  function closeLib(){ libModal.style.display = "none"; }

  // Pro modal
  function openProModal(){
    proMsg.textContent = "";
    proKey.value = "";
    proModal.style.display = "flex";
    setTimeout(()=>proKey.focus(), 50);
  }
  function closeProModal(){ proModal.style.display = "none"; }

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

  // Backend
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

  let sending = false;
  async function onSend(){
    if(sending) return;
    const userText = (inputEl.value || "").trim();
    if(!userText) return;

    setMode(inferMode(userText));
    const nextTopic = inferTopic(userText);
    if(nextTopic !== state.topic) setTopic(nextTopic);

    addMsg("me", userText);
    inputEl.value = "";
    setStatus("Thinking…");
    sending = true;
    sendBtn.classList.add("locked");
    sendBtn.textContent = "…";

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
      const html = extractHtmlFromResponse(assistantText);
      if(html && doPreview){
        if(!state.draftName) state.draftName = state.topic ? `${state.topic}` : "untitled";
        setPreview(html);
      }
      if(data && typeof data.html === "string" && looksLikeHTML(data.html)){
        if(doPreview) setPreview(data.html);
      }

      setStatus("Ready");
    }catch(err){
      addMsg("simo", `⚠️ ${err?.message || "Error"}`);
      setStatus("Ready");
    }finally{
      sending = false;
      sendBtn.classList.remove("locked");
      sendBtn.textContent = "Send";
    }
  }

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

  function boot(){
    setMode(state.mode || "building");
    setTopic(state.topic || "");
    setDraftMeta();
    setProUI();

    // If draft exists, render it (otherwise iframe already has placeholder)
    if(state.draftHtml && looksLikeHTML(state.draftHtml)){
      frameEl.srcdoc = state.draftHtml;
    }

    // Seed message (confirms JS is alive)
    addMsg("simo", "Reset. I’m here.\n\nTell me what you want right now — venting, solving, or building.");

    // Listeners
    sendBtn.addEventListener("click", onSend);
    inputEl.addEventListener("keydown", (e) => {
      if(e.key === "Enter" && !e.shiftKey){
        e.preventDefault();
        onSend();
      }
    });

    previewBtn.addEventListener("click", manualPreview);
    downloadBtn.addEventListener("click", downloadHTML);

    saveBtn.addEventListener("click", () => { if(pro.pro) saveBuild(); });
    libraryBtn.addEventListener("click", () => { if(pro.pro) openLib(); });

    proBtn.addEventListener("click", () => { if(!pro.pro) openProModal(); });
    proClose.addEventListener("click", closeProModal);
    proModal.addEventListener("click", (e) => { if(e.target === proModal) closeProModal(); });

    proVerify.addEventListener("click", async () => {
      const key = (proKey.value || "").trim();
      if(!key){ proMsg.textContent = "Enter a key."; return; }
      proMsg.textContent = "Verifying…";
      try{
        const data = await verifyProKey(key);
        const ok = !!data?.ok && !!data?.pro;
        if(ok){
          pro = { pro:true, key };
          localStorage.setItem(PRO_KEY, JSON.stringify(pro));
          setProUI();
          proMsg.textContent = "✅ Pro enabled.";
          await sleep(300);
          closeProModal();
          addMsg("simo", "Pro is ON. Save + Library unlocked.");
        }else{
          proMsg.textContent = "❌ Invalid key.";
        }
      }catch(err){
        proMsg.textContent = `⚠️ ${err?.message || "Verification failed"}`;
      }
    });

    libClose.addEventListener("click", closeLib);
    libModal.addEventListener("click", (e) => { if(e.target === libModal) closeLib(); });
    libClear.addEventListener("click", () => { setLibrary([]); renderLibrary(); });

    topicTag.textContent = `topic: ${state.topic || "none"}`;
    draftTag.textContent = `draft: ${state.draftName || "none"}`;
  }

  // Boot safely
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
