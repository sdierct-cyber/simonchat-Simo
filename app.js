(() => {
  const $ = (id) => document.getElementById(id);

  // Views / tabs
  const tabChat = $("tabChat");
  const tabPreview = $("tabPreview");
  const tabBuilder = $("tabBuilder");

  const viewChat = $("viewChat");
  const viewPreview = $("viewPreview");
  const viewBuilder = $("viewBuilder");

  const planPill = $("planPill");
  const statusText = $("statusText");

  // Chat
  const chatEl = $("chat");
  const inputEl = $("input");
  const sendBtn = $("sendBtn");
  const btnReset = $("btnReset");

  // Debug
  const debugDrawer = $("debugDrawer");
  const debugLog = $("debugLog");

  // Preview UI
  const listingList = $("listingList");
  const selectedListing = $("selectedListing");
  const spaceQuery = $("spaceQuery");
  const chips = $("chips");
  const btnBook = $("btnBook");
  const bookMsg = $("bookMsg");

  // Unlock modal
  const overlay = $("overlay");
  const btnUnlock = $("btnUnlock");
  const btnShowUnlock = $("btnShowUnlock");
  const btnClose = $("btnClose");
  const btnApply = $("btnApply");
  const unlockCode = $("unlockCode");
  const unlockStatus = $("unlockStatus");
  const unlockTitle = $("unlockTitle");
  const unlockText = $("unlockText");

  function log(...args) {
    const line = `[${new Date().toLocaleTimeString()}] ` + args.map(a => {
      try { return typeof a === "string" ? a : JSON.stringify(a); }
      catch { return String(a); }
    }).join(" ");
    debugLog.textContent = (debugLog.textContent ? debugLog.textContent + "\n" : "") + line;
    debugLog.scrollTop = debugLog.scrollHeight;
  }
  function setStatus(text, kind="") {
    statusText.textContent = text;
    statusText.style.color = kind === "bad" ? "#fecaca" : (kind === "good" ? "#bbf7d0" : "");
  }

  // ----------------------------
  // Plan / unlock (demo gate)
  // ----------------------------
  const PLAN_KEY = "simo_plan_v1";
  function getPlan() {
    return localStorage.getItem(PLAN_KEY) || "free";
  }
  function setPlan(p) {
    localStorage.setItem(PLAN_KEY, p);
    renderPlan();
  }
  function renderPlan() {
    const plan = getPlan();
    planPill.textContent = `Plan: ${plan === "pro" ? "Pro" : "Free"}`;
    planPill.style.borderColor = plan === "pro" ? "rgba(34,197,94,.45)" : "rgba(255,255,255,.10)";
    planPill.style.background = plan === "pro" ? "rgba(34,197,94,.12)" : "rgba(255,255,255,.04)";
  }

  function openUnlock(reasonTitle="Unlock Builder", reasonText="Builder features are locked on Free.") {
    unlockTitle.textContent = reasonTitle;
    unlockText.textContent = reasonText;
    unlockStatus.textContent = "";
    unlockStatus.className = "status";
    unlockCode.value = "";
    overlay.style.display = "flex";
  }
  function closeUnlock() {
    overlay.style.display = "none";
  }

  btnUnlock.addEventListener("click", () => openUnlock());
  btnShowUnlock.addEventListener("click", () =>
    openUnlock(
      "Why unlock?",
      "Because Simo can do real work for you (designs, app scaffolds, landing pages). Free is for chat + previews."
    )
  );
  btnClose.addEventListener("click", closeUnlock);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeUnlock(); });

  btnApply.addEventListener("click", () => {
    const code = (unlockCode.value || "").trim().toUpperCase();
    if (code === "SIMO-UNLOCK") {
      setPlan("pro");
      unlockStatus.textContent = "Unlocked. Plan is now Pro.";
      unlockStatus.className = "status good";
      setStatus("Unlocked Pro features.", "good");
      setTimeout(closeUnlock, 450);
    } else {
      unlockStatus.textContent = "Invalid code. Use SIMO-UNLOCK for demo.";
      unlockStatus.className = "status bad";
      setStatus("Unlock failed.", "bad");
    }
  });

  // Locked feature buttons
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-locked-action]");
    if (!btn) return;

    const action = btn.getAttribute("data-locked-action");
    if (getPlan() !== "pro") {
      openUnlock("Unlock required", "That Builder feature is locked. Unlock to use it.");
      log("Locked action blocked:", action);
      return;
    }

    // Pro demo behavior: show a “working” teaser output in chat
    setTab("chat");
    addMsg("assistant", `Alright. Builder mode is ON.\nTell me what you want for: ${action.replaceAll("_"," ")}.\n(Example: goals, style, budget, deadline.)`);
  });

  // ----------------------------
  // Tabs
  // ----------------------------
  function setTab(which) {
    const isChat = which === "chat";
    const isPreview = which === "preview";
    const isBuilder = which === "builder";

    tabChat.classList.toggle("active", isChat);
    tabPreview.classList.toggle("active", isPreview);
    tabBuilder.classList.toggle("active", isBuilder);

    viewChat.style.display = isChat ? "" : "none";
    viewPreview.style.display = isPreview ? "" : "none";
    viewBuilder.style.display = isBuilder ? "" : "none";

    // Save last tab (prevents “stuck mode” surprises)
    localStorage.setItem("simo_tab_v1", which);
  }
  tabChat.addEventListener("click", () => setTab("chat"));
  tabPreview.addEventListener("click", () => setTab("preview"));
  tabBuilder.addEventListener("click", () => setTab("builder"));

  // ----------------------------
  // Chat
  // ----------------------------
  const CHAT_KEY = "simo_chat_v2";
  let messages = [];

  function loadChat() {
    try {
      const raw = localStorage.getItem(CHAT_KEY);
      messages = raw ? JSON.parse(raw) : [];
    } catch { messages = []; }
  }
  function saveChat() {
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(messages)); } catch {}
  }
  function renderMsg(msg) {
    const wrap = document.createElement("div");
    wrap.className = "msg " + (msg.role === "user" ? "you" : "simo");

    const who = document.createElement("div");
    who.className = "who";
    who.textContent = msg.role === "user" ? "You" : "S";

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = msg.content;

    wrap.appendChild(who);
    wrap.appendChild(bubble);
    chatEl.appendChild(wrap);
    chatEl.scrollTop = chatEl.scrollHeight;
  }
  function renderAll() {
    chatEl.innerHTML = "";
    messages.forEach(renderMsg);
  }
  function addMsg(role, text) {
    const msg = { role, content: String(text || "") };
    messages.push(msg);
    renderMsg(msg);
    saveChat();
  }

  function bootHello() {
    addMsg("assistant", "Hey — I’m Simo. What’s going on?");
  }

  btnReset.addEventListener("click", () => {
    localStorage.removeItem(CHAT_KEY);
    messages = [];
    chatEl.innerHTML = "";
    bootHello();
    setStatus("Chat reset.");
    log("Chat reset");
  });

  // Endpoint (via netlify.toml redirect)
  async function callSimo(userText) {
    const payload = { messages, user_text: userText };
    const res = await fetch("/api/simo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = data?.error || data?.message || `HTTP ${res.status}`;
      throw new Error(err);
    }
    return data;
  }

  async function onSend() {
    const text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = "";
    addMsg("user", text);

    // If user explicitly asks for Builder features but is Free, show gate (no surprises)
    const wantsBuilder = /(build|design|make)\s+(my|a)\s+(app|website|landing|logo|brand|home)/i.test(text);
    if (wantsBuilder && getPlan() !== "pro") {
      addMsg("assistant", "I can do that — but that’s Builder mode. Unlock it, and I’ll build it with you.");
      openUnlock("Unlock Builder", "Builder mode is required for done-for-you work (designs, app scaffolds, landing pages).");
      return;
    }

    setStatus("Simo is typing…");
    sendBtn.disabled = true;
    inputEl.disabled = true;

    try {
      const data = await callSimo(text);
      addMsg("assistant", data?.reply || "I’m here. What’s going on?");
      setStatus("Ready.", "good");
      log("Reply OK");
    } catch (err) {
      addMsg("assistant", "I hit an error talking to the server.\n\n" + (err?.message || "Unknown error"));
      setStatus("Server error: " + (err?.message || "Unknown"), "bad");
      debugDrawer.open = true;
      log("ERROR:", err?.stack || err?.message || String(err));
    } finally {
      sendBtn.disabled = false;
      inputEl.disabled = false;
      inputEl.focus();
    }
  }

  sendBtn.addEventListener("click", onSend);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  });

  // ----------------------------
  // Preview listings (concrete UI)
  // ----------------------------
  const listings = [
    { id:"l1", title:"Driveway spot • Quiet street", sub:"Fits sedan/SUV • Available today • Well-lit", price:12 },
    { id:"l2", title:"Covered garage bay", sub:"Covered • Winter-friendly • 24/7 access", price:20 },
    { id:"l3", title:"RV/Boat side pad", sub:"Wide access • Camera on site • Weekly discount", price:18 },
  ];

  function renderListings() {
    if (!listingList) return;

    listingList.innerHTML = "";
    const q = (spaceQuery?.value || "").toLowerCase();
    const active = Array.from(chips?.querySelectorAll(".chip.on") || []).map(b => b.dataset.chip);

    const filtered = listings.filter(l => {
      const blob = (l.title + " " + l.sub).toLowerCase();
      const matchQ = !q || blob.includes(q);
      const matchChip = active.length === 0 ? true : true; // preview: chips are visual filter toggles
      return matchQ && matchChip;
    });

    filtered.forEach(l => {
      const row = document.createElement("div");
      row.className = "listing";
      row.innerHTML = `
        <div class="thumb"></div>
        <div class="meta">
          <h3>${l.title}</h3>
          <div class="sub2">${l.sub}</div>
          <div class="sub2"><span class="price">$${l.price}/day</span> <span class="pill">Instant request</span></div>
        </div>
        <button class="btn" data-pick="${l.id}">Pick</button>
      `;
      listingList.appendChild(row);
    });

    selectedListing.innerHTML = filtered.map(l => `<option value="${l.id}">${l.title} ($${l.price}/day)</option>`).join("");
    if (!selectedListing.value && filtered[0]) selectedListing.value = filtered[0].id;

    listingList.querySelectorAll("[data-pick]").forEach(btn => {
      btn.addEventListener("click", () => {
        selectedListing.value = btn.getAttribute("data-pick");
        bookMsg.textContent = "Selected. Choose dates and request booking (preview).";
      });
    });
  }

  chips?.addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    b.classList.toggle("on");
    renderListings();
  });

  spaceQuery?.addEventListener("input", renderListings);

  btnBook?.addEventListener("click", () => {
    bookMsg.textContent = "Request sent (preview). Next phase: real accounts + payments + calendar availability.";
  });

  // ----------------------------
  // Boot
  // ----------------------------
  renderPlan();

  loadChat();
  if (messages.length === 0) bootHello();
  else renderAll();

  renderListings();

  const lastTab = localStorage.getItem("simo_tab_v1") || "chat";
  setTab(lastTab);

  setStatus("Ready.");
  log("App loaded. Plan:", getPlan(), "Tab:", lastTab); })();
