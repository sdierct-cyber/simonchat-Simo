/* chat.js — MUST match netlify/functions/simon.js contract
   Backend expects:
   { text, mode, pro, current_preview_html, current_preview_name }

   Backend returns:
   { reply, preview_name, preview_html, preview:{name,html}, backend_label }
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

  // Fail fast if something important is missing
  const required = ["chatList","msg","sendBtn","modeBuilding","modeSolving","modeVenting","proToggle","previewFrame"];
  const missing = required.filter(k => !els[k]);
  if (missing.length) {
    console.error("Simo UI missing required elements:", missing);
    return;
  }

  const API_URL = "/.netlify/functions/simon";

  const state = {
    mode: "building",
    pro: false,
    busy: false,
    backendLabel: "simo-backend-locked-v4",

    // These two MUST be sent to backend for edits to work
    currentPreviewHtml: "",
    currentPreviewName: "none",
  };

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

  function setBackendLabel(label) {
    state.backendLabel = label || state.backendLabel || "simo-backend-locked-v4";
    if (els.backendBadge) els.backendBadge.textContent = `backend: ${state.backendLabel}`;
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
    els.proLine.textContent = state.pro
      ? "Pro ON: Save build + Download enabled."
      : "Pro OFF: Save + Download disabled.";

    // Enable/disable buttons based on pro + preview existence
    els.downloadBtn.disabled = !state.pro || !state.currentPreviewHtml;
    els.saveBtn.disabled = !state.pro || !state.currentPreviewHtml;
    els.libraryBtn.disabled = !state.pro;
  }

  function setPreview(html, name) {
    state.currentPreviewHtml = html || "";
    state.currentPreviewName = name || (html ? "preview" : "none");

    els.previewNameBadge.textContent = state.currentPreviewName || "none";
    els.previewStatusBadge.textContent = html ? "ready" : "empty";
    els.previewLine.textContent = html ? "Preview loaded." : "No preview yet.";

    els.previewFrame.srcdoc = html || "";

    // Update buttons based on pro state
    els.downloadBtn.disabled = !state.pro || !state.currentPreviewHtml;
    els.saveBtn.disabled = !state.pro || !state.currentPreviewHtml;
  }

  function clearPreview() {
    setPreview("", "none");
    bubble("simo", "Simo: Preview cleared.");
  }

  function downloadCurrentPreview() {
    if (!state.pro || !state.currentPreviewHtml) return;

    const blob = new Blob([state.currentPreviewHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    const safeName = (state.currentPreviewName || "preview")
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

  // --- Local library (Pro only)
  function getSavedBuilds() {
    try { return JSON.parse(localStorage.getItem("simo_builds") || "[]"); }
    catch { return []; }
  }
  function setSavedBuilds(list) {
    localStorage.setItem("simo_builds", JSON.stringify(list));
  }

  function saveBuild() {
    if (!state.pro || !state.currentPreviewHtml) return;

    const name = prompt("Name this build (e.g., lp_v1):", state.currentPreviewName || "build");
    if (!name) return;

    const builds = getSavedBuilds();
    builds.unshift({ name, html: state.currentPreviewHtml, ts: Date.now(), mode: state.mode });
    setSavedBuilds(builds.slice(0, 30));

    bubble("simo", `Simo: Saved build: ${name}`);
  }

  function openLibrary() {
    if (!state.pro) return;

    const builds = getSavedBuilds();
    if (!builds.length) {
      bubble("simo", "Simo: Library is empty. Generate a preview, then Save build.");
      return;
    }

    const menu = builds.slice(0, 12).map((b, i) => `${i + 1}) ${b.name}`).join("\n");
    const pick = prompt(`Library:\n${menu}\n\nType a number to load:`, "1");
    const idx = Number(pick) - 1;
    if (!Number.isFinite(idx) || idx < 0 || idx >= builds.length) return;

    const chosen = builds[idx];
    setPreview(chosen.html, chosen.name);
    bubble("simo", `Simo: Loaded from library: ${chosen.name}`);
  }

  // --- Response parsing (matches your simon.js)
  function parseBackendResponse(data) {
    const reply =
      data?.reply ??
      data?.text ??
      data?.message ??
      "";

    const backendLabel =
      data?.backend_label ??
      data?.backend ??
      "";

    const previewName =
      data?.preview?.name ??
      data?.preview_name ??
      "";

    const previewHtml =
      data?.preview?.html ??
      data?.preview_html ??
      "";

    return { reply, backendLabel, previewName, previewHtml };
  }

  async function send() {
    if (state.busy) return;

    const text = (els.msg.value || "").trim();
    if (!text) return;

    bubble("me", `You: ${text}`);
    els.msg.value = "";

    state.busy = true;
    els.sendBtn.disabled = true;
    els.previewStatusBadge.textContent = "thinking…";

    try {
      // ✅ THIS IS THE CRITICAL FIX:
      // send fields that simon.js expects
      const payload = {
        text,                 // <-- REQUIRED
        mode: state.mode,
        pro: state.pro,
        current_preview_html: state.currentPreviewHtml,  // <-- REQUIRED for edits
        current_preview_name: state.currentPreviewName,  // <-- REQUIRED for edits
      };

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));
      const { reply, backendLabel, previewName, previewHtml } = parseBackendResponse(data);

      if (backendLabel) setBackendLabel(backendLabel);

      bubble("simo", `Simo: ${reply || "(no reply text)"}`);

      // If backend returns preview, load it
      if (previewHtml) {
        setPreview(previewHtml, previewName || "preview");
      } else {
        els.previewStatusBadge.textContent = "ready";
      }
    } catch (err) {
      console.error(err);
      bubble("simo", "Simo: Network/backend error. Check Netlify function logs.");
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
    setBackendLabel(state.backendLabel || "simo-backend-locked-v4");
  }

  function devDump() {
    const info = [
      `mode=${state.mode}`,
      `pro=${state.pro}`,
      `current_preview_name=${state.currentPreviewName}`,
      `has_preview_html=${!!state.currentPreviewHtml}`,
      `backend=${state.backendLabel}`,
      `api=${API_URL}`
    ].join(" | ");
    bubble("simo", `Simo (dev): ${info}`);
  }

  // Wire up
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
  setBackendLabel("simo-backend-locked-v4");
  resetAll();
})();
