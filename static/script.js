// Simo — matched stable UI controller for current Flask backend
(() => {
  if (window.__SIMO_BOOTED__) return;
  window.__SIMO_BOOTED__ = true;

  const $ = (id) => document.getElementById(id);
  const SIMO = window.SIMO_BOOT || {};

  // -----------------------------
  // Core elements
  // -----------------------------
  const chatEl = $("chatMessages");
  const inputEl = $("chatInput");
  const sendBtn = $("sendBtn");
  const newChatBtn = $("newChatBtn");
  const clearBtn = $("clearBtn");
  const statusLine = $("statusLine");

  const imgBtn = $("imgBtn");
  const micBtn = $("micBtn");
  const imagePick = $("imagePick");
  const imageStage = $("imageStage");
  const imagePreview = $("imagePreview");
  const imageName = $("imageName");
  const removeImageBtn = $("removeImageBtn");
  const imageDropZone = $("imageDropZone");

  const proBtn = $("proBtn");
  const proModal = $("proModal");
  const closeProModal = $("closeProModal");

  const settingsBtn = $("settingsBtn");
  const signupBtn = $("signupBtn");
  const settingsModal = $("settingsModal");
  const closeSettings = $("closeSettings");

  const accountModal = $("accountModal");
  const closeAccount = $("closeAccount");
  const youBtn = $("youBtn");
  const accEmail = $("accEmail");
  const accPlan = $("accPlan");

  const saveSettingsBtn = $("saveSettings");
  const resetSettingsBtn = $("resetSettings");
  const setVoice = $("setVoice");
  const setStyle = $("setStyle");
  const setLang = $("setLang");
  const setTheme = $("setTheme");

  const builderPreviewModal = $("builderPreviewModal");
  const builderPreviewFrame = $("builderPreviewFrame");
  const builderHtmlWrap = $("builderHtmlWrap");
  const builderHtmlView = $("builderHtmlView");
  const showHtmlBtn = $("showHtmlBtn");
  const openBuilderNewTabBtn = $("openBuilderNewTabBtn");
  const publishBuildBtn = $("publishBuildBtn");
  const downloadHtmlBtn = $("downloadHtmlBtn");
  const saveBuildBtn = $("saveBuildBtn");
  const openLibraryBtn = $("openLibraryBtn");
  const closeBuilderPreviewBtn = $("closeBuilderPreviewBtn");
  const closeBuilderPreviewFooterBtn = $("closeBuilderPreviewFooterBtn");

  const libraryModal = $("libraryModal");
  const closeLibraryBtn = $("closeLibraryBtn");
  const libraryList = $("libraryList");
  const libraryEmpty = $("libraryEmpty");
  const builderLibrarySideBtn = $("builderLibrarySideBtn");
  const exportLibraryBtn = $("exportLibraryBtn");
  const importLibraryBtn = $("importLibraryBtn");
  const importLibraryFile = $("importLibraryFile");

  const buySingleMonthly = $("buySingleMonthly");
  const buySingleYearly = $("buySingleYearly");
  const buyTeamMonthly = $("buyTeamMonthly");
  const buyTeamYearly = $("buyTeamYearly");

  const welcomeCard = $("welcomeCard");

  const dashEmail = $("dashEmail");
  const dashPlan = $("dashPlan");
  const dashUsage = $("dashUsage");
  const dashBuildCount = $("dashBuildCount");
  const topPlanLabel = $("topPlanLabel");

  // -----------------------------
  // Local keys / state
  // -----------------------------
  const SETTINGS_KEY = "simo_user_settings_v3";
  const LIBRARY_KEY = "simo_builder_library_v3";
  const LAST_PREVIEW_KEY = "simo_last_preview_v3";
  const WELCOME_DISMISSED_KEY = "simo_welcome_dismissed_v3";

  let isSending = false;
  let pendingImage = null;
  let typingBubbleEl = null;

  let currentBuilderHtml = "";
  let currentBuilderName = "";

  let chatHistory = [];

  // -----------------------------
  // Helpers
  // -----------------------------
  function setStatus(text) {
    if (statusLine) statusLine.textContent = text || "";
  }

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function safeJsonParse(str, fallback) {
    try {
      return JSON.parse(str);
    } catch {
      return fallback;
    }
  }

  function loadLocal(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return safeJsonParse(raw, fallback);
    } catch {
      return fallback;
    }
  }

  function saveLocal(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function makeId(prefix = "id") {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeBuildName(name) {
    return String(name || "simo-project")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "simo-project";
  }

  function bestBuildNameFromHtml(html) {
    if (!html) return "simo-project";
    const m = String(html).match(/<title>(.*?)<\/title>/i);
    if (m?.[1]) return normalizeBuildName(m[1]);
    return "simo-project";
  }

  function scrollChatToBottom() {
    if (!chatEl) return;
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function openModal(el) {
    if (!el) return;
    el.classList.remove("hidden");
    el.setAttribute("aria-hidden", "false");
  }

  function closeModal(el) {
    if (!el) return;
    el.classList.add("hidden");
    el.setAttribute("aria-hidden", "true");
  }

  function closeAllModals() {
    [proModal, settingsModal, accountModal, builderPreviewModal, libraryModal].forEach(closeModal);
  }

  function formatNow() {
    return new Date().toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function planLabelFromRaw(planRaw) {
    if (planRaw === "single") return "Pro";
    if (planRaw === "team") return "Team";
    return "Free";
  }

  function statusTextFromPlan(planRaw, st = null) {
    if (planRaw === "single") return "Simo Pro active.";
    if (planRaw === "team") return "Simo Team active.";
    if (st?.used_today != null && st?.free_daily_limit != null) {
      return `Free plan: ${st.used_today}/${st.free_daily_limit} messages used today.`;
    }
    return "Simo is online and ready.";
  }

  function updateDashboardCards(statusData = null, meData = null) {
    if (dashEmail) dashEmail.textContent = meData?.email || SIMO.userEmail || "Guest";

    const planRaw = meData?.plan || statusData?.plan || SIMO.plan || "free";
    const planLabel = planLabelFromRaw(planRaw);

    if (dashPlan) dashPlan.textContent = planLabel;
    if (topPlanLabel) topPlanLabel.textContent = planLabel;

    if (dashUsage) {
      if (statusData?.used_today != null && statusData?.free_daily_limit != null) {
        if (planRaw === "free") {
          dashUsage.textContent = `${statusData.used_today} / ${statusData.free_daily_limit}`;
        } else {
          dashUsage.textContent = "Unlimited";
        }
      } else {
        dashUsage.textContent = planRaw === "free" ? "--" : "Unlimited";
      }
    }

    if (dashBuildCount) {
      const items = getLibrary();
      dashBuildCount.textContent = String(items.length);
    }
  }

  // -----------------------------
  // Settings
  // -----------------------------
  const defaultSettings = {
    voice: false,
    style: "friendly",
    language: "en",
    theme: "default"
  };

  function getSettings() {
    return { ...defaultSettings, ...loadLocal(SETTINGS_KEY, defaultSettings) };
  }

  function applyTheme(theme) {
    document.body.dataset.theme = theme || "default";

    const root = document.documentElement;
    if (!root) return;

    if (theme === "ocean") {
      root.style.setProperty("--blue", "#66b3ff");
      root.style.setProperty("--purple", "#88d3ff");
    } else if (theme === "emerald") {
      root.style.setProperty("--blue", "#57d8a2");
      root.style.setProperty("--purple", "#56f0a9");
    } else if (theme === "sunset") {
      root.style.setProperty("--blue", "#ffb46e");
      root.style.setProperty("--purple", "#ff8bbd");
    } else {
      root.style.removeProperty("--blue");
      root.style.removeProperty("--purple");
    }
  }

  function loadSettingsIntoUI() {
    const s = getSettings();
    if (setVoice) setVoice.checked = !!s.voice;
    if (setStyle) setStyle.value = s.style || "friendly";
    if (setLang) setLang.value = s.language || "en";
    if (setTheme) setTheme.value = s.theme || "default";
    applyTheme(s.theme);
  }

  function saveSettingsFromUI() {
    const next = {
      voice: !!setVoice?.checked,
      style: setStyle?.value || "friendly",
      language: setLang?.value || "en",
      theme: setTheme?.value || "default"
    };
    saveLocal(SETTINGS_KEY, next);
    applyTheme(next.theme);
    setStatus("Settings saved.");
  }

  function resetSettings() {
    saveLocal(SETTINGS_KEY, defaultSettings);
    loadSettingsIntoUI();
    setStatus("Settings reset.");
  }

  // -----------------------------
  // Chat UI
  // -----------------------------
  function appendMessage(role, text, opts = {}) {
    if (!chatEl) return null;

    const msg = document.createElement("div");
    msg.className = `msg ${role}`;

    let html = "";

    if (opts.title) {
      html += `<div style="font-weight:800; margin-bottom:8px;">${esc(opts.title)}</div>`;
    }

    if (text) {
      html += `<div>${esc(text).replace(/\n/g, "<br>")}</div>`;
    }

    if (opts.imageUrl) {
      html += `<img src="${opts.imageUrl}" alt="Uploaded image preview" />`;
    }

    msg.innerHTML = html;
    chatEl.appendChild(msg);
    scrollChatToBottom();
    return msg;
  }

  function showTypingBubble(text = "Simo is thinking…") {
    removeTypingBubble();
    if (!chatEl) return;

    typingBubbleEl = document.createElement("div");
    typingBubbleEl.className = "msg assistant";
    typingBubbleEl.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="
          width:10px;
          height:10px;
          border-radius:50%;
          background:#56f0a9;
          box-shadow:0 0 12px rgba(86,240,169,.85);
          display:inline-block;
        "></span>
        <span>${esc(text)}</span>
      </div>
    `;
    chatEl.appendChild(typingBubbleEl);
    scrollChatToBottom();
  }

  function removeTypingBubble() {
    if (typingBubbleEl?.parentNode) {
      typingBubbleEl.parentNode.removeChild(typingBubbleEl);
    }
    typingBubbleEl = null;
  }

  function clearChatUI() {
    if (!chatEl) return;
    chatEl.innerHTML = "";
    chatHistory = [];
  }

  // -----------------------------
  // History
  // -----------------------------
  function pushHistory(role, content) {
    if (!content || !String(content).trim()) return;
    chatHistory.push({
      role,
      content: String(content)
    });
    if (chatHistory.length > 24) {
      chatHistory = chatHistory.slice(-24);
    }
  }

  // -----------------------------
  // Account / status
  // -----------------------------
  async function fetchStatus() {
    try {
      const resp = await fetch("/api/status");
      const data = await resp.json();
      return data;
    } catch {
      return null;
    }
  }

  async function fetchMe() {
    try {
      const resp = await fetch("/api/me");
      const data = await resp.json();
      return data;
    } catch {
      return null;
    }
  }

  async function refreshAccountUI() {
    const me = await fetchMe();
    if (!me) {
      updateDashboardCards(null, null);
      return;
    }

    if (accEmail) accEmail.textContent = me.email || "Guest";
    if (accPlan) accPlan.textContent = planLabelFromRaw(me.plan);

    updateDashboardCards(null, me);
  }

  async function refreshUsageStatus() {
    const st = await fetchStatus();
    if (!st) return null;

    updateDashboardCards(st, null);
    setStatus(statusTextFromPlan(st.plan, st));
    return st;
  }

  // -----------------------------
  // Prompt injection
  // -----------------------------
  function wirePromptButtons() {
    document.querySelectorAll("[data-prompt]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const prompt = btn.getAttribute("data-prompt") || "";
        if (inputEl) {
          inputEl.value = prompt;
          inputEl.focus();
        }
        setStatus("Prompt loaded.");
      });
    });
  }

  // -----------------------------
  // Image staging
  // -----------------------------
  async function stageImageFile(file) {
    if (!file) return;
    if (!file.type || !file.type.startsWith("image/")) {
      setStatus("That file is not an image.");
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);

      pendingImage = {
        file,
        dataUrl,
        name: file.name || "image",
        type: file.type || "image/png"
      };

      if (imagePreview) imagePreview.src = dataUrl;
      if (imageName) imageName.textContent = pendingImage.name;
      if (imageStage) imageStage.classList.remove("hidden");

      setStatus("Image ready to send.");
    } catch {
      setStatus("Could not read that image.");
    }
  }

  function clearStagedImage() {
    pendingImage = null;
    if (imagePick) imagePick.value = "";
    if (imagePreview) imagePreview.removeAttribute("src");
    if (imageName) imageName.textContent = "No image selected";
    if (imageStage) imageStage.classList.add("hidden");
  }

  // -----------------------------
  // Builder preview
  // -----------------------------
  function openBuilderPreview(html, name = "") {
    if (!builderPreviewModal || !builderPreviewFrame || !builderHtmlView) return;

    currentBuilderHtml = html || "";
    currentBuilderName = name || bestBuildNameFromHtml(currentBuilderHtml);

    builderPreviewFrame.srcdoc = currentBuilderHtml;
    builderHtmlView.value = currentBuilderHtml;

    if (builderHtmlWrap) builderHtmlWrap.classList.add("hidden");

    saveLocal(LAST_PREVIEW_KEY, {
      html: currentBuilderHtml,
      name: currentBuilderName,
      savedAt: new Date().toISOString()
    });

    openModal(builderPreviewModal);
  }

  function closeBuilderPreview() {
    closeModal(builderPreviewModal);
  }

  function restoreLastPreview() {
    const last = loadLocal(LAST_PREVIEW_KEY, null);
    if (!last?.html) return;
    currentBuilderHtml = last.html;
    currentBuilderName = last.name || bestBuildNameFromHtml(last.html);
  }

  // -----------------------------
  // Builder Library
  // -----------------------------
  function getLibrary() {
    return loadLocal(LIBRARY_KEY, []);
  }

  function setLibrary(items) {
    saveLocal(LIBRARY_KEY, items);
    updateDashboardCards(null, null);
  }

  function renderLibrary() {
    if (!libraryList || !libraryEmpty) return;

    const items = getLibrary()
      .slice()
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

    libraryList.innerHTML = "";

    if (!items.length) {
      libraryEmpty.classList.remove("hidden");
      if (dashBuildCount) dashBuildCount.textContent = "0";
      return;
    }

    libraryEmpty.classList.add("hidden");
    if (dashBuildCount) dashBuildCount.textContent = String(items.length);

    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "libraryCard";
      card.innerHTML = `
        <div class="libraryTitle">${esc(item.name || "untitled-build")}</div>
        <div class="libraryMeta">Saved ${esc(new Date(item.updatedAt || item.createdAt).toLocaleString())}</div>
        <div class="libraryActions">
          <button class="buyBtn" data-act="open" data-id="${esc(item.id)}" type="button">Open</button>
          <button class="buyBtn ghost" data-act="download" data-id="${esc(item.id)}" type="button">Download</button>
          <button class="buyBtn ghost" data-act="publish" data-id="${esc(item.id)}" type="button">Publish</button>
          <button class="buyBtn ghost" data-act="rename" data-id="${esc(item.id)}" type="button">Rename</button>
          <button class="buyBtn ghost" data-act="delete" data-id="${esc(item.id)}" type="button">Delete</button>
        </div>
      `;
      libraryList.appendChild(card);
    });

    libraryList.querySelectorAll("button[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        handleLibraryAction(btn.getAttribute("data-act"), btn.getAttribute("data-id"));
      });
    });
  }

  async function handleLibraryAction(act, id) {
    const items = getLibrary();
    const item = items.find((x) => x.id === id);
    if (!item) return;

    if (act === "open") {
      openBuilderPreview(item.html, item.name);
      setStatus(`Opened build: ${item.name}`);
      return;
    }

    if (act === "download") {
      await downloadHtmlViaApi(item.name, item.html);
      return;
    }

    if (act === "publish") {
      await publishHtmlViaApi(item.name, item.html);
      return;
    }

    if (act === "rename") {
      const next = prompt("Rename build:", item.name || "simo-project");
      if (!next) return;
      item.name = next.trim();
      item.updatedAt = new Date().toISOString();
      setLibrary(items);
      renderLibrary();
      setStatus("Build renamed.");
      return;
    }

    if (act === "delete") {
      if (!confirm(`Delete "${item.name}"?`)) return;
      setLibrary(items.filter((x) => x.id !== id));
      renderLibrary();
      setStatus("Build deleted.");
    }
  }

  function saveCurrentBuildToLibrary() {
    if (!currentBuilderHtml) {
      setStatus("No builder preview is open.");
      return;
    }

    const suggested = currentBuilderName || bestBuildNameFromHtml(currentBuilderHtml);
    const chosen = prompt("Save build as:", suggested);
    if (!chosen) return;

    const items = getLibrary();
    const record = {
      id: makeId("build"),
      name: chosen.trim(),
      html: currentBuilderHtml,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    items.unshift(record);
    setLibrary(items);
    renderLibrary();
    setStatus(`Saved build: ${record.name}`);
  }

  function exportLibrary() {
    const items = getLibrary();
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `simo-library-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
    setStatus("Library exported.");
  }

  function importLibraryFromFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "[]"));
        if (!Array.isArray(parsed)) throw new Error("Invalid library file.");
        setLibrary(parsed);
        renderLibrary();
        setStatus("Library imported.");
      } catch (err) {
        alert(err?.message || "Import failed.");
        setStatus("Import failed.");
      }
    };
    reader.readAsText(file);
  }

  // -----------------------------
  // API helpers
  // -----------------------------
  async function postJson(url, payload) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });

    const text = await resp.text();
    const data = safeJsonParse(text, null);

    if (!resp.ok) {
      throw new Error(data?.error || text || `Request failed (${resp.status})`);
    }

    return data ?? {};
  }

  async function downloadHtmlViaApi(title, html) {
    if (!html || !String(html).trim()) {
      setStatus("No HTML available.");
      return;
    }

    try {
      setStatus("Preparing HTML download…");

      const resp = await fetch("/api/download-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || "simo-project",
          html: html || ""
        })
      });

      if (!resp.ok) {
        const text = await resp.text();
        const data = safeJsonParse(text, null);
        throw new Error(data?.error || text || "Download failed.");
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${normalizeBuildName(title || "simo-project")}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1200);
      setStatus("HTML downloaded.");
    } catch (err) {
      console.error(err);
      setStatus("Download failed.");
      alert(err?.message || "Download failed.");
    }
  }

  async function publishHtmlViaApi(title, html) {
    if (!html || !String(html).trim()) {
      setStatus("No HTML available.");
      return;
    }

    try {
      setStatus("Publishing page…");

      const data = await postJson("/api/publish", {
        title: title || "published-page",
        html: html || ""
      });

      if (data?.ok && data?.url) {
        setStatus("Page published.");
        alert(`Published successfully:\n${data.url}`);
        return;
      }

      throw new Error(data?.error || "Publish failed.");
    } catch (err) {
      console.error(err);
      setStatus("Publish failed.");
      alert(err?.message || "Publish failed.");
    }
  }

  async function startCheckout(planCode) {
    try {
      setStatus("Opening secure checkout…");

      const data = await postJson("/api/create-checkout-session", {
        plan: planCode
      });

      if (data?.url) {
        window.location.href = data.url;
        return;
      }

      throw new Error(data?.error || "Checkout session was not created.");
    } catch (err) {
      console.error(err);
      setStatus("Checkout failed.");
      alert(err?.message || "Checkout failed.");
    }
  }

  // -----------------------------
  // Chat requests
  // -----------------------------
  async function sendTextChat(text) {
    const payload = {
      text,
      history: chatHistory,
      settings: getSettings()
    };

    const wantsBuilder =
      /build|landing page|website|web page|homepage|create a page|make a page|builder/i.test(text);

    if (wantsBuilder) {
      payload.mode = "builder";
    }

    return await postJson("/api/chat", payload);
  }

  async function sendImageChat(text) {
    if (!pendingImage?.file) {
      throw new Error("No image selected.");
    }

    const form = new FormData();
    form.append("image", pendingImage.file);
    form.append("text", text || "");
    form.append("history", JSON.stringify(chatHistory));
    form.append("settings", JSON.stringify(getSettings()));

    const resp = await fetch("/api/image", {
      method: "POST",
      body: form
    });

    const raw = await resp.text();
    const data = safeJsonParse(raw, null);

    if (!resp.ok) {
      throw new Error(data?.error || raw || `Request failed (${resp.status})`);
    }

    return data ?? {};
  }

  // -----------------------------
  // Send flow
  // -----------------------------
  async function handleSend() {
    if (isSending) return;

    const rawText = inputEl?.value || "";
    const text = rawText.trim();

    if (!text && !pendingImage) {
      setStatus("Type a message or attach an image.");
      return;
    }

    isSending = true;
    if (sendBtn) sendBtn.disabled = true;

    let sendHadError = false;
    let builderReturned = false;

    try {
      if (text) {
        appendMessage("user", text, pendingImage ? { imageUrl: pendingImage.dataUrl } : {});
        pushHistory("user", text);
      } else if (pendingImage) {
        const defaultImageText = "Please analyze this image.";
        appendMessage("user", defaultImageText, { imageUrl: pendingImage.dataUrl });
        pushHistory("user", defaultImageText);
      }

      if (inputEl) inputEl.value = "";

      showTypingBubble(
        pendingImage ? "Simo is looking at your image…" : "Simo is thinking…"
      );
      setStatus("Sending…");

      let data;
      if (pendingImage) {
        data = await sendImageChat(text || "Please analyze this image.");
      } else {
        data = await sendTextChat(text);
      }

      removeTypingBubble();

      if (data?.mode === "builder" && data?.builder?.html) {
        builderReturned = true;

        const builder = data.builder;
        currentBuilderHtml = builder.html || "";
        currentBuilderName = builder.title || bestBuildNameFromHtml(builder.html || "");
        openBuilderPreview(currentBuilderHtml, currentBuilderName);

        const builderSummary = data.answer || builder.summary || "Builder preview ready.";
        appendMessage("assistant", builderSummary);
        pushHistory("assistant", builderSummary);

        clearStagedImage();
        if (inputEl) inputEl.focus();
        setStatus(`Builder preview ready at ${formatNow()}.`);

        // Refresh dashboard in background, but don't let it hang the UI state
        refreshUsageStatus().catch(() => {});
        return;
      }

      const answer = data?.answer || "Done.";
      appendMessage("assistant", answer);
      pushHistory("assistant", answer);

      clearStagedImage();
      if (inputEl) inputEl.focus();

      // Refresh usage, but don't allow a slow/failing refresh to leave the UI stuck
      const latestStatus = await refreshUsageStatus();
      if (!latestStatus) {
        setStatus(`Simo replied at ${formatNow()}.`);
      }
    } catch (err) {
      sendHadError = true;
      console.error(err);
      removeTypingBubble();
      appendMessage("assistant", `I hit a problem: ${err?.message || "Unknown error"}`);
      setStatus("Something went wrong.");
    } finally {
      removeTypingBubble();
      isSending = false;
      if (sendBtn) sendBtn.disabled = false;
      scrollChatToBottom();

      // Final safeguard so the footer never stays stuck on a transient sending/thinking state
      const currentStatus = (statusLine?.textContent || "").trim().toLowerCase();
      const looksTransient =
        currentStatus === "" ||
        currentStatus.includes("sending") ||
        currentStatus.includes("thinking");

      if (!sendHadError && looksTransient) {
        if (builderReturned) {
          setStatus(`Builder preview ready at ${formatNow()}.`);
        } else {
          setStatus(statusTextFromPlan(SIMO.plan || "free"));
        }
      }
    }
  }

  // -----------------------------
  // Status rotation
  // -----------------------------
  const statusPhrases = [
    "Simo is online and ready.",
    "Chat, builder, and image tools are standing by.",
    "Upload an image or ask Simo to build a page.",
    "Your best-friend AI is warmed up.",
    "You’re close — this feels launch-ready."
  ];
  let statusIndex = 0;

  function rotateStatus() {
    if (isSending) return;
    if (!statusLine) return;
    statusLine.textContent = statusPhrases[statusIndex % statusPhrases.length];
    statusIndex += 1;
  }

  // -----------------------------
  // Modal wiring
  // -----------------------------
  function wireModals() {
    proBtn?.addEventListener("click", () => openModal(proModal));
    closeProModal?.addEventListener("click", () => closeModal(proModal));

    settingsBtn?.addEventListener("click", () => {
      loadSettingsIntoUI();
      openModal(settingsModal);
    });

    closeSettings?.addEventListener("click", () => closeModal(settingsModal));
    saveSettingsBtn?.addEventListener("click", saveSettingsFromUI);
    resetSettingsBtn?.addEventListener("click", resetSettings);

    youBtn?.addEventListener("click", async () => {
      await refreshAccountUI();
      openModal(accountModal);
    });

    closeAccount?.addEventListener("click", () => closeModal(accountModal));

    closeBuilderPreviewBtn?.addEventListener("click", closeBuilderPreview);
    closeBuilderPreviewFooterBtn?.addEventListener("click", closeBuilderPreview);

    openLibraryBtn?.addEventListener("click", () => {
      renderLibrary();
      openModal(libraryModal);
    });

    builderLibrarySideBtn?.addEventListener("click", () => {
      renderLibrary();
      openModal(libraryModal);
    });

    closeLibraryBtn?.addEventListener("click", () => closeModal(libraryModal));

    document.querySelectorAll(".modal").forEach((modal) => {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal(modal);
      });
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllModals();
    });
  }

  // -----------------------------
  // Builder controls
  // -----------------------------
  function wireBuilderControls() {
    showHtmlBtn?.addEventListener("click", () => {
      if (!builderHtmlWrap) return;
      builderHtmlWrap.classList.toggle("hidden");
      setStatus(builderHtmlWrap.classList.contains("hidden") ? "HTML hidden." : "HTML shown.");
    });

    openBuilderNewTabBtn?.addEventListener("click", () => {
      if (!currentBuilderHtml) {
        setStatus("No preview available.");
        return;
      }

      const blob = new Blob([currentBuilderHtml], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setStatus("Preview opened in new tab.");
    });

    publishBuildBtn?.addEventListener("click", async () => {
      await publishHtmlViaApi(currentBuilderName || "published-page", currentBuilderHtml);
    });

    downloadHtmlBtn?.addEventListener("click", async () => {
      await downloadHtmlViaApi(currentBuilderName || "simo-project", currentBuilderHtml);
    });

    saveBuildBtn?.addEventListener("click", saveCurrentBuildToLibrary);
  }

  // -----------------------------
  // Core events
  // -----------------------------
  function wireCoreEvents() {
    sendBtn?.addEventListener("click", handleSend);

    inputEl?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    newChatBtn?.addEventListener("click", () => {
      if (!confirm("Start a new chat?")) return;
      clearChatUI();
      clearStagedImage();
      if (inputEl) inputEl.value = "";
      if (welcomeCard) welcomeCard.classList.remove("hidden");
      setStatus("New chat started.");
    });

    clearBtn?.addEventListener("click", () => {
      if (!confirm("Clear current chat history?")) return;
      clearChatUI();
      clearStagedImage();
      setStatus("Chat cleared.");
    });

    imgBtn?.addEventListener("click", () => imagePick?.click());

    micBtn?.addEventListener("click", () => {
      setStatus("Voice is coming soon.");
    });

    imagePick?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (file) await stageImageFile(file);
    });

    removeImageBtn?.addEventListener("click", () => {
      clearStagedImage();
      setStatus("Image removed.");
    });

    document.addEventListener("paste", async (e) => {
      const items = Array.from(e.clipboardData?.items || []);
      const imgItem = items.find((i) => i.type?.startsWith("image/"));
      if (!imgItem) return;
      const file = imgItem.getAsFile();
      if (file) await stageImageFile(file);
    });

    document.addEventListener("dragover", (e) => e.preventDefault());
    document.addEventListener("drop", async (e) => {
      e.preventDefault();
      const file = Array.from(e.dataTransfer?.files || []).find((f) => f.type?.startsWith("image/"));
      if (file) await stageImageFile(file);
    });

    imageDropZone?.addEventListener("dragover", (e) => {
      e.preventDefault();
      imageDropZone.style.borderColor = "rgba(121,166,255,.45)";
    });

    imageDropZone?.addEventListener("dragleave", () => {
      imageDropZone.style.borderColor = "";
    });

    imageDropZone?.addEventListener("drop", async (e) => {
      e.preventDefault();
      imageDropZone.style.borderColor = "";
      const file = Array.from(e.dataTransfer?.files || []).find((f) => f.type?.startsWith("image/"));
      if (file) await stageImageFile(file);
    });

    signupBtn?.addEventListener("click", async () => {
      const me = await fetchMe();
      if (me?.logged_in) {
        await refreshAccountUI();
        openModal(accountModal);
      } else {
        window.location.href = "/login";
      }
    });

    exportLibraryBtn?.addEventListener("click", exportLibrary);

    importLibraryBtn?.addEventListener("click", () => {
      importLibraryFile?.click();
    });

    importLibraryFile?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) importLibraryFromFile(file);
      if (importLibraryFile) importLibraryFile.value = "";
    });
  }

  // -----------------------------
  // Stripe
  // -----------------------------
  function wireStripe() {
    buySingleMonthly?.addEventListener("click", () => startCheckout("single_monthly"));
    buySingleYearly?.addEventListener("click", () => startCheckout("single_yearly"));
    buyTeamMonthly?.addEventListener("click", () => startCheckout("team_monthly"));
    buyTeamYearly?.addEventListener("click", () => startCheckout("team_yearly"));
  }

  // -----------------------------
  // Welcome / boot
  // -----------------------------
  function bootGreeting() {
    if (!chatEl || chatEl.children.length) return;

    appendMessage(
      "assistant",
      SIMO.userEmail
        ? `Welcome back, ${SIMO.userEmail}. I’m ready when you are.`
        : "Hi — I’m Simo. Your best-friend AI is online and ready."
    );

    appendMessage(
      "assistant",
      "I can help with ideas, business plans, image analysis, writing, and premium landing-page generation."
    );
  }

  function initWelcomeState() {
    const dismissed = localStorage.getItem(WELCOME_DISMISSED_KEY) === "1";

    if (dismissed && welcomeCard && chatEl?.children?.length) {
      welcomeCard.classList.add("hidden");
    }

    if (welcomeCard) {
      welcomeCard.addEventListener("dblclick", () => {
        welcomeCard.classList.add("hidden");
        localStorage.setItem(WELCOME_DISMISSED_KEY, "1");
        setStatus("Welcome card hidden.");
      });
    }
  }

  // -----------------------------
  // Init
  // -----------------------------
  async function init() {
    wirePromptButtons();
    wireModals();
    wireBuilderControls();
    wireCoreEvents();
    wireStripe();

    loadSettingsIntoUI();
    restoreLastPreview();
    renderLibrary();
    initWelcomeState();
    bootGreeting();

    await refreshAccountUI();
    await refreshUsageStatus();
    updateDashboardCards(null, null);

    rotateStatus();
    setInterval(rotateStatus, 5000);

    console.log("Simo UI booted with matched backend.", {
      plan: SIMO.plan,
      isTeam: SIMO.isTeam,
      stripeMode: SIMO.stripeMode,
      userEmail: SIMO.userEmail
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
