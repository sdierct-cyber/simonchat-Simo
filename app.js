/* app.js — Simo UI controller (stable V2)
   - Bulletproof event wiring (DOMContentLoaded + delegation)
   - Enter to send, Shift+Enter newline
   - Pro gating via /.netlify/functions/pro
   - Sends chat to /.netlify/functions/simon
   - Maintains rolling memory + current HTML for edits/continue
   - Preview via iframe srcdoc (no white flash)
*/

(() => {
  const $ = (id) => document.getElementById(id);

  const els = {};
  const state = {
    mode: "general",          // "general" | "building"
    pro: false,
    messages: [],             // rolling conversation
    currentHtml: "",          // last full HTML doc
    threadId: crypto?.randomUUID?.() || String(Date.now()),
  };

  const LS = {
    pro: "simo_pro",
    proKey: "simo_pro_key",
    messages: "simo_messages_v2",
    html: "simo_current_html_v2",
    library: "simo_library_v2",
  };

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  function setModeLabel(txt) { els.modeLabel.textContent = txt; }
  function setStatus(txt) { els.statusLabel.textContent = txt; }
  function setHint(txt) { els.hint.textContent = txt; }

  function renderProUI() {
    els.btnPro.classList.toggle("proOn", state.pro);
    els.proDot.style.background = state.pro ? "#39ff7a" : "#ff3b3b";
    els.proDot.style.boxShadow = state.pro ? "0 0 14px rgba(57,255,122,.55)" : "0 0 14px rgba(255,59,59,.55)";
    els.proStatus.textContent = `Pro: ${state.pro ? "ON" : "OFF"}`;

    // gated buttons
    ["download","save","library"].forEach((id) => {
      const b = els[id];
      const locked = !state.pro;
      b.disabled = locked;
      b.classList.toggle("locked", locked);
    });
  }

  function addMsg(role, text) {
    const t = String(text ?? "").trim();
    if (!t) return;

    const time = new Date();
    const stamp = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    state.messages.push({ role, text: t, ts: Date.now() });

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

    // autoscroll
    els.log.scrollTop = els.log.scrollHeight;

    // persist rolling state
    localStorage.setItem(LS.messages, JSON.stringify(state.messages.slice(-40)));
  }

  function setPreview(html) {
    const doc = String(html || "").trim();
    if (!doc || !doc.toLowerCase().startsWith("<!doctype html")) {
      els.previewSub.textContent = "No HTML cached yet.";
      els.previewFrame.srcdoc = "";
      els.previewEmpty.style.display = "flex";
      return;
    }
    state.currentHtml = doc;
    localStorage.setItem(LS.html, doc);

    els.previewEmpty.style.display = "none";
    els.previewSub.textContent = "Updated by Simo.";
    els.previewFrame.srcdoc = doc;
  }

  function detectModeFromUserText(t) {
    const s = t.toLowerCase();
    const buildWords = ["build", "make a", "create a", "landing page", "website", "app", "preview"];
    const editWords  = ["change", "add", "remove", "continue", "next", "update", "edit", "headline", "cta", "price", "image"];
    const isBuild = buildWords.some(w => s.includes(w));
    const isEdit = editWords.some(w => s.includes(w));

    if (isBuild || (isEdit && state.currentHtml)) return "building";
    return "general";
  }

  async function postJson(url, body, timeoutMs = 20000) {
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
      try { json = JSON.parse(text); } catch { /* keep null */ }
      return { ok: r.ok, status: r.status, text, json };
    } finally {
      clearTimeout(t);
    }
  }

  async function send() {
    const input = els.input.value;
    const msg = String(input || "").trim();
    if (!msg) return;

    els.input.value = "";
    addMsg("user", msg);

    // decide mode
    state.mode = detectModeFromUserText(msg);
    setModeLabel(state.mode);
    setStatus("Thinking...");
    setHint(state.mode === "building" ? "Building / editing with HTML continuity…" : "Chatting…");

    const payload = {
      mode: state.mode,        // "general" | "building"
      pro: state.pro,
      threadId: state.threadId,
      input: msg,
      // send last messages for continuity
      messages: state.messages.slice(-20),
      currentHtml: state.currentHtml || ""
    };

    const res = await postJson("/.netlify/functions/simon", payload, 25000).catch((e) => {
      return { ok:false, status: 0, text: "", json: { ok:false, error: `Network/timeout error: ${e?.name || e}` } };
    });

    if (!res.ok) {
      const err = res.json?.error || res.text || `HTTP ${res.status}`;
      addMsg("assistant", `Error: ${err}`);
      setStatus("Ready");
      setHint("If this repeats: open Netlify → Functions → simon → Logs.");
      return;
    }

    const out = res.json || {};
    const reply = out.reply || out.output || out.text || "(no response)";
    addMsg("assistant", reply);

    if (out.html) setPreview(out.html);

    setStatus("Ready");
    setHint(state.currentHtml ? "You can say: change headline…, add testimonials, change image 1…, download, save" : "Build something to render in Preview.");
  }

  function resetThread() {
    state.threadId = crypto?.randomUUID?.() || String(Date.now());
    state.messages = [];
    state.currentHtml = "";
    localStorage.removeItem(LS.messages);
    localStorage.removeItem(LS.html);
    els.log.innerHTML = "";
    setPreview("");
    addMsg("assistant", "Reset. I’m here.");
    setModeLabel("ready");
    setStatus("Ready");
    setHint("Start with: build a landing page for …");
  }

  function clearMemory() {
    // clears *rolling* chat memory but keeps current HTML (so edits can still work if you want)
    state.messages = [];
    localStorage.removeItem(LS.messages);
    addMsg("assistant", "Memory cleared (rolling context reset).");
  }

  function newThread() {
    // clears rolling + html
    resetThread();
    addMsg("assistant", "New thread started.");
  }

  function openProModal() {
    els.verifyStatus.textContent = "";
    els.modalWrap.classList.add("show");
    setTimeout(() => els.proKey?.focus(), 50);
  }
  function closeProModal() {
    els.modalWrap.classList.remove("show");
  }

  async function verifyPro() {
    const key = String(els.proKey.value || "").trim();
    if (!key) return;

    els.verifyStatus.className = "status";
    els.verifyStatus.textContent = "Verifying…";

    const res = await postJson("/.netlify/functions/pro", { key }, 12000).catch(() => ({ ok:false, json:null, status:0, text:"" }));
    const ok = !!res?.json?.ok && !!res?.json?.pro;

    if (ok) {
      state.pro = true;
      localStorage.setItem(LS.pro, "1");
      localStorage.setItem(LS.proKey, key);
      els.verifyStatus.className = "status ok";
      els.verifyStatus.textContent = "Pro unlocked.";
      renderProUI();
      closeProModal();
      addMsg("assistant", "Pro enabled.");
    } else {
      state.pro = false;
      localStorage.removeItem(LS.pro);
      els.verifyStatus.className = "status bad";
      els.verifyStatus.textContent = "Invalid key.";
      renderProUI();
    }
  }

  function downloadHtml() {
    if (!state.currentHtml) {
      addMsg("assistant", "No HTML cached yet. Build something first.");
      return;
    }
    const blob = new Blob([state.currentHtml], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "simo_build.html";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  function saveToLibrary() {
    if (!state.currentHtml) {
      addMsg("assistant", "No HTML cached yet. Build something first.");
      return;
    }
    const lib = safeJsonParse(localStorage.getItem(LS.library), []);
    const item = {
      id: crypto?.randomUUID?.() || String(Date.now()),
      ts: Date.now(),
      title: `Build ${new Date().toLocaleString()}`,
      html: state.currentHtml
    };
    lib.unshift(item);
    localStorage.setItem(LS.library, JSON.stringify(lib.slice(0, 50)));
    addMsg("assistant", "Saved to Library.");
  }

  function openLibrary() {
    const lib = safeJsonParse(localStorage.getItem(LS.library), []);
    if (!lib.length) {
      addMsg("assistant", "Library is empty.");
      return;
    }
    // Load newest
    const item = lib[0];
    state.currentHtml = item.html;
    setPreview(item.html);
    addMsg("assistant", `Loaded latest from Library: ${item.title}`);
  }

  function bind() {
    // cache elements
    [
      "modeLabel","statusLabel","hint","log","input",
      "send","reset","previewBtn","download","save","library",
      "btnPro","btnClearMemory","btnNewThread",
      "proDot","proStatus","previewFrame","previewSub","previewEmpty",
      "modalWrap","closeModal","verifyKey","proKey","verifyStatus"
    ].forEach(id => els[id] = $(id));

    // restore pro + state
    state.pro = localStorage.getItem(LS.pro) === "1";
    const savedMsgs = safeJsonParse(localStorage.getItem(LS.messages), []);
    const savedHtml = localStorage.getItem(LS.html) || "";
    state.messages = Array.isArray(savedMsgs) ? savedMsgs : [];
    state.currentHtml = savedHtml;

    renderProUI();

    // restore UI
    els.log.innerHTML = "";
    if (state.messages.length) {
      state.messages.forEach(m => addMsg(m.role, m.text));
    } else {
      addMsg("assistant", "Back again — pick up where we left off.");
    }
    if (state.currentHtml) setPreview(state.currentHtml);
    else setPreview("");

    setModeLabel("ready");
    setStatus("Ready");

    // button clicks
    els.send.addEventListener("click", send);
    els.reset.addEventListener("click", resetThread);
    els.previewBtn.addEventListener("click", () => setPreview(state.currentHtml));
    els.download.addEventListener("click", downloadHtml);
    els.save.addEventListener("click", saveToLibrary);
    els.library.addEventListener("click", openLibrary);

    els.btnClearMemory.addEventListener("click", clearMemory);
    els.btnNewThread.addEventListener("click", newThread);
    els.btnPro.addEventListener("click", openProModal);

    // modal
    els.closeModal.addEventListener("click", closeProModal);
    els.modalWrap.addEventListener("click", (e) => { if (e.target === els.modalWrap) closeProModal(); });
    els.verifyKey.addEventListener("click", verifyPro);
    els.proKey.addEventListener("keydown", (e) => {
      if (e.key === "Enter") verifyPro();
      if (e.key === "Escape") closeProModal();
    });

    // textarea enter to send
    els.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", bind);
})();
