(() => {
  // --- Safe DOM getters
  const $ = (id) => document.getElementById(id);

  const chatEl = $("chat");
  const inputEl = $("input");
  const sendBtn = $("sendBtn");
  const debugBtn = $("debugBtn");

  const statusDot = $("statusDot");
  const statusText = $("statusText");

  const kvScript = $("kvScript");
  const kvBind = $("kvBind");

  // --- Render helpers
  function addMsg(role, text) {
    const div = document.createElement("div");
    div.className = `msg ${role === "you" ? "you" : "simo"}`;
    div.textContent = text;
    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function setStatus(ok, text) {
    statusDot.classList.remove("good", "bad");
    statusDot.classList.add(ok ? "good" : "bad");
    statusText.textContent = text;
  }

  function setKV(el, value) {
    if (!el) return;
    el.textContent = value;
  }

  // --- Core API call
  async function callSimo(message) {
    const res = await fetch("/api/simon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });

    // If Netlify function isn't wired, this will show it clearly.
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText}${t ? ` — ${t.slice(0, 180)}` : ""}`);
    }

    const data = await res.json().catch(() => ({}));
    // Expect { reply: "..." } or { text: "..." }
    return data.reply || data.text || "I’m here. What’s going on?";
  }

  // --- Send logic (button + Enter)
  async function handleSend() {
    const raw = inputEl.value || "";
    const msg = raw.trim();
    if (!msg) return;

    addMsg("you", msg);
    inputEl.value = "";
    inputEl.style.height = ""; // reset auto-grow
    sendBtn.disabled = true;

    try {
      const reply = await callSimo(msg);
      addMsg("simo", reply);
    } catch (err) {
      addMsg("simo", `I hit an error. ${err?.message || err}`);
    } finally {
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  // --- Auto-grow textarea
  function autoGrow() {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + "px";
  }

  // --- Debug runner
  async function runDebug() {
    addMsg("simo", "Debug check: running…");
    try {
      const res = await fetch("/api/simon?ping=1", { method: "GET" });
      if (!res.ok) throw new Error(`API not OK (HTTP ${res.status})`);
      const data = await res.json().catch(() => ({}));
      const hasKey = !!data.has_OPENAI_API_KEY || !!data.hasOpenAIKey;
      addMsg("simo", `Debug: API reachable. Key present: ${hasKey ? "YES" : "NO"}.`);
      setStatus(true, `API: OK${hasKey ? "" : " (no key?)"}`);
    } catch (e) {
      addMsg("simo", `Debug: API issue — ${e?.message || e}`);
      setStatus(false, "API: error");
    }
  }

  // --- Bindings (this is where your old versions were breaking)
  function bind() {
    if (!chatEl || !inputEl || !sendBtn || !debugBtn) {
      console.error("Missing required elements:", { chatEl, inputEl, sendBtn, debugBtn });
      alert("Missing required elements. Your HTML IDs do not match simo.js.");
      return false;
    }

    // Button click
    sendBtn.addEventListener("click", handleSend);

    // Enter to send, Shift+Enter = newline
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    // Auto-grow
    inputEl.addEventListener("input", autoGrow);

    // Debug button
    debugBtn.addEventListener("click", runDebug);

    return true;
  }

  // --- Init
  function init() {
    setKV(kvScript, "YES");
    const ok = bind();
    setKV(kvBind, ok ? "OK" : "FAILED");

    addMsg("simo", "Hey — I’m Simo. What’s going on?");
    setStatus(false, "API: not checked");
    inputEl.focus();

    // Light API check (doesn't waste tokens if your function handles ?ping=1)
    // If your backend doesn't support ping, it will just show error (still useful).
    runDebug();
  }

  // Because index.html uses defer, DOM is ready here.
  init();
})();
