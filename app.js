/* app.js — Simo UI controller (V1.1 hotfix)
   Fixes:
   - NO white preview panel when empty (iframe hidden until HTML exists)
   - Preview renders only when HTML exists
   - Extracts HTML if present
   - Auto-retry ONCE if assistant claims preview updated but we got no HTML
*/

(() => {
  const $ = (id) => document.getElementById(id);

  const chatEl = $("chat");
  const inputEl = $("input");
  const sendBtn = $("sendBtn");
  const resetBtn = $("resetBtn");
  const previewBtn = $("previewBtn");
  const downloadBtn = $("downloadBtn");
  const saveBtn = $("saveBtn");
  const libraryBtn = $("libraryBtn");

  const chatStatus = $("chatStatus");
  const topicTag = $("topicTag");
  const draftTag = $("draftTag");

  const previewFrame = $("previewFrame");
  const previewStatus = $("previewStatus");
  const previewPlaceholder = $("previewPlaceholder");

  const proPill = $("proPill");
  const proText = $("proText");
  const unlockProBtn = $("unlockProBtn");

  const state = {
    mode: "building",
    topic: "—",
    pro: false,
    lastHTML: "",
    lastTitle: "simo-build",
    apiUrl: "/.netlify/functions/simon",
    proUrl: "/.netlify/functions/pro",
  };

  function setBusy(isBusy) {
    chatStatus.textContent = isBusy ? "Thinking…" : "Ready";
    sendBtn.disabled = isBusy;
    previewBtn.disabled = isBusy;
    downloadBtn.disabled = isBusy;
    resetBtn.disabled = isBusy;
  }

  function addMsg(who, text) {
    const row = document.createElement("div");
    row.className = `msg ${who === "me" ? "me" : "ai"}`;

    const av = document.createElement("div");
    av.className = "avatar";
    av.textContent = who === "me" ? "You" : "S";

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;

    row.appendChild(av);
    row.appendChild(bubble);
    chatEl.appendChild(row);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function autoGrowTextarea() {
    inputEl.style.height = "auto";
    const h = Math.min(inputEl.scrollHeight, 160);
    inputEl.style.height = Math.max(h, 56) + "px";
  }

  function setTopic(topic) {
    state.topic = topic || "—";
    topicTag.textContent = `topic: ${state.topic}`;
  }

  function setDraftLabel(label) {
    draftTag.textContent = `draft: ${label || "none"}`;
  }

  function setPro(on) {
    state.pro = !!on;
    proText.textContent = `Pro: ${state.pro ? "ON" : "OFF"}`;
    proPill.classList.toggle("on", state.pro);
    saveBtn.disabled = !state.pro;
    libraryBtn.disabled = !state.pro;
  }

  function escapeFilename(s) {
    return (s || "simo-build")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  function wrapHtmlDoc(fragment) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Simo Preview</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;margin:0;padding:24px;background:#0b1020;color:#eaf0ff}</style>
</head>
<body>
${fragment}
</body>
</html>`;
  }

  function extractHTML(anyText) {
    const t = (anyText || "").trim();
    if (!t) return "";

    const fenced = t.match(/```html\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) return fenced[1].trim();

    const rawDoc = t.match(/<html[\s\S]*<\/html>/i);
    if (rawDoc && rawDoc[0]) return rawDoc[0].trim();

    // fragment fallback
    const looksLikeFragment =
      /<(section|div|main|header|footer|nav|article)\b/i.test(t) &&
      /<\/(section|div|main|header|footer|nav|article)>/i.test(t);

    if (looksLikeFragment) return wrapHtmlDoc(t);

    return "";
  }

  // IMPORTANT: hide iframe when no html so no white panel
  function renderPreview(html) {
    const clean = (html || "").trim();
    if (!clean) {
      previewStatus.textContent = "No preview yet";
      previewPlaceholder.style.display = "flex";
      previewFrame.style.display = "none";
      previewFrame.removeAttribute("srcdoc");
      return;
    }
    state.lastHTML = clean;
    previewStatus.textContent = "Updated";
    previewPlaceholder.style.display = "none";
    previewFrame.style.display = "block";
    previewFrame.srcdoc = clean;
  }

  function downloadHTML() {
    if (!state.lastHTML) {
      addMsg("ai", "No HTML to download yet. Ask for a build or say: “show me a preview”.");
      return;
    }
    const blob = new Blob([state.lastHTML], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${escapeFilename(state.lastTitle || "simo-build")}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 500);
  }

  function resetAll() {
    chatEl.innerHTML = "";
    setTopic("—");
    setDraftLabel("none");
    renderPreview("");
    state.lastTitle = "simo-build";
    state.lastHTML = "";
    addMsg("ai", "Tell me what you want right now — venting, solving, or building.");
  }

  async function callSimo(userText) {
    const payload = {
      mode: state.mode,
      text: userText,
      topic: state.topic,
      want_html: true, // harmless if backend ignores; helpful if it supports it
    };

    const res = await fetch(state.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let data;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) data = await res.json();
    else data = { ok: res.ok, output_text: await res.text() };

    if (!res.ok) {
      const msg = data?.error || data?.message || "Request failed.";
      throw new Error(msg);
    }
    return data;
  }

  function inferTopicFromUser(text) {
    const t = (text || "").toLowerCase();
    if (t.includes("landing page")) return "landing page";
    if (t.includes("website")) return "website";
    if (t.includes("app")) return "app";
    if (t.includes("resume")) return "resume";
    return state.topic === "—" ? "general" : state.topic;
  }

  // If the assistant claims preview updated but we got no HTML, retry ONCE.
  async function maybeRetryForHTML(assistantText) {
    const claimUpdated =
      /updated the preview|preview on the right|render/i.test((assistantText || "").toLowerCase());

    if (!claimUpdated) return "";

    // ONE retry: force html-only
    const retry = await callSimo("Return ONLY the complete HTML for the current draft. No commentary. No markdown.");
    const retryText =
      retry.output_text || retry.text || retry.message || (retry.response && (retry.response.output_text || retry.response.text)) || "";

    const directHtml = retry.html || retry.preview_html || (retry.response && (retry.response.html || retry.response.preview_html)) || "";
    return (directHtml || "").trim() || extractHTML(retryText);
  }

  function wireEvents() {
    inputEl.addEventListener("input", autoGrowTextarea);

    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
      }
    });

    sendBtn.addEventListener("click", async () => {
      const text = (inputEl.value || "").trim();
      if (!text) return;

      addMsg("me", text);
      inputEl.value = "";
      autoGrowTextarea();
      setTopic(inferTopicFromUser(text));

      setBusy(true);
      try {
        const data = await callSimo(text);

        const assistantText =
          data.output_text ||
          data.text ||
          data.message ||
          (data.response && (data.response.output_text || data.response.text)) ||
          "";

        addMsg("ai", assistantText || "Got it.");

        const directHtml =
          data.html ||
          data.preview_html ||
          (data.response && (data.response.html || data.response.preview_html)) ||
          "";

        let html = (directHtml || "").trim() || extractHTML(assistantText);

        if (!html) {
          // Auto-retry ONLY if it *claimed* it updated preview
          html = await maybeRetryForHTML(assistantText);
        }

        const wantsPreview = /show me a preview|preview/i.test(text);

        if (html) {
          state.lastTitle = state.topic || "simo-build";
          setDraftLabel("ready");
          renderPreview(html);
        } else if (wantsPreview) {
          renderPreview("");
          addMsg("ai", "I still didn’t receive HTML to render. That means the backend isn’t sending HTML back yet.");
        }
      } catch (err) {
        addMsg("ai", `Error: ${err.message || err}`);
      } finally {
        setBusy(false);
      }
    });

    resetBtn.addEventListener("click", resetAll);

    previewBtn.addEventListener("click", () => {
      if (state.lastHTML) return renderPreview(state.lastHTML);
      addMsg("ai", "No HTML cached yet. Ask for a build, or say: “show me a preview”.");
    });

    downloadBtn.addEventListener("click", downloadHTML);

    unlockProBtn.addEventListener("click", async () => {
      const key = prompt("Enter your Pro key:");
      if (!key) return;

      try {
        setBusy(true);
        const res = await fetch(state.proUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data && data.ok && data.pro) {
          setPro(true);
          addMsg("ai", "Pro unlocked ✅");
        } else {
          setPro(false);
          addMsg("ai", "Invalid key.");
        }
      } catch {
        addMsg("ai", "Could not verify Pro right now.");
      } finally {
        setBusy(false);
      }
    });

    // Safe placeholders
    saveBtn.addEventListener("click", () => {
      if (!state.pro) return;
      if (!state.lastHTML) return addMsg("ai", "Nothing to save yet.");
      const item = { id: String(Date.now()), title: state.lastTitle, html: state.lastHTML, topic: state.topic, ts: new Date().toISOString() };
      const key = "simo_library_v1";
      const list = JSON.parse(localStorage.getItem(key) || "[]");
      list.unshift(item);
      localStorage.setItem(key, JSON.stringify(list));
      addMsg("ai", "Saved to Library ✅");
    });

    libraryBtn.addEventListener("click", () => {
      if (!state.pro) return;
      const key = "simo_library_v1";
      const list = JSON.parse(localStorage.getItem(key) || "[]");
      if (!list.length) return addMsg("ai", "Library is empty.");
      const first = list[0];
      state.lastTitle = first.title || "simo-build";
      state.lastHTML = first.html || "";
      setTopic(first.topic || "—");
      setDraftLabel("loaded");
      renderPreview(state.lastHTML);
      addMsg("ai", `Loaded: ${first.title}`);
    });
  }

  window.addEventListener("DOMContentLoaded", () => {
    setPro(false);
    resetAll();
    wireEvents();
    autoGrowTextarea();
    renderPreview(""); // ensure iframe hidden on load
  });
})();
