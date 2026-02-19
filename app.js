/* app.js — Simo UI controller (stable)
   Fixes:
   - Buttons + Enter key always work
   - Input box not crunched (CSS + auto-grow)
   - Preview renders even if backend doesn't return data.html
   - Extracts HTML from:
       data.html | data.preview_html | data.output_text with ```html``` | raw <html>...
   - Stores lastHTML for Preview/Download
*/

(() => {
  const $ = (id) => document.getElementById(id);

  // ---- Elements
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

  // ---- State
  const state = {
    mode: "building",
    topic: "—",
    pro: false,
    lastHTML: "",
    lastTitle: "simo-build",
    apiUrl: "/.netlify/functions/simon",
    proUrl: "/.netlify/functions/pro",
  };

  // ---- Helpers
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
    // keeps it comfy without breaking layout
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

  function escapeHtmlFilename(s) {
    return (s || "simo-build")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  // --- HTML extraction (THIS is what fixes your screenshot problem)
  function extractHTML(anyText) {
    const t = (anyText || "").trim();
    if (!t) return "";

    // 1) fenced ```html ... ```
    const fenced = t.match(/```html\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) return fenced[1].trim();

    // 2) any fenced block ``` ... ``` (sometimes model uses no language tag)
    const anyFence = t.match(/```\s*([\s\S]*?)```/);
    if (anyFence && anyFence[1] && /<\/(html|body)>/i.test(anyFence[1])) {
      return anyFence[1].trim();
    }

    // 3) raw html document
    if (/<html[\s\S]*<\/html>/i.test(t)) {
      const raw = t.match(/<html[\s\S]*<\/html>/i);
      return raw ? raw[0].trim() : "";
    }

    // 4) fallback: if it looks like HTML fragment
    if (/<(section|div|main|header|footer)[\s>]/i.test(t) && /<\/(section|div|main|header|footer)>/i.test(t)) {
      // wrap it
      return wrapHtmlDoc(t);
    }

    return "";
  }

  function wrapHtmlDoc(fragment) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Simo Preview</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;margin:0;padding:24px}</style>
</head>
<body>
${fragment}
</body>
</html>`;
  }

  function renderPreview(html) {
    const clean = (html || "").trim();
    if (!clean) {
      previewStatus.textContent = "No preview yet";
      previewPlaceholder.style.display = "flex";
      previewFrame.removeAttribute("srcdoc");
      return;
    }
    state.lastHTML = clean;
    previewStatus.textContent = "Updated";
    previewPlaceholder.style.display = "none";
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
    a.download = `${escapeHtmlFilename(state.lastTitle || "simo-build")}.html`;
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

  // ---- Backend call
  async function callSimo(userText) {
    const payload = {
      mode: state.mode,
      text: userText,
      topic: state.topic,
      // you can pass more fields if your backend uses them
    };

    const res = await fetch(state.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let data;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      data = await res.json();
    } else {
      // sometimes functions return text on errors
      const raw = await res.text();
      data = { ok: res.ok, output_text: raw };
    }

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
    if (t.includes("stressed") || t.includes("argument") || t.includes("wife") || t.includes("vent")) return "venting";
    return state.topic === "—" ? "general" : state.topic;
  }

  // ---- Events
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

      // update topic tag fast for UX
      setTopic(inferTopicFromUser(text));

      setBusy(true);
      try {
        const data = await callSimo(text);

        // Most backends return text in one of these:
        const assistantText =
          data.output_text ||
          data.text ||
          data.message ||
          (data.response && (data.response.output_text || data.response.text)) ||
          "";

        if (assistantText) addMsg("ai", assistantText);
        else addMsg("ai", "Got it.");

        // Pull HTML from multiple possible locations
        const directHtml =
          data.html ||
          data.preview_html ||
          (data.response && (data.response.html || data.response.preview_html)) ||
          "";

        let html = (directHtml || "").trim();
        if (!html) {
          // extract from assistant text
          html = extractHTML(assistantText);
        }

        // If user asked for preview, force render whatever we have
        const wantsPreview = /show me a preview|preview/i.test(text);

        if (html) {
          state.lastTitle = state.topic || "simo-build";
          setDraftLabel("ready");
          renderPreview(html);
        } else if (wantsPreview) {
          // If they asked for preview but we still have no HTML, show a helpful message
          renderPreview("");
          addMsg("ai", "I didn’t receive HTML to render. I can regenerate it — say: “regenerate the HTML”.");
        }
      } catch (err) {
        addMsg("ai", `Error: ${err.message || err}`);
      } finally {
        setBusy(false);
      }
    });

    resetBtn.addEventListener("click", resetAll);

    previewBtn.addEventListener("click", () => {
      if (state.lastHTML) {
        renderPreview(state.lastHTML);
        return;
      }
      addMsg("ai", "No HTML cached yet. Ask for a build, or say: “show me a preview”.");
    });

    downloadBtn.addEventListener("click", downloadHTML);

    unlockProBtn.addEventListener("click", async () => {
      // Minimal “unlock” flow: ask for key via prompt (keeps it simple + stable)
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
      } catch (e) {
        addMsg("ai", "Could not verify Pro right now.");
      } finally {
        setBusy(false);
      }
    });

    // Save/Library placeholders (Pro gated) — won’t break UI
    saveBtn.addEventListener("click", () => {
      if (!state.pro) return;
      if (!state.lastHTML) { addMsg("ai", "Nothing to save yet."); return; }
      const item = {
        id: String(Date.now()),
        title: state.lastTitle || "simo-build",
        html: state.lastHTML,
        topic: state.topic,
        ts: new Date().toISOString(),
      };
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
      if (!list.length) { addMsg("ai", "Library is empty."); return; }

      const first = list[0];
      state.lastTitle = first.title || "simo-build";
      state.lastHTML = first.html || "";
      setTopic(first.topic || "—");
      setDraftLabel("loaded");
      renderPreview(state.lastHTML);
      addMsg("ai", `Loaded: ${first.title}`);
    });
  }

  // ---- Boot
  window.addEventListener("DOMContentLoaded", () => {
    // default pro off until unlocked
    setPro(false);

    // stable seed message
    resetAll();

    // Wire events last (prevents null + “buttons don’t work”)
    wireEvents();

    // initialize textarea height
    autoGrowTextarea();
  });
})();
