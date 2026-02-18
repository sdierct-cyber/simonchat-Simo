/* chat.js — Simo UI controller (safe + no null errors)
   - Buttons + Enter key work
   - Pro toggles
   - Calls Netlify function backend (/.netlify/functions/simon)
   - Loads preview via iframe srcdoc
   - Download HTML
   - Save build + Library (localStorage) when Pro ON
   - MODE SWITCH: always sends current preview state so edits work across modes
   - NEW: Free daily message limit (Pro unlimited)
*/

(() => {
  const $ = (id) => document.getElementById(id);

  const els = {
    chatList: $("chatList"),
    msg: $("msg"),
    sendBtn: $("sendBtn"),
    resetBtn: $("resetBtn"),
    devBtn: $("devBtn"),
    saveBtn: $("saveBtn"),
    libraryBtn: $("libraryBtn"),

    modeBuilding: $("modeBuilding"),
    modeSolving: $("modeSolving"),
    modeVenting: $("modeVenting"),
    proToggle: $("proToggle"),

    backendBadge: $("backendBadge"),
    modeLine: $("modeLine"),
    proLine: $("proLine"),

    previewFrame: $("previewFrame"),
    downloadBtn: $("downloadBtn"),
    clearPreviewBtn: $("clearPreviewBtn"),

    previewNameBadge: $("previewNameBadge"),
    previewModeBadge: $("previewModeBadge"),
    previewProBadge: $("previewProBadge"),
    previewStatusBadge: $("previewStatusBadge"),
    previewLine: $("previewLine"),
  };

  const required = ["chatList","msg","sendBtn","modeBuilding","modeSolving","modeVenting","proToggle","previewFrame"];
  const missing = required.filter(k => !els[k]);
  if (missing.length) {
    console.error("Simo UI missing required elements:", missing);
    return;
  }

  const state = {
    mode: "building",
    pro: false,
    lastPreviewHtml: "",
    lastPreviewName: "none",
    lastBackend: "?",
    busy: false
  };

  const API_URL = "/.netlify/functions/simon";

  // =========================
  // PLAN LIMITS (SAFE)
  // =========================
  const LIMITS = {
    FREE_DAILY_MESSAGES: 30,     // change this later if you want
  };

  function todayKey() {
    // local date key (YYYY-MM-DD)
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function usageStorageKey() {
    return `simo_usage_${todayKey()}`;
  }

  function getUsage() {
    try {
      const raw = localStorage.getItem(usageStorageKey());
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        msgs: Number(parsed?.msgs || 0),
      };
    } catch {
      return { msgs: 0 };
    }
  }

  function setUsage(u) {
    localStorage.setItem(usageStorageKey(), JSON.stringify({
      msgs: Number(u?.msgs || 0)
    }));
  }

  function canSendMessage() {
    if (state.pro) return { ok: true, left: Infinity, limit: Infinity };

    const u = getUsage();
    const limit = LIMITS.FREE_DAILY_MESSAGES;
    const left = Math.max(0, limit - u.msgs);
    return { ok: left > 0, left, limit };
  }

  function consumeMessage() {
    if (state.pro) return;
    const u = getUsage();
    u.msgs = (u.msgs || 0) + 1;
    setUsage(u);
  }

  function updateProLine() {
    if (state.pro) {
      els.proLine.textContent = "Pro ON: Save build + Download enabled. (Unlimited messages)";
      return;
    }
    const u = getUsage();
    const limit = LIMITS.FREE_DAILY_MESSAGES;
    const left = Math.max(0, limit - u.msgs);
    els.proLine.textContent = `Pro OFF: Save + Download disabled. (Free: ${left}/${limit} messages left today)`;
  }

  // =========================
  // UI helpers
  // =========================
  function scrollChatToBottom() {
    els.chatList.scrollTop = els.chatList.scrollHeight + 9999;
  }

  function bubble(role, text) {
    const div = document.createElement("div");
    div.className = `bubble ${role === "me" ? "me" : "simo"}`;
    div.textContent = text;
    els.chatList.appendChild(div);
    scrollChatToBottom();
  }

  function setMode(mode) {
    state.mode = mode;

    els.modeBuilding.classList.toggle("active", mode === "building");
    els.modeSolving.classList.toggle("active", mode === "solving");
    els.modeVenting.classList.toggle("active", mode === "venting");

    els.modeLine.textContent = `Mode: ${mode}`;
    els.previewModeBadge.textContent = `mode: ${mode}`;
  }

  function setPro(on) {
    state.pro = !!on;

    els.proToggle.classList.toggle("active", state.pro);
    els.proToggle.classList.toggle("on", state.pro);
    els.proToggle.setAttribute("aria-pressed", String(state.pro));
    els.proToggle.textContent = state.pro ? "Pro: ON" : "Pro: OFF";

    els.previewProBadge.textContent = state.pro ? "pro: on" : "pro: off";

    // Save + Library allowed only when Pro on
    els.saveBtn.disabled = !state.pro || !state.lastPreviewHtml;
    els.libraryBtn.disabled = !state.pro;

    // Download enabled only when Pro on + preview exists
    els.downloadBtn.disabled = !state.pro || !state.lastPreviewHtml;

    updateProLine();
  }

  function setBackendLabel(label) {
    state.lastBackend = label || "?";
    els.backendBadge.textContent = `backend: ${state.lastBackend}`;
  }

  function setPreview(html, name = "preview") {
    state.lastPreviewHtml = html || "";
    state.lastPreviewName = name || "preview";

    els.previewNameBadge.textContent = state.lastPreviewName || "preview";
    els.previewStatusBadge.textContent = html ? "ready" : "empty";
    els.previewLine.textContent = html ? "Preview loaded." : "No preview yet.";

    els.previewFrame.srcdoc = html || "";

    els.downloadBtn.disabled = !state.pro || !state.lastPreviewHtml;
    els.saveBtn.disabled = !state.pro || !state.lastPreviewHtml;
  }

  function clearPreview() {
    setPreview("", "none");
    bubble("simo", "Preview cleared.");
  }

  function downloadCurrentPreview() {
    if (!state.pro || !state.lastPreviewHtml) return;

    const blob = new Blob([state.lastPreviewHtml], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);

    const safeName = (state.lastPreviewName || "preview")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .slice(0, 40);

    a.href = url;
    a.download = `${safeName || "preview"}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function getSavedBuilds() {
    try {
      return JSON.parse(localStorage.getItem("simo_builds") || "[]");
    } catch {
      return [];
    }
  }

  function setSavedBuilds(list) {
    localStorage.setItem("simo_builds", JSON.stringify(list));
  }

  function saveBuild() {
    if (!state.pro || !state.lastPreviewHtml) return;

    const name = prompt("Name this build (e.g., lp_v1):", state.lastPreviewName || "build");
    if (!name) return;

    const builds = getSavedBuilds();
    builds.unshift({
      name,
      html: state.lastPreviewHtml,
      ts: Date.now(),
      mode: state.mode
    });

    setSavedBuilds(builds.slice(0, 30));
    bubble("simo", `Saved build: ${name}`);
  }

  function openLibrary() {
    if (!state.pro) return;

    const builds = getSavedBuilds();
    if (!builds.length) {
      bubble("simo", "Library is empty. Generate a preview, then Save build.");
      return;
    }

    const menu = builds
      .slice(0, 12)
      .map((b, i) => `${i + 1}) ${b.name}`)
      .join("\n");

    const pick = prompt(`Library:\n${menu}\n\nType a number to load:`, "1");
    const idx = Number(pick) - 1;
    if (!Number.isFinite(idx) || idx < 0 || idx >= builds.length) return;

    const chosen = builds[idx];
    setPreview(chosen.html, chosen.name);
    bubble("simo", `Loaded from library: ${chosen.name}`);
  }

  function extractFromResponse(data) {
    const root = data && (data.response || data);

    const text =
      root?.text ??
      root?.reply ??
      root?.output_text ??
      root?.message ??
      root?.assistant ??
      "";

    const backend =
      root?.backend_label ??
      root?.backend ??
      root?.meta?.backend ??
      root?.version ??
      "";

    const previewHtml =
      root?.preview_html ??
      root?.previewHtml ??
      root?.preview?.html ??
      root?.preview?.preview_html ??
      root?.preview?.srcdoc ??
      "";

    const previewName =
      root?.preview_name ??
      root?.previewName ??
      root?.preview?.name ??
      root?.preview?.preview_name ??
      (previewHtml ? "preview" : "none");

    return { text, backend, previewHtml, previewName };
  }

  async function send() {
    if (state.busy) return;

    const q = (els.msg.value || "").trim();
    if (!q) return;

    // LIMIT CHECK (Free only)
    const allowed = canSendMessage();
    if (!allowed.ok) {
      bubble("simo", `Simo: You’ve hit today’s Free limit (${allowed.limit} messages). Turn Pro ON for unlimited messages.`);
      updateProLine();
      return;
    }

    bubble("me", `You: ${q}`);
    els.msg.value = "";

    // consume immediately so refresh spamming can’t bypass it
    consumeMessage();
    updateProLine();

    state.busy = true;
    els.sendBtn.disabled = true;
    els.previewStatusBadge.textContent = "thinking…";

    try {
      const payload = {
        text: q,
        mode: state.mode,
        pro: state.pro,
        current_preview_name: state.lastPreviewName,
        current_preview_html: state.lastPreviewHtml
      };

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));
      const { text, backend, previewHtml, previewName } = extractFromResponse(data);

      if (backend) setBackendLabel(backend);

      bubble("simo", text ? `Simo: ${text}` : "Simo: (no response text)");

      if (previewHtml) {
        setPreview(previewHtml, previewName || "preview");
      } else {
        els.previewStatusBadge.textContent = "ready";
      }
    } catch (err) {
      console.error(err);
      bubble("simo", "Simo: Sorry — I hit a network/backend error. Check Netlify function logs.");
      els.previewStatusBadge.textContent = "error";
    } finally {
      state.busy = false;
      els.sendBtn.disabled = false;
    }
  }

  function resetAll() {
    els.chatList.innerHTML = "";
    bubble("simo", "Simo: Reset. I’m here.");
    setPreview("", "none");
    setBackendLabel(state.lastBackend || "?");
    updateProLine();
  }

  function devDump() {
    const u = getUsage();
    const info = [
      `mode=${state.mode}`,
      `pro=${state.pro}`,
      `preview=${state.lastPreviewName}`,
      `hasPreviewHtml=${!!state.lastPreviewHtml}`,
      `backend=${state.lastBackend}`,
      `api=${API_URL}`,
      `free_used_today=${u.msgs}`
    ].join(" | ");
    bubble("simo", `Simo (dev): ${info}`);
  }

  // Wire up events
  els.sendBtn.addEventListener("click", send);
  els.msg.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      send();
    }
  });

  els.modeBuilding.addEventListener("click", () => setMode("building"));
  els.modeSolving.addEventListener("click", () => setMode("solving"));
  els.modeVenting.addEventListener("click", () => setMode("venting"));

  els.proToggle.addEventListener("click", () => setPro(!state.pro));

  els.resetBtn.addEventListener("click", resetAll);
  els.devBtn.addEventListener("click", devDump);

  els.clearPreviewBtn.addEventListener("click", clearPreview);
  els.downloadBtn.addEventListener("click", downloadCurrentPreview);

  els.saveBtn.addEventListener("click", saveBuild);
  els.libraryBtn.addEventListener("click", openLibrary);

  // Boot
  setMode("building");
  setPro(false);
  setBackendLabel("?");
  resetAll();
})();
