/* app.js — Simo UI controller (V1.4 DEBUG-SAFE + STABLE)
   - Forces POST to /.netlify/functions/simon
   - Forces JSON body { input, lastHTML }
   - Never hides errors: prints backend error message in chat
   - Preview updates whenever html exists
   - Pro verify still uses /.netlify/functions/pro
*/

(() => {
  const $ = (id) => document.getElementById(id);

  const chatLog = $("chatLog");
  const input = $("userInput");
  const sendBtn = $("sendBtn");
  const resetBtn = $("resetBtn");
  const previewFrame = $("previewFrame");
  const previewEmpty = $("previewEmpty");

  const proToggle = $("proToggle");
  const saveBtn = $("saveBtn");
  const dlBtn = $("downloadBtn");
  const libBtn = $("libraryBtn");

  const statusEl = $("status");
  const statusWrap = $("statusWrap");

  const state = {
    pro: false,
    lastHTML: "",
    proKey: localStorage.getItem("PRO_KEY") || ""
  };

  function setStatus(text, ok = true) {
    if (statusEl) statusEl.textContent = text;
    if (statusWrap) {
      statusWrap.classList.toggle("ok", !!ok);
      statusWrap.classList.toggle("bad", !ok);
    }
  }

  function addMsg(who, text) {
    const wrap = document.createElement("div");
    wrap.className = "msg " + (who === "You" ? "you" : "simo");

    const name = document.createElement("div");
    name.className = "who";
    name.textContent = who;

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;

    wrap.appendChild(name);
    wrap.appendChild(bubble);
    chatLog.appendChild(wrap);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function setPreviewHTML(html) {
    state.lastHTML = (html || "").toString();

    if (!state.lastHTML.trim()) {
      previewFrame.style.display = "none";
      previewEmpty.style.display = "flex";
      previewFrame.srcdoc = "";
      return;
    }

    previewEmpty.style.display = "none";
    previewFrame.style.display = "block";
    previewFrame.srcdoc = state.lastHTML;
  }

  function setProUI(on) {
    state.pro = !!on;
    setStatus(on ? "Pro" : "Ready", true);

    if (saveBtn) saveBtn.disabled = !on;
    if (dlBtn) dlBtn.disabled = !on;
    if (libBtn) libBtn.disabled = !on;
  }

  async function verifyProKey(key) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);

    try {
      const r = await fetch("/.netlify/functions/pro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
        signal: ctrl.signal
      });

      const data = await r.json().catch(() => null);
      return !!(data && data.ok && data.pro);
    } catch {
      return false;
    } finally {
      clearTimeout(t);
    }
  }

  async function ensureProOn() {
    let key = (state.proKey || "").trim();
    if (!key) key = (prompt("Enter your Pro license key:") || "").trim();
    if (!key) return false;

    setStatus("Verifying…", true);
    const ok = await verifyProKey(key);

    if (ok) {
      state.proKey = key;
      localStorage.setItem("PRO_KEY", key);
      setProUI(true);
      return true;
    } else {
      setProUI(false);
      alert("Key not valid. Pro stayed OFF.");
      return false;
    }
  }

  async function callBackend(userText) {
    const payload = { input: userText, lastHTML: state.lastHTML };

    console.log("[SIMO] POST /.netlify/functions/simon payload:", payload);

    const r = await fetch("/.netlify/functions/simon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const text = await r.text();
    console.log("[SIMO] STATUS", r.status, "RAW:", text.slice(0, 300));

    // Always try to parse JSON
    let data = null;
    try { data = JSON.parse(text); } catch {}

    if (!data) {
      // Not JSON — treat as error, show raw snippet
      return {
        ok: false,
        reply: "Backend returned non-JSON response.",
        html: "",
        error: text.slice(0, 300)
      };
    }

    return data;
  }

  async function onSend() {
    const text = (input.value || "").trim();
    if (!text) return;

    addMsg("You", text);
    input.value = "";

    try {
      setStatus("Thinking…", true);

      const res = await callBackend(text);

      // If backend indicates error, show it clearly
      if (!res.ok) {
        addMsg("Simo", res.reply || "Backend error.");
        if (res.error) addMsg("Simo", "Error details: " + String(res.error).slice(0, 220));
        setStatus("Error", false);
        return;
      }

      addMsg("Simo", (res.reply || "Done.").trim());

      if (res.html && String(res.html).trim()) {
        setPreviewHTML(res.html);
      }

      setStatus(state.pro ? "Pro" : "Ready", true);
    } catch (e) {
      addMsg("Simo", "Request failed: " + String(e && e.message ? e.message : e));
      setStatus("Error", false);
    }
  }

  function onReset() {
    chatLog.innerHTML = "";
    setPreviewHTML("");
    addMsg("Simo", "Reset. I’m here.");
    setStatus(state.pro ? "Pro" : "Ready", true);
  }

  // Buttons
  if (sendBtn) sendBtn.addEventListener("click", onSend);
  if (resetBtn) resetBtn.addEventListener("click", onReset);

  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    });
  }

  if (proToggle) {
    proToggle.addEventListener("change", async () => {
      if (proToggle.checked) {
        const ok = await ensureProOn();
        if (!ok) proToggle.checked = false;
      } else {
        setProUI(false);
      }
    });
  }

  // Boot
  setProUI(false);
  addMsg("Simo", "Reset. I’m here.");
  setStatus("Ready", true);
})();
