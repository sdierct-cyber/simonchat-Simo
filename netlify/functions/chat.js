(() => {
  console.log("✅ chat.js loaded");

  const ids = [
    "msgs","in","send","showBtn","status",
    "previewBody","pTitle","pHint",
    "modalBack","cancel","unlock"
  ];

  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) {
      console.error("❌ Missing element id:", id);
      alert("Missing element id: " + id + " (check index.html IDs match chat.js)");
      return;
    }
  }

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
    builderEnabled: false,
    lastPreviewHtml: null
  };

  function scrollDown(){ msgsEl.scrollTop = msgsEl.scrollHeight; }

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

  function openBuilderModal(){ modalBack.style.display = "flex"; }
  function closeBuilderModal(){ modalBack.style.display = "none"; }

  function setPreview(html, title="Preview") {
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

  async function talk(text, {forceShow=false} = {}) {
    addMsg("user", text);
    state.messages.push({ role:"user", content:text });

    const typing = document.createElement("div");
    typing.className = "m simo";
    typing.innerHTML = `<div class="meta">Simo</div><div>…</div>`;
    msgsEl.appendChild(typing);
    scrollDown();

    try {
      console.log("➡️ sending to function:", text);
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

      const txt = await res.text();
      console.log("⬅️ function response status:", res.status, txt.slice(0, 200));

      if (!res.ok) throw new Error("Function error: " + res.status);

      let data;
      try { data = JSON.parse(txt); }
      catch { throw new Error("Bad JSON from function"); }

      typing.remove();

      if (data.reply) {
        addMsg("assistant", data.reply);
        state.messages.push({ role:"assistant", content:data.reply });
      }

      if (data.builder?.status === "offered" && !state.builderEnabled) {
        openBuilderModal();
      }

      if (data.preview?.html) {
        setPreview(data.preview.html, data.preview.title || "Preview");
      }

    } catch (e) {
      typing.remove();
      console.error("❌ talk error:", e);
      addMsg("assistant", "I couldn’t reach my brain for a second. Try again.");
    }
  }

  sendBtn.addEventListener("click", () => {
    console.log("✅ send clicked");
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
    console.log("✅ show clicked");
    if (state.lastPreviewHtml) {
      setPreview(state.lastPreviewHtml, "Preview");
      return;
    }
    talk("Show me what you’ve got so far.", { forceShow:true });
  });

  cancelBtn.addEventListener("click", closeBuilderModal);

  unlockBtn.addEventListener("click", () => {
    state.builderEnabled = true;
    setStatus();
    closeBuilderModal();
    addMsg("assistant", "Alright. I’m in builder mode — tell me what you want me to build first.");
  });

  setStatus();
  addMsg("assistant", "Hey — I’m Simo. What’s going on?");
})();
