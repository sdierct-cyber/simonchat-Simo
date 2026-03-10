// Simo V4.6.6 — stable chat + vision + image memory + builder preview modal + HTML download + 3D viewer + local builder library + stronger builder continuation detection + locked builder preview modal + reopen last preview button + better suggested save names + duplicate build in library + rename build in library + auto version naming + builder library search + library export/import backup + favorite pinned builds + build tags + build notes + archive/unarchive builds + library stats bar + library sort controls + premium sort control polish + quick filter chips + multi-tag filter support + clickable build tag filter sync + builder version history + undo builder changes + persisted last builder preview across reload + publish to web + live usage counter
(() => {
  if (window.__SIMO_BOOTED__) return;
  window.__SIMO_BOOTED__ = true;

  const $ = (id) => document.getElementById(id);

  // Core UI
  const chatEl = $("chatMessages");
  const inputEl = $("chatInput");
  const sendBtn = $("sendBtn");
  const newChatBtn = $("newChatBtn");
  const clearBtn = $("clearBtn");
  const statusLine = $("statusLine");

  // Sidebar buttons
  const sideItems = document.querySelectorAll(".sideItem[data-prompt]");
  const builderLibrarySideBtn = $("builderLibrarySideBtn");

  // Upgrade modal
  const proBtn = $("proBtn");
  const proModal = $("proModal");
  const closeProModal = $("closeProModal");
  const buySingleMonthly = $("buySingleMonthly");
  const buySingleYearly = $("buySingleYearly");
  const buyTeamMonthly = $("buyTeamMonthly");
  const buyTeamYearly = $("buyTeamYearly");

  // Settings modal
  const settingsBtn = $("settingsBtn");
  const signupBtn = $("signupBtn");
  const settingsModal = $("settingsModal");
  const closeSettings = $("closeSettings");
  const saveSettingsBtn = $("saveSettings");
  const resetSettingsBtn = $("resetSettings");
  const setVoice = $("setVoice");
  const setStyle = $("setStyle");
  const setLang = $("setLang");
  const setTheme = $("setTheme");

  // Account modal
  const youBtn = $("youBtn");
  const accountModal = $("accountModal");
  const closeAccount = $("closeAccount");
  const accEmail = $("accEmail");
  const accPlan = $("accPlan");

  // Image upload UI
  const imgBtn = $("imgBtn");
  const imagePick = $("imagePick");
  const imageStage = $("imageStage");
  const imageDropZone = $("imageDropZone");
  const imagePreview = $("imagePreview");
  const imageName = $("imageName");
  const removeImageBtn = $("removeImageBtn");

  const BOOT = window.SIMO_BOOT || {
    plan: "free",
    isTeam: false,
    stripeMode: "test",
    freeLimit: 50,
    userEmail: ""
  };

  const LS_HISTORY = "simo_history_v3";
  const LS_SETTINGS = "simo_settings_v1";
  const LS_BUILDS = "simo_builder_library_v1";
  const LS_LAST_BUILDER = "simo_last_builder_preview_v1";

  const state = {
    plan: BOOT.plan || "free",
    pro: BOOT.plan === "single" || BOOT.plan === "team",
    isTeam: !!BOOT.isTeam || BOOT.plan === "team",
    stripeMode: BOOT.stripeMode || "test",
    freeLimit: Number(BOOT.freeLimit || 50),
    usedToday: 0,
    history: loadHistory(),
    settings: loadSettings(),
    pendingImageFile: null,
    pendingImagePreviewUrl: "",
    lastBuilder: null,
    builderVersions: [],
    builderVersionIndex: -1,
    librarySearch: "",
    libraryShowArchived: false,
    librarySort: "newest",
    libraryQuickFilter: "all",
    librarySelectedTag: "",
    statusText: "",
    statusTimer: null
  };

  // 3D viewer refs/runtime
  let modelViewerLoadPromise = null;
  let viewerModalEl = null;
  let viewerUrlEl = null;
  let viewerLoadBtnEl = null;
  let viewerCloseBtnEl = null;
  let viewerStatusEl = null;
  let viewerModelWrapEl = null;
  let viewerTitleEl = null;

  // Builder preview refs/runtime
  let builderModalEl = null;
  let builderFrameEl = null;
  let builderHtmlWrapEl = null;
  let builderHtmlViewEl = null;
  let builderCloseBtnEl = null;
  let builderCloseFooterBtnEl = null;
  let builderOpenNewBtnEl = null;
  let builderCodeBtnEl = null;
  let builderDownloadBtnEl = null;
  let builderSaveBtnEl = null;
  let builderOpenLibraryBtnEl = null;
  let builderPublishBtnEl = null;
  let undoBuilderBtnEl = null;
  let builderVersionInfoEl = null;

  // Reopen last preview button/runtime
  let reopenLastPreviewBtnEl = null;

  // Library modal refs/runtime
  let libraryModalEl = null;
  let closeLibraryBtnEl = null;
  let libraryEmptyEl = null;
  let libraryListEl = null;
  let librarySearchEl = null;
  let librarySortEl = null;
  let exportLibraryBtnEl = null;
  let importLibraryBtnEl = null;
  let importLibraryFileEl = null;
  let toggleArchivedBtnEl = null;
  let libraryStatsEl = null;
  let libraryQuickFiltersEl = null;
  let libraryTagFiltersEl = null;

  const MODEL_URLS = {
    astronaut: "https://modelviewer.dev/shared-assets/models/Astronaut.glb",
    toyCar: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/ToyCar/glTF-Binary/ToyCar.glb",
    duck: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Duck/glTF-Binary/Duck.glb",
    helmet: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb",
    avocado: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Avocado/glTF-Binary/Avocado.glb"
  };

  const BUILDER_TRIGGERS = [
    "build",
    "create a page",
    "create page",
    "landing page",
    "website",
    "web page",
    "html page",
    "portfolio site",
    "portfolio website",
    "app layout",
    "build me",
    "make me a page",
    "make a page",
    "make me a website",
    "make a website",
    "generate html",
    "generate a page",
    "generate website",
    "design a landing page",
    "design a website",
    "homepage",
    "home page",
    "builder",
    "build a",
    "build an",
    "create a landing page",
    "create a website",
    "create a homepage",
    "create a home page",
    "make a landing page",
    "make a homepage",
    "make a home page",
    "make me a landing page"
  ];

  const BUILDER_FOLLOWUP_PHRASES = [
    "make the buttons",
    "change the buttons",
    "make it gold",
    "make it purple",
    "make it blue",
    "make it darker",
    "make it lighter",
    "change the colors",
    "change the color",
    "change the background",
    "change the headline",
    "change the title",
    "change the hero",
    "change the hero image",
    "change the image",
    "change the layout",
    "update the page",
    "update the layout",
    "edit the page",
    "edit the layout",
    "add testimonials",
    "add pricing",
    "add a pricing section",
    "add a contact section",
    "add a contact form",
    "add a footer",
    "add a navbar",
    "add a hero",
    "add a hero section",
    "add a section",
    "remove testimonials",
    "remove pricing",
    "remove the footer",
    "remove the hero",
    "replace the image",
    "swap the image",
    "make it luxury",
    "make it luxurious",
    "make it modern",
    "make it elegant",
    "make it premium",
    "make the text bigger",
    "make the buttons rounded",
    "make the buttons more premium",
    "make the font bigger",
    "make the page cleaner",
    "make it more minimal",
    "make it more luxurious",
    "restyle the page",
    "redesign the page"
  ];

  const BUILDER_EDIT_WORDS = [
    "change",
    "update",
    "edit",
    "make",
    "add",
    "remove",
    "replace",
    "swap",
    "use",
    "turn",
    "restyle",
    "redesign",
    "refine",
    "improve"
  ];

  const BUILDER_TARGET_WORDS = [
    "button",
    "buttons",
    "color",
    "colors",
    "background",
    "layout",
    "page",
    "site",
    "website",
    "hero",
    "headline",
    "title",
    "section",
    "pricing",
    "testimonial",
    "testimonials",
    "footer",
    "navbar",
    "nav",
    "image",
    "images",
    "font",
    "text",
    "cta",
    "form",
    "contact",
    "menu",
    "card",
    "cards"
  ];

  function ensureLibraryControlStyles() {
    if (document.getElementById("simoLibraryControlStyles")) return;

    const style = document.createElement("style");
    style.id = "simoLibraryControlStyles";
    style.textContent = `
      .simoLibraryControlsGrid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 190px;
        gap: 10px;
      }

      .simoLibrarySearchInput {
        width: 100%;
        padding: 12px 14px;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,.12);
        background:
          linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,.02)),
          rgba(255,255,255,.03);
        color: #eef2ff;
        outline: none;
        font-size: 14px;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.03);
      }

      .simoLibrarySearchInput::placeholder {
        color: #93a4c7;
      }

      .simoLibrarySearchInput:focus {
        border-color: rgba(106, 147, 255, .45);
        box-shadow:
          0 0 0 1px rgba(106, 147, 255, .18),
          0 0 24px rgba(86, 100, 255, .12),
          inset 0 1px 0 rgba(255,255,255,.04);
      }

      .simoLibrarySortWrap {
        position: relative;
      }

      .simoLibrarySortWrap::after {
        content: "";
        position: absolute;
        right: 14px;
        top: 50%;
        width: 10px;
        height: 10px;
        border-right: 2px solid #d7e2ff;
        border-bottom: 2px solid #d7e2ff;
        transform: translateY(-65%) rotate(45deg);
        pointer-events: none;
        opacity: .9;
      }

      .simoLibrarySortSelect {
        appearance: none;
        -webkit-appearance: none;
        -moz-appearance: none;
        width: 100%;
        padding: 12px 42px 12px 14px;
        border-radius: 14px;
        border: 1px solid rgba(120, 134, 255, .20);
        background:
          radial-gradient(circle at top left, rgba(99,102,241,.18), transparent 38%),
          linear-gradient(180deg, rgba(17,24,39,.98), rgba(11,16,28,.98));
        color: #eef2ff;
        outline: none;
        font-size: 14px;
        font-weight: 700;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.04),
          0 10px 24px rgba(0,0,0,.18);
        cursor: pointer;
      }

      .simoLibrarySortSelect:hover {
        border-color: rgba(120, 134, 255, .34);
      }

      .simoLibrarySortSelect:focus {
        border-color: rgba(106, 147, 255, .50);
        box-shadow:
          0 0 0 1px rgba(106, 147, 255, .18),
          0 0 24px rgba(86, 100, 255, .14),
          inset 0 1px 0 rgba(255,255,255,.04);
      }

      .simoLibrarySortSelect option {
        color: #0f172a;
        background: #ffffff;
      }

      .simoLibraryQuickFilters,
      .simoLibraryTagFilters {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .simoLibraryChip,
      .simoLibraryTagChip {
        border: 1px solid rgba(255,255,255,.12);
        background:
          linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,.02)),
          rgba(255,255,255,.03);
        color: #dbe4ff;
        border-radius: 999px;
        padding: 9px 14px;
        font-size: 13px;
        font-weight: 800;
        cursor: pointer;
        transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;
      }

      .simoLibraryChip:hover,
      .simoLibraryTagChip:hover {
        transform: translateY(-1px);
        border-color: rgba(130, 147, 255, .28);
      }

      .simoLibraryChip.isActive,
      .simoLibraryTagChip.isActive {
        color: #ffffff;
        border-color: rgba(106,147,255,.38);
        background:
          radial-gradient(circle at top left, rgba(99,102,241,.28), transparent 40%),
          linear-gradient(180deg, rgba(25,35,70,.98), rgba(12,18,34,.98));
        box-shadow:
          0 8px 20px rgba(39, 56, 130, .22),
          inset 0 1px 0 rgba(255,255,255,.05);
      }

      .simoLibraryTagChip {
        padding: 8px 12px;
        font-size: 12px;
      }

      .simoLibraryTagBar {
        border: 1px solid rgba(255,255,255,.08);
        background: rgba(255,255,255,.025);
        border-radius: 14px;
        padding: 12px;
      }

      .simoBuildCardTag {
        display: inline-flex;
        align-items: center;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(99,102,241,.16);
        border: 1px solid rgba(99,102,241,.28);
        color: #dbe4ff;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }

      .simoBuildCardTag:hover {
        border-color: rgba(120, 140, 255, .42);
        transform: translateY(-1px);
      }

      .simoBuildCardTag.isActive {
        color: #ffffff;
        background:
          radial-gradient(circle at top left, rgba(99,102,241,.30), transparent 45%),
          linear-gradient(180deg, rgba(34,47,100,.96), rgba(18,26,50,.96));
        border-color: rgba(120, 140, 255, .44);
      }

      .simoBuilderVersionInfo {
        margin-left: auto;
        font-size: 12px;
        color: #9fb0d4;
        font-weight: 700;
      }

      @media (max-width: 760px) {
        .simoLibraryControlsGrid {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getIdleStatusText() {
    if (state.plan === "team") {
      return "PRO TEAM active";
    }
    if (state.plan === "single") {
      return "SIMO PRO active";
    }
    return `Free: ${state.usedToday} / ${state.freeLimit} messages today`;
  }

  function renderStatusLine() {
    if (!statusLine) return;
    statusLine.textContent = state.statusText || getIdleStatusText();
  }

  function setStatus(text, options = {}) {
    const { sticky = false, duration = 2200 } = options;

    if (state.statusTimer) {
      clearTimeout(state.statusTimer);
      state.statusTimer = null;
    }

    state.statusText = String(text || "");
    renderStatusLine();

    if (!sticky && state.statusText) {
      state.statusTimer = setTimeout(() => {
        state.statusText = "";
        state.statusTimer = null;
        renderStatusLine();
      }, duration);
    }
  }

  function scrollToBottom() {
    if (!chatEl) return;
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function addMessage(role, content, allowHtml = false) {
    if (!chatEl) return;
    const el = document.createElement("div");
    el.className = `msg ${role}`;
    el.dataset.role = role;

    if (allowHtml) {
      el.innerHTML = (content || "").toString();
    } else {
      el.textContent = (content || "").toString();
    }

    chatEl.appendChild(el);
    scrollToBottom();
  }

  function buildImageBubbleHtml(imageUrl, captionText = "") {
    const safeCaption = escapeHtml(captionText);
    return `
      <div class="userImageBubble">
        <img src="${imageUrl}" alt="Uploaded image" class="userImageBubbleImg" />
        ${safeCaption ? `<div class="userImageBubbleCaption">${safeCaption}</div>` : ""}
      </div>
    `;
  }

  function ensureSingleGreeting() {
    if (!chatEl) return;
    const hasAssistant = chatEl.querySelector('[data-role="assistant"]');
    if (hasAssistant) return;
    addMessage(
      "assistant",
      "Hey! I’m Simo 😊 Here whenever you need to vent, share ideas, brainstorm, or just talk. What’s on your mind?"
    );
  }

  function renderAll() {
    if (!chatEl) return;
    chatEl.innerHTML = "";
    for (const m of state.history) addMessage(m.role, m.content);
    ensureSingleGreeting();
    scrollToBottom();
  }

  function saveHistory() {
    try {
      localStorage.setItem(LS_HISTORY, JSON.stringify(state.history));
    } catch {}
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(LS_HISTORY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (x) =>
            x &&
            (x.role === "user" || x.role === "assistant") &&
            typeof x.content === "string"
        )
        .slice(-160);
    } catch {
      return [];
    }
  }

  function saveLastBuilderPreview(builder) {
    try {
      if (!builder || typeof builder !== "object" || !builder.html || typeof builder.html !== "string") {
        localStorage.removeItem(LS_LAST_BUILDER);
        return;
      }

      const payload = {
        title: String(builder.title || "Untitled Build"),
        summary: String(builder.summary || "Generated by Simo"),
        html: String(builder.html || ""),
        savedAt: new Date().toISOString()
      };

      localStorage.setItem(LS_LAST_BUILDER, JSON.stringify(payload));
    } catch {}
  }

  function loadLastBuilderPreview() {
    try {
      const raw = localStorage.getItem(LS_LAST_BUILDER);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      if (!parsed.html || typeof parsed.html !== "string") return null;

      return {
        title: String(parsed.title || "Recovered Build"),
        summary: String(parsed.summary || "Recovered preview"),
        html: String(parsed.html || "")
      };
    } catch {
      return null;
    }
  }

  function clearLastBuilderPreview() {
    try {
      localStorage.removeItem(LS_LAST_BUILDER);
    } catch {}
  }

  function seedBuilderVersionsFromLastBuilder(builder) {
    if (!builder || !builder.html) {
      state.builderVersions = [];
      state.builderVersionIndex = -1;
      return;
    }

    state.builderVersions = [{
      id: `version_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: builder.title || "Untitled Build",
      summary: builder.summary || "Recovered preview",
      html: builder.html,
      createdAt: new Date().toISOString()
    }];
    state.builderVersionIndex = 0;
  }

  function clearHistory() {
    state.history = [];
    saveHistory();
    renderAll();
    clearPendingImage();
    state.lastBuilder = null;
    state.builderVersions = [];
    state.builderVersionIndex = -1;
    clearLastBuilderPreview();
    updateReopenLastPreviewButton();
    updateBuilderVersionInfo();
    state.statusText = "";
    renderStatusLine();
  }

  function loadSettings() {
    const defaults = {
      voice: false,
      style: "friendly",
      language: "en",
      theme: "default"
    };

    try {
      const raw = localStorage.getItem(LS_SETTINGS);
      const s = raw ? JSON.parse(raw) : null;
      if (!s || typeof s !== "object") return defaults;

      return {
        voice: !!s.voice,
        style: s.style || "friendly",
        language: s.language || "en",
        theme: s.theme || "default"
      };
    } catch {
      return defaults;
    }
  }

  function saveSettingsLocal(s) {
    try {
      localStorage.setItem(LS_SETTINGS, JSON.stringify(s));
    } catch {}
  }

  function applyTheme(theme) {
    document.body.dataset.theme = theme || "default";
  }

  function syncSettingsUI() {
    if (setVoice) setVoice.checked = !!state.settings.voice;
    if (setStyle) setStyle.value = state.settings.style || "friendly";
    if (setLang) setLang.value = state.settings.language || "en";
    if (setTheme) setTheme.value = state.settings.theme || "default";
  }

  function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove("hidden");
    modalEl.setAttribute("aria-hidden", "false");
  }

  function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add("hidden");
    modalEl.setAttribute("aria-hidden", "true");
  }

  function normalizeBuilderText(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[_-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function hasAny(text, phrases) {
    return phrases.some((phrase) => text.includes(phrase));
  }

  function isBuilderFollowup(text) {
    const t = normalizeBuilderText(text);
    if (!t) return false;

    if (hasAny(t, BUILDER_FOLLOWUP_PHRASES)) return true;

    const shortText = t.split(" ").length <= 18;
    const hasEditWord = hasAny(t, BUILDER_EDIT_WORDS);
    const hasTargetWord = hasAny(t, BUILDER_TARGET_WORDS);

    return shortText && hasEditWord && hasTargetWord;
  }

  function isBuilderIntent(text) {
    const t = normalizeBuilderText(text);
    if (!t) return false;
    if (hasAny(t, BUILDER_TRIGGERS)) return true;
    if (state.lastBuilder && isBuilderFollowup(t)) return true;
    return false;
  }

  async function refreshStatus() {
    try {
      const r = await fetch("/api/status", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!j || !j.ok) {
        if (!state.statusText) renderStatusLine();
        return;
      }

      state.plan = j.plan || "free";
      state.isTeam = !!j.is_team || state.plan === "team";
      state.pro = state.plan === "single" || state.plan === "team";
      state.usedToday = Number(j.used_today || 0);
      state.freeLimit = Number(j.free_daily_limit || state.freeLimit);

      if (proBtn) {
        proBtn.classList.toggle("isTeam", state.isTeam);
        proBtn.classList.toggle("isPro", state.pro && !state.isTeam);
      }

      renderStatusLine();
    } catch {
      setStatus("Offline • Check server", { sticky: true });
    }
  }

  // -------------------------
  // Reopen Last Preview Button
  // -------------------------
  function ensureReopenLastPreviewButton() {
    if (reopenLastPreviewBtnEl) return;

    if (!document.getElementById("simoReopenPreviewStyles")) {
      const style = document.createElement("style");
      style.id = "simoReopenPreviewStyles";
      style.textContent = `
        .simoReopenPreviewBtn {
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 9998;
          border: 1px solid rgba(255,255,255,.16);
          background:
            radial-gradient(circle at top left, rgba(99,102,241,.35), transparent 40%),
            linear-gradient(180deg, rgba(12,18,37,.96), rgba(7,12,24,.96));
          color: #eef2ff;
          border-radius: 999px;
          padding: 12px 16px;
          font-size: 14px;
          font-weight: 800;
          cursor: pointer;
          display: none;
          align-items: center;
          gap: 8px;
          backdrop-filter: blur(8px);
        }

        .simoReopenPreviewBtn:hover {
          transform: translateY(-1px);
          box-shadow: 0 18px 44px rgba(0,0,0,.34);
        }

        .simoReopenPreviewBtn.isVisible {
          display: inline-flex;
        }
      `;
      document.head.appendChild(style);
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "reopenLastPreviewBtn";
    btn.className = "simoReopenPreviewBtn";
    btn.textContent = "Reopen Last Preview";
    btn.addEventListener("click", () => {
      reopenLastPreview();
    });

    document.body.appendChild(btn);
    reopenLastPreviewBtnEl = btn;
  }

  function isBuilderPreviewOpen() {
    return !!(builderModalEl && !builderModalEl.classList.contains("hidden"));
  }

  function updateReopenLastPreviewButton() {
    ensureReopenLastPreviewButton();
    if (!reopenLastPreviewBtnEl) return;
    const hasBuild = !!(state.lastBuilder && state.lastBuilder.html);
    const previewOpen = isBuilderPreviewOpen();
    reopenLastPreviewBtnEl.classList.toggle("isVisible", hasBuild && !previewOpen);
  }

  function reopenLastPreview() {
    if (!state.lastBuilder?.html) {
      setStatus("No previous preview to reopen");
      return;
    }
    renderBuilderPreview(state.lastBuilder, { skipVersionPush: true });
    setStatus("Last preview reopened");
  }

  // -------------------------
  // Builder version history
  // -------------------------
  function pushBuilderVersion(builder) {
    if (!builder || !builder.html) return;

    const normalized = {
      title: builder.title || "Untitled Build",
      summary: builder.summary || "Generated by Simo",
      html: builder.html
    };

    const current = getCurrentBuilderVersion();
    if (
      current &&
      current.html === normalized.html &&
      current.title === normalized.title &&
      current.summary === normalized.summary
    ) {
      return;
    }

    if (state.builderVersionIndex < state.builderVersions.length - 1) {
      state.builderVersions = state.builderVersions.slice(0, state.builderVersionIndex + 1);
    }

    const version = {
      id: `version_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: normalized.title,
      summary: normalized.summary,
      html: normalized.html,
      createdAt: new Date().toISOString()
    };

    state.builderVersions.push(version);
    state.builderVersionIndex = state.builderVersions.length - 1;
  }

  function getCurrentBuilderVersion() {
    if (state.builderVersionIndex < 0 || state.builderVersionIndex >= state.builderVersions.length) {
      return null;
    }
    return state.builderVersions[state.builderVersionIndex] || null;
  }

  function updateBuilderVersionInfo() {
    if (!builderVersionInfoEl) return;

    const total = state.builderVersions.length;
    const current = state.builderVersionIndex >= 0 ? state.builderVersionIndex + 1 : 0;

    if (!total) {
      builderVersionInfoEl.textContent = "No versions yet";
      if (undoBuilderBtnEl) undoBuilderBtnEl.disabled = true;
      return;
    }

    builderVersionInfoEl.textContent = `Version ${current} of ${total}`;
    if (undoBuilderBtnEl) undoBuilderBtnEl.disabled = current <= 1;
  }

  function restoreBuilderVersion(index) {
    if (index < 0 || index >= state.builderVersions.length) {
      setStatus("Version not found");
      return;
    }

    state.builderVersionIndex = index;
    const version = state.builderVersions[index];
    if (!version?.html) {
      setStatus("Version data missing");
      return;
    }

    state.lastBuilder = {
      title: version.title || "Untitled Build",
      summary: version.summary || "Generated by Simo",
      html: version.html
    };

    renderBuilderPreview(state.lastBuilder, { skipVersionPush: true });
    updateBuilderVersionInfo();
    setStatus(`Restored builder version ${index + 1}`);
  }

  function undoBuilderVersion() {
    if (state.builderVersionIndex <= 0) {
      setStatus("No earlier builder version");
      return;
    }

    restoreBuilderVersion(state.builderVersionIndex - 1);
    addMessage("assistant", "Restored the previous builder version.");
  }

  // -------------------------
  // Builder library helpers
  // -------------------------
  function normalizeSearchText(text) {
    return String(text || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, " and ")
      .replace(/[^a-zA-Z0-9, ]+/g, " ")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function htmlToSearchText(html) {
    return String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, " and ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function cleanTagList(raw) {
    if (Array.isArray(raw)) {
      return [...new Set(
        raw
          .map((x) => String(x || "").trim())
          .filter(Boolean)
          .map((x) => x.replace(/\s+/g, " "))
      )];
    }

    return [...new Set(
      String(raw || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => x.replace(/\s+/g, " "))
    )];
  }

  function tagsToText(tags) {
    return cleanTagList(tags).join(", ");
  }

  function cleanNoteText(note) {
    return String(note || "").replace(/\s+/g, " ").trim();
  }

  function buildSearchIndex(build) {
    return normalizeSearchText([
      build?.name || "",
      build?.title || "",
      build?.summary || "",
      tagsToText(build?.tags || []),
      cleanNoteText(build?.notes || ""),
      htmlToSearchText(build?.html || "")
    ].join(" "));
  }

  function titleCaseWords(text) {
    const smallWords = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);
    const specialWords = {
      saas: "SaaS",
      ai: "AI",
      html: "HTML",
      "3d": "3D",
      ui: "UI",
      ux: "UX",
      cta: "CTA"
    };

    return String(text || "")
      .trim()
      .split(/\s+/)
      .map((word, index) => {
        const clean = word.toLowerCase();
        if (specialWords[clean]) return specialWords[clean];
        if (index > 0 && smallWords.has(clean)) return clean;
        return clean.charAt(0).toUpperCase() + clean.slice(1);
      })
      .join(" ");
  }

  function cleanSuggestedBuildName(raw) {
    let text = String(raw || "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[“”"']/g, "")
      .trim();

    if (!text) return "";

    text = text
      .replace(/\bpage\b/gi, "")
      .replace(/\bwebsite\b/gi, "")
      .replace(/\bsite\b/gi, "")
      .replace(/\blanding\b/gi, "Landing")
      .replace(/\bcopy\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    return titleCaseWords(text);
  }

  function getBaseVersionName(raw) {
    const cleaned = cleanSuggestedBuildName(raw || "");
    return cleaned.replace(/\s+v\d+$/i, "").trim();
  }

  function getNextVersionedName(baseName, builds) {
    const base = getBaseVersionName(baseName) || "Simo Build";
    let maxVersion = 0;

    builds.forEach((build) => {
      const name = String(build?.name || build?.title || "").trim();
      const normalized = getBaseVersionName(name);

      if (normalized.toLowerCase() !== base.toLowerCase()) return;

      const match = name.match(/\bv(\d+)\s*$/i);
      if (match) {
        maxVersion = Math.max(maxVersion, Number(match[1]) || 0);
      } else if (cleanSuggestedBuildName(name).toLowerCase() === base.toLowerCase()) {
        maxVersion = Math.max(maxVersion, 1);
      }
    });

    return `${base} v${Math.max(1, maxVersion + 1)}`;
  }

  function withSearchIndex(build) {
    const copy = { ...(build || {}) };
    copy.name = copy.name || "";
    copy.title = copy.title || "";
    copy.summary = copy.summary || "";
    copy.html = copy.html || "";
    copy.savedAt = copy.savedAt || new Date().toISOString();
    copy.id = copy.id || `build_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    copy.isPinned = !!copy.isPinned;
    copy.isArchived = !!copy.isArchived;
    copy.tags = cleanTagList(copy.tags || []);
    copy.notes = cleanNoteText(copy.notes || "");
    copy.searchIndex = buildSearchIndex(copy);
    return copy;
  }

  function migrateBuilds(builds) {
    let changed = false;

    const migrated = (Array.isArray(builds) ? builds : []).map((build) => {
      const next = withSearchIndex(build);
      const oldIndex = String(build?.searchIndex || "");
      const oldTags = Array.isArray(build?.tags) ? build.tags : [];
      const oldNotes = String(build?.notes || "");

      if (
        !build ||
        oldIndex !== next.searchIndex ||
        !build.id ||
        typeof build.name !== "string" ||
        typeof build.title !== "string" ||
        typeof build.summary !== "string" ||
        typeof build.html !== "string" ||
        typeof build.isPinned !== "boolean" ||
        typeof build.isArchived !== "boolean" ||
        !Array.isArray(build.tags) ||
        JSON.stringify(cleanTagList(oldTags)) !== JSON.stringify(next.tags) ||
        cleanNoteText(oldNotes) !== next.notes
      ) {
        changed = true;
      }

      return next;
    });

    return { migrated, changed };
  }

  function loadBuilds() {
    try {
      const raw = localStorage.getItem(LS_BUILDS);
      const parsed = raw ? JSON.parse(raw) : [];
      const { migrated, changed } = migrateBuilds(parsed);

      if (changed) {
        localStorage.setItem(LS_BUILDS, JSON.stringify(migrated));
      }

      return migrated;
    } catch {
      return [];
    }
  }

  function saveBuilds(builds) {
    try {
      const { migrated } = migrateBuilds(builds);
      localStorage.setItem(LS_BUILDS, JSON.stringify(migrated));
    } catch {}
  }

  function getSortedBuilds(builds) {
    const list = [...builds];

    list.sort((a, b) => {
      if (!!a.isArchived !== !!b.isArchived) return a.isArchived ? 1 : -1;
      if (!!a.isPinned !== !!b.isPinned) return a.isPinned ? -1 : 1;

      const nameA = (a.name || a.title || "").toLowerCase();
      const nameB = (b.name || b.title || "").toLowerCase();
      const timeA = new Date(a.savedAt || 0).getTime();
      const timeB = new Date(b.savedAt || 0).getTime();

      switch (state.librarySort) {
        case "oldest":
          return timeA - timeB;
        case "name_asc":
          return nameA.localeCompare(nameB);
        case "name_desc":
          return nameB.localeCompare(nameA);
        case "newest":
        default:
          return timeB - timeA;
      }
    });

    return list;
  }

  function getLibraryStats(builds) {
    const list = Array.isArray(builds) ? builds : [];
    const total = list.length;
    const active = list.filter((b) => !b.isArchived).length;
    const archived = list.filter((b) => !!b.isArchived).length;
    const pinned = list.filter((b) => !!b.isPinned && !b.isArchived).length;
    const tagged = list.filter((b) => Array.isArray(b.tags) && b.tags.length > 0).length;

    return { total, active, archived, pinned, tagged };
  }

  function renderLibraryStats(builds) {
    if (!libraryStatsEl) return;

    const stats = getLibraryStats(builds);

    libraryStatsEl.innerHTML = `
      <div style="
        display:grid;
        grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
        gap:10px;
      ">
        ${renderStatCard("Total", stats.total)}
        ${renderStatCard("Active", stats.active)}
        ${renderStatCard("Archived", stats.archived)}
        ${renderStatCard("Pinned", stats.pinned)}
        ${renderStatCard("Tagged", stats.tagged)}
      </div>
    `;
  }

  function renderStatCard(label, value) {
    return `
      <div style="
        border:1px solid rgba(255,255,255,.10);
        background:rgba(255,255,255,.03);
        border-radius:14px;
        padding:12px;
      ">
        <div style="font-size:12px; color:#9fb0d4; font-weight:700;">${escapeHtml(label)}</div>
        <div style="margin-top:6px; font-size:22px; color:#fff; font-weight:900;">${escapeHtml(String(value))}</div>
      </div>
    `;
  }

  function formatWhen(iso) {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return "Unknown time";
    }
  }

  function suggestBuildName() {
    const title = cleanSuggestedBuildName(state.lastBuilder?.title || "");
    const summary = cleanSuggestedBuildName(state.lastBuilder?.summary || "");

    const blocked = new Set([
      "",
      "Untitled Build",
      "Generated By Simo",
      "Simo Build"
    ]);

    if (title && !blocked.has(title)) return title;
    if (summary && !blocked.has(summary)) return summary;
    return "Simo Build";
  }

  function createLibraryBackupObject(builds) {
    return {
      app: "Simo",
      type: "builder-library-backup",
      version: "4.6.6",
      exportedAt: new Date().toISOString(),
      count: Array.isArray(builds) ? builds.length : 0,
      builds: (Array.isArray(builds) ? builds : []).map((build) => withSearchIndex(build))
    };
  }

  function exportLibraryBuilds() {
    const builds = loadBuilds();
    if (!builds.length) {
      setStatus("No library builds to export");
      addMessage("assistant", "Your Builder Library is empty, so there’s nothing to export yet.");
      return;
    }

    try {
      const backup = createLibraryBackupObject(builds);
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const a = document.createElement("a");
      a.href = url;
      a.download = `simo-builder-library-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => {
        try { URL.revokeObjectURL(url); } catch {}
      }, 5000);

      setStatus("Library exported");
      addMessage("assistant", `Exported ${builds.length} build${builds.length === 1 ? "" : "s"} from your Builder Library.`);
    } catch {
      setStatus("Export failed");
      addMessage("assistant", "Could not export the Builder Library right now.");
    }
  }

  function mergeImportedBuilds(importedBuilds) {
    const current = loadBuilds();
    const seen = new Set();
    const merged = [];

    function fingerprint(build) {
      return [
        normalizeSearchText(build?.name || ""),
        normalizeSearchText(build?.title || ""),
        normalizeSearchText(build?.summary || ""),
        normalizeSearchText(tagsToText(build?.tags || [])),
        normalizeSearchText(cleanNoteText(build?.notes || "")),
        normalizeSearchText(build?.html || "")
      ].join("||");
    }

    [...importedBuilds, ...current].forEach((build) => {
      const normalized = withSearchIndex(build);
      const key = normalized.id || fingerprint(normalized);
      const alt = fingerprint(normalized);

      if (seen.has(key) || seen.has(alt)) return;
      seen.add(key);
      seen.add(alt);
      merged.push(normalized);
    });

    return getSortedBuilds(merged);
  }

  async function importLibraryBuildsFromFile(file) {
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      let builds = [];
      if (Array.isArray(parsed)) {
        builds = parsed;
      } else if (parsed && Array.isArray(parsed.builds)) {
        builds = parsed.builds;
      }

      if (!builds.length) {
        setStatus("Import failed");
        addMessage("assistant", "That file does not contain any Builder Library builds.");
        return;
      }

      const merged = mergeImportedBuilds(builds);
      saveBuilds(merged);
      renderLibraryList();
      setStatus("Library imported");
      addMessage("assistant", `Imported library backup. You now have ${merged.length} total build${merged.length === 1 ? "" : "s"} in Builder Library.`);
    } catch {
      setStatus("Import failed");
      addMessage("assistant", "That backup file could not be imported.");
    } finally {
      if (importLibraryFileEl) importLibraryFileEl.value = "";
    }
  }

  function saveCurrentBuild() {
    if (!state.lastBuilder?.html) {
      addMessage("assistant", "There’s no build to save yet. Generate one first.");
      setStatus("No build to save");
      return;
    }

    if (!state.pro) {
      addMessage("assistant", "Saving builds is part of Pro. Upgrade to keep projects in your Builder Library.");
      setStatus("Save is Pro only");
      openModal(proModal);
      return;
    }

    const builds = loadBuilds();
    const suggested = getNextVersionedName(suggestBuildName(), builds);
    const name = window.prompt("Save build as:", suggested);

    if (!name || !name.trim()) {
      setStatus("Save cancelled");
      return;
    }

    const finalName = cleanSuggestedBuildName(name.trim()) || suggested;
    const now = new Date().toISOString();

    builds.unshift(withSearchIndex({
      id: `build_${Date.now()}`,
      name: finalName,
      title: state.lastBuilder.title || finalName,
      summary: state.lastBuilder.summary || "Generated by Simo",
      html: state.lastBuilder.html,
      savedAt: now,
      isPinned: false,
      isArchived: false,
      tags: [],
      notes: ""
    }));

    saveBuilds(getSortedBuilds(builds));
    renderLibraryList();
    setStatus("Build saved");
    addMessage("assistant", `Saved "${finalName}" to your Builder Library.`);
  }

  function duplicateSavedBuild(index) {
    const builds = loadBuilds();
    const build = builds[index];
    if (!build || !build.html) return;

    const baseName = getBaseVersionName(build.name || build.title || "Simo Build") || "Simo Build";
    const suggested = getNextVersionedName(baseName, builds);
    const chosen = window.prompt("Duplicate build as:", suggested);

    if (!chosen || !chosen.trim()) {
      setStatus("Duplicate cancelled");
      return;
    }

    const finalName = cleanSuggestedBuildName(chosen.trim()) || suggested;
    const now = new Date().toISOString();

    builds.unshift(withSearchIndex({
      id: `build_${Date.now()}`,
      name: finalName,
      title: build.title || finalName,
      summary: build.summary || "Generated by Simo",
      html: build.html,
      savedAt: now,
      isPinned: false,
      isArchived: false,
      tags: build.tags || [],
      notes: build.notes || ""
    }));

    saveBuilds(getSortedBuilds(builds));
    renderLibraryList();
    setStatus("Build duplicated");
    addMessage("assistant", `Duplicated "${build.name || "build"}" as "${finalName}".`);
  }

  function renameSavedBuild(index) {
    const builds = loadBuilds();
    const build = builds[index];
    if (!build) return;

    const currentName = cleanSuggestedBuildName(build.name || build.title || "Simo Build") || "Simo Build";
    const chosen = window.prompt("Rename build:", currentName);

    if (!chosen || !chosen.trim()) {
      setStatus("Rename cancelled");
      return;
    }

    build.name = cleanSuggestedBuildName(chosen.trim()) || currentName;
    build.searchIndex = buildSearchIndex(build);

    saveBuilds(getSortedBuilds(builds));
    renderLibraryList();
    setStatus("Build renamed");
    addMessage("assistant", `Renamed build to "${build.name}".`);
  }

  function editBuildTags(index) {
    const builds = loadBuilds();
    const build = builds[index];
    if (!build) return;

    const current = tagsToText(build.tags || []);
    const chosen = window.prompt("Edit tags (comma separated):", current);

    if (chosen === null) {
      setStatus("Tag edit cancelled");
      return;
    }

    build.tags = cleanTagList(chosen);
    build.searchIndex = buildSearchIndex(build);

    if (state.librarySelectedTag && !build.tags.includes(state.librarySelectedTag)) {
      state.librarySelectedTag = "";
    }

    saveBuilds(getSortedBuilds(builds));
    renderLibraryList();
    setStatus("Tags updated");

    if (build.tags.length) {
      addMessage("assistant", `Updated tags for "${build.name || "build"}" to: ${build.tags.join(", ")}.`);
    } else {
      addMessage("assistant", `Cleared tags for "${build.name || "build"}".`);
    }
  }

  function editBuildNotes(index) {
    const builds = loadBuilds();
    const build = builds[index];
    if (!build) return;

    const current = cleanNoteText(build.notes || "");
    const chosen = window.prompt("Edit note:", current);

    if (chosen === null) {
      setStatus("Note edit cancelled");
      return;
    }

    build.notes = cleanNoteText(chosen);
    build.searchIndex = buildSearchIndex(build);

    saveBuilds(getSortedBuilds(builds));
    renderLibraryList();
    setStatus("Note updated");

    if (build.notes) {
      addMessage("assistant", `Updated note for "${build.name || "build"}".`);
    } else {
      addMessage("assistant", `Cleared note for "${build.name || "build"}".`);
    }
  }

  function togglePinnedBuild(index) {
    const builds = loadBuilds();
    const build = builds[index];
    if (!build) return;

    build.isPinned = !build.isPinned;
    saveBuilds(getSortedBuilds(builds));
    renderLibraryList();

    if (build.isPinned) {
      setStatus("Build pinned");
      addMessage("assistant", `Pinned "${build.name || "build"}" to the top of Builder Library.`);
    } else {
      setStatus("Build unpinned");
      addMessage("assistant", `Unpinned "${build.name || "build"}".`);
    }
  }

  function toggleArchivedBuild(index) {
    const builds = loadBuilds();
    const build = builds[index];
    if (!build) return;

    build.isArchived = !build.isArchived;
    if (build.isArchived) build.isPinned = false;

    saveBuilds(getSortedBuilds(builds));

    if (!build.isArchived && state.libraryQuickFilter === "archived") {
      state.libraryQuickFilter = "all";
      state.libraryShowArchived = false;
    }

    renderLibraryList();

    if (build.isArchived) {
      setStatus("Build archived");
      addMessage("assistant", `Archived "${build.name || "build"}".`);
    } else {
      setStatus("Build unarchived");
      addMessage("assistant", `Unarchived "${build.name || "build"}".`);
    }
  }

  function getQuickFilterLabel(filter) {
    switch (filter) {
      case "pinned": return "Pinned";
      case "tagged": return "Tagged";
      case "notes": return "With Notes";
      case "archived": return "Archived";
      case "all":
      default: return "All";
    }
  }

  function applyLibraryQuickFilter(filter) {
    const next = String(filter || "all");

    if (next === "archived") {
      state.libraryQuickFilter = "archived";
      state.libraryShowArchived = true;
    } else {
      state.libraryQuickFilter = next;
      state.libraryShowArchived = false;
    }

    updateArchivedToggleButton();
    renderLibraryQuickFilters();
    renderLibraryTagFilters();
    renderLibraryList();
    setStatus(`Filter: ${getQuickFilterLabel(state.libraryQuickFilter)}`);
  }

  function applyLibraryTagFilter(tag) {
    const next = String(tag || "").trim();
    state.librarySelectedTag = next;
    renderLibraryTagFilters();
    renderLibraryList();
    setStatus(next ? `Tag filter: ${next}` : "Tag filter cleared");
  }

  function selectBuildCardTag(tag) {
    const next = String(tag || "").trim();

    if (!next) return;

    if (state.librarySelectedTag === next) {
      state.librarySelectedTag = "";
      if (state.libraryQuickFilter === "tagged") {
        state.libraryQuickFilter = "all";
        state.libraryShowArchived = false;
      }
      updateArchivedToggleButton();
      renderLibraryQuickFilters();
      renderLibraryTagFilters();
      renderLibraryList();
      setStatus("Tag filter cleared");
      return;
    }

    state.librarySelectedTag = next;

    if (state.libraryQuickFilter !== "archived") {
      state.libraryQuickFilter = "tagged";
      state.libraryShowArchived = false;
    }

    updateArchivedToggleButton();
    renderLibraryQuickFilters();
    renderLibraryTagFilters();
    renderLibraryList();
    setStatus(`Tag filter: ${next}`);
  }

  function getBuildsInCurrentView(builds) {
    let sorted = getSortedBuilds(builds);

    if (state.libraryQuickFilter === "archived") {
      sorted = sorted.filter((build) => !!build.isArchived);
    } else {
      sorted = sorted.filter((build) => !build.isArchived);

      if (state.libraryQuickFilter === "pinned") {
        sorted = sorted.filter((build) => !!build.isPinned);
      } else if (state.libraryQuickFilter === "tagged") {
        sorted = sorted.filter((build) => Array.isArray(build.tags) && build.tags.length > 0);
      } else if (state.libraryQuickFilter === "notes") {
        sorted = sorted.filter((build) => !!cleanNoteText(build.notes || ""));
      }
    }

    return sorted;
  }

  function getAvailableTagsForCurrentView(builds) {
    const tags = new Set();

    getBuildsInCurrentView(builds).forEach((build) => {
      cleanTagList(build.tags || []).forEach((tag) => tags.add(tag));
    });

    return [...tags].sort((a, b) => a.localeCompare(b));
  }

  function renderLibraryQuickFilters() {
    if (!libraryQuickFiltersEl) return;

    const chips = [
      { key: "all", label: "All" },
      { key: "pinned", label: "Pinned" },
      { key: "tagged", label: "Tagged" },
      { key: "notes", label: "With Notes" },
      { key: "archived", label: "Archived" }
    ];

    libraryQuickFiltersEl.innerHTML = `
      <div class="simoLibraryQuickFilters">
        ${chips.map((chip) => `
          <button
            type="button"
            class="simoLibraryChip ${state.libraryQuickFilter === chip.key ? "isActive" : ""}"
            data-library-chip="${chip.key}"
          >${escapeHtml(chip.label)}</button>
        `).join("")}
      </div>
    `;

    libraryQuickFiltersEl.querySelectorAll("[data-library-chip]").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyLibraryQuickFilter(btn.getAttribute("data-library-chip"));
      });
    });
  }

  function renderLibraryTagFilters() {
    if (!libraryTagFiltersEl) return;

    const builds = loadBuilds();
    const tags = getAvailableTagsForCurrentView(builds);

    if (!tags.length) {
      libraryTagFiltersEl.innerHTML = "";
      if (state.librarySelectedTag) state.librarySelectedTag = "";
      return;
    }

    if (state.librarySelectedTag && !tags.includes(state.librarySelectedTag)) {
      state.librarySelectedTag = "";
    }

    libraryTagFiltersEl.innerHTML = `
      <div class="simoLibraryTagBar">
        <div style="font-size:12px; color:#9fb0d4; font-weight:800; margin-bottom:10px;">
          Tag Filter ${state.librarySelectedTag ? `• Selected: ${escapeHtml(state.librarySelectedTag)}` : ""}
        </div>
        <div class="simoLibraryTagFilters">
          <button
            type="button"
            class="simoLibraryTagChip ${!state.librarySelectedTag ? "isActive" : ""}"
            data-library-tag=""
          >All Tags</button>
          ${tags.map((tag) => `
            <button
              type="button"
              class="simoLibraryTagChip ${state.librarySelectedTag === tag ? "isActive" : ""}"
              data-library-tag="${escapeHtml(tag)}"
            >${escapeHtml(tag)}</button>
          `).join("")}
          ${state.librarySelectedTag ? `
            <button
              type="button"
              class="simoLibraryTagChip"
              data-library-clear-tag="1"
            >Clear Tag Filter</button>
          ` : ""}
        </div>
      </div>
    `;

    libraryTagFiltersEl.querySelectorAll("[data-library-tag]").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyLibraryTagFilter(btn.getAttribute("data-library-tag"));
      });
    });

    libraryTagFiltersEl.querySelectorAll("[data-library-clear-tag]").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyLibraryTagFilter("");
      });
    });
  }

  function getFilteredBuildsWithIndex(builds, searchText) {
    let sorted = getBuildsInCurrentView(builds);

    if (state.librarySelectedTag) {
      sorted = sorted.filter((build) => cleanTagList(build.tags || []).includes(state.librarySelectedTag));
    }

    const q = normalizeSearchText(searchText);
    if (!q) {
      return sorted.map((build) => ({
        build,
        index: builds.findIndex((b) => b.id === build.id)
      }));
    }

    return sorted
      .map((build) => ({
        build,
        index: builds.findIndex((b) => b.id === build.id)
      }))
      .filter(({ build }) => {
        const haystack = String(build?.searchIndex || buildSearchIndex(build));
        return haystack.includes(q);
      });
  }

  function renderTagChips(tags) {
    const clean = cleanTagList(tags);
    if (!clean.length) return "";

    return `
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
        ${clean.map((tag) => `
          <button
            type="button"
            class="simoBuildCardTag ${state.librarySelectedTag === tag ? "isActive" : ""}"
            data-card-tag="${escapeHtml(tag)}"
          >${escapeHtml(tag)}</button>
        `).join("")}
      </div>
    `;
  }

  function renderNoteBlock(note) {
    const clean = cleanNoteText(note);
    if (!clean) return "";

    return `
      <div style="
        margin-top:10px;
        padding:10px 12px;
        border-radius:12px;
        background:rgba(255,255,255,.04);
        border:1px solid rgba(255,255,255,.08);
        color:#dbe4ff;
        font-size:13px;
        line-height:1.55;
      ">
        <div style="font-weight:800; font-size:12px; color:#aab7d4; margin-bottom:6px;">Note</div>
        <div>${escapeHtml(clean)}</div>
      </div>
    `;
  }

  function updateArchivedToggleButton() {
    if (!toggleArchivedBtnEl) return;
    toggleArchivedBtnEl.textContent = state.libraryShowArchived ? "Show Active" : "Show Archived";
  }

  function updateLibrarySortUI() {
    if (!librarySortEl) return;
    librarySortEl.value = state.librarySort || "newest";
  }

  function ensureLibraryModal() {
    if (libraryModalEl) return;

    ensureLibraryControlStyles();

    libraryModalEl = $("libraryModal");
    closeLibraryBtnEl = $("closeLibraryBtn");
    libraryEmptyEl = $("libraryEmpty");
    libraryListEl = $("libraryList");

    if (libraryModalEl && !document.getElementById("builderLibrarySearch")) {
      const controlsWrap = document.createElement("div");
      controlsWrap.style.padding = "12px 16px 0";
      controlsWrap.innerHTML = `
        <div class="simoLibraryControlsGrid">
          <input
            id="builderLibrarySearch"
            class="simoLibrarySearchInput"
            type="text"
            placeholder="Search builds, tags, or notes..."
            autocomplete="off"
          />
          <div class="simoLibrarySortWrap">
            <select id="builderLibrarySort" class="simoLibrarySortSelect">
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="name_asc">Name A–Z</option>
              <option value="name_desc">Name Z–A</option>
            </select>
          </div>
        </div>
      `;

      const statsWrap = document.createElement("div");
      statsWrap.id = "builderLibraryStats";
      statsWrap.style.padding = "12px 16px 0";

      const quickFiltersWrap = document.createElement("div");
      quickFiltersWrap.id = "builderLibraryQuickFilters";
      quickFiltersWrap.style.padding = "12px 16px 0";

      const tagFiltersWrap = document.createElement("div");
      tagFiltersWrap.id = "builderLibraryTagFilters";
      tagFiltersWrap.style.padding = "12px 16px 0";

      const actionsWrap = document.createElement("div");
      actionsWrap.style.padding = "12px 16px 0";
      actionsWrap.style.display = "flex";
      actionsWrap.style.gap = "10px";
      actionsWrap.style.flexWrap = "wrap";
      actionsWrap.innerHTML = `
        <button id="toggleArchivedBtn" type="button" class="buyBtn ghost">Show Archived</button>
        <button id="exportLibraryBtn" type="button" class="buyBtn ghost">Export Library</button>
        <button id="importLibraryBtn" type="button" class="buyBtn ghost">Import Library</button>
        <input id="importLibraryFile" type="file" accept=".json,application/json" style="display:none" />
      `;

      const modalCard = libraryModalEl.firstElementChild;
      if (modalCard) {
        const header = modalCard.firstElementChild;
        if (header && header.nextSibling) {
          modalCard.insertBefore(controlsWrap, header.nextSibling);
          modalCard.insertBefore(statsWrap, controlsWrap.nextSibling);
          modalCard.insertBefore(quickFiltersWrap, statsWrap.nextSibling);
          modalCard.insertBefore(tagFiltersWrap, quickFiltersWrap.nextSibling);
          modalCard.insertBefore(actionsWrap, tagFiltersWrap.nextSibling);
        } else {
          modalCard.appendChild(controlsWrap);
          modalCard.appendChild(statsWrap);
          modalCard.appendChild(quickFiltersWrap);
          modalCard.appendChild(tagFiltersWrap);
          modalCard.appendChild(actionsWrap);
        }
      }

      librarySearchEl = $("builderLibrarySearch");
      librarySortEl = $("builderLibrarySort");
      libraryStatsEl = $("builderLibraryStats");
      libraryQuickFiltersEl = $("builderLibraryQuickFilters");
      libraryTagFiltersEl = $("builderLibraryTagFilters");
      toggleArchivedBtnEl = $("toggleArchivedBtn");
      exportLibraryBtnEl = $("exportLibraryBtn");
      importLibraryBtnEl = $("importLibraryBtn");
      importLibraryFileEl = $("importLibraryFile");

      if (librarySearchEl) {
        librarySearchEl.value = state.librarySearch || "";
        librarySearchEl.addEventListener("input", () => {
          state.librarySearch = librarySearchEl.value || "";
          renderLibraryList();
        });
      }

      if (librarySortEl) {
        librarySortEl.value = state.librarySort || "newest";
        librarySortEl.addEventListener("change", () => {
          state.librarySort = librarySortEl.value || "newest";
          renderLibraryList();
          setStatus(`Sorted by ${librarySortEl.options[librarySortEl.selectedIndex]?.text || "Newest"}`);
        });
      }

      toggleArchivedBtnEl?.addEventListener("click", () => {
        if (state.libraryShowArchived) {
          state.libraryShowArchived = false;
          state.libraryQuickFilter = "all";
        } else {
          state.libraryShowArchived = true;
          state.libraryQuickFilter = "archived";
        }
        updateArchivedToggleButton();
        renderLibraryQuickFilters();
        renderLibraryTagFilters();
        renderLibraryList();
        setStatus(state.libraryShowArchived ? "Showing archived builds" : "Showing active builds");
      });

      exportLibraryBtnEl?.addEventListener("click", exportLibraryBuilds);
      importLibraryBtnEl?.addEventListener("click", () => {
        importLibraryFileEl?.click();
      });
      importLibraryFileEl?.addEventListener("change", async () => {
        const file = importLibraryFileEl?.files?.[0];
        if (file) await importLibraryBuildsFromFile(file);
      });

      updateArchivedToggleButton();
      updateLibrarySortUI();
      renderLibraryQuickFilters();
      renderLibraryTagFilters();
    } else {
      librarySearchEl = $("builderLibrarySearch");
      librarySortEl = $("builderLibrarySort");
      libraryStatsEl = $("builderLibraryStats");
      libraryQuickFiltersEl = $("builderLibraryQuickFilters");
      libraryTagFiltersEl = $("builderLibraryTagFilters");
      toggleArchivedBtnEl = $("toggleArchivedBtn");
      exportLibraryBtnEl = $("exportLibraryBtn");
      importLibraryBtnEl = $("importLibraryBtn");
      importLibraryFileEl = $("importLibraryFile");
      updateArchivedToggleButton();
      updateLibrarySortUI();
      renderLibraryQuickFilters();
      renderLibraryTagFilters();
    }

    closeLibraryBtnEl?.addEventListener("click", closeLibraryModal);

    libraryModalEl?.addEventListener("click", (e) => {
      if (e.target === libraryModalEl) closeLibraryModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && libraryModalEl && !libraryModalEl.classList.contains("hidden")) {
        closeLibraryModal();
      }
    });
  }

  function openLibraryModal() {
    ensureLibraryModal();
    if (librarySearchEl) librarySearchEl.value = state.librarySearch || "";
    updateArchivedToggleButton();
    updateLibrarySortUI();
    renderLibraryQuickFilters();
    renderLibraryTagFilters();
    renderLibraryList();
    openModal(libraryModalEl);
    setTimeout(() => {
      librarySearchEl?.focus();
    }, 0);
  }

  function closeLibraryModal() {
    closeModal(libraryModalEl);
  }

  function loadSavedBuild(index) {
    const builds = loadBuilds();
    const build = builds[index];
    if (!build || !build.html) return;

    state.lastBuilder = {
      title: build.title || build.name || "Saved Build",
      summary: build.summary || "Loaded from library",
      html: build.html
    };

    closeLibraryModal();
    renderBuilderPreview(state.lastBuilder, { skipVersionPush: false });
    setStatus(`Loaded "${build.name || "build"}"`);
  }

  function deleteSavedBuild(index) {
    const builds = loadBuilds();
    const build = builds[index];
    if (!build) return;

    const ok = window.confirm(`Delete "${build.name}"?`);
    if (!ok) return;

    builds.splice(index, 1);

    if (state.librarySelectedTag && !builds.some((b) => cleanTagList(b.tags || []).includes(state.librarySelectedTag))) {
      state.librarySelectedTag = "";
    }

    saveBuilds(getSortedBuilds(builds));
    renderLibraryList();
    setStatus("Build deleted");
  }

  function renderLibraryList() {
    ensureLibraryModal();
    if (!libraryListEl || !libraryEmptyEl) return;

    const builds = loadBuilds();
    renderLibraryStats(builds);
    renderLibraryQuickFilters();
    renderLibraryTagFilters();

    const filtered = getFilteredBuildsWithIndex(builds, state.librarySearch);

    if (librarySearchEl && librarySearchEl.value !== state.librarySearch) {
      librarySearchEl.value = state.librarySearch || "";
    }
    updateLibrarySortUI();

    if (!filtered.length) {
      libraryEmptyEl.classList.remove("hidden");

      let viewLabel = "";
      if (state.libraryQuickFilter === "archived") {
        viewLabel = "archived builds";
      } else if (state.libraryQuickFilter === "notes") {
        viewLabel = "active builds with notes";
      } else if (state.libraryQuickFilter === "tagged") {
        viewLabel = "active tagged builds";
      } else if (state.libraryQuickFilter === "pinned") {
        viewLabel = "active pinned builds";
      } else {
        viewLabel = "active builds";
      }

      if (state.librarySelectedTag) {
        viewLabel += ` tagged "${state.librarySelectedTag}"`;
      }

      libraryEmptyEl.textContent = state.librarySearch
        ? `No ${viewLabel} found for "${state.librarySearch}".`
        : `No ${viewLabel} yet.`;

      libraryListEl.innerHTML = "";
      return;
    }

    libraryEmptyEl.classList.add("hidden");

    libraryListEl.innerHTML = filtered.map(({ build, index }) => `
      <div style="border:1px solid rgba(255,255,255,.10); border-radius:16px; padding:14px; background:${build.isArchived ? "rgba(255,255,255,.02)" : "rgba(255,255,255,.03)"};">
        <div style="display:flex; align-items:center; gap:10px; justify-content:space-between; flex-wrap:wrap;">
          <div style="font-weight:800; font-size:16px; color:#fff;">
            ${build.isPinned ? "📌 " : ""}${build.isArchived ? "🗄️ " : ""}${escapeHtml(build.name || "Untitled Build")}
          </div>
          <div style="font-size:12px; color:${build.isArchived ? "#9ca3af" : build.isPinned ? "#f6d365" : "#aab7d4"};">
            ${build.isArchived ? "Archived" : build.isPinned ? "Pinned" : ""}
          </div>
        </div>
        <div style="margin-top:4px; font-size:12px; color:#aab7d4;">Saved ${escapeHtml(formatWhen(build.savedAt))}</div>
        <div style="margin-top:8px; color:#d9e4ff;">${escapeHtml(build.summary || "Generated by Simo")}</div>
        ${renderTagChips(build.tags || [])}
        ${renderNoteBlock(build.notes || "")}
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
          ${build.isArchived ? "" : `<button type="button" class="buyBtn ghost" data-pin-build="${index}">${build.isPinned ? "Unpin" : "Pin"}</button>`}
          <button type="button" class="buyBtn ghost" data-tags-build="${index}">Tags</button>
          <button type="button" class="buyBtn ghost" data-notes-build="${index}">Note</button>
          <button type="button" class="buyBtn ghost" data-archive-build="${index}">${build.isArchived ? "Unarchive" : "Archive"}</button>
          <button type="button" class="buyBtn" data-load-build="${index}">Load</button>
          <button type="button" class="buyBtn ghost" data-open-build="${index}">Open in New Tab</button>
          <button type="button" class="buyBtn ghost" data-duplicate-build="${index}">Duplicate</button>
          <button type="button" class="buyBtn ghost" data-rename-build="${index}">Rename</button>
          <button type="button" class="buyBtn ghost" data-delete-build="${index}">Delete</button>
        </div>
      </div>
    `).join("");

    libraryListEl.querySelectorAll("[data-card-tag]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tag = btn.getAttribute("data-card-tag") || "";
        selectBuildCardTag(tag);
      });
    });

    libraryListEl.querySelectorAll("[data-pin-build]").forEach((btn) => {
      btn.addEventListener("click", () => {
        togglePinnedBuild(Number(btn.getAttribute("data-pin-build")));
      });
    });

    libraryListEl.querySelectorAll("[data-tags-build]").forEach((btn) => {
      btn.addEventListener("click", () => {
        editBuildTags(Number(btn.getAttribute("data-tags-build")));
      });
    });

    libraryListEl.querySelectorAll("[data-notes-build]").forEach((btn) => {
      btn.addEventListener("click", () => {
        editBuildNotes(Number(btn.getAttribute("data-notes-build")));
      });
    });

    libraryListEl.querySelectorAll("[data-archive-build]").forEach((btn) => {
      btn.addEventListener("click", () => {
        toggleArchivedBuild(Number(btn.getAttribute("data-archive-build")));
      });
    });

    libraryListEl.querySelectorAll("[data-load-build]").forEach((btn) => {
      btn.addEventListener("click", () => {
        loadSavedBuild(Number(btn.getAttribute("data-load-build")));
      });
    });

    libraryListEl.querySelectorAll("[data-open-build]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const buildsNow = loadBuilds();
        const build = buildsNow[Number(btn.getAttribute("data-open-build"))];
        if (!build?.html) return;
        openBuilderHtmlInNewTab(build.html);
      });
    });

    libraryListEl.querySelectorAll("[data-duplicate-build]").forEach((btn) => {
      btn.addEventListener("click", () => {
        duplicateSavedBuild(Number(btn.getAttribute("data-duplicate-build")));
      });
    });

    libraryListEl.querySelectorAll("[data-rename-build]").forEach((btn) => {
      btn.addEventListener("click", () => {
        renameSavedBuild(Number(btn.getAttribute("data-rename-build")));
      });
    });

    libraryListEl.querySelectorAll("[data-delete-build]").forEach((btn) => {
      btn.addEventListener("click", () => {
        deleteSavedBuild(Number(btn.getAttribute("data-delete-build")));
      });
    });
  }

  // -------------------------
  // Builder preview modal
  // -------------------------
  function setBuilderStatusText(text) {
    const footer = document.querySelector("#builderPreviewModal .tiny.muted");
    if (footer && text) footer.textContent = text;
  }

  function ensureBuilderPreviewModal() {
    if (builderModalEl) return;

    builderModalEl = $("builderPreviewModal");
    builderFrameEl = $("builderPreviewFrame");
    builderHtmlWrapEl = $("builderHtmlWrap");
    builderHtmlViewEl = $("builderHtmlView");
    builderCloseBtnEl = $("closeBuilderPreviewBtn");
    builderCloseFooterBtnEl = $("closeBuilderPreviewFooterBtn");
    builderOpenNewBtnEl = $("openBuilderNewTabBtn");
    builderCodeBtnEl = $("showHtmlBtn");
    builderDownloadBtnEl = $("downloadHtmlBtn");
    builderSaveBtnEl = $("saveBuildBtn");
    builderOpenLibraryBtnEl = $("openLibraryBtn");

    if (builderModalEl && !document.getElementById("publishBuildBtn")) {
      const topActionRow = builderCodeBtnEl?.parentElement;
      if (topActionRow) {
        const publishBtn = document.createElement("button");
        publishBtn.type = "button";
        publishBtn.id = "publishBuildBtn";
        publishBtn.className = "buyBtn";
        publishBtn.textContent = "Publish";
        topActionRow.appendChild(publishBtn);
      }
    }

    if (builderModalEl && !document.getElementById("undoBuilderBtn")) {
      const footerBtnRow = builderCloseFooterBtnEl?.parentElement;
      if (footerBtnRow) {
        const undoBtn = document.createElement("button");
        undoBtn.type = "button";
        undoBtn.id = "undoBuilderBtn";
        undoBtn.className = "buyBtn ghost";
        undoBtn.textContent = "Undo Change";

        const versionInfo = document.createElement("div");
        versionInfo.id = "builderVersionInfo";
        versionInfo.className = "simoBuilderVersionInfo";
        versionInfo.textContent = "No versions yet";

        footerBtnRow.insertBefore(undoBtn, footerBtnRow.firstChild);
        footerBtnRow.appendChild(versionInfo);
      }
    }

    builderPublishBtnEl = $("publishBuildBtn");
    undoBuilderBtnEl = $("undoBuilderBtn");
    builderVersionInfoEl = $("builderVersionInfo");

    builderCloseBtnEl?.addEventListener("click", closeBuilderPreview);
    builderCloseFooterBtnEl?.addEventListener("click", closeBuilderPreview);

    builderOpenNewBtnEl?.addEventListener("click", () => {
      if (!state.lastBuilder?.html) return;
      openBuilderHtmlInNewTab(state.lastBuilder.html);
    });

    builderCodeBtnEl?.addEventListener("click", () => {
      if (!state.lastBuilder?.html) return;
      toggleBuilderHtmlView();
    });

    builderDownloadBtnEl?.addEventListener("click", async () => {
      await downloadBuilderHtml();
    });

    builderSaveBtnEl?.addEventListener("click", () => {
      saveCurrentBuild();
    });

    builderOpenLibraryBtnEl?.addEventListener("click", () => {
      openLibraryModal();
    });

    builderPublishBtnEl?.addEventListener("click", async () => {
      await publishCurrentBuild();
    });

    undoBuilderBtnEl?.addEventListener("click", () => {
      undoBuilderVersion();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && builderModalEl && !builderModalEl.classList.contains("hidden")) {
        closeBuilderPreview();
      }
    });

    updateBuilderVersionInfo();
  }

  function openBuilderPreview() {
    ensureBuilderPreviewModal();
    if (!builderModalEl) return;
    builderModalEl.classList.remove("hidden");
    builderModalEl.setAttribute("aria-hidden", "false");
    updateReopenLastPreviewButton();
    updateBuilderVersionInfo();
  }

  function closeBuilderPreview() {
    if (!builderModalEl) return;
    builderModalEl.classList.add("hidden");
    builderModalEl.setAttribute("aria-hidden", "true");
    updateReopenLastPreviewButton();
  }

  function openBuilderHtmlInNewTab(html) {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch {}
    }, 15000);
  }

  function hideBuilderHtmlView() {
    if (builderHtmlWrapEl) builderHtmlWrapEl.classList.add("hidden");
    if (builderCodeBtnEl) builderCodeBtnEl.textContent = "Show HTML";
  }

  function showBuilderHtmlView() {
    if (!state.lastBuilder?.html) return;
    if (builderHtmlViewEl) builderHtmlViewEl.value = state.lastBuilder.html;
    if (builderHtmlWrapEl) builderHtmlWrapEl.classList.remove("hidden");
    if (builderCodeBtnEl) builderCodeBtnEl.textContent = "Hide HTML";
  }

  function toggleBuilderHtmlView() {
    if (!builderHtmlWrapEl) return;
    const isHidden = builderHtmlWrapEl.classList.contains("hidden");
    if (isHidden) {
      showBuilderHtmlView();
    } else {
      hideBuilderHtmlView();
    }
  }

  async function downloadBuilderHtml() {
    if (!state.lastBuilder?.html) {
      setStatus("No builder HTML to download yet");
      return;
    }

    if (!state.pro) {
      addMessage("assistant", "Downloading HTML is part of Pro. Upgrade to export your projects.");
      setStatus("Download is Pro only");
      openModal(proModal);
      return;
    }

    try {
      setStatus("Preparing HTML download…", { sticky: true });

      const r = await fetch("/api/download-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: state.lastBuilder.title || "simo-project",
          html: state.lastBuilder.html
        })
      });

      if (!r.ok) {
        let msg = "Download failed.";
        try {
          const j = await r.json();
          if (j && j.error) msg = j.error;
        } catch {}
        addMessage("assistant", msg);
        setStatus("Download error");
        return;
      }

      const blob = await r.blob();
      const url = URL.createObjectURL(blob);

      let filename = "simo-project.html";
      const cd = r.headers.get("Content-Disposition") || r.headers.get("content-disposition") || "";
      const match = cd.match(/filename="?([^"]+)"?/i);
      if (match && match[1]) filename = match[1];

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => {
        try { URL.revokeObjectURL(url); } catch {}
      }, 5000);

      setStatus("HTML downloaded");
    } catch {
      addMessage("assistant", "Could not download the HTML right now.");
      setStatus("Download network error");
    }
  }

  async function publishCurrentBuild() {
    if (!state.lastBuilder?.html) {
      addMessage("assistant", "There’s no build to publish yet. Generate one first.");
      setStatus("No build to publish");
      return;
    }

    if (!state.pro) {
      addMessage("assistant", "Publishing to the web is part of Pro. Upgrade to make your pages live.");
      setStatus("Publish is Pro only");
      openModal(proModal);
      return;
    }

    try {
      setStatus("Publishing build…", { sticky: true });

      const r = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: state.lastBuilder.title || suggestBuildName() || "published-page",
          html: state.lastBuilder.html
        })
      });

      const j = await r.json().catch(() => null);

      if (!j || !j.ok || !j.url) {
        addMessage("assistant", j && j.error ? j.error : "Publish failed.");
        setStatus("Publish error");
        return;
      }

      setStatus("Site published");
      addMessage("assistant", `Your site is live: ${j.url}`);
      window.open(j.url, "_blank", "noopener,noreferrer");
    } catch {
      addMessage("assistant", "Network error while publishing.");
      setStatus("Publish network error");
    }
  }

  function renderBuilderPreview(builder, options = {}) {
    if (!builder || typeof builder !== "object") return;
    if (!builder.html || typeof builder.html !== "string") return;

    ensureBuilderPreviewModal();

    const skipVersionPush = !!options.skipVersionPush;

    if (!skipVersionPush) {
      pushBuilderVersion(builder);
      const version = getCurrentBuilderVersion();
      if (version) {
        state.lastBuilder = {
          title: version.title || "Untitled Build",
          summary: version.summary || "Generated by Simo",
          html: version.html
        };
      } else {
        state.lastBuilder = {
          title: builder.title || "Untitled Build",
          summary: builder.summary || "Generated by Simo",
          html: builder.html
        };
      }
    } else {
      state.lastBuilder = {
        title: builder.title || "Untitled Build",
        summary: builder.summary || "Generated by Simo",
        html: builder.html
      };
    }

    saveLastBuilderPreview(state.lastBuilder);

    if (builderFrameEl) {
      builderFrameEl.srcdoc = state.lastBuilder.html;
    }

    if (builderHtmlViewEl) {
      builderHtmlViewEl.value = state.lastBuilder.html;
    }

    hideBuilderHtmlView();
    setBuilderStatusText("The preview/download/save/library/publish buttons are active for this build.");
    openBuilderPreview();
    updateBuilderVersionInfo();
    updateReopenLastPreviewButton();
  }

  // -------------------------
  // Embedded 3D Viewer
  // -------------------------
  function inject3DViewerStyles() {
    if (document.getElementById("simo3dStyles")) return;

    const style = document.createElement("style");
    style.id = "simo3dStyles";
    style.textContent = `
      .simo3dOverlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(3, 8, 20, 0.76);
        backdrop-filter: blur(8px);
        padding: 18px;
        box-sizing: border-box;
      }

      .simo3dOverlay.isOpen { display: flex; }

      .simo3dPanel {
        width: min(1200px, 96vw);
        height: min(820px, 90vh);
        display: flex;
        flex-direction: column;
        border-radius: 24px;
        overflow: hidden;
        background:
          radial-gradient(1000px 700px at 30% 0%, rgba(168,85,255,.18), transparent 60%),
          linear-gradient(180deg, rgba(10,16,35,.98), rgba(4,9,22,.98));
        border: 1px solid rgba(255,255,255,.10);
        box-shadow: 0 30px 80px rgba(0,0,0,.45);
      }

      .simo3dHeader {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        border-bottom: 1px solid rgba(255,255,255,.10);
        box-sizing: border-box;
      }

      .simo3dTitle {
        min-width: 170px;
        font-size: 24px;
        font-weight: 900;
        color: #ffffff;
      }

      .simo3dUrl {
        flex: 1;
        min-width: 220px;
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,.12);
        background: rgba(8,12,25,.75);
        color: #eef3ff;
        font-size: 16px;
        outline: none;
      }

      .simo3dBtn {
        border: none;
        border-radius: 16px;
        padding: 12px 16px;
        font-size: 15px;
        font-weight: 800;
        cursor: pointer;
        background: #2a66ff;
        color: white;
      }

      .simo3dBtn.simo3dClose {
        background: rgba(255,255,255,.08);
        color: #eef3ff;
      }

      .simo3dHint {
        padding: 10px 16px;
        border-bottom: 1px solid rgba(255,255,255,.08);
        color: #afbddf;
        font-size: 13px;
      }

      .simo3dViewerWrap {
        flex: 1;
        min-height: 0;
        background:
          radial-gradient(1000px 700px at 30% 5%, rgba(168,85,255,.16), transparent 60%),
          linear-gradient(180deg, #0c1225, #070c18);
        position: relative;
      }

      .simo3dViewerWrap model-viewer,
      .simo3dViewerWrap #simo3dFallback {
        width: 100%;
        height: 100%;
        display: block;
      }

      .simo3dViewerWrap model-viewer {
        pointer-events: auto;
        touch-action: none;
        user-select: none;
        cursor: grab;
      }

      .simo3dViewerWrap model-viewer:active { cursor: grabbing; }

      #simo3dFallback {
        display: none;
        box-sizing: border-box;
        padding: 28px;
        color: #eef3ff;
        font-size: 16px;
        line-height: 1.5;
      }

      .simo3dFooter {
        padding: 10px 16px;
        border-top: 1px solid rgba(255,255,255,.08);
        color: #d9e3ff;
        font-size: 13px;
      }

      @media (max-width: 900px) {
        .simo3dHeader { flex-wrap: wrap; }
        .simo3dTitle {
          width: 100%;
          min-width: 0;
          font-size: 22px;
        }
        .simo3dUrl { width: 100%; }
      }
    `;
    document.head.appendChild(style);
  }

  function set3DViewerStatus(text) {
    if (viewerStatusEl) viewerStatusEl.textContent = text;
  }

  async function ensureModelViewerLibraryLoaded() {
    if (window.customElements && window.customElements.get("model-viewer")) return true;
    if (modelViewerLoadPromise) return modelViewerLoadPromise;

    modelViewerLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.type = "module";
      script.src = "https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js";
      script.onload = () => resolve(true);
      script.onerror = () => reject(new Error("Failed to load model-viewer."));
      document.head.appendChild(script);
    });

    return modelViewerLoadPromise;
  }

  function buildFreshModelViewer() {
    if (!viewerModelWrapEl) return null;

    const oldMv = $("simo3dModel");
    if (oldMv) oldMv.remove();

    const mv = document.createElement("model-viewer");
    mv.id = "simo3dModel";
    mv.setAttribute("camera-controls", "");
    mv.setAttribute("shadow-intensity", "1");
    mv.setAttribute("exposure", "1");
    mv.setAttribute("interaction-prompt", "none");
    mv.setAttribute("touch-action", "none");
    mv.style.width = "100%";
    mv.style.height = "100%";
    mv.style.display = "block";
    mv.style.pointerEvents = "auto";
    mv.style.background = "transparent";

    viewerModelWrapEl.prepend(mv);

    mv.addEventListener("load", async () => {
      const fallbackEl = $("simo3dFallback");
      if (fallbackEl) fallbackEl.style.display = "none";
      mv.style.display = "block";
      mv.style.pointerEvents = "auto";
      mv.removeAttribute("auto-rotate");
      mv.cameraControls = true;
      mv.interactionPrompt = "none";
      try { await mv.updateComplete; } catch {}
      try {
        if (typeof mv.dismissPoster === "function") mv.dismissPoster();
      } catch {}
      set3DViewerStatus("Model loaded. Drag to rotate.");
    });

    mv.addEventListener("error", () => {
      const fallbackEl = $("simo3dFallback");
      const fallbackUrlEl = $("simo3dFallbackUrl");
      if (fallbackEl) fallbackEl.style.display = "block";
      mv.style.display = "none";
      if (fallbackUrlEl) fallbackUrlEl.textContent = (viewerUrlEl?.value || "").trim();
      set3DViewerStatus("Could not load that model URL.");
    });

    return mv;
  }

  function ensure3DViewerModal() {
    if (viewerModalEl) return;

    inject3DViewerStyles();

    const overlay = document.createElement("div");
    overlay.id = "simo3dOverlay";
    overlay.className = "simo3dOverlay";
    overlay.setAttribute("aria-hidden", "true");

    overlay.innerHTML = `
      <div class="simo3dPanel" role="dialog" aria-modal="true" aria-label="Simo 3D Viewer">
        <div class="simo3dHeader">
          <div class="simo3dTitle" id="simo3dTitle">Simo 3D Viewer</div>
          <input
            id="simo3dUrl"
            class="simo3dUrl"
            type="text"
            placeholder="Paste a public .glb or .gltf URL"
            autocomplete="off"
          />
          <button id="simo3dLoad" class="simo3dBtn" type="button">Load</button>
          <button id="simo3dClose" class="simo3dBtn simo3dClose" type="button">Close</button>
        </div>

        <div class="simo3dHint">
          Loaded inside Simo. Drag with the mouse to rotate. Scroll to zoom. Shift + drag to pan.
        </div>

        <div class="simo3dViewerWrap" id="simo3dViewerWrap">
          <div id="simo3dFallback">
            <div style="font-size:22px;font-weight:900;margin-bottom:10px;">3D viewer loaded, but the model didn’t render.</div>
            <div style="margin-bottom:10px;">Paste a public <strong>.glb</strong> or <strong>.gltf</strong> file URL and click <strong>Load</strong>.</div>
            <div id="simo3dFallbackUrl" style="word-break:break-word;color:#a9c1ff;"></div>
          </div>
        </div>

        <div class="simo3dFooter" id="simo3dStatus">Preparing viewer…</div>
      </div>
    `;

    document.body.appendChild(overlay);

    viewerModalEl = overlay;
    viewerUrlEl = $("simo3dUrl");
    viewerLoadBtnEl = $("simo3dLoad");
    viewerCloseBtnEl = $("simo3dClose");
    viewerStatusEl = $("simo3dStatus");
    viewerModelWrapEl = $("simo3dViewerWrap");
    viewerTitleEl = $("simo3dTitle");

    buildFreshModelViewer();

    viewerLoadBtnEl?.addEventListener("click", () => {
      loadEmbedded3DModel((viewerUrlEl?.value || "").trim());
    });

    viewerCloseBtnEl?.addEventListener("click", closeEmbedded3DViewer);

    viewerUrlEl?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        loadEmbedded3DModel((viewerUrlEl.value || "").trim());
      }
    });

    viewerModalEl?.addEventListener("click", (e) => {
      if (e.target === viewerModalEl) closeEmbedded3DViewer();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && viewerModalEl?.classList.contains("isOpen")) {
        closeEmbedded3DViewer();
      }
    });
  }

  function openEmbedded3DViewer() {
    ensure3DViewerModal();
    viewerModalEl?.classList.add("isOpen");
    viewerModalEl?.setAttribute("aria-hidden", "false");
  }

  function closeEmbedded3DViewer() {
    viewerModalEl?.classList.remove("isOpen");
    viewerModalEl?.setAttribute("aria-hidden", "true");
  }

  function extractModelUrl(text) {
    const match = String(text || "").match(/https?:\/\/\S+\.(glb|gltf)(\?\S*)?/i);
    return match ? match[0] : "";
  }

  function normalize3DText(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[-_/]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function pickSampleModelForPrompt(text) {
    const t = normalize3DText(text);

    if (hasAny(t, ["car", "classic car", "vehicle", "automobile", "sports car", "supercar"])) {
      return {
        title: "Simo 3D Viewer • Car",
        url: MODEL_URLS.toyCar,
        description: "Loaded a sample car model."
      };
    }

    if (hasAny(t, ["duck"])) {
      return {
        title: "Simo 3D Viewer • Duck",
        url: MODEL_URLS.duck,
        description: "Loaded a sample duck model."
      };
    }

    if (hasAny(t, ["helmet"])) {
      return {
        title: "Simo 3D Viewer • Helmet",
        url: MODEL_URLS.helmet,
        description: "Loaded a sample helmet model."
      };
    }

    if (hasAny(t, ["avocado", "fruit"])) {
      return {
        title: "Simo 3D Viewer • Avocado",
        url: MODEL_URLS.avocado,
        description: "Loaded a sample avocado model."
      };
    }

    return {
      title: "Simo 3D Viewer",
      url: MODEL_URLS.astronaut,
      description: "Loaded a sample 3D model."
    };
  }

  async function loadEmbedded3DModel(url) {
    ensure3DViewerModal();

    const fallbackEl = $("simo3dFallback");
    if (fallbackEl) fallbackEl.style.display = "none";

    if (!url) {
      set3DViewerStatus("Paste a public .glb or .gltf URL first.");
      return;
    }

    if (viewerUrlEl) viewerUrlEl.value = url;
    set3DViewerStatus("Loading model…");

    try {
      await ensureModelViewerLibraryLoaded();
      await new Promise((resolve) => setTimeout(resolve, 120));

      const mv = buildFreshModelViewer();
      if (!mv) {
        set3DViewerStatus("Viewer element not ready.");
        return;
      }

      mv.style.display = "block";
      mv.style.pointerEvents = "auto";
      mv.cameraControls = true;
      mv.interactionPrompt = "none";
      mv.removeAttribute("auto-rotate");
      mv.src = url;
    } catch {
      const fallback = $("simo3dFallback");
      const fallbackUrl = $("simo3dFallbackUrl");
      if (fallback) fallback.style.display = "block";
      if (fallbackUrl) fallbackUrl.textContent = url;
      set3DViewerStatus("3D library failed to load in this browser session.");
    }
  }

  async function openEmbedded3DWithPrompt(promptText) {
    const explicitUrl = extractModelUrl(promptText);
    const sample = pickSampleModelForPrompt(promptText);
    const finalUrl = explicitUrl || sample.url;

    ensure3DViewerModal();
    if (viewerTitleEl) viewerTitleEl.textContent = sample.title;
    openEmbedded3DViewer();

    if (viewerUrlEl) viewerUrlEl.value = finalUrl;
    await loadEmbedded3DModel(finalUrl);
  }

  function maybeOpen3DPreview(text) {
    const t = normalize3DText(text);

    const direct3DPhrases = [
      "3d", "3 d", "glb", "gltf", "model viewer", "3d viewer",
      "3d model", "3d preview", "open 3d", "show 3d",
      "rotate model", "rotate this model", "3d object"
    ];

    const actionWords = ["show", "open", "preview", "render", "rotate", "load", "view"];
    const objectWords = [
      "model", "object", "mesh", "asset", "viewer", "car", "vehicle",
      "classic car", "supercar", "helmet", "duck", "avocado"
    ];

    const hasDirect3D = hasAny(t, direct3DPhrases);
    const hasAction = hasAny(t, actionWords);
    const hasObject = hasAny(t, objectWords);
    const hasModelUrl = !!extractModelUrl(t);

    const wants3d =
      hasModelUrl ||
      hasDirect3D ||
      (hasAction && hasObject && (t.includes("3d") || t.includes("model") || t.includes("viewer") || t.includes("rotate") || t.includes("render")));

    if (!wants3d) return false;

    const canUse3D =
      !!(state.pro || state.isTeam || state.plan === "single" || state.plan === "team");

    if (!canUse3D) {
      addMessage(
        "assistant",
        "3D preview is available in Pro. Upgrade and I’ll open the live 3D viewer for you."
      );
      openModal(proModal);
      return true;
    }

    openEmbedded3DWithPrompt(text);

    const sample = pickSampleModelForPrompt(text);
    addMessage(
      "assistant",
      `${sample.description} I opened the embedded 3D viewer inside Simo. You can paste any public .glb or .gltf URL into the viewer to replace it.`
    );
    return true;
  }

  // -------------------------
  // Image staging
  // -------------------------
  function revokePendingPreviewUrl() {
    if (state.pendingImagePreviewUrl) {
      try { URL.revokeObjectURL(state.pendingImagePreviewUrl); } catch {}
      state.pendingImagePreviewUrl = "";
    }
  }

  function clearPendingImage() {
    state.pendingImageFile = null;
    revokePendingPreviewUrl();

    if (imagePreview) imagePreview.removeAttribute("src");
    if (imageName) imageName.textContent = "No image selected";
    if (imageStage) imageStage.classList.add("hidden");
    if (imageDropZone) imageDropZone.classList.remove("dragover");
  }

  function stageImageFile(file) {
    if (!file || !file.type || !file.type.startsWith("image/")) {
      setStatus("That file is not an image");
      return;
    }

    state.pendingImageFile = file;
    revokePendingPreviewUrl();
    state.pendingImagePreviewUrl = URL.createObjectURL(file);

    if (imagePreview) imagePreview.src = state.pendingImagePreviewUrl;
    if (imageName) imageName.textContent = file.name || "Pasted image";
    if (imageStage) imageStage.classList.remove("hidden");

    setStatus("Image ready • add text or press Send");
  }

  function getPastedImageFile(e) {
    const items = e.clipboardData?.items;
    if (!items || !items.length) return null;

    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        return item.getAsFile();
      }
    }
    return null;
  }

  // -------------------------
  // Chat send
  // -------------------------
  async function sendMessage() {
    const text = (inputEl?.value || "").trim();
    const hasImage = !!state.pendingImageFile;

    if (!text && !hasImage) return;

    if (hasImage) {
      await sendImageMessage(text);
      return;
    }

    addMessage("user", text);
    state.history.push({ role: "user", content: text });
    saveHistory();

    if (inputEl) {
      inputEl.value = "";
      inputEl.focus();
    }

    setStatus("Simo is thinking…", { sticky: true });

    const lower = text.toLowerCase();
    if (
      state.builderVersions.length > 1 &&
      ["undo", "revert", "restore previous", "undo change", "previous version"].some((x) => lower.includes(x))
    ) {
      undoBuilderVersion();
      return;
    }

    if (maybeOpen3DPreview(text)) {
      await refreshStatus();
      return;
    }

    try {
      const payload = {
        text,
        history: state.history.slice(-16),
        settings: state.settings
      };

      if (isBuilderIntent(text)) {
        payload.mode = "builder";
      }

      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (r.status === 402) {
        const j = await r.json().catch(() => null);
        addMessage("assistant", j && j.error ? j.error : "Daily limit reached. Upgrade to continue.");
        setStatus("Limit reached • Upgrade to continue");
        openModal(proModal);
        return;
      }

      const j = await r.json().catch(() => null);

      if (!j || !j.ok) {
        addMessage("assistant", j && j.error ? j.error : "Something went wrong.");
        setStatus("Error");
        return;
      }

      addMessage("assistant", j.answer || "");
      state.history.push({ role: "assistant", content: j.answer || "" });
      saveHistory();

      const builder = j.builder || null;
      if (
        (payload.mode === "builder" || j.mode === "builder") &&
        builder &&
        builder.html
      ) {
        renderBuilderPreview(builder, { skipVersionPush: false });
        setStatus("Builder preview ready");
        await refreshStatus();
      } else {
        await refreshStatus();
      }
    } catch {
      addMessage("assistant", "Network error. Check your server is running.");
      setStatus("Network error");
    }
  }

  async function sendImageMessage(text) {
    const file = state.pendingImageFile;
    if (!file) return;

    const imageBubbleUrl = state.pendingImagePreviewUrl || URL.createObjectURL(file);
    const bubbleHtml = buildImageBubbleHtml(imageBubbleUrl, text || "");

    addMessage("user", bubbleHtml, true);

    const historyLabel = text ? `[Image: ${file.name}] ${text}` : `[Image uploaded: ${file.name}]`;
    state.history.push({ role: "user", content: historyLabel });
    saveHistory();

    if (inputEl) inputEl.value = "";

    setStatus("Uploading image…", { sticky: true });

    const fd = new FormData();
    fd.append("image", file);
    fd.append("text", text || "");
    fd.append("history", JSON.stringify(state.history.slice(-16)));
    fd.append("settings", JSON.stringify(state.settings));

    state.pendingImageFile = null;
    state.pendingImagePreviewUrl = "";
    if (imagePreview) imagePreview.removeAttribute("src");
    if (imageName) imageName.textContent = "No image selected";
    if (imageStage) imageStage.classList.add("hidden");
    if (imageDropZone) imageDropZone.classList.remove("dragover");

    try {
      const r = await fetch("/api/image", {
        method: "POST",
        body: fd
      });

      if (r.status === 402) {
        const j = await r.json().catch(() => null);
        addMessage("assistant", j && j.error ? j.error : "Daily limit reached. Upgrade to continue.");
        setStatus("Limit reached • Upgrade to continue");
        openModal(proModal);
        inputEl?.focus();
        return;
      }

      const j = await r.json().catch(() => null);

      if (!j || !j.ok) {
        addMessage("assistant", j && j.error ? j.error : "Image upload failed.");
        setStatus("Image error");
        inputEl?.focus();
        return;
      }

      addMessage("assistant", j.answer || "");
      state.history.push({ role: "assistant", content: j.answer || "" });
      saveHistory();

      await refreshStatus();
      inputEl?.focus();
    } catch {
      addMessage("assistant", "Network error uploading image.");
      setStatus("Image network error");
      inputEl?.focus();
    }
  }

  // -------------------------
  // Stripe checkout
  // -------------------------
  async function startCheckout(planKey) {
    try {
      setStatus("Opening Stripe checkout…", { sticky: true });

      const r = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planKey })
      });

      const j = await r.json().catch(() => null);

      if (!j || !j.ok || !j.url) {
        addMessage("assistant", j && j.error ? j.error : "Stripe checkout failed.");
        setStatus("Stripe error");
        return;
      }

      window.location.href = j.url;
    } catch {
      setStatus("Stripe network error");
    }
  }

  // -------------------------
  // Account modal
  // -------------------------
  async function openAccount() {
    try {
      const r = await fetch("/api/me", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!j || !j.ok) return;

      if (accEmail) accEmail.textContent = j.email || "Not signed in";
      if (accPlan) accPlan.textContent = j.plan || "free";
      openModal(accountModal);
    } catch {}
  }

  // -------------------------
  // Paste / drag / drop image support
  // -------------------------
  function bindImagePasteSupport() {
    document.addEventListener("paste", (e) => {
      const file = getPastedImageFile(e);
      if (!file) return;
      e.preventDefault();
      stageImageFile(file);
    });
  }

  function bindImageDropSupport() {
    document.addEventListener("dragover", (e) => {
      const files = e.dataTransfer?.files;
      if (files && files.length) e.preventDefault();
    });

    document.addEventListener("drop", (e) => {
      const files = e.dataTransfer?.files;
      if (!files || !files.length) return;

      const file = files[0];
      if (!file || !file.type || !file.type.startsWith("image/")) return;

      e.preventDefault();
      stageImageFile(file);
    });
  }

  function bindImageStageDragEffects() {
    document.addEventListener("dragenter", (e) => {
      const types = Array.from(e.dataTransfer?.types || []);
      if (types.includes("Files")) imageDropZone?.classList.add("dragover");
    });

    document.addEventListener("dragleave", (e) => {
      if (!e.relatedTarget) imageDropZone?.classList.remove("dragover");
    });

    document.addEventListener("drop", () => {
      imageDropZone?.classList.remove("dragover");
    });

    document.addEventListener("dragend", () => {
      imageDropZone?.classList.remove("dragover");
    });
  }

  // -------------------------
  // Bind events
  // -------------------------
  function bindEventsOnce() {
    sendBtn?.addEventListener("click", sendMessage);

    inputEl?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    newChatBtn?.addEventListener("click", clearHistory);
    clearBtn?.addEventListener("click", clearHistory);

    proBtn?.addEventListener("click", () => openModal(proModal));
    closeProModal?.addEventListener("click", () => closeModal(proModal));
    proModal?.addEventListener("click", (e) => {
      if (e.target === proModal) closeModal(proModal);
    });

    buySingleMonthly?.addEventListener("click", () => startCheckout("single_monthly"));
    buySingleYearly?.addEventListener("click", () => startCheckout("single_yearly"));
    buyTeamMonthly?.addEventListener("click", () => startCheckout("team_monthly"));
    buyTeamYearly?.addEventListener("click", () => startCheckout("team_yearly"));

    settingsBtn?.addEventListener("click", () => {
      syncSettingsUI();
      openModal(settingsModal);
    });

    closeSettings?.addEventListener("click", () => closeModal(settingsModal));
    settingsModal?.addEventListener("click", (e) => {
      if (e.target === settingsModal) closeModal(settingsModal);
    });

    saveSettingsBtn?.addEventListener("click", () => {
      state.settings = {
        voice: !!setVoice?.checked,
        style: setStyle?.value || "friendly",
        language: setLang?.value || "en",
        theme: setTheme?.value || "default"
      };
      saveSettingsLocal(state.settings);
      applyTheme(state.settings.theme);
      setStatus(`Saved • theme: ${state.settings.theme}`);
      closeModal(settingsModal);
    });

    resetSettingsBtn?.addEventListener("click", () => {
      state.settings = {
        voice: false,
        style: "friendly",
        language: "en",
        theme: "default"
      };
      saveSettingsLocal(state.settings);
      applyTheme("default");
      syncSettingsUI();
      setStatus("Settings reset");
    });

    signupBtn?.addEventListener("click", () => {
      addMessage("assistant", "Easy Signup is next. For now, use Sign in (Google) in the top bar.");
      scrollToBottom();
    });

    youBtn?.addEventListener("click", openAccount);
    closeAccount?.addEventListener("click", () => closeModal(accountModal));
    accountModal?.addEventListener("click", (e) => {
      if (e.target === accountModal) closeModal(accountModal);
    });

    sideItems.forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = btn.getAttribute("data-prompt") || "";
        if (inputEl) {
          inputEl.value = p;
          inputEl.focus();
        }
      });
    });

    builderLibrarySideBtn?.addEventListener("click", () => {
      openLibraryModal();
      setStatus("Builder Library opened");
    });

    imgBtn?.addEventListener("click", () => imagePick?.click());

    imagePick?.addEventListener("change", () => {
      const file = imagePick.files && imagePick.files[0];
      imagePick.value = "";
      if (file) stageImageFile(file);
    });

    removeImageBtn?.addEventListener("click", () => {
      clearPendingImage();
      inputEl?.focus();
      setStatus("Image removed");
    });
  }

  async function init() {
    applyTheme(state.settings.theme);
    bindEventsOnce();
    bindImagePasteSupport();
    bindImageDropSupport();
    bindImageStageDragEffects();
    ensure3DViewerModal();
    ensureBuilderPreviewModal();
    ensureLibraryModal();
    ensureReopenLastPreviewButton();

    // force migration once on startup
    saveBuilds(loadBuilds());

    const recoveredLastBuilder = loadLastBuilderPreview();
    if (recoveredLastBuilder?.html) {
      state.lastBuilder = recoveredLastBuilder;
      seedBuilderVersionsFromLastBuilder(recoveredLastBuilder);
    }

    renderAll();
    clearPendingImage();
    updateReopenLastPreviewButton();
    updateBuilderVersionInfo();
    renderStatusLine();
    await refreshStatus();

    if (recoveredLastBuilder?.html) {
      setStatus("Recovered last builder preview • ready");
    }

    inputEl?.focus();
  }

  init();
})();