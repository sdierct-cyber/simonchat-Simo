// chat.js — Simo chat controller (clean + safe)

(() => {
  // ---------- DOM ----------
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

  // ---------- STATE ----------
  const state = {
    sessionId: crypto.randomUUID(),
    messages: [],
    builderToken: localStorage.getItem("builder_token") || null,
    lastPreviewHtml: null,
  };

  // ---------- HELPERS ----------
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
    statusEl.textContent = state.builderToken ? "Builder" : "Free";
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
    iframe.setAttribute(
      "sandbox",
      "allow-forms allow-scripts allow-same-origin"
    );
    iframe.srcdoc = html;
    previewBody.appendChild(iframe);
  }

  // ---------- CORE TALK ----------
  async function talk(text, { forceShow = false } = {}) {
    addMsg("user", text);
    state.messages.push({ role: "user", content: text });

    // typing placeholder
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
          builderToken: state.builderToken,
          forceShow,
        }),
      });

      if (!res.ok) throw new Error("Function failed");

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
        state.messages.push({
          role: "assistant",
          content: data.reply,
        });
      }

      if (data.builder?.status === "offered" && !state.builderToken) {
        openBuilderModal();
      }

      if (data.preview?.html) {
        setPreview(data.preview.html, data.preview.title || "Preview");
      }
    } catch (err) {
      typing.remove();
      addMsg(
        "assistant",
        "I couldn’t reach my brain for a second. Try again."
      );
      state.messages.push({
        role: "assistant",
        content: "I couldn’t reach my brain for a second. Try again.",
      });
    }
  }

  // ---------- EVENTS ----------
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

  unlockBtn.addEventListener("click", async () => {
    try {
      const res = await fetch(
        "/.netlify/functions/create-checkout-session",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: state.sessionId }),
        }
      );

      const data = await res.json();
      if (!data.url) throw new Error("No checkout URL");

      window.location.href = data.url;
    } catch {
      closeBuilderModal();
      addMsg(
        "assistant",
        "Something went sideways trying to unlock Builder. Try again in a minute."
      );
      state.messages.push({
        role: "assistant",
        content:
          "Something went sideways trying to unlock Builder. Try again in a minute.",
      });
    }
  });

  // ---------- STRIPE RETURN HANDLER ----------
  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  (async function handleStripeReturn() {
    const checkout = getParam("checkout");
    const sessionId = getParam("session_id");

    if (checkout === "success" && sessionId) {
      try {
        const res = await fetch(
          "/.netlify/functions/verify-checkout-session",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: sessionId }),
          }
        );

        const data = await res.json();

        if (data.ok && data.token) {
          localStorage.setItem("builder_token", data.token);
          state.builderToken = data.token;
          setStatus();

          const url = new URL(window.location.href);
          url.searchParams.delete("checkout");
          url.searchParams.delete("session_id");
          window.history.replaceState({}, "", url.toString());

          addMsg(
            "assistant",
            "Alright. Builder’s unlocked. Tell me what you want me to build first."
          );
          state.messages.push({
            role: "assistant",
            content:
              "Alright. Builder’s unlocked. Tell me what you want me to build first.",
          });
        }
      } catch {
        addMsg(
          "assistant",
          "I didn’t get a clean unlock from Stripe. If you were charged, tell me and we’ll fix it."
        );
      }
    }

    if (checkout === "cancel") {
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      window.history.replaceState({}, "", url.toString());

      addMsg(
        "assistant",
        "No worries. If you want me to actually build something later, just tell me."
      );
    }
  })();

  // ---------- BOOT ----------
  setStatus();
  addMsg("assistant", "Hey — I’m Simo. What’s going on?");
})();
