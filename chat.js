/* chat.js — Simo UI controller (stable IDs, no null crashes)
   Required IDs:
   #chat, #input, #sendBtn
*/

(function(){
  const $ = (sel) => document.querySelector(sel);

  // --- required elements (validator expects these exact IDs) ---
  const chatEl   = $("#chat");
  const inputEl  = $("#input");
  const sendBtn  = $("#sendBtn");

  // --- optional UI elements ---
  const modeBuildingBtn = $("#modeBuilding");
  const modeSolvingBtn  = $("#modeSolving");
  const modeVentingBtn  = $("#modeVenting");
  const proBtn          = $("#togglePro");

  const resetBtn   = $("#resetBtn");
  const devBtn     = $("#devBtn");
  const saveBtn    = $("#saveBtn");
  const libraryBtn = $("#libraryBtn");

  const backendBadge = $("#backendBadge");
  const hintLine     = $("#hintLine");

  const previewFrame = $("#previewFrame");
  const previewName  = $("#previewName");
  const previewMode  = $("#previewMode");
  const previewPro   = $("#previewPro");
  const previewStatus= $("#previewStatus");

  const downloadBtn     = $("#downloadBtn");
  const clearPreviewBtn = $("#clearPreviewBtn");

  // Hard-stop if required elements are missing (prevents silent broken send)
  if(!chatEl || !inputEl || !sendBtn){
    document.body.innerHTML = `
      <div style="padding:24px;font-family:system-ui;color:#fff;background:#0b1020;min-height:100vh">
        <h1>Simo UI Error</h1>
        <p>This page is missing required elements (chat/input/sendBtn).</p>
        <pre style="background:#0008;padding:12px;border-radius:12px;border:1px solid #fff2;color:#d7e4ff">
chat: ${!!chatEl}
input: ${!!inputEl}
sendBtn: ${!!sendBtn}
URL: ${location.href}
        </pre>
      </div>`;
    return;
  }

  // --------------------------
  // State
  // --------------------------
  const LS = {
    MODE: "simo_mode",
    PRO: "simo_pro",
    MESSAGES: "simo_messages",
    PREVIEW: "simo_preview",
    LIBRARY: "simo_library"
  };

  let mode = localStorage.getItem(LS.MODE) || "building";   // building|solving|venting
  let proOn = (localStorage.getItem(LS.PRO) || "0") === "1";

  let messages = [];
  try { messages = JSON.parse(localStorage.getItem(LS.MESSAGES) || "[]"); } catch { messages = []; }

  let preview = null;
  try { preview = JSON.parse(localStorage.getItem(LS.PREVIEW) || "null"); } catch { preview = null; }
  // preview: { name, html }

  let library = [];
  try { library = JSON.parse(localStorage.getItem(LS.LIBRARY) || "[]"); } catch { library = []; }
  // library item: { id, name, html, createdAt }

  // --------------------------
  // UI helpers
  // --------------------------
  function setActive(btn, isOn){
    if(!btn) return;
    btn.classList.toggle("active", !!isOn);
  }

  function syncTopPills(){
    setActive(modeBuildingBtn, mode === "building");
    setActive(modeSolvingBtn,  mode === "solving");
    setActive(modeVentingBtn,  mode === "venting");

    if(proBtn){
      proBtn.textContent = `Pro: ${proOn ? "ON" : "OFF"}`;
      setActive(proBtn, proOn);
    }

    if(previewMode) previewMode.textContent = `mode: ${mode}`;
    if(previewPro)  previewPro.textContent  = `pro: ${proOn ? "on" : "off"}`;

    // Enable/disable paid buttons
    const hasPreview = !!(preview && preview.html);
    if(saveBtn) saveBtn.disabled = !(proOn && hasPreview);
    if(libraryBtn) libraryBtn.disabled = !(proOn && library.length > 0);
    if(downloadBtn) downloadBtn.disabled = !(proOn && hasPreview);
  }

  function setInputPlaceholder(){
    let text = "";
    if(mode === "venting"){
      text = "Say what's on your mind…";
    } else if(mode === "solving"){
      text = "What are we trying to fix?";
    } else {
      text = "Describe what you want to build. Say 'show me a preview' for visuals.";
    }
    if(proOn) text += "  (Pro ON: Save + Download enabled.)";
    inputEl.placeholder = text;
  }

  function setHint(){
    if(!hintLine) return;
    if(mode === "building"){
      hintLine.textContent = `Tip: Try “build landing page”, “show me a preview”, then “change pro price to 19”, then “save build”.`;
    } else if(mode === "venting"){
      hintLine.textContent = `Tip: Vent freely — Simo stays in best-friend mode here.`;
    } else {
      hintLine.textContent = `Tip: Tell me the goal + what you tried, and I’ll help you solve it.`;
    }
  }

  function escapeHtml(s=""){
    return String(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;");
  }

  function addMsg(role, text){
    const div = document.createElement("div");
    div.className = `msg ${role === "you" ? "you" : "simo"}`;
    div.textContent = text;
    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function renderAll(){
    chatEl.innerHTML = "";
    if(messages.length === 0){
      addMsg("simo", "Reset. I’m here.");
      messages = [{ role:"simo", text:"Reset. I’m here." }];
      saveMessages();
    } else {
      for(const m of messages){
        addMsg(m.role, m.text);
      }
    }
  }

  function saveMessages(){
    localStorage.setItem(LS.MESSAGES, JSON.stringify(messages));
  }

  function saveState(){
    localStorage.setItem(LS.MODE, mode);
    localStorage.setItem(LS.PRO, proOn ? "1" : "0");
    localStorage.setItem(LS.PREVIEW, JSON.stringify(preview));
    localStorage.setItem(LS.LIBRARY, JSON.stringify(library));
  }

  function setPreview(name, html){
    preview = { name: name || "preview", html: html || "" };
    if(previewName) previewName.textContent = preview.name || "preview";
    if(previewFrame){
      // srcdoc avoids any hosting issues
      previewFrame.srcdoc = preview.html || "";
    }
    saveState();
    syncTopPills();
  }

  function clearPreview(){
    preview = null;
    if(previewName) previewName.textContent = "none";
    if(previewFrame) previewFrame.srcdoc = "";
    saveState();
    syncTopPills();
  }

  function downloadCurrentPreview(){
    if(!preview || !preview.html) return;
    const blob = new Blob([preview.html], { type:"text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${preview.name || "preview"}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=> URL.revokeObjectURL(url), 1000);
  }

  function openLibrary(){
    // Simple chooser (no extra UI file) — pick latest or list names
    const items = library.slice().reverse();
    if(items.length === 0){
      addMsg("simo","Library is empty. Save a build first.");
      messages.push({role:"simo", text:"Library is empty. Save a build first."});
      saveMessages();
      return;
    }

    const menu = items.map((it, idx)=> `${idx+1}) ${it.name} (${new Date(it.createdAt).toLocaleString()})`).join("\n");
    const choice = prompt(
      `Saved builds:\n\n${menu}\n\nType a number to load:`,
      "1"
    );
    const n = Number(choice);
    if(!n || n<1 || n>items.length) return;

    const picked = items[n-1];
    setPreview(picked.name, picked.html);
    addMsg("simo", `Loaded: ${picked.name}`);
    messages.push({role:"simo", text:`Loaded: ${picked.name}`});
    saveMessages();
  }

  function saveBuild(){
    if(!proOn){
      addMsg("simo","Turn Pro ON to save builds.");
      messages.push({role:"simo", text:"Turn Pro ON to save builds."});
      saveMessages();
      return;
    }
    if(!preview || !preview.html){
      addMsg("simo","Nothing to save yet — generate a preview first.");
      messages.push({role:"simo", text:"Nothing to save yet — generate a preview first."});
      saveMessages();
      return;
    }

    const name = prompt("Name this build:", preview.name || "my_build");
    if(!name) return;

    const item = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      name,
      html: preview.html,
      createdAt: Date.now()
    };
    library.push(item);
    saveState();
    syncTopPills();
    addMsg("simo", `Saved: ${name}`);
    messages.push({role:"simo", text:`Saved: ${name}`});
    saveMessages();
  }

  function resetAll(){
    messages = [{role:"simo", text:"Reset. I’m here."}];
    preview = null;
    localStorage.removeItem(LS.MESSAGES);
    localStorage.setItem(LS.MESSAGES, JSON.stringify(messages));
    localStorage.setItem(LS.PREVIEW, "null");
    renderAll();
    clearPreview();
    syncTopPills();
    setInputPlaceholder();
    setHint();
  }

  // --------------------------
  // Backend call
  // --------------------------
  async function callBackend(text){
    const payload = {
      text,
      mode,
      pro: proOn,
      current_preview_name: preview?.name || "",
      current_preview_html: preview?.html || ""
    };

    const res = await fetch("/.netlify/functions/simon", {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(()=> ({}));
    if(!res.ok || data.ok === false){
      const err = data?.error || `HTTP ${res.status}`;
      const details = data?.details ? `\n${data.details}` : "";
      throw new Error(err + details);
    }
    return data;
  }

  // --------------------------
  // Send flow
  // --------------------------
  async function send(){
    const text = (inputEl.value || "").trim();
    if(!text) return;

    inputEl.value = "";
    addMsg("you", text);
    messages.push({role:"you", text});
    saveMessages();

    try{
      if(previewStatus) previewStatus.textContent = "thinking…";

      const data = await callBackend(text);

      // Reply
      const reply = (data.reply || "").trim() || "Okay.";
      addMsg("simo", reply);
      messages.push({role:"simo", text: reply});
      saveMessages();

      // Preview update (keep deterministic + do NOT lose current preview)
      if(typeof data.preview_html === "string" && data.preview_html.trim()){
        const nm = data.preview_name || "preview";
        setPreview(nm, data.preview_html);
      }

      if(backendBadge && data.backend_tag){
        backendBadge.textContent = `backend: ${data.backend_tag}`;
      } else if(backendBadge){
        // If backend_tag not provided, keep whatever is there
        if(backendBadge.textContent.includes("?")) backendBadge.textContent = "backend: simo-backend";
      }

    }catch(err){
      const msg = `Backend error: ${err?.message || err}`;
      addMsg("simo", msg);
      messages.push({role:"simo", text: msg});
      saveMessages();
    }finally{
      if(previewStatus) previewStatus.textContent = "ready";
      syncTopPills();
      setHint();
    }
  }

  // --------------------------
  // Wire events (no nulls)
  // --------------------------
  sendBtn.addEventListener("click", send);
  inputEl.addEventListener("keydown", (e)=>{
    if(e.key === "Enter" && !e.shiftKey){
      e.preventDefault();
      send();
    }
  });

  if(modeBuildingBtn) modeBuildingBtn.addEventListener("click", ()=>{
    mode = "building"; saveState(); syncTopPills(); setInputPlaceholder(); setHint();
  });
  if(modeSolvingBtn) modeSolvingBtn.addEventListener("click", ()=>{
    mode = "solving"; saveState(); syncTopPills(); setInputPlaceholder(); setHint();
  });
  if(modeVentingBtn) modeVentingBtn.addEventListener("click", ()=>{
    mode = "venting"; saveState(); syncTopPills(); setInputPlaceholder(); setHint();
  });

  if(proBtn) proBtn.addEventListener("click", ()=>{
    proOn = !proOn;
    saveState();
    syncTopPills();
    setInputPlaceholder();
    setHint();
  });

  if(resetBtn) resetBtn.addEventListener("click", resetAll);
  if(clearPreviewBtn) clearPreviewBtn.addEventListener("click", clearPreview);
  if(downloadBtn) downloadBtn.addEventListener("click", downloadCurrentPreview);

  if(saveBtn) saveBtn.addEventListener("click", saveBuild);
  if(libraryBtn) libraryBtn.addEventListener("click", openLibrary);

  if(devBtn) devBtn.addEventListener("click", ()=>{
    const snapshot = {
      mode, proOn,
      hasPreview: !!(preview && preview.html),
      previewName: preview?.name || null,
      libraryCount: library.length
    };
    alert("Dev snapshot:\n" + JSON.stringify(snapshot, null, 2));
  });

  // --------------------------
  // Boot
  // --------------------------
  renderAll();
  if(preview?.html) setPreview(preview.name, preview.html);
  syncTopPills();
  setInputPlaceholder();
  setHint();

})();
