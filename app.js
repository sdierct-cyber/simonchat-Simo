/* app.js — Simo UI controller (V1.2 stable)
   Fixes:
   - Parses backend JSON {reply, html} OR plain text safely
   - Renders reply text to chat only (never dumps raw JSON)
   - Updates preview iframe from html string automatically
   - Pro toggle ALWAYS triggers verify flow and gates buttons
   - Enter-to-send works; Shift+Enter newline
   - Safe selectors + fallbacks so it won’t “lose” buttons
*/

(() => {
  // ---------- Helpers ----------
  const $ = (id) => document.getElementById(id);
  const q = (sel, root = document) => root.querySelector(sel);
  const qa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const byTextButton = (txt) =>
    qa("button").find((b) => (b.textContent || "").trim().toLowerCase() === txt.toLowerCase());

  const safeJSON = (text) => {
    try { return JSON.parse(text); } catch { return null; }
  };

  const setStatus = (label, ok = true) => {
    const el = $("status") || $("statusBadge") || q('[data-role="status"]') || q(".status");
    if (!el) return;
    el.textContent = label;
    el.classList.toggle("ok", !!ok);
    el.classList.toggle("bad", !ok);
  };

  const state = {
    pro: false,
    lastHTML: "",
    lastReply: "",
    proKey: localStorage.getItem("PRO_KEY") || "",
  };

  // ---------- Elements (with fallbacks) ----------
  const chatLog =
    $("chatLog") ||
    q("#chat") ||
    q(".chat") ||
    q('[data-role="chat"]') ||
    q(".messages");

  const input =
    $("userInput") ||
    $("input") ||
    q("textarea") ||
    q('input[type="text"]');

  const sendBtn =
    $("sendBtn") ||
    $("btnSend") ||
    byTextButton("Send");

  const resetBtn =
    $("resetBtn") ||
    $("btnReset") ||
    byTextButton("Reset");

  const previewFrame =
    $("previewFrame") ||
    q("iframe") ||
    q('[data-role="preview"] iframe');

  const proToggle =
    $("proToggle") ||
    q('input[type="checkbox"]') ||
    q('button[aria-label*="pro" i]');

  const saveBtn = $("saveBtn") || $("btnSave") || byTextButton("Save");
  const dlBtn   = $("downloadBtn") || $("btnDownload") || byTextButton("Download");
  const libBtn  = $("libraryBtn") || $("btnLibrary") || byTextButton("Library");

  // ---------- UI rendering ----------
  const addMsg = (who, text) => {
    if (!chatLog) return;
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
  };

  const setPreviewHTML = (html) => {
    state.lastHTML = html || "";
    if (!previewFrame) return;

    if (!html) {
      // keep preview empty / placeholder (don’t force a white panel)
      try { previewFrame.srcdoc = ""; } catch {}
      return;
    }

    try {
      previewFrame.srcdoc = html;
    } catch (e) {
      // fallback if srcdoc blocked for some reason
      previewFrame.setAttribute("srcdoc", html);
    }
  };

  function setProUI(on) {
    state.pro = !!on;
    setStatus(on ? "Pro" : "Free", true);

    // checkbox toggle sync
    if (proToggle && proToggle.type === "checkbox") proToggle.checked = !!on;

    // gate buttons
    if (saveBtn) saveBtn.disabled = !on;
    if (dlBtn)   dlBtn.disabled   = !on;
    if (libBtn)  libBtn.disabled  = !on;
  }

  // ---------- Pro verify ----------
  async function verifyProKey(key) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);

    try {
      const r = await fetch("/.netlify/functions/pro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
        signal: ctrl.signal,
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
    // If already Pro, nothing to do
    if (state.pro) return true;

    // Ask for key (simple + reliable; avoids missing modal bugs)
    let key = (state.proKey || "").trim();
    if (!key) {
      key = (window.prompt("Enter your Pro license key:") || "").trim();
    }
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
      setStatus("Free", true);
      window.alert("Key not valid. Pro stayed OFF.");
      return false;
    }
  }

  function turnProOff() {
    setProUI(false);
  }

  // ---------- Backend call ----------
  async function callBackend(userText) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);

    try {
      const r = await fetch("/.netlify/functions/simon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: userText }),
        signal: ctrl.signal,
      });

      const raw = await r.text();
      // Try parse JSON
      const obj = safeJSON(raw);

      // If JSON with reply/html -> return structured
      if (obj && (typeof obj.reply === "string" || typeof obj.html === "string")) {
        return {
          reply: (obj.reply || "").toString(),
          html: (obj.html || "").toString(),
          raw,
        };
      }

      // Otherwise treat as plain text; attempt to extract html if backend returned a full doc
      const looksLikeHTML = raw.includes("<!doctype") || raw.includes("<html");
      return {
        reply: looksLikeHTML ? "Done. I updated the preview on the right." : raw,
        html: looksLikeHTML ? raw : "",
        raw,
      };
    } finally {
      clearTimeout(t);
    }
  }

  // ---------- Send handling ----------
  async function onSend() {
    if (!input) return;
    const text = (input.value || "").trim();
    if (!text) return;

    addMsg("You", text);
    input.value = "";

    try {
      setStatus("Thinking…", true);
      const res = await callBackend(text);

      // IMPORTANT: never dump raw JSON into chat
      const reply = (res.reply || "").trim() || "Done.";
      addMsg("Simo", reply);
      state.lastReply = reply;

      // Update preview if html exists
      if (res.html && res.html.trim()) {
        setPreviewHTML(res.html);
      }

      setStatus("Ready", true);
    } catch (e) {
      addMsg("Simo", "Something failed. Try again.");
      setStatus("Error", false);
    }
  }

  function onReset() {
    // Clear chat
    if (chatLog) chatLog.innerHTML = "";
    // Clear preview WITHOUT forcing a white panel
    setPreviewHTML("");
    addMsg("Simo", "Reset. I’m here.");
    setStatus(state.pro ? "Pro" : "Ready", true);
  }

  // ---------- Wire events ----------
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

  // Pro toggle: handle checkbox or button-like toggle
  if (proToggle) {
    if (proToggle.type === "checkbox") {
      proToggle.addEventListener("change", async () => {
        if (proToggle.checked) {
          const ok = await ensureProOn();
          if (!ok) proToggle.checked = false;
        } else {
          turnProOff();
        }
      });
    } else {
      proToggle.addEventListener("click", async () => {
        if (!state.pro) await ensureProOn();
        else turnProOff();
      });
    }
  }

  // Boot
  setProUI(false);           // default OFF
  addMsg("Simo", "Reset. I’m here.");
  setStatus("Ready", true);
})();
