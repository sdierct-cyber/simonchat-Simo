// simonchat/chat.js — frontend chat controller

(() => {
  const msgsEl = document.getElementById("msgs");
  const input = document.getElementById("in");
  const sendBtn = document.getElementById("send");
  const showBtn = document.getElementById("showBtn");
  const statusEl = document.getElementById("status");

  const previewBody = document.getElementById("previewBody");
  const pTitle = document.getElementById("pTitle");
  const pHint = document.getElementById("pHint");

  const modalBack = document.getElementById("modalBack");
  const cancelBtn = document.getElementById("cancel");
  const unlockBtn = document.getElementById("unlock");

  const state = {
    sessionId: crypto.randomUUID(),
    messages: [],
    builderEnabled: false,      // MVP: no Stripe yet
    lastPreviewHtml: null
  };

  function scrollDown() {
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function addMsg(role, text) {
    const wrap = document.createElement("div");
    wrap.className = `m ${role === "user" ? "you" : "simo"}`;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = role === "user" ? "you" : "Simo";

    const body = document.createElement("div");
    body.textContent = text;

    wrap.appendChild(meta);
    wrap.appendChild(body);
    msgsEl.appendChild(wrap);
    scrollDown();
  }

  function setStatus() {
    statusEl.textContent = state.builderEnabled ? "Builder" : "Free";
  }

  function openBuilderModal() {
    modalBack.style.display = "flex";
  }

  function closeBuilderModal() {
    modalBack.style.display = "none";
  }

  function setPreview(html, title = "Preview") {
    if (!html) return;

    state.lastPreviewHtml = html;

    pTitle.textContent = title;
    pHint.textContent = "React to it — we’ll shape it together.";

    previewBody.innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-forms allow-scripts allow-same-origin");
    iframe.srcdoc = html;
    previewBody.appendChild(iframe);
  }

  async function talk(text, { forceShow = false } = {}) {
    addMsg("user", text);
    state.messages.push({ role: "user", content: text });

    const typing = document.createElement("div");
    typing.className = "m simo";
    typing.innerHTML = `<div class="meta">Simo</div><div>…</div>`;
    msgsEl.appendChild(typing);
    scrollDown();

    try {
      const res = await fetch("/.netlify/functions/simo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: state.sessionId,
          messages: state.messages,
          builderEnabled: state.builderEnabled,
          forceShow
        })
      });

      if (!res.ok) throw new Error("Function error");

      let data;
      try {
        const txt = await res.text();
        data = JSON.parse(txt);
      } catch {
        throw new Error("Bad JSON from function");
      }

      typing.remove();

      if (data.reply) {
        addMsg("assistant", data.reply);
        state.messages.push({ role: "assistant", content: data.reply });
      }

      if (data.builder?.status === "offered" && !state.builderEnabled) {
        openBuilderModal();
      }

      if (data.preview?.html) {
        setPreview(data.preview.html, data.preview.title || "Preview");
      }

    } catch (e) {
      typing.remove();
      addMsg("assistant", "I couldn’t reach my brain for a second. Try again.");
      state.messages.push({ role: "assistant", content: "I couldn’t reach my brain for a second. Try again." });
    }
  }

  sendBtn.addEventListener("click", () => {
    const t = input.value.trim();
    if (!t) return;
    input.value = "";
    talk(t);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });

  showBtn.addEventListener("click", () => {
    if (state.lastPreviewHtml) {
      setPreview(state.lastPreviewHtml, "Preview");
      return;
    }
    talk("Show me what you’ve got so far.", { forceShow: true });
  });

  cancelBtn.addEventListener("click", closeBuilderModal);

  // MVP “unlock” (no Stripe yet): just flips the flag so you can test previews
  unlockBtn.addEventListener("click", () => {
    state.builderEnabled = true;
    setStatus();
    closeBuilderModal();
    addMsg("assistant", "Alright. I’m in builder mode — tell me what you want me to build first.");
    state.messages.push({ role: "assistant", content: "Alright. I’m in builder mode — tell me what you want me to build first." });
  });

  // Boot
  setStatus();
  addMsg("assistant", "Hey — I’m Simo. What’s going on?");
})();
