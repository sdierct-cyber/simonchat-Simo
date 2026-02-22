/* app.js — Simo UI controller (KNOWN-GOOD)
   Fixes:
   - No syntax traps (no stray catch, no top-level await)
   - Uses your real IDs: sendBtn, resetBtn, chatInput, previewFrame, previewEmpty
   - Pro verify uses simple fetch (no AbortController)
   - Sets window.__SIMO_UI_OK__ = true when initialized
*/

(() => {
  const BACKEND_URL = "/.netlify/functions/simon";
  const PRO_URL = "/.netlify/functions/pro";

  const state = {
    pro: false,
    proKey: localStorage.getItem("simo_pro_key") || "",
    lastHTML: "",
    conversation: []
  };

  // ---------- DOM helpers ----------
  const $ = (id) => document.getElementById(id);
  const q = (sel) => document.querySelector(sel);
  const qa = (sel) => Array.from(document.querySelectorAll(sel));

  function byTextButton(label) {
    const t = label.toLowerCase();
    return qa("button").find(b => (b.textContent || "").trim().toLowerCase() === t) || null;
  }

  function esc(s){
    return String(s).replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }

  function chatBodyEl() {
    return $("chatBody") || q(".chatBody") || q('[data-chat="body"]') || null;
  }

  function addMsg(who, text) {
    const body = chatBodyEl();
    if (!body) return;
    const wrap = document.createElement("div");
    wrap.className = "msg";

    const whoEl = document.createElement("div");
    whoEl.className = "who";
    whoEl.textContent = who;

    const bubble = document.createElement("div");
    bubble.className = "bubble " + (who.toLowerCase() === "you" ? "you" : "simo");
    bubble.innerHTML = esc(text);

    wrap.appendChild(whoEl);
    wrap.appendChild(bubble);
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
  }

  function setStatus(text, good=false) {
    const el = $("statusText") || $("status") || q(".status") || null;
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("good", !!good);
    el.classList.toggle("bad", !good && /error|fail|invalid/i.test(text));
  }

  function isProbablyHTML(html) {
    const t = String(html || "").trim();
    return /^<!doctype html/i.test(t) || /^<html[\s>]/i.test(t) || t.includes("<body");
  }

  function setPreviewHTML(html) {
    const frame = $("previewFrame") || q("iframe");
    const empty = $("previewEmpty") || q(".previewEmpty");
    state.lastHTML = html || "";

    if (!frame) return;

    if (html && html.trim()) {
      if (empty) empty.style.display = "none";
      frame.style.display = "block";
      frame.srcdoc = html;
    } else {
      frame.srcdoc = "";
      frame.style.display = "none";
      if (empty) empty.style.display = "flex";
    }
  }

 function setProUI(on) {
  state.pro = !!on;
  setStatus(on ? "Pro" : "Free", on);

  const toggle = $("proToggle") || q('input[type="checkbox"]');
  if (toggle) toggle.checked = !!on;

  const saveBtn = $("saveBtn") || $("btnSave") || byTextButton("Save");
  const dlBtn   = $("downloadBtn") || $("btnDownload") || byTextButton("Download");
  const libBtn  = $("libraryBtn") || $("btnLibrary") || byTextButton("Library");

  if (saveBtn) saveBtn.disabled = !on;
  if (dlBtn) dlBtn.disabled = !on;
  if (libBtn) libBtn.disabled = !on;
}
  }

  // ---------- Pro verify ----------
  async function verifyProKey(key) {
    try {
      const r = await fetch(PRO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key })
      });

      const raw = await r.text();
      let data;
      try { data = JSON.parse(raw); } catch { data = { ok:false, pro:false }; }

      if (r.ok && data.ok && data.pro) {
        localStorage.setItem("simo_pro_key", key);
        setProUI(true);
        addMsg("Simo", "Pro verified. Save/Download/Library unlocked.");
        return true;
      }

      localStorage.removeItem("simo_pro_key");
      setProUI(false);
      addMsg("Simo", "Invalid key. Still in Free mode.");
      return false;
    } catch (e) {
      setProUI(false);
      addMsg("Simo", "Pro verify failed (network). Still in Free mode.");
      return false;
    }
  }

  function wireProToggle() {
    const toggle = $("proToggle") || q('input[type="checkbox"]') || null;
    if (!toggle) return;

    // On boot, try stored key (quietly)
    if (state.proKey) {
      verifyProKey(state.proKey);
    } else {
      setProUI(false);
    }

    toggle.addEventListener("change", async () => {
      if (toggle.checked) {
        const key = prompt("Enter Pro key:");
        if (!key) { toggle.checked = false; return; }
        const ok = await verifyProKey(String(key).trim());
        if (!ok) toggle.checked = false;
      } else {
        localStorage.removeItem("simo_pro_key");
        setProUI(false);
        addMsg("Simo", "Pro turned off.");
      }
    });
  }

  // ---------- Chat send ----------
  async function sendMessage() {
    const ta = $("chatInput") || q("textarea");
    if (!ta) return;

    const input = String(ta.value || "").trim();
    if (!input) return;

    ta.value = "";
    addMsg("You", input);
    setStatus("Thinking…", true);

    const history = state.conversation.slice(-12);

    try {
      const r = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ input, history, pro: !!state.pro })
      });

      const data = await r.json().catch(() => null);

      if (!r.ok || !data || !data.ok) {
        addMsg("Simo", `Backend error (${r.status || "?"}).`);
        setStatus("Error", false);
        return;
      }

      const text = String(data.text || "").trim() || "Done.";
      const html = String(data.html || "").trim();

      state.conversation.push({ role:"user", content: input });
      state.conversation.push({ role:"assistant", content: text });

      addMsg("Simo", text);
      if (isProbablyHTML(html)) setPreviewHTML(html);

      setStatus("Ready", true);
    } catch (e) {
      addMsg("Simo", "Backend error (network).");
      setStatus("Error", false);
    }
  }

  function wireButtons() {
    const sendBtn = $("sendBtn") || $("btnSend") || byTextButton("Send");
    const resetBtn = $("resetBtn") || $("btnReset") || byTextButton("Reset");
    const ta = $("chatInput") || q("textarea");

    if (sendBtn) sendBtn.addEventListener("click", sendMessage);

    if (ta) {
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        const body = chatBodyEl();
        if (body) body.innerHTML = "";
        state.conversation = [];
        setPreviewHTML("");
        addMsg("Simo", "Reset. I’m here.");
        setStatus(state.pro ? "Pro" : "Free", !!state.pro);
      });
    }
  }

  // ---------- Init ----------
  function init() {
    window.__SIMO_UI_OK__ = true;

    // Keep preview dark until HTML exists
    const frame = $("previewFrame") || q("iframe");
    const empty = $("previewEmpty") || q(".previewEmpty");
    if (frame) frame.style.display = "none";
    if (empty) empty.style.display = "flex";

    addMsg("Simo", "Reset. I’m here.");
    setStatus("Free", false);

    wireButtons();
    wireProToggle();
  }

  window.addEventListener("DOMContentLoaded", init);
})();
