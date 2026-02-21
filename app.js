/* app.js — Simo UI controller (Failsafe V4)
   - Cannot fail silently
   - Retries binding until DOM is ready + elements exist
   - Delegated click handling (buttons keep working)
*/

(() => {
  window.__SIMO_APP_LOADED__ = true;
  window.__SIMO_APP_VERSION__ = "failsafe-v4";

  const $ = (id) => document.getElementById(id);

  const REQUIRED_IDS = [
    "modeLabel","statusLabel","hint","log","input",
    "send","reset","previewBtn","download","save","library",
    "btnPro","btnClearMemory","btnNewThread",
    "proDot","proStatus","previewFrame","previewSub","previewEmpty",
    "modalWrap","closeModal","verifyKey","proKey","verifyStatus"
  ];

  const state = {
    mode: "general",
    pro: localStorage.getItem("simo_pro") === "1",
    messages: [],
    currentHtml: localStorage.getItem("simo_current_html_v2") || "",
    threadId: (crypto?.randomUUID?.() || String(Date.now()))
  };

  const els = {};

  function logBindReport() {
    const missing = REQUIRED_IDS.filter(id => !$(id));
    if (missing.length) {
      console.warn("[Simo] Missing IDs in DOM:", missing);
      return false;
    }
    return true;
  }

  function setText(id, text) { if (els[id]) els[id].textContent = text; }

  function setPreview(html) {
    const doc = String(html || "").trim();
    if (!doc || !doc.toLowerCase().startsWith("<!doctype html")) {
      setText("previewSub", "No HTML cached yet.");
      els.previewFrame.srcdoc = "";
      els.previewEmpty.style.display = "flex";
      return;
    }
    state.currentHtml = doc;
    localStorage.setItem("simo_current_html_v2", doc);
    els.previewEmpty.style.display = "none";
    setText("previewSub", "Updated by Simo.");
    els.previewFrame.srcdoc = doc;
  }

  function addMsg(role, text) {
    const t = String(text ?? "").trim();
    if (!t) return;

    const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    state.messages.push({ role, text: t, ts: Date.now() });
    state.messages = state.messages.slice(-40);

    localStorage.setItem("simo_messages_v2", JSON.stringify(state.messages));

    const wrap = document.createElement("div");
    wrap.className = "msg " + (role === "user" ? "you" : "simo");

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${role === "user" ? "You" : "Simo"} • ${stamp}`;

    const body = document.createElement("div");
    body.className = "text";
    body.textContent = t;

    wrap.appendChild(meta);
    wrap.appendChild(body);
    els.log.appendChild(wrap);
    els.log.scrollTop = els.log.scrollHeight;
  }

  function renderProUI() {
    if (!els.btnPro) return;
    els.btnPro.classList.toggle("proOn", state.pro);
    if (els.proDot) {
      els.proDot.style.background = state.pro ? "#39ff7a" : "#ff3b3b";
      els.proDot.style.boxShadow = state.pro ? "0 0 14px rgba(57,255,122,.55)" : "0 0 14px rgba(255,59,59,.55)";
    }
    if (els.proStatus) els.proStatus.textContent = `Pro: ${state.pro ? "ON" : "OFF"}`;

    ["download","save","library"].forEach((id) => {
      const b = els[id];
      if (!b) return;
      b.disabled = !state.pro;
      b.classList.toggle("locked", !state.pro);
    });
  }

  function openProModal() {
    els.verifyStatus.textContent = "";
    els.modalWrap.classList.add("show");
    setTimeout(() => els.proKey?.focus(), 50);
  }
  function closeProModal() { els.modalWrap.classList.remove("show"); }

  async function postJson(url, body, timeoutMs = 25000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
      const text = await r.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      return { ok: r.ok, status: r.status, text, json };
    } finally {
      clearTimeout(t);
    }
  }

  async function verifyPro() {
    const key = String(els.proKey.value || "").trim();
    if (!key) return;

    els.verifyStatus.className = "status";
    els.verifyStatus.textContent = "Verifying…";

    const res = await postJson("/.netlify/functions/pro", { key }, 12000).catch(() => null);
    const ok = !!res?.json?.ok && !!res?.json?.pro;

    if (ok) {
      state.pro = true;
      localStorage.setItem("simo_pro", "1");
      localStorage.setItem("simo_pro_key", key);
      els.verifyStatus.className = "status ok";
      els.verifyStatus.textContent = "Pro unlocked.";
      renderProUI();
      closeProModal();
      addMsg("assistant", "Pro enabled.");
    } else {
      state.pro = false;
      localStorage.removeItem("simo_pro");
      els.verifyStatus.className = "status bad";
      els.verifyStatus.textContent = "Invalid key.";
      renderProUI();
    }
  }

  function detectModeFromUserText(t) {
    const s = t.toLowerCase();
    const buildWords = ["build","make a","create a","landing page","website","app","preview"];
    const editWords = ["change","add","remove","continue","next","update","edit","headline","cta","price","image"];
    const isBuild = buildWords.some(w => s.includes(w));
    const isEdit = editWords.some(w => s.includes(w));
    if (isBuild || (isEdit && state.currentHtml)) return "building";
    return "general";
  }

  async function send() {
    const msg = String(els.input.value || "").trim();
    if (!msg) return;

    els.input.value = "";
    addMsg("user", msg);

    state.mode = detectModeFromUserText(msg);
    setText("modeLabel", state.mode);
    setText("statusLabel", "Thinking…");

    const payload = {
      mode: state.mode,
      pro: state.pro,
      threadId: state.threadId,
      input: msg,
      messages: state.messages.slice(-20),
      currentHtml: state.currentHtml || ""
    };

    let res;
    try {
      res = await postJson("/.netlify/functions/simon", payload, 25000);
    } catch (e) {
      addMsg("assistant", `Error: Network/timeout error: ${e?.name || e}`);
      setText("statusLabel", "Ready");
      return;
    }

    if (!res.ok) {
      addMsg("assistant", `Error: ${res.json?.error || res.text || `HTTP ${res.status}`}`);
      setText("statusLabel", "Ready");
      return;
    }

    const out = res.json || {};
    addMsg("assistant", out.reply || out.output || out.text || "(no response)");
    if (out.html) setPreview(out.html);

    setText("statusLabel", "Ready");
  }

  function resetThread() {
    state.threadId = (crypto?.randomUUID?.() || String(Date.now()));
    state.messages = [];
    state.currentHtml = "";
    localStorage.removeItem("simo_messages_v2");
    localStorage.removeItem("simo_current_html_v2");
    els.log.innerHTML = "";
    setPreview("");
    addMsg("assistant", "Reset. I’m here.");
    setText("modeLabel", "ready");
    setText("statusLabel", "Ready");
  }

  // Delegated button handling
  function onClick(e) {
    const id = e.target?.id;
    if (!id) return;

    if (id === "send") return send();
    if (id === "reset") return resetThread();
    if (id === "previewBtn") return setPreview(state.currentHtml);
    if (id === "btnPro") return openProModal();
    if (id === "closeModal") return closeProModal();
    if (id === "verifyKey") return verifyPro();

    if (id === "btnClearMemory") {
      state.messages = [];
      localStorage.removeItem("simo_messages_v2");
      addMsg("assistant", "Memory cleared (rolling context reset).");
      return;
    }

    if (id === "btnNewThread") {
      resetThread();
      addMsg("assistant", "New thread started.");
      return;
    }

    if (id === "download") {
      if (!state.currentHtml) return addMsg("assistant","No HTML cached yet. Build something first.");
      const blob = new Blob([state.currentHtml], { type:"text/html;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "simo_build.html";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      return;
    }

    if (id === "save") {
      if (!state.currentHtml) return addMsg("assistant","No HTML cached yet. Build something first.");
      const lib = JSON.parse(localStorage.getItem("simo_library_v2") || "[]");
      lib.unshift({ id: String(Date.now()), ts: Date.now(), title: `Build ${new Date().toLocaleString()}`, html: state.currentHtml });
      localStorage.setItem("simo_library_v2", JSON.stringify(lib.slice(0,50)));
      addMsg("assistant","Saved to Library.");
      return;
    }

    if (id === "library") {
      const lib = JSON.parse(localStorage.getItem("simo_library_v2") || "[]");
      if (!lib.length) return addMsg("assistant","Library is empty.");
      state.currentHtml = lib[0].html;
      setPreview(state.currentHtml);
      addMsg("assistant",`Loaded latest from Library: ${lib[0].title}`);
      return;
    }
  }

  function onKeydown(e) {
    if (e.target?.id === "input" && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
    if (e.target?.id === "proKey") {
      if (e.key === "Enter") verifyPro();
      if (e.key === "Escape") closeProModal();
    }
  }

  function boot() {
    // Cache elements
    REQUIRED_IDS.forEach(id => els[id] = $(id));

    if (!logBindReport()) return false;

    // restore messages
    try {
      const saved = JSON.parse(localStorage.getItem("simo_messages_v2") || "[]");
      if (Array.isArray(saved) && saved.length) {
        state.messages = saved;
        els.log.innerHTML = "";
        saved.forEach(m => addMsg(m.role, m.text));
      } else {
        addMsg("assistant","Back again — pick up where we left off.");
      }
    } catch {
      addMsg("assistant","Back again — pick up where we left off.");
    }

    renderProUI();
    setPreview(state.currentHtml);

    // Hard bind delegated handlers once
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeydown, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeydown, true);

    setText("modeLabel", "ready");
    setText("statusLabel", "Ready");
    console.log("[Simo] app.js bound OK:", window.__SIMO_APP_VERSION__);
    return true;
  }

  // Retry boot until DOM + elements exist (covers timing / partial loads)
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    if (boot() || tries >= 50) clearInterval(timer);
  }, 120);

})();
