/* app.js — Simo UI controller (NO top-level await, matches your IDs)
   Works with:
   - textarea id="chatInput"
   - send button id="sendBtn"
   - reset button id="resetBtn" (if present) or button text "Reset"
   - iframe id="previewFrame"
   - empty preview div id="previewEmpty"
*/

(() => {
  const BACKEND_URL = "/.netlify/functions/simon";
  const PRO_URL = "/.netlify/functions/pro";

  const state = {
    pro: false,
    proKey: "",
    lastHTML: "",
    conversation: [] // [{role, content}]
  };

  // ---------- Helpers ----------
  const $id = (id) => document.getElementById(id);
  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  function findButtonByText(txt) {
    const t = txt.toLowerCase();
    return qsa("button").find(b => (b.textContent || "").trim().toLowerCase() === t) || null;
  }

  function esc(s){
    return String(s).replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }

  function getChatBody() {
    return $id("chatBody") || qs(".chatBody") || $id("messages") || qs(".messages") || null;
  }

  function addMsg(who, text) {
    const chat = getChatBody();
    if (!chat) return;

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
    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;
  }

  function setStatus(text, good=false) {
    const el =
      $id("statusText") ||
      $id("status") ||
      qs(".status") ||
      null;
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("good", !!good);
    el.classList.toggle("bad", !good && /error|invalid|fail/i.test(text));
  }

  function isProbablyHTML(s){
    const t = String(s || "").trim();
    return /^<!doctype html/i.test(t) || /^<html[\s>]/i.test(t) || t.includes("<body");
  }

  function setPreviewHTML(html) {
    const frame = $id("previewFrame") || qs("iframe");
    const empty = $id("previewEmpty") || qs(".previewEmpty");
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

  function titleFromHTML(html) {
    try {
      const m = html.match(/<title>([\s\S]*?)<\/title>/i);
      if (m && m[1]) return m[1].trim().slice(0, 60);
    } catch {}
    return "Untitled build";
  }

  function getLibrary() {
    try {
      const raw = localStorage.getItem("simo_library");
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function setLibrary(arr) {
    localStorage.setItem("simo_library", JSON.stringify(arr));
  }

  function renderLibrary() {
    const list = $id("libList") || qs(".libList");
    if (!list) return;

    const items = getLibrary();
    list.innerHTML = "";

    if (!items.length) {
      const p = document.createElement("div");
      p.className = "small";
      p.textContent = "No saved items yet.";
      list.appendChild(p);
      return;
    }

    for (const item of items) {
      const row = document.createElement("div");
      row.className = "libItem";

      const left = document.createElement("div");
      const b = document.createElement("b");
      b.textContent = item.title || "Saved build";
      const span = document.createElement("span");
      span.textContent = new Date(item.ts || Date.now()).toLocaleString();
      left.appendChild(b);
      left.appendChild(document.createElement("br"));
      left.appendChild(span);

      const btn = document.createElement("button");
      btn.className = "btn ghost";
      btn.textContent = "Load";
      btn.onclick = () => {
        setPreviewHTML(item.html || "");
        addMsg("Simo", `Loaded: ${item.title || "Saved build"}`);
      };

      row.appendChild(left);
      row.appendChild(btn);
      list.appendChild(row);
    }
  }

  function setProUI(on) {
    state.pro = !!on;
    setStatus(on ? "Pro" : "Free", on);

    const saveBtn = $id("saveBtn") || $id("btnSave") || findButtonByText("Save");
    const dlBtn   = $id("downloadBtn") || $id("btnDownload") || findButtonByText("Download");
    const libBtn  = $id("libraryBtn") || $id("btnLibrary") || findButtonByText("Library");

    if (saveBtn) saveBtn.disabled = !on;
    if (dlBtn) dlBtn.disabled = !on;
    if (libBtn) libBtn.disabled = !on;
  }

  // ---------- Pro verify ----------
  async function verifyProKey(key) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);

    try {
      const r = await fetch(PRO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
        signal: ctrl.signal
      });

      const raw = await r.text();
      let data;
      try { data = JSON.parse(raw); } catch { data = { ok:false, pro:false }; }

      if (r.ok && data.ok && data.pro) {
        state.proKey = key;
        localStorage.setItem("simo_pro_key", key);
        setProUI(true);
        addMsg("Simo", "Pro verified. Save/Download/Library unlocked.");
        renderLibrary();
        return true;
      }

      setProUI(false);
      addMsg("Simo", "Invalid key. Still in Free mode.");
      return false;
    } catch (e) {
      setProUI(false);
      addMsg("Simo", `Pro verify failed (${e?.name === "AbortError" ? "timeout" : "network"}). Still in Free mode.`);
      return false;
    } finally {
      clearTimeout(t);
    }
  }

  function wireProToggle() {
    const toggle = $id("proToggle") || qs('input[type="checkbox"]') || null;

    const saved = localStorage.getItem("simo_pro_key") || "";
    if (saved) verifyProKey(saved);
    else setProUI(false);

    if (!toggle) return;

    toggle.addEventListener("change", async () => {
      if (toggle.checked) {
        const key = prompt("Enter Pro key:");
        if (!key) { toggle.checked = false; return; }
        const ok = await verifyProKey(String(key).trim());
        if (!ok) toggle.checked = false;
      } else {
        state.proKey = "";
        localStorage.removeItem("simo_pro_key");
        setProUI(false);
        addMsg("Simo", "Pro turned off.");
      }
    });
  }

  // ---------- Chat send ----------
  async function sendMessage() {
    const ta = $id("chatInput") || qs("textarea");
    if (!ta) return;

    const input = String(ta.value || "").trim();
    if (!input) return;

    ta.value = "";
    addMsg("You", input);

    const history = state.conversation.slice(-12);
    setStatus("Thinking…", true);

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 25000);

    try {
      const r = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          history,
          pro: !!state.pro
        }),
        signal: ctrl.signal
      });

      const data = await r.json().catch(() => null);

      if (!r.ok || !data || !data.ok) {
        addMsg("Simo", `Backend error (${r.status || "?"})`);
        setStatus("Error", false);
        return;
      }

      const text = String(data.text || "").trim() || "Done.";
      const html = String(data.html || "").trim();

      state.conversation.push({ role: "user", content: input });
      state.conversation.push({ role: "assistant", content: text });

      addMsg("Simo", text);

      if (isProbablyHTML(html)) setPreviewHTML(html);

      setStatus("Ready", true);
    } catch (e) {
      addMsg("Simo", `Backend error (${e?.name === "AbortError" ? "timeout" : "network"}).`);
      setStatus("Error", false);
    } finally {
      clearTimeout(timeout);
    }
  }

  function wireSendReset() {
    // IMPORTANT: your real button id is sendBtn (your screenshot)
    const sendBtn = $id("sendBtn") || $id("btnSend") || findButtonByText("Send");
    const resetBtn = $id("resetBtn") || $id("btnReset") || findButtonByText("Reset");
    const ta = $id("chatInput") || qs("textarea");

    if (sendBtn) sendBtn.onclick = sendMessage;

    if (ta) {
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
    }

    if (resetBtn) {
      resetBtn.onclick = () => {
        const chat = getChatBody();
        if (chat) chat.innerHTML = "";
        state.conversation = [];
        setPreviewHTML("");
        addMsg("Simo", "Reset. I’m here.");
        setStatus(state.pro ? "Pro" : "Free", !!state.pro);
      };
    }
  }

  function wireStorageButtons() {
    const saveBtn = $id("saveBtn") || $id("btnSave") || findButtonByText("Save");
    const dlBtn   = $id("downloadBtn") || $id("btnDownload") || findButtonByText("Download");
    const libBtn  = $id("libraryBtn") || $id("btnLibrary") || findButtonByText("Library");
    const list    = $id("libList") || qs(".libList");

    if (saveBtn) {
      saveBtn.onclick = () => {
        if (!state.pro) { addMsg("Simo", "Save is Pro."); return; }
        if (!state.lastHTML) { addMsg("Simo", "Nothing to save yet. Build something first."); return; }

        const items = getLibrary();
        const title = titleFromHTML(state.lastHTML);
        items.unshift({ id: crypto.randomUUID(), title, ts: Date.now(), html: state.lastHTML });
        setLibrary(items.slice(0, 30));
        renderLibrary();
        addMsg("Simo", `Saved: ${title}`);
      };
    }

    if (dlBtn) {
      dlBtn.onclick = () => {
        if (!state.pro) { addMsg("Simo", "Download is Pro."); return; }
        if (!state.lastHTML) { addMsg("Simo", "Nothing to download yet. Build something first."); return; }

        const blob = new Blob([state.lastHTML], { type: "text/html;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = (titleFromHTML(state.lastHTML).replace(/[^\w\-]+/g, "_") || "simo_build") + ".html";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      };
    }

    if (libBtn && list) {
      libBtn.onclick = () => {
        if (!state.pro) { addMsg("Simo", "Library is Pro."); return; }
        list.classList.toggle("show");
        renderLibrary();
      };
    }
  }

  function init() {
    // marker so you can verify in console
    window.__SIMO_UI_OK__ = true;

    // default preview state
    const frame = $id("previewFrame") || qs("iframe");
    const empty = $id("previewEmpty") || qs(".previewEmpty");
    if (frame) frame.style.display = "none";
    if (empty) empty.style.display = "flex";

    // boot message
    addMsg("Simo", "Reset. I’m here.");
    setStatus("Free", false);

    wireProToggle();
    wireSendReset();
    wireStorageButtons();
    renderLibrary();
  }

  window.addEventListener("DOMContentLoaded", init);
})();
