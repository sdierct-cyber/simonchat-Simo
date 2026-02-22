/* app.js — Simo UI controller (stable)
   - Sends chat to /.netlify/functions/simon
   - Shows assistant text in chat
   - Renders returned HTML into iframe via srcdoc
   - Pro verify via /.netlify/functions/pro
   - Save/Download/Library gated behind Pro (but won’t break free mode)
*/

(() => {
  const BACKEND_URL = "/.netlify/functions/simon";
  const PRO_URL = "/.netlify/functions/pro";

  const state = {
    pro: false,
    proKey: "",
    lastHTML: "",
    conversation: [] // [{role:"user"|"assistant", content:"..."}]
  };

  // ---------- Helpers ----------
  const $id = (id) => document.getElementById(id);
  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  function esc(s){
    return String(s).replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }

  function findButtonByText(txt) {
    const t = txt.toLowerCase();
    return qsa("button").find(b => (b.textContent || "").trim().toLowerCase() === t) || null;
  }

  function getTextarea() {
    return qs("textarea") || $id("input") || $id("prompt") || $id("chatInput") || null;
  }

  function getChatBody() {
    return $id("chatBody") || qs(".chatBody") || $id("messages") || qs(".messages") || null;
  }

  function getPreviewFrame() {
    return $id("previewFrame") || qs("iframe#preview") || qs("iframe") || null;
  }

  function getPreviewEmpty() {
    return $id("previewEmpty") || qs(".previewEmpty") || null;
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

  function setPreviewHTML(html) {
    const frame = getPreviewFrame();
    const empty = getPreviewEmpty();
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

  function looksLikeJsonString(s) {
    const t = String(s || "").trim();
    return (t.startsWith("{") && t.endsWith("}")) || (t.includes('"reply"') && t.includes('"html"'));
  }

  function extractReplyHtmlFromText(text) {
    // Handles the edge case where backend returns JSON blob inside text.
    try {
      const t = String(text || "").trim();
      const first = t.indexOf("{");
      const last = t.lastIndexOf("}");
      if (first !== -1 && last !== -1 && last > first) {
        const obj = JSON.parse(t.slice(first, last + 1));
        if (obj && typeof obj === "object") {
          return {
            reply: typeof obj.reply === "string" ? obj.reply : "",
            html: typeof obj.html === "string" ? obj.html : ""
          };
        }
      }
    } catch {}
    return { reply: "", html: "" };
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

  function titleFromHTML(html) {
    try {
      const m = html.match(/<title>([\s\S]*?)<\/title>/i);
      if (m && m[1]) return m[1].trim().slice(0, 60);
    } catch {}
    return "Untitled build";
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

    // Toggle pill/status if present
    const statusPill = $id("statusPill") || qs(".statusPill");
    if (statusPill) statusPill.textContent = on ? "Pro" : "Free";

    setStatus(on ? "Pro" : "Ready", on);

    // Gate buttons
    const saveBtn = $id("btnSave") || findButtonByText("Save");
    const dlBtn = $id("btnDownload") || findButtonByText("Download");
    const libBtn = $id("btnLibrary") || findButtonByText("Library");

    if (saveBtn) saveBtn.disabled = !on;
    if (dlBtn) dlBtn.disabled = !on;
    if (libBtn) libBtn.disabled = !on;

    // Show/hide library list
    const list = $id("libList") || qs(".libList");
    if (list) list.classList.toggle("show", false);
  }

  // ---------- Pro verification ----------
  async function verifyProKey(key) {
    setStatus("Verifying…", true);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);

    try {
      const r = await fetch(PRO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
        signal: ctrl.signal
      });

      const data = await r.json().catch(() => ({ ok: false, pro: false }));
      if (r.ok && data.ok && data.pro) {
        state.proKey = key;
        localStorage.setItem("simo_pro_key", key);
        setProUI(true);
        addMsg("Simo", "Pro verified. Save/Download/Library unlocked.");
        renderLibrary();
        return true;
      } else {
        setProUI(false);
        addMsg("Simo", "Invalid key. Still in Free mode.");
        setStatus("Free", false);
        return false;
      }
    } catch (e) {
      setProUI(false);
      addMsg("Simo", "Pro verify failed (network). Still in Free mode.");
      setStatus("Free", false);
      return false;
    } finally {
      clearTimeout(t);
    }
  }

  function wireProToggle() {
    const toggle =
      $id("proToggle") ||
      qs('input[type="checkbox"][data-pro]') ||
      qs('input[type="checkbox"]#pro') ||
      null;

    // If no toggle element, we still restore key if present.
    const saved = localStorage.getItem("simo_pro_key") || "";
    if (saved) {
      // verify silently once
      verifyProKey(saved);
    } else {
      setProUI(false);
    }

    if (!toggle) return;

    toggle.checked = !!state.pro;

    toggle.addEventListener("change", async () => {
      if (toggle.checked) {
        // ask for key
        const modal = $id("proModal");
        const input = $id("proKeyInput");
        const verifyBtn = $id("proVerifyBtn");
        const cancelBtn = $id("proCancelBtn");

        if (modal && input && verifyBtn) {
          modal.style.display = "block";
          input.value = state.proKey || "";
          input.focus();

          const close = () => (modal.style.display = "none");

          cancelBtn && (cancelBtn.onclick = () => { toggle.checked = false; close(); });

          verifyBtn.onclick = async () => {
            const key = String(input.value || "").trim();
            if (!key) return;
            const ok = await verifyProKey(key);
            if (!ok) toggle.checked = false;
            close();
          };
        } else {
          // fallback prompt
          const key = prompt("Enter Pro key:");
          if (!key) { toggle.checked = false; return; }
          const ok = await verifyProKey(String(key).trim());
          if (!ok) toggle.checked = false;
        }
      } else {
        // turn off pro locally
        state.proKey = "";
        localStorage.removeItem("simo_pro_key");
        setProUI(false);
        addMsg("Simo", "Pro turned off.");
      }
    });
  }

  // ---------- Chat send ----------
  async function sendMessage() {
    const ta = getTextarea();
    if (!ta) return;

    const input = String(ta.value || "").trim();
    if (!input) return;

    ta.value = "";
    addMsg("You", input);

    // Send previous conversation as history (exclude current input)
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

      // IMPORTANT: read JSON (not text)
      const data = await r.json().catch(() => null);

      if (!r.ok || !data || !data.ok) {
        addMsg("Simo", `Backend error (${r.status || "?"})`);
        setStatus("Error", false);
        return;
      }

      let text = String(data.text || "").trim();
      let html = String(data.html || "").trim();

      // If backend ever stuffs reply/html JSON into text, extract it
      if (!html && looksLikeJsonString(text)) {
        const ex = extractReplyHtmlFromText(text);
        if (ex.reply) text = ex.reply;
        if (ex.html) html = ex.html;
      }

      // Update memory
      state.conversation.push({ role: "user", content: input });
      state.conversation.push({ role: "assistant", content: text });

      addMsg("Simo", text || "Done.");

      if (html) {
        setPreviewHTML(html);
        setStatus("Ready", true);
      } else {
        setStatus("Ready", true);
      }
    } catch (e) {
      addMsg("Simo", "Backend error (network/timeout).");
      setStatus("Error", false);
    } finally {
      clearTimeout(timeout);
    }
  }

  function wireSendReset() {
    const sendBtn = $id("btnSend") || findButtonByText("Send");
    const resetBtn = $id("btnReset") || findButtonByText("Reset");
    const ta = getTextarea();

    sendBtn && (sendBtn.onclick = sendMessage);

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
      };
    }
  }

  // ---------- Save / Download / Library ----------
  function wireStorageButtons() {
    const saveBtn = $id("btnSave") || findButtonByText("Save");
    const dlBtn = $id("btnDownload") || findButtonByText("Download");
    const libBtn = $id("btnLibrary") || findButtonByText("Library");
    const list = $id("libList") || qs(".libList");

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

  // ---------- Init ----------
  function init() {
    // default preview state
    const frame = getPreviewFrame();
    const empty = getPreviewEmpty();
    if (frame) frame.style.display = "none";
    if (empty) empty.style.display = "flex";

    addMsg("Simo", "Reset. I’m here.");

    wireProToggle();
    wireSendReset();
    wireStorageButtons();

    // Ensure UI gates correctly on boot
    setProUI(!!state.pro);
    renderLibrary();
  }

  window.addEventListener("DOMContentLoaded", init);
})();
