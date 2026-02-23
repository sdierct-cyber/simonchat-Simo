(() => {
  const $ = (id) => document.getElementById(id);

  const chatLog = $("chatLog");
  const input = $("userInput");
  const sendBtn = $("sendBtn");
  const resetBtn = $("resetBtn");
  const statusEl = $("status");
  const previewEmpty = $("previewEmpty");
  const previewFrame = $("previewFrame");

  const state = { lastHTML: "" };

  function setStatus(t) { statusEl.textContent = t; }

  function addMsg(who, text) {
    const wrap = document.createElement("div");
    wrap.className = who === "You" ? "you" : "simo";
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
  }

  function setPreview(html) {
    state.lastHTML = String(html || "");
    if (!state.lastHTML.trim()) {
      previewFrame.style.display = "none";
      previewEmpty.style.display = "flex";
      previewFrame.srcdoc = "";
      return;
    }
    previewEmpty.style.display = "none";
    previewFrame.style.display = "block";
    previewFrame.srcdoc = state.lastHTML;
  }

  async function callBackend(text) {
    const r = await fetch("/.netlify/functions/simon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: text, lastHTML: state.lastHTML })
    });

    const raw = await r.text();
    let data = null;
    try { data = JSON.parse(raw); } catch {}

    if (!data) return { ok:false, reply:"Backend returned non-JSON.", html:"", error: raw.slice(0,200) };
    return data;
  }

  async function onSend() {
    const text = (input.value || "").trim();
    if (!text) return;

    addMsg("You", text);
    input.value = "";
    setStatus("Thinking…");

    try {
      const res = await callBackend(text);

      if (!res.ok) {
        addMsg("Simo", res.reply || "Backend error.");
        if (res.error) addMsg("Simo", "Error: " + String(res.error).slice(0, 200));
        setStatus("Error");
        return;
      }

      addMsg("Simo", (res.reply || "Done.").trim());
      if (res.html && String(res.html).trim()) setPreview(res.html);

      setStatus("Ready");
    } catch (e) {
      addMsg("Simo", "Request failed: " + String(e?.message || e));
      setStatus("Error");
    }
  }

  function onReset() {
    chatLog.innerHTML = "";
    setPreview("");
    addMsg("Simo", "Reset. I’m here.");
    setStatus("Ready");
  }

  sendBtn.addEventListener("click", onSend);
  resetBtn.addEventListener("click", onReset);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
  });

  // boot
  addMsg("Simo", "Reset. I’m here.");
  setStatus("Ready");
})();
