// Simo — Phase 2.6 Memory Upgrade
// full-file replacement
(() => {
  if (window.__SIMO_BOOTED__) return;
  window.__SIMO_BOOTED__ = true;

  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const LIB_KEY = "simo_builder_library_v5_1_builder_first";
  const LAST_PREVIEW_KEY = "simo_last_preview_v2";
  const PREVIEW_HISTORY_KEY = "simo_preview_history_v1";
  const SETTINGS_KEY = "simo_ui_settings_v2";

  const SIMO = window.SIMO_BOOT || {};

  const state = {
    booted: false,
    sending: false,

    me: {
      loggedIn: !!SIMO.loggedIn,
      email: SIMO.email || "",
      name: SIMO.name || "",
      pro: !!SIMO.pro,
      team: !!SIMO.team,
    },

    freeDailyLimit: Number(SIMO.freeDailyLimit || 50),
    usageToday: Number(SIMO.usageToday || 0),

    selectedImageUrl: "",
    selectedImageFilename: "",
    lastAssistantText: "",

    draftHtml: "",
    lastPreviewHtml: "",
    lastPreviewTitle: "",
    currentPreviewMode: "render",

    lastOpened3DUrl: "",
    activeRecommendedOpenUrl: "",

    currentSearch: "",
    currentSort: "newest",
    currentFilter: "all",
    showArchived: false,

    publish: {
      busy: false,
      lastUrl: "",
      lastSlug: "",
    },

    ui: {
      theme: "default",
      accent: "blue",
    },

    previewHistoryLimit: 8,
  };

  // -----------------------------
  // utils
  // -----------------------------
  function safeJsonParse(text, fallback) {
    try {
      return JSON.parse(text);
    } catch {
      return fallback;
    }
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function prettyDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  }

  function slugify(str) {
    return (
      String(str || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "simo-build"
    );
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setText(el, value) {
    if (el) el.textContent = value;
  }

  function show(el) {
    if (!el) return;
    el.hidden = false;
    el.style.display = "";
  }

  function hide(el) {
    if (!el) return;
    el.hidden = true;
    el.style.display = "none";
  }

  function revealPill(el, displayValue = "inline-flex") {
    if (!el) return;
    el.classList.remove("hidden");
    el.hidden = false;
    el.style.display = displayValue;
  }

  function concealPill(el) {
    if (!el) return;
    el.classList.add("hidden");
    el.hidden = true;
    el.style.display = "none";
  }

  function autoGrow(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 260) + "px";
  }

  function cssEscapeSafe(value) {
    const raw = String(value ?? "");
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(raw);
    }
    return raw.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function uniqueElements(list) {
    return Array.from(new Set((Array.isArray(list) ? list : []).filter(Boolean)));
  }

  function toAbsoluteUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      return new URL(raw, window.location.origin).toString();
    } catch {
      return raw;
    }
  }

  async function api(path, opts = {}) {
    const isFormData = opts.body instanceof FormData;

    const res = await fetch(path, {
      credentials: "same-origin",
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(opts.headers || {}),
      },
      ...opts,
    });

    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json") ? await res.json() : await res.text();

    if (!res.ok) {
      const msg =
        (data && data.error) ||
        (data && data.message) ||
        (typeof data === "string" ? data : `Request failed: ${res.status}`);
      throw new Error(msg);
    }

    return data;
  }

  function toast(message, type = "info", ms = 2600) {
    let wrap = $("toastWrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "toastWrap";
      wrap.style.position = "fixed";
      wrap.style.right = "18px";
      wrap.style.bottom = "18px";
      wrap.style.zIndex = "999999";
      wrap.style.display = "flex";
      wrap.style.flexDirection = "column";
      wrap.style.gap = "10px";
      document.body.appendChild(wrap);
    }

    const item = document.createElement("div");
    item.className = `simo-toast simo-toast-${type}`;
    item.style.maxWidth = "390px";
    item.style.padding = "12px 14px";
    item.style.borderRadius = "14px";
    item.style.backdropFilter = "blur(10px)";
    item.style.color = "#fff";
    item.style.border = "1px solid rgba(255,255,255,.12)";
    item.style.boxShadow = "0 8px 30px rgba(0,0,0,.25)";
    item.style.fontSize = "14px";
    item.style.background =
      type === "error"
        ? "rgba(180,30,60,.92)"
        : type === "success"
        ? "rgba(24,110,72,.92)"
        : "rgba(16,22,36,.92)";
    item.textContent = message;

    wrap.appendChild(item);

    setTimeout(() => {
      item.style.opacity = "0";
      item.style.transform = "translateY(8px)";
      item.style.transition = "all .25s ease";
      setTimeout(() => item.remove(), 250);
    }, ms);
  }

  function styleActionButton(btn) {
    if (!btn) return;
    btn.style.padding = "8px 10px";
    btn.style.borderRadius = "12px";
    btn.style.cursor = "pointer";
    btn.style.border = "1px solid rgba(255,255,255,.10)";
    btn.style.background = "rgba(255,255,255,.06)";
    btn.style.color = "#eef4ff";
  }

  function styleSidebarPill(btn) {
    if (!btn) return;
    btn.classList.add("pill");
    btn.style.display = "none";
    btn.style.width = "";
  }

  function titleCase(value) {
    return String(value || "")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase())
      .trim();
  }

  async function copyTextToClipboard(text, successMessage = "Copied.") {
    const value = String(text || "");
    if (!value) {
      toast("Nothing to copy.", "error", 1800);
      return false;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      toast(successMessage, "success", 1600);
      return true;
    } catch {
      toast("Copy failed.", "error", 1800);
      return false;
    }
  }

  // -----------------------------
  // scrolling
  // -----------------------------
  function getMainScrollContainer() {
    return $(".main") || document.scrollingElement || document.documentElement;
  }

  function getChatScrollContainer() {
    return $("chat") || $(".chat-wrap") || getMainScrollContainer();
  }

  function scrollElementToBottom(el) {
    if (!el) return;
    try {
      el.scrollTop = el.scrollHeight;
    } catch {}
  }

  function scrollWindowToBottom() {
    try {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "smooth",
      });
    } catch {
      window.scrollTo(0, document.documentElement.scrollHeight);
    }
  }

  function scrollChatToBottom(forceWindow = false) {
    const chatContainer = getChatScrollContainer();
    const mainContainer = getMainScrollContainer();

    const run = () => {
      scrollElementToBottom(chatContainer);
      if (mainContainer && mainContainer !== chatContainer) {
        scrollElementToBottom(mainContainer);
      }
      if (forceWindow) scrollWindowToBottom();
    };

    run();
    requestAnimationFrame(run);
    setTimeout(run, 30);
    setTimeout(run, 80);
    setTimeout(run, 160);
    setTimeout(run, 280);
  }

  function scrollAfterUiChange() {
    scrollChatToBottom(true);
    setTimeout(() => scrollChatToBottom(true), 90);
    setTimeout(() => scrollChatToBottom(true), 180);
    setTimeout(() => scrollChatToBottom(true), 320);
  }

  // -----------------------------
  // storage
  // -----------------------------
  function normalizeLibraryArray(items) {
    if (!Array.isArray(items)) return [];

    return items
      .filter(Boolean)
      .map((item) => ({
        id: item.id || "build_" + Math.random().toString(36).slice(2, 10),
        title: String(item.title || "Untitled Build"),
        html: String(item.html || ""),
        sourceText: String(item.sourceText || ""),
        notes: String(item.notes || ""),
        tags: Array.isArray(item.tags) ? item.tags.filter(Boolean).map(String) : [],
        pinned: !!item.pinned,
        archived: !!item.archived,
        createdAt: item.createdAt || nowIso(),
        updatedAt: item.updatedAt || item.createdAt || nowIso(),
      }));
  }

  function getLibrary() {
    return normalizeLibraryArray(safeJsonParse(localStorage.getItem(LIB_KEY), []));
  }

  function setLibrary(items) {
    localStorage.setItem(LIB_KEY, JSON.stringify(normalizeLibraryArray(items)));
    updateDashboardUi();
  }

  function getLastPreview() {
    return safeJsonParse(localStorage.getItem(LAST_PREVIEW_KEY), null);
  }

  function normalizePreviewHistory(items) {
    if (!Array.isArray(items)) return [];
    return items
      .filter(Boolean)
      .map((item) => ({
        id: item.id || `preview_${Math.random().toString(36).slice(2, 10)}`,
        title: String(item.title || "Untitled Preview"),
        html: String(item.html || ""),
        savedAt: item.savedAt || nowIso(),
      }))
      .filter((item) => item.html);
  }

  function getPreviewHistory() {
    return normalizePreviewHistory(safeJsonParse(localStorage.getItem(PREVIEW_HISTORY_KEY), []));
  }

  function setPreviewHistory(items) {
    const clean = normalizePreviewHistory(items).slice(0, state.previewHistoryLimit);
    localStorage.setItem(PREVIEW_HISTORY_KEY, JSON.stringify(clean));
    updateRecentBuildsVisibility();
    renderRecentBuilds();
  }

  function savePreviewToHistory(html, title = "") {
    const cleanHtml = String(html || "").trim();
    if (!cleanHtml) return;

    const cleanTitle = String(title || "Untitled Preview").trim() || "Untitled Preview";
    const existing = getPreviewHistory();

    const withoutDupes = existing.filter(
      (item) => !(item.html === cleanHtml && item.title === cleanTitle)
    );

    const next = [
      {
        id: `preview_${Math.random().toString(36).slice(2, 10)}`,
        title: cleanTitle,
        html: cleanHtml,
        savedAt: nowIso(),
      },
      ...withoutDupes,
    ].slice(0, state.previewHistoryLimit);

    setPreviewHistory(next);
  }

  function clearPreviewHistory() {
    localStorage.removeItem(PREVIEW_HISTORY_KEY);
    updateRecentBuildsVisibility();
    renderRecentBuilds();
  }

  function saveLastPreview(html, title = "") {
    const payload = {
      html: String(html || ""),
      title: String(title || ""),
      savedAt: nowIso(),
    };
    localStorage.setItem(LAST_PREVIEW_KEY, JSON.stringify(payload));
    state.lastPreviewHtml = payload.html;
    state.lastPreviewTitle = payload.title;
    savePreviewToHistory(payload.html, payload.title);
    updateReopenLastPreviewVisibility();
  }

  function getUiSettings() {
    return safeJsonParse(localStorage.getItem(SETTINGS_KEY), {
      theme: "default",
      accent: "blue",
    });
  }

  function saveUiSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.ui));
  }

  function generateLibraryItem({ title, html, sourceText = "" }) {
    const now = nowIso();
    return {
      id: "build_" + Math.random().toString(36).slice(2, 10),
      title: String(title || "Untitled Build"),
      html: String(html || ""),
      sourceText: String(sourceText || ""),
      notes: "",
      tags: [],
      pinned: false,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  function exportLibraryJson() {
    return JSON.stringify(
      {
        version: "5.1-builder-first",
        exportedAt: nowIso(),
        items: getLibrary(),
      },
      null,
      2
    );
  }

  function mergeImportedLibrary(payload) {
    if (!payload || !Array.isArray(payload.items)) {
      throw new Error("Invalid library file.");
    }

    const existing = getLibrary();
    const map = new Map(existing.map((x) => [x.id, x]));

    for (const item of normalizeLibraryArray(payload.items)) {
      map.set(item.id, item);
    }

    const merged = Array.from(map.values());
    setLibrary(merged);
    return merged.length;
  }

  // -----------------------------
  // dom refs
  // -----------------------------
  const inputEl = $("chatInput");
  const sendBtn = $("sendBtn");
  const imageInput = $("imageInput");
  const imageBtn = $("imageBtn");
  const analyzeImageBtn = $("analyzeImageBtn");
  const upgradeBtn = $("upgradeBtn");
  const loginBtn = $("loginBtn");
  const logoutBtn = $("logoutBtn");
  const userEmailEl = $("userEmail");
  const proBadgeEl = $("proBadge");

  const accountValueEl = $("accountValue");
  const planValueEl = $("planValue");
  const usageValueEl = $("usageTodayValue");
  const libraryCountValueEl = $("libraryCountValue");
  const loadingHintEl = $("loadingHint");

  const clearHistoryBtn = $("clearHistoryBtn");
  const newChatBtn = $("newChatBtn");
  const settingsBtn = $("settingsBtn");
  const easySignupBtn = $("signupBtn");
  const profileBtn = $("profileBtn");
  const builderLibraryCard = $("builderLibraryCard");
  const openLibraryBtn = $("openLibraryBtn");
  const reopenLastPreviewBtn = $("reopenLastPreviewBtn");
  const publishBtn =
    $("publishBtn") ||
    $("openPublishBtn") ||
    document.querySelector('[data-role="publish-build"]');

  function getRecentBuildsBtn() {
    return $("recentBuildsBtn");
  }

  // -----------------------------
  // theme / settings
  // -----------------------------
  function syncLibraryTriggerVisuals() {
    const accentMap = {
      blue: "#6ea8ff",
      purple: "#b982ff",
      pink: "#ff8fca",
      emerald: "#56f0a9",
    };

    const accent = accentMap[state.ui.accent] || accentMap.blue;
    const libraryTriggers = uniqueElements([
      builderLibraryCard,
      openLibraryBtn,
      reopenLastPreviewBtn,
      getRecentBuildsBtn(),
    ]);

    libraryTriggers.forEach((el) => {
      if (!el) return;
      el.style.cursor = "pointer";

      if (el.dataset.libraryTriggerStyled === "true") return;
      el.dataset.libraryTriggerStyled = "true";

      el.style.transition =
        "transform .18s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease";

      el.addEventListener("mouseenter", () => {
        el.style.transform = "translateY(-1px)";
        el.style.boxShadow = `0 12px 30px rgba(0,0,0,.18), 0 0 0 1px ${accent}22 inset`;
        el.style.borderColor = `${accent}55`;
      });

      el.addEventListener("mouseleave", () => {
        el.style.transform = "translateY(0)";
        el.style.boxShadow = "";
        el.style.borderColor = "";
      });
    });
  }

  function applyUiSettings() {
    const body = document.body;
    if (!body) return;

    body.dataset.simoTheme = state.ui.theme || "default";
    body.dataset.simoAccent = state.ui.accent || "blue";

    const themes = {
      default: {
        bg:
          "radial-gradient(circle at top left, rgba(87,125,255,.18) 0%, transparent 28%), radial-gradient(circle at top right, rgba(177,110,255,.14) 0%, transparent 26%), radial-gradient(circle at bottom center, rgba(40,76,150,.22) 0%, transparent 30%), linear-gradient(180deg, #09111d 0%, #08101b 38%, #060d17 100%)",
      },
      midnight: {
        bg:
          "radial-gradient(circle at top left, rgba(55,95,190,.15) 0%, transparent 26%), radial-gradient(circle at top right, rgba(85,95,150,.12) 0%, transparent 24%), radial-gradient(circle at bottom center, rgba(30,50,100,.18) 0%, transparent 28%), linear-gradient(180deg, #060b13 0%, #050910 42%, #04070d 100%)",
      },
      aurora: {
        bg:
          "radial-gradient(circle at top left, rgba(72,170,255,.16) 0%, transparent 26%), radial-gradient(circle at top right, rgba(120,255,210,.12) 0%, transparent 22%), radial-gradient(circle at bottom center, rgba(180,120,255,.14) 0%, transparent 28%), linear-gradient(180deg, #09131d 0%, #07111a 38%, #061019 100%)",
      },
    };

    const accents = {
      blue: { color: "#6ea8ff", glow: "rgba(110,168,255,.22)" },
      purple: { color: "#b982ff", glow: "rgba(185,130,255,.22)" },
      pink: { color: "#ff8fca", glow: "rgba(255,143,202,.22)" },
      emerald: { color: "#56f0a9", glow: "rgba(86,240,169,.22)" },
    };

    const theme = themes[state.ui.theme] || themes.default;
    const accent = accents[state.ui.accent] || accents.blue;

    body.style.background = theme.bg;
    document.documentElement.style.setProperty("--blue", accent.color);
    document.documentElement.style.setProperty("--blue2", accent.color);
    document.documentElement.style.setProperty("--focus-glow", accent.glow);

    $$("[data-simo-accent-preview]").forEach((el) => {
      const value = el.getAttribute("data-simo-accent-preview");
      const active = value === state.ui.accent;
      el.style.outline = active ? `2px solid ${accent.color}` : "none";
      el.style.boxShadow = active ? `0 0 0 4px ${accent.glow}` : "none";
    });

    $$("[data-simo-theme-option]").forEach((el) => {
      const value = el.getAttribute("data-simo-theme-option");
      const active = value === state.ui.theme;
      el.style.borderColor = active ? accent.color : "rgba(255,255,255,.10)";
      el.style.boxShadow = active ? `0 8px 24px ${accent.glow}` : "none";
      el.style.background = active ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.04)";
    });

    syncLibraryTriggerVisuals();
  }

  // -----------------------------
  // account ui
  // -----------------------------
  function updateDashboardUi() {
    if (accountValueEl) {
      setText(accountValueEl, state.me.loggedIn ? (state.me.email || "Signed in") : "Guest");
    }

    if (planValueEl) {
      if (state.me.team) setText(planValueEl, "Team");
      else setText(planValueEl, state.me.pro ? "Pro" : "Free");
    }

    if (usageValueEl) {
      const used = Number(state.usageToday || 0);
      const limit = Number(state.freeDailyLimit || 50);
      setText(
        usageValueEl,
        state.me.pro || state.me.team ? `${used}` : `${used} / ${limit}`
      );
    }

    if (libraryCountValueEl) {
      setText(libraryCountValueEl, String(getLibrary().length));
    }

    syncLibraryTriggerVisuals();
  }

  function updateUserUi() {
    setText(userEmailEl, state.me.email || "");

    if (proBadgeEl) {
      proBadgeEl.textContent = state.me.pro ? "Pro" : "Free";
      proBadgeEl.dataset.pro = state.me.pro ? "true" : "false";
    }

    if (loginBtn) {
      loginBtn.onclick = () => {
        window.location.href = "/login";
      };
    }

    if (logoutBtn) {
      logoutBtn.onclick = () => {
        window.location.href = "/logout";
      };
    }

    updateDashboardUi();
  }

  async function refreshMe() {
    try {
      const data = await api("/api/me");
      state.me.loggedIn = !!data.loggedIn;
      state.me.email = data.email || "";
      state.me.name = data.name || "";
      state.me.pro = !!data.pro;
      state.me.team = !!data.team;
      state.usageToday = Number(data.usage_today || 0);
      state.freeDailyLimit = Number(data.free_daily_limit || state.freeDailyLimit || 50);
      updateUserUi();
    } catch (err) {
      console.warn("refreshMe failed:", err);
    }
  }

  async function refreshProStatus() {
    try {
      const data = await api("/api/pro-status");
      state.me.loggedIn = !!data.loggedIn;
      state.me.email = data.email || "";
      state.me.pro = !!data.pro;
      updateUserUi();
    } catch (err) {
      console.warn("refreshProStatus failed:", err);
    }
  }

  async function startUpgradeFlow() {
    try {
      const data = await api("/api/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({}),
      });

      if (data && data.ok && data.url) {
        window.location.href = data.url;
        return;
      }

      throw new Error("Could not start checkout.");
    } catch (err) {
      toast(err.message || "Upgrade failed.", "error");
    }
  }

  // -----------------------------
  // chat rendering
  // -----------------------------
  function ensureChatShell() {
    const existing = $("chatMessages");
    if (existing) return existing;

    const wrap = document.createElement("div");
    wrap.id = "chatMessages";
    wrap.style.maxWidth = "980px";
    wrap.style.margin = "20px auto";
    wrap.style.padding = "0 14px 120px";

    const host = $("chat") || document.body;
    host.appendChild(wrap);
    return wrap;
  }

  function normalizeReplyText(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\u00a0/g, " ")
      .trim();
  }

  function formatInlineText(text) {
    let html = escapeHtml(String(text || ""));
    html = html.replace(
      /`([^`\n]+)`/g,
      '<code style="padding:2px 6px;border-radius:8px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.08);font-size:.95em;color:#f4f7ff;">$1</code>'
    );
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
    return html;
  }

  function renderAssistantTextHtml(text) {
    const raw = normalizeReplyText(text);
    if (!raw) {
      return `<div style="color:#eef4ff;">Done.</div>`;
    }

    const codeBlocks = [];
    const placeholderPrefix = "__SIMO_CODE_BLOCK__";
    let working = raw.replace(/```([a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
      const idx =
        codeBlocks.push({
          lang: String(lang || "").trim(),
          code: String(code || "").replace(/^\n+|\n+$/g, ""),
        }) - 1;
      return `${placeholderPrefix}${idx}__`;
    });

    const lines = working.split("\n");
    const out = [];
    let paragraph = [];
    let listType = null;

    function flushParagraph() {
      if (!paragraph.length) return;
      const content = paragraph.join(" ").trim();
      if (content) {
        out.push(
          `<p style="margin:0; line-height:1.55; color:#eef4ff;">${formatInlineText(content)}</p>`
        );
      }
      paragraph = [];
    }

    function closeList() {
      if (listType) {
        out.push(listType === "ul" ? "</ul>" : "</ol>");
        listType = null;
      }
    }

    for (const lineRaw of lines) {
      const line = lineRaw.trim();

      const codeMatch = line.match(new RegExp(`^${placeholderPrefix}(\\d+)__$`));
      if (codeMatch) {
        flushParagraph();
        closeList();
        const block = codeBlocks[Number(codeMatch[1])] || { lang: "", code: "" };
        out.push(`
          <div style="display:grid; gap:6px; margin:2px 0;">
            ${
              block.lang
                ? `<div style="font-size:11px; color:rgba(235,242,255,.65); text-transform:uppercase; letter-spacing:.08em;">${escapeHtml(block.lang)}</div>`
                : ""
            }
            <pre style="margin:0; padding:14px; border-radius:14px; background:rgba(6,12,22,.94); border:1px solid rgba(255,255,255,.08); overflow:auto; color:#eef4ff; line-height:1.45;"><code>${escapeHtml(block.code)}</code></pre>
          </div>
        `);
        continue;
      }

      if (!line) {
        flushParagraph();
        closeList();
        continue;
      }

      if (/^---+$/.test(line)) {
        flushParagraph();
        closeList();
        out.push(`<div style="height:1px; background:rgba(255,255,255,.08); margin:2px 0;"></div>`);
        continue;
      }

      const h = line.match(/^(#{1,3})\s+(.*)$/);
      if (h) {
        flushParagraph();
        closeList();
        const level = h[1].length;
        const sizes = { 1: "18px", 2: "16px", 3: "14px" };
        out.push(
          `<div style="margin:0; font-weight:800; font-size:${sizes[level]}; line-height:1.35; color:#eef4ff;">${formatInlineText(h[2])}</div>`
        );
        continue;
      }

      const ul = line.match(/^[-*•]\s+(.*)$/);
      if (ul) {
        flushParagraph();
        if (listType !== "ul") {
          closeList();
          out.push(`<ul style="margin:0; padding-left:18px; display:grid; gap:6px; color:#eef4ff;">`);
          listType = "ul";
        }
        out.push(`<li style="line-height:1.5;">${formatInlineText(ul[1])}</li>`);
        continue;
      }

      const ol = line.match(/^(\d+)[.)]\s+(.*)$/);
      if (ol) {
        flushParagraph();
        if (listType !== "ol") {
          closeList();
          out.push(`<ol style="margin:0; padding-left:20px; display:grid; gap:6px; color:#eef4ff;">`);
          listType = "ol";
        }
        out.push(`<li style="line-height:1.5;">${formatInlineText(ol[2])}</li>`);
        continue;
      }

      paragraph.push(line);
    }

    flushParagraph();
    closeList();

    return `<div style="display:grid; gap:10px;">${out.join("")}</div>`;
  }

  function buildAssistantUtilityBar(rawText) {
    const safeText = encodeURIComponent(String(rawText || ""));
    return `
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:2px;">
        <button
          type="button"
          data-copy-assistant="${safeText}"
          style="
            padding:7px 10px;
            border-radius:10px;
            border:1px solid rgba(255,255,255,.10);
            background:rgba(255,255,255,.05);
            color:#eef4ff;
            cursor:pointer;
            font-size:12px;
          "
        >Copy reply</button>
      </div>
    `;
  }

  function addMessage(role, text, meta = {}) {
    const target = ensureChatShell();

    const row = document.createElement("div");
    row.className = `msg-row msg-${role}`;
    row.style.display = "flex";
    row.style.margin = "10px 0";
    row.style.justifyContent = role === "user" ? "flex-end" : "flex-start";

    const bubble = document.createElement("div");
    bubble.className = `msg-bubble msg-bubble-${role}`;
    bubble.style.maxWidth = "min(860px, 92%)";
    bubble.style.padding = "14px 16px";
    bubble.style.borderRadius = "18px";
    bubble.style.border = "1px solid rgba(255,255,255,.08)";
    bubble.style.background =
      role === "user"
        ? "linear-gradient(180deg, rgba(95,130,255,.20), rgba(75,105,220,.14))"
        : "linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.035))";
    bubble.style.color = "#eef4ff";
    bubble.style.boxShadow = "0 12px 30px rgba(0,0,0,.16)";

    if (meta.html) {
      bubble.innerHTML = meta.html;
    } else {
      bubble.textContent = text || "";
      bubble.style.whiteSpace = "pre-wrap";
      bubble.style.lineHeight = "1.5";
    }

    row.appendChild(bubble);
    target.appendChild(row);

    scrollAfterUiChange();
    return bubble;
  }

  function addImageBubble(url, filename = "") {
    const safeUrl = escapeHtml(url);
    const safeName = escapeHtml(filename || "Uploaded image");

    addMessage("user", "", {
      html: `
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div style="font-size:12px; opacity:.82;">${safeName}</div>
          <img src="${safeUrl}" alt="${safeName}" style="max-width:320px; width:100%; border-radius:14px; border:1px solid rgba(255,255,255,.08);" />
        </div>
      `,
    });
  }

  // -----------------------------
  // 3d helpers
  // -----------------------------
  function isHosted3DUrl(url) {
    const value = String(url || "").trim().toLowerCase();
    if (!value) return false;
    const isHttp = value.startsWith("http://") || value.startsWith("https://");
    const is3d = value.includes(".glb") || value.includes(".gltf");
    return isHttp && is3d;
  }

  function isLocal3DUrl(url) {
    const value = String(url || "").trim().toLowerCase();
    if (!value) return false;
    return /^\/static\/models\/.+\.(glb|gltf)(\?.*)?$/i.test(value);
  }

  function isAny3DUrl(url) {
    return isHosted3DUrl(url) || isLocal3DUrl(url);
  }

  function normalize3DUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    return raw.replace(/[),.;]+$/, "").trim();
  }

  function cleanTierLabel(value) {
    const t = String(value || "").trim().toLowerCase();
    if (!t) return "";
    if (t === "verified") return "Verified";
    if (t === "fallback") return "Backup";
    if (t === "candidate") return "Creative";
    if (t === "concept") return "Concept";
    return titleCase(t);
  }

  function cleanStyleLabel(value) {
    const t = String(value || "").trim().toLowerCase();
    if (!t || t === "default" || t === "fallback") return "";
    if (t === "realistic") return "Realistic";
    if (t === "stylized") return "Stylized";
    return titleCase(t);
  }

  function modelOptionSortScore(item) {
    const tier = String(item?.tier || item?.source || "").toLowerCase();
    const style = String(item?.style || "").toLowerCase();

    const tierScore =
      tier === "verified" ? 0 :
      tier === "candidate" ? 1 :
      tier === "fallback" ? 2 :
      tier === "concept" ? 3 :
      9;

    const styleScore =
      style === "realistic" ? 0 :
      style === "default" ? 1 :
      style === "stylized" ? 2 :
      style === "fallback" ? 3 :
      4;

    return [tierScore, styleScore, String(item?.label || "").toLowerCase()];
  }

  function open3DUrl(src, titleOverride = "") {
    const clean = normalize3DUrl(src);
    if (!clean || !isAny3DUrl(clean) || !window.Simo3DViewer) return false;

    state.lastOpened3DUrl = clean;
    const label =
      titleOverride ||
      titleCase(
        (clean.split("/").pop() || "3d model")
          .split("?")[0]
          .replace(/\.(glb|gltf)$/i, "")
      );

    window.Simo3DViewer.open(clean, `Simo 3D Viewer — ${label}`);
    setTimeout(() => scrollChatToBottom(true), 60);
    setTimeout(() => scrollChatToBottom(true), 180);
    return true;
  }

  function normalizeModelOptions(model3d, topLevelOptions = []) {
    const fromModel =
      model3d && Array.isArray(model3d.model3d_options) ? model3d.model3d_options : [];

    const fromTopLevel = Array.isArray(topLevelOptions) ? topLevelOptions : [];

    const fromChoices =
      model3d && Array.isArray(model3d.choices)
        ? model3d.choices.map((item) => ({
            label: item.label || item.title || "Option",
            url: item.url || "",
            verified: !!item.verified,
            source: item.source || "candidate",
            tier: item.tier || item.source || (item.verified ? "verified" : "candidate"),
            style: item.style || "default",
          }))
        : [];

    const merged = [...fromModel, ...fromTopLevel, ...fromChoices];
    const seen = new Set();
    const out = [];

    for (const item of merged) {
      if (!item || !item.url) continue;
      const url = normalize3DUrl(item.url);
      if (!url || !isAny3DUrl(url)) continue;
      if (seen.has(url)) continue;
      seen.add(url);

      out.push({
        label: String(item.label || item.title || "Option"),
        url,
        verified: !!item.verified,
        source: String(item.source || ""),
        tier: String(item.tier || item.source || (item.verified ? "verified" : "candidate")).toLowerCase(),
        style: String(item.style || "default").toLowerCase(),
      });
    }

    out.sort((a, b) => {
      const aa = modelOptionSortScore(a);
      const bb = modelOptionSortScore(b);
      for (let i = 0; i < aa.length; i++) {
        if (aa[i] < bb[i]) return -1;
        if (aa[i] > bb[i]) return 1;
      }
      return 0;
    });

    return out;
  }

  function getPrimaryModelOption(model3d, topLevelOptions = []) {
    const options = normalizeModelOptions(model3d, topLevelOptions);
    const verified = options.find((x) => x.verified || x.tier === "verified");
    return verified || options[0] || null;
  }

  function badgePill(text, bg, border) {
    return `
      <span style="
        padding:4px 8px;
        border-radius:999px;
        font-size:11px;
        line-height:1;
        color:#eef4ff;
        background:${bg};
        border:1px solid ${border};
        white-space:nowrap;
      ">${escapeHtml(text)}</span>
    `;
  }

  function renderChoiceMeta(item) {
    const bits = [];
    const tier = String(item?.tier || item?.source || "").toLowerCase();
    const style = String(item?.style || "").toLowerCase();

    if (tier === "verified") bits.push(badgePill("Verified", "rgba(72,170,110,.18)", "rgba(72,170,110,.26)"));
    else if (tier === "fallback") bits.push(badgePill("Backup", "rgba(255,183,77,.16)", "rgba(255,183,77,.22)"));
    else if (tier === "candidate") bits.push(badgePill("Creative", "rgba(110,168,255,.16)", "rgba(110,168,255,.24)"));
    else if (tier === "concept") bits.push(badgePill("Concept", "rgba(176,120,255,.16)", "rgba(176,120,255,.24)"));

    if (style === "realistic") bits.push(badgePill("Realistic", "rgba(255,255,255,.06)", "rgba(255,255,255,.10)"));
    else if (style === "stylized") bits.push(badgePill("Stylized", "rgba(255,255,255,.06)", "rgba(255,255,255,.10)"));

    return bits.join("");
  }

  function getChoiceDescription(item, isPrimary = false) {
    const tier = String(item?.tier || item?.source || "").toLowerCase();
    const style = String(item?.style || "").toLowerCase();

    if (tier === "fallback") return "Reliable backup option you can still open right now.";
    if (tier === "verified") return isPrimary ? "Best ready-to-open model for this request." : "Verified working model ready to preview.";
    if (tier === "candidate" && style === "stylized") return isPrimary ? "Recommended creative option with a more stylized look." : "Creative alternative with a more stylized look.";
    if (tier === "candidate") return isPrimary ? "Recommended preview option for this request." : "Alternative preview option to compare.";
    if (tier === "concept") return "Concept-only direction for future expansion.";
    return isPrimary ? "Recommended option for this request." : "Additional option to explore.";
  }

  function previewGradientForChoice(item, isPrimary = false) {
    const tier = String(item?.tier || item?.source || "").toLowerCase();
    const style = String(item?.style || "").toLowerCase();

    if (isPrimary || tier === "verified") return "linear-gradient(135deg, rgba(90,140,255,.28), rgba(145,108,255,.18))";
    if (tier === "fallback") return "linear-gradient(135deg, rgba(255,192,120,.18), rgba(255,160,100,.10))";
    if (style === "stylized") return "linear-gradient(135deg, rgba(176,120,255,.20), rgba(110,168,255,.12))";
    return "linear-gradient(135deg, rgba(110,168,255,.16), rgba(255,255,255,.04))";
  }

  function choiceButtonHtml(item, index, groupId, primary) {
    const label = escapeHtml(item.label || `Option ${index + 1}`);
    const rawUrl = String(item.url || "");
    const safeUrl = encodeURIComponent(rawUrl);
    const isSelected = primary && primary.url === item.url;
    const description = escapeHtml(getChoiceDescription(item, isSelected));
    const previewLabel = escapeHtml(cleanTierLabel(item?.tier || item?.source || "") || "Option");
    const previewStyle = escapeHtml(cleanStyleLabel(item?.style || "") || "Ready");
    const previewBg = previewGradientForChoice(item, isSelected);

    return `
      <button
        type="button"
        class="simo-model-choice-btn"
        data-model-group="${escapeHtml(groupId)}"
        data-model-choice-url="${safeUrl}"
        data-model-choice-label="${label}"
        style="
          appearance:none;
          border:1px solid ${isSelected ? "rgba(110,168,255,.46)" : "rgba(255,255,255,.10)"};
          background:${isSelected ? "linear-gradient(180deg, rgba(110,168,255,.18), rgba(90,120,255,.10))" : "rgba(255,255,255,.055)"};
          box-shadow:${isSelected ? "0 10px 28px rgba(80,120,255,.18), inset 0 0 0 1px rgba(255,255,255,.02)" : "none"};
          color:#eef4ff;
          padding:9px;
          border-radius:13px;
          cursor:pointer;
          font:inherit;
          display:flex;
          flex-direction:column;
          align-items:flex-start;
          gap:6px;
          min-width:210px;
          flex:1 1 210px;
          text-align:left;
          transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease;
        "
      >
        <div style="
          width:100%;
          height:48px;
          border-radius:11px;
          background:${previewBg};
          border:1px solid rgba(255,255,255,.08);
          display:flex;
          align-items:flex-end;
          justify-content:space-between;
          padding:7px;
          box-sizing:border-box;
          overflow:hidden;
        ">
          <div style="display:grid; gap:2px;">
            <div style="font-size:11px; font-weight:700; color:#eef4ff;">${previewLabel}</div>
            <div style="font-size:10px; color:rgba(235,242,255,.78);">${previewStyle}</div>
          </div>
          <div style="
            width:24px;
            height:24px;
            border-radius:999px;
            background:rgba(255,255,255,.08);
            border:1px solid rgba(255,255,255,.10);
            display:flex;
            align-items:center;
            justify-content:center;
            font-size:11px;
          ">✦</div>
        </div>

        <div style="display:flex; width:100%; justify-content:space-between; gap:7px; align-items:flex-start;">
          <span style="font-weight:700; font-size:12px; line-height:1.22;">${label}</span>
          ${isSelected ? `<span>${badgePill("Recommended", "rgba(110,168,255,.14)", "rgba(110,168,255,.22)")}</span>` : ""}
        </div>

        <div style="display:flex; gap:5px; flex-wrap:wrap;">
          ${renderChoiceMeta(item)}
        </div>

        <div style="font-size:11.5px; line-height:1.28; color:rgba(235,242,255,.80); min-height:18px;">
          ${description}
        </div>

        <div style="margin-top:2px; font-size:11.5px; font-weight:700; color:${isSelected ? "#cfe0ff" : "#eef4ff"};">
          Open model →
        </div>
      </button>
    `;
  }

  function buildChoiceGroups(options, primary) {
    const groups = { recommended: [], creative: [], backup: [] };
    options.forEach((item) => {
      const tier = String(item?.tier || item?.source || "").toLowerCase();
      const isPrimary = primary && primary.url === item.url;
      if (isPrimary || tier === "verified") groups.recommended.push(item);
      else if (tier === "fallback") groups.backup.push(item);
      else groups.creative.push(item);
    });
    return groups;
  }

  function renderChoiceGroupSection(groupKey, items, groupId, primary) {
    if (!items || !items.length) return "";

    const label =
      groupKey === "recommended" ? "Recommended" :
      groupKey === "creative" ? "Creative" :
      "Backup";

    const sub =
      groupKey === "recommended" ? "Best place to start" :
      groupKey === "creative" ? "Alternative looks and directions" :
      "Safer fallback choices";

    const cards = items.map((item, index) => choiceButtonHtml(item, index, groupId, primary)).join("");

    return `
      <section style="display:grid; grid-template-columns:110px minmax(0,1fr); gap:6px; align-items:start;">
        <div style="display:grid; gap:1px; padding-top:2px;">
          <div style="font-size:12px; font-weight:700; color:#eaf1ff;">${escapeHtml(label)}</div>
          <div style="font-size:10.5px; line-height:1.18; color:rgba(235,242,255,.65);">${escapeHtml(sub)}</div>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:stretch;">
          ${cards}
        </div>
      </section>
    `;
  }

  function build3DChoicesHtml(model3d, topLevelOptions = []) {
    const options = normalizeModelOptions(model3d, topLevelOptions);
    if (!options.length) return "";

    const primary = getPrimaryModelOption(model3d, topLevelOptions) || options[0];
    const safeObject = escapeHtml(
      titleCase((model3d && (model3d.object_name || model3d.name || model3d.label)) || "3d model")
    );

    const groupId = `model-choice-group-${Math.random().toString(36).slice(2, 10)}`;
    const summaryTier = cleanTierLabel(primary?.tier || primary?.source || "");
    const summaryStyle = cleanStyleLabel(primary?.style || "");
    const summaryLabel = [summaryTier, summaryStyle].filter(Boolean).join(" • ");
    const grouped = buildChoiceGroups(options, primary);

    return `
      <div
        data-model-choice-wrap="${escapeHtml(groupId)}"
        data-primary-model-url="${encodeURIComponent(primary.url || "")}"
        style="
          margin-top:6px;
          padding:8px;
          border:1px solid rgba(255,255,255,.08);
          background:linear-gradient(180deg, rgba(255,255,255,.032), rgba(255,255,255,.018));
          border-radius:14px;
          display:grid;
          gap:6px;
        "
      >
        <div style="
          display:grid;
          grid-template-columns:minmax(0,1fr) auto;
          gap:8px;
          align-items:start;
          padding:2px 2px 4px;
        ">
          <div style="display:grid; gap:2px; min-width:0;">
            <div style="font-size:.95rem; font-weight:700; color:#eef4ff;">3D options for ${safeObject}</div>
            <div style="font-size:11px; color:rgba(235,242,255,.72); line-height:1.22;">
              ${escapeHtml(summaryLabel ? `Recommended option ready • ${summaryLabel}` : "Recommended option ready")}
            </div>
          </div>
          <button
            type="button"
            data-role="open-recommended"
            data-model-group="${escapeHtml(groupId)}"
            data-model-choice-url="${encodeURIComponent(primary.url)}"
            data-model-choice-label="${escapeHtml(primary.label || "Recommended Model")}"
            style="
              padding:8px 10px;
              border-radius:12px;
              border:1px solid rgba(110,168,255,.24);
              background:rgba(110,168,255,.12);
              color:#eef4ff;
              cursor:pointer;
              font:inherit;
              font-weight:700;
              font-size:11.5px;
              white-space:nowrap;
            "
          >Open recommended</button>
        </div>

        <div style="display:grid; gap:5px;">
          ${renderChoiceGroupSection("recommended", grouped.recommended, groupId, primary)}
          ${renderChoiceGroupSection("creative", grouped.creative, groupId, primary)}
          ${renderChoiceGroupSection("backup", grouped.backup, groupId, primary)}
        </div>
      </div>
    `;
  }

  function bindBubbleActions(scope) {
    if (!scope) return;

    $$("[data-copy-assistant]", scope).forEach((btn) => {
      if (btn.dataset.boundCopy === "true") return;
      btn.dataset.boundCopy = "true";

      btn.addEventListener("click", async () => {
        const raw = decodeURIComponent(btn.getAttribute("data-copy-assistant") || "");
        await copyTextToClipboard(raw, "Reply copied.");
      });
    });

    $$("[data-model-choice-url]", scope).forEach((btn) => {
      if (btn.dataset.boundModelChoice === "true") return;
      btn.dataset.boundModelChoice = "true";

      btn.addEventListener("click", () => {
        const url = decodeURIComponent(btn.getAttribute("data-model-choice-url") || "");
        const label = btn.getAttribute("data-model-choice-label") || "3D Model";
        if (!open3DUrl(url, label)) {
          toast("That 3D model could not be opened.", "error", 3000);
        }
      });
    });
  }

  function addAssistantMessageWith3D(reply, model3d = null, topLevelOptions = []) {
    const rawReply = String(reply || "Done.");
    const formattedReply = renderAssistantTextHtml(rawReply);
    const utilityBar = buildAssistantUtilityBar(rawReply);
    const choicesHtml = build3DChoicesHtml(model3d, topLevelOptions);

    const bubble = addMessage("assistant", "", {
      html: `
        <div style="display:grid; gap:8px;">
          ${formattedReply}
          ${utilityBar}
          ${choicesHtml}
        </div>
      `,
    });

    bindBubbleActions(bubble);
    return bubble;
  }

  function addCandidateMessage(reply, candidates = [], objectName = "") {
    const cleanCandidates = (Array.isArray(candidates) ? candidates : []).filter(Boolean);
    const rawReply = String(reply || "I found candidate assets to review.");

    const choicesHtml = build3DChoicesHtml(
      {
        available: cleanCandidates.some((c) => c && c.url),
        model3d_options: cleanCandidates.map((c, idx) => ({
          label: c.label || c.title || `${titleCase(objectName || "Option")} ${idx + 1}`,
          url: c.url || "",
          verified: !!c.verified,
          source: c.source || "candidate",
          tier: c.tier || c.source || (c.verified ? "verified" : "candidate"),
          style: c.style || "default",
        })),
        object_name: objectName || "3d model",
        name: objectName || "3d model",
      },
      cleanCandidates
    );

    const cards = cleanCandidates
      .map((item, idx) => {
        const url = String(item.url || "");
        const hasUrl = !!url;
        const title = escapeHtml(
          item.title || item.label || `${titleCase(objectName || "Candidate")} ${idx + 1}`
        );
        const description = escapeHtml(
          getChoiceDescription(
            {
              tier: item.tier || item.source || (item.verified ? "verified" : "candidate"),
              style: item.style || "default",
            },
            idx === 0
          )
        );

        return `
          <div style="
            padding:10px;
            border-radius:14px;
            background:rgba(255,255,255,.05);
            border:1px solid rgba(255,255,255,.08);
            display:grid;
            gap:6px;
          ">
            <div style="display:flex; justify-content:space-between; gap:8px; align-items:flex-start; flex-wrap:wrap;">
              <div style="font-weight:700; color:#eef4ff;">${title}</div>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                ${renderChoiceMeta({
                  tier: item.tier || item.source || (item.verified ? "verified" : "candidate"),
                  source: item.source || "",
                  style: item.style || "default",
                })}
              </div>
            </div>

            <div style="font-size:12px; color:rgba(235,242,255,.76); line-height:1.42;">
              ${description}
            </div>

            ${
              hasUrl
                ? `
                  <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button
                      type="button"
                      data-candidate-open="${escapeHtml(url)}"
                      data-candidate-title="${title}"
                      style="
                        padding:8px 10px;
                        border-radius:12px;
                        border:1px solid rgba(255,255,255,.10);
                        background:rgba(255,255,255,.06);
                        color:#eef4ff;
                        cursor:pointer;
                      "
                    >Open Candidate</button>
                  </div>
                `
                : `
                  <div style="font-size:12px; color:#ffd7a8;">
                    No direct model URL is loaded for this candidate yet.
                  </div>
                `
            }
          </div>
        `;
      })
      .join("");

    const bubble = addMessage("assistant", "", {
      html: `
        <div style="display:grid; gap:8px;">
          ${renderAssistantTextHtml(rawReply)}
          ${buildAssistantUtilityBar(rawReply)}
          ${choicesHtml}
          <div style="display:grid; gap:8px;">
            ${cards || `<div style="font-size:13px; opacity:.85;">No candidate cards available yet.</div>`}
          </div>
        </div>
      `,
    });

    bindBubbleActions(bubble);

    $$("[data-candidate-open]", bubble).forEach((btn) => {
      if (btn.dataset.boundCandidate === "true") return;
      btn.dataset.boundCandidate = "true";

      btn.addEventListener("click", () => {
        const url = btn.getAttribute("data-candidate-open") || "";
        const title = btn.getAttribute("data-candidate-title") || "Candidate";
        if (!open3DUrl(url, title)) {
          toast("That candidate URL is not a supported 3D model yet.", "error", 3000);
        }
      });
    });
  }

  function setSending(isSending) {
    state.sending = isSending;

    if (sendBtn) {
      sendBtn.disabled = isSending;
      sendBtn.textContent = isSending ? "..." : "➤";
    }

    if (loadingHintEl) {
      loadingHintEl.textContent = isSending ? "Simo is thinking..." : "Ready.";
    }
  }

  // -----------------------------
  // builder detection / preview
  // -----------------------------
  function isLikelyHtml(text) {
    if (!text) return false;
    const t = String(text).trim();
    return (
      t.startsWith("<!DOCTYPE html") ||
      t.startsWith("<html") ||
      (t.includes("<body") && t.includes("</")) ||
      (t.includes("<div") && t.includes("</div>"))
    );
  }

  function extractHtmlCandidate(text) {
    const raw = String(text || "").trim();
    if (!raw) return "";

    const fenced = raw.match(/```html\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) return fenced[1].trim();
    if (isLikelyHtml(raw)) return raw;

    const doctypeIndex = raw.indexOf("<!DOCTYPE html");
    if (doctypeIndex >= 0) return raw.slice(doctypeIndex).trim();

    const htmlIndex = raw.indexOf("<html");
    if (htmlIndex >= 0) return raw.slice(htmlIndex).trim();

    return "";
  }

  function inferBuildTitleFromText(text) {
    const raw = String(text || "").trim();
    if (!raw) return "Untitled Build";

    const html = extractHtmlCandidate(raw);
    if (html) {
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        const title = titleMatch[1].replace(/\s+/g, " ").trim();
        if (title) return title.slice(0, 80);
      }
    }

    const firstLine = raw.split("\n").find(Boolean) || raw.slice(0, 60);
    return firstLine.replace(/[#>*`]/g, "").trim().slice(0, 80) || "Untitled Build";
  }

  function maybeHandleBuilderResponse(text) {
    const html = extractHtmlCandidate(text);
    if (!html) return { handled: false, html: "", title: "" };

    state.draftHtml = html;
    const title = inferBuildTitleFromText(text);
    openPreviewModal(html, title);

    return {
      handled: true,
      html,
      title,
    };
  }

  function tryOpenVerified3DFromPayload(data) {
    if (!data || !data.model3d) return false;

    const model3d = data.model3d;
    if (!model3d.available) return false;

    const primary = getPrimaryModelOption(model3d, data.model3d_options || []);
    if (!primary || !primary.url) return false;

    const tier = String(
      primary.tier || model3d.tier || model3d.route_type || primary.source || ""
    ).toLowerCase();

    if (!(primary.verified || tier === "verified")) return false;

    const label = titleCase(
      primary.label || model3d.label || model3d.name || model3d.object_name || "3d model"
    );

    return open3DUrl(primary.url, label);
  }

  function maybeToastRouteInfo(data) {
    const model3d = data && data.model3d;
    if (!model3d) return;

    if (model3d.route_type === "concept") {
      toast("Concept mode ready.", "info", 2200);
    }
  }

  // -----------------------------
  // uploads / analyze
  // -----------------------------
  async function uploadSelectedImage(file) {
    if (!file) return null;

    const fd = new FormData();
    fd.append("image", file);

    const res = await fetch("/api/upload-image", {
      method: "POST",
      body: fd,
      credentials: "same-origin",
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error((data && data.error) || "Image upload failed.");
    }

    state.selectedImageUrl = data.url || "";
    state.selectedImageFilename = data.filename || file.name || "";

    if (state.selectedImageUrl) {
      addImageBubble(state.selectedImageUrl, state.selectedImageFilename);
      toast("Image uploaded.", "success");
    }

    return data;
  }

  async function analyzeLastImage() {
    try {
      const prompt =
        (inputEl && inputEl.value && inputEl.value.trim()) ||
        "Analyze this image in detail.";

      const data = await api("/api/analyze-image", {
        method: "POST",
        body: JSON.stringify({ prompt }),
      });

      if (data && data.ok) {
        const reply = String(data.reply || "Done.");
        state.lastAssistantText = reply;
        addAssistantMessageWith3D(reply);
        scrollAfterUiChange();
        return data;
      }

      throw new Error("Image analysis failed.");
    } catch (err) {
      toast(err.message || "Image analysis failed.", "error");
      return null;
    }
  }

  // -----------------------------
  // publish helpers
  // -----------------------------
  function getPublishHtml() {
    return String(state.lastPreviewHtml || state.draftHtml || "").trim();
  }

  function derivePublishSlug(title, html) {
    const fromTitle = slugify(title || "");
    if (fromTitle && fromTitle !== "simo-build") return fromTitle;

    const titleMatch = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      const slug = slugify(titleMatch[1]);
      if (slug) return slug;
    }

    return `simo-build-${Date.now()}`;
  }

  function normalizePublishResponse(data, attemptedSlug) {
    if (!data || typeof data !== "object") return null;

    const url =
      data.url ||
      data.published_url ||
      data.publish_url ||
      data.share_url ||
      data.preview_url ||
      (data.path ? toAbsoluteUrl(data.path) : "") ||
      (data.slug ? toAbsoluteUrl(`/published/${data.slug}`) : "");

    const slug = String(data.slug || attemptedSlug || "").trim();

    if (!url) return null;

    return {
      url: toAbsoluteUrl(url),
      slug,
      raw: data,
    };
  }

  async function tryPublishRequest(endpoint, payload) {
    const res = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json") ? await res.json() : await res.text();

    if (!res.ok) {
      const msg =
        (data && data.error) ||
        (data && data.message) ||
        (typeof data === "string" ? data : `Publish failed: ${res.status}`);
      throw new Error(msg);
    }

    return data;
  }

  function ensurePublishModalDom() {
    if ($("publishResultModal") && $("publishResultUrl")) return;

    const modal = document.createElement("div");
    modal.id = "publishResultModal";
    modal.hidden = true;
    modal.style.position = "fixed";
    modal.style.inset = "0";
    modal.style.background = "rgba(0,0,0,.72)";
    modal.style.zIndex = "99986";
    modal.style.display = "none";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";
    modal.style.padding = "20px";

    modal.innerHTML = `
      <div style="
        width:min(720px, 96vw);
        display:flex;
        flex-direction:column;
        overflow:hidden;
        border-radius:24px;
        background:linear-gradient(180deg, rgba(10,16,30,.98), rgba(7,12,22,.98));
        border:1px solid rgba(255,255,255,.10);
        box-shadow:0 30px 80px rgba(0,0,0,.42);
        color:#eef4ff;
      ">
        <div style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:12px;
          padding:14px 16px;
          border-bottom:1px solid rgba(255,255,255,.08);
        ">
          <div style="font-weight:700;">Publish Result</div>
          <button id="publishResultCloseBtn" type="button">Close</button>
        </div>

        <div style="padding:16px; display:grid; gap:14px;">
          <div id="publishResultStatus" style="font-size:14px; color:#dfe9ff;">
            Your build was published.
          </div>

          <div style="
            padding:12px;
            border-radius:14px;
            border:1px solid rgba(255,255,255,.10);
            background:rgba(255,255,255,.05);
            overflow:auto;
            word-break:break-all;
            font-size:13px;
          ">
            <div id="publishResultUrl"></div>
          </div>

          <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end;">
            <button id="copyPublishUrlBtn" type="button">Copy Link</button>
            <button id="openPublishUrlBtn" type="button">Open Link</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    [
      "publishResultCloseBtn",
      "copyPublishUrlBtn",
      "openPublishUrlBtn",
    ]
      .map($)
      .forEach(styleActionButton);
  }

  function openPublishResultModal(url, slug = "") {
    ensurePublishModalDom();

    const modal = $("publishResultModal");
    const statusEl = $("publishResultStatus");
    const urlEl = $("publishResultUrl");
    const safeUrl = toAbsoluteUrl(url);

    state.publish.lastUrl = safeUrl;
    state.publish.lastSlug = slug || "";

    if (statusEl) {
      statusEl.textContent = slug
        ? `Your build was published successfully as "${slug}".`
        : "Your build was published successfully.";
    }

    if (urlEl) {
      urlEl.innerHTML = `
        <a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" style="color:#cfe0ff; text-decoration:underline;">
          ${escapeHtml(safeUrl)}
        </a>
      `;
    }

    modalOpen(modal);
  }

  function closePublishResultModal() {
    modalClose($("publishResultModal"));
  }

  function setPublishBusy(isBusy) {
    state.publish.busy = isBusy;

    const publishModalBtn = $("publishBuildBtn");
    const publishTopBtn = publishBtn;

    [publishModalBtn, publishTopBtn].forEach((btn) => {
      if (!btn) return;
      btn.disabled = isBusy;
      btn.textContent = isBusy ? "Publishing..." : "Publish";
    });
  }

  async function publishCurrentBuild() {
    const html = getPublishHtml();
    if (!html) {
      toast("No build is loaded to publish.", "error");
      return;
    }

    if (state.publish.busy) return;

    setPublishBusy(true);

    try {
      const title = String(state.lastPreviewTitle || inferBuildTitleFromText(html) || "Untitled Build").trim();
      const slug = derivePublishSlug(title, html);

      const payload = {
        title,
        slug,
        html,
        sourceText: state.lastAssistantText || "",
      };

      const endpoints = [
        "/api/publish",
        "/api/publish-build",
        "/api/builder/publish",
      ];

      let published = null;
      let lastErr = null;

      for (const endpoint of endpoints) {
        try {
          const data = await tryPublishRequest(endpoint, payload);
          published = normalizePublishResponse(data, slug);

          if (published && published.url) {
  closeLibrary();
  document.body.classList.remove("modal-open");
  document.body.style.overflow = "";
  break;
}

          lastErr = new Error(`Endpoint responded without a publish URL: ${endpoint}`);
        } catch (err) {
          lastErr = err;
        }
      }

      if (!published || !published.url) {
        throw lastErr || new Error("Publish endpoint is not ready yet.");
      }

      openPublishResultModal(published.url, published.slug || slug);
      toast("Build published.", "success", 2200);
    } catch (err) {
      const msg = String(err?.message || "Publish failed.");

      if (/404|not found|endpoint|route/i.test(msg)) {
        toast("Publish backend is not wired yet. Preview, Save, Download, and Open in New Tab still work.", "error", 4600);
      } else {
        toast(msg, "error", 4200);
      }
    } finally {
      setPublishBusy(false);
    }
  }

  // -----------------------------
  // preview modal
  // -----------------------------
  function modalOpen(el) {
    if (!el) return;
    el.hidden = false;
    el.style.display = "flex";
    el.dataset.modalVisible = "true";
    document.body.classList.add("modal-open");
  }

  function modalClose(el) {
    if (!el) return;
    el.hidden = true;
    el.style.display = "none";
    delete el.dataset.modalVisible;

    if (!document.querySelector('[data-modal-visible="true"]')) {
      document.body.classList.remove("modal-open");
    }
  }

  function ensurePreviewModalDom() {
    if ($("builderPreviewModal") && $("builderPreviewFrame")) return;

    const modal = document.createElement("div");
    modal.id = "builderPreviewModal";
    modal.hidden = true;
    modal.style.position = "fixed";
    modal.style.inset = "0";
    modal.style.background = "rgba(0,0,0,.72)";
    modal.style.zIndex = "99980";
    modal.style.display = "none";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";
    modal.style.padding = "20px";

    modal.innerHTML = `
    <div style="
      width:min(1180px, 96vw);
      height:min(820px, 92vh);
      display:flex;
      flex-direction:column;
      overflow:hidden;
      border-radius:24px;
      background:linear-gradient(180deg, rgba(10,16,30,.98), rgba(7,12,22,.98));
      border:1px solid rgba(255,255,255,.10);
      box-shadow:0 30px 80px rgba(0,0,0,.42);
    ">
      <div style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        padding:14px 16px;
        color:#eef4ff;
        border-bottom:1px solid rgba(255,255,255,.08);
      ">
        <div id="builderPreviewTitle" style="
          font-weight:700;
          min-width:0;
          flex:1 1 auto;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        ">Simo Builder Preview</div>

        <div style="
          display:flex;
          gap:8px;
          flex-wrap:nowrap;
          align-items:center;
          justify-content:flex-end;
          flex:0 0 auto;
        ">
          <button id="showHtmlBtn" type="button">Show HTML</button>
          <button id="openPreviewTabBtn" type="button">Open in New Tab</button>
          <button id="downloadHtmlBtn" type="button">Download HTML</button>
          <button id="saveBuildBtn" type="button">Save</button>
          <button id="publishBuildBtn" type="button">Publish</button>
          <button id="builderPreviewClose" type="button">Close</button>
        </div>
      </div>

      <div style="flex:1; display:flex; min-height:0;">
        <iframe
          id="builderPreviewFrame"
          style="
            flex:1;
            width:100%;
            height:100%;
            border:0;
            background:#fff;
            display:block;
          "
        ></iframe>

        <pre
          id="builderPreviewHtml"
          hidden
          style="
            display:none;
            margin:0;
            width:100%;
            height:100%;
            overflow:auto;
            padding:18px;
            box-sizing:border-box;
            color:#eaf2ff;
            background:#07111f;
            white-space:pre-wrap;
          "
        ></pre>
      </div>
    </div>
  `;

    document.body.appendChild(modal);

    [
      "showHtmlBtn",
      "openPreviewTabBtn",
      "downloadHtmlBtn",
      "saveBuildBtn",
      "publishBuildBtn",
      "builderPreviewClose",
    ]
      .map($)
      .forEach(styleActionButton);
  }

  function openPreviewModal(html, title = "Simo Builder Preview") {
    ensurePreviewModalDom();

    const modal = $("builderPreviewModal");
    const frame = $("builderPreviewFrame");
    const htmlEl = $("builderPreviewHtml");
    const titleEl = $("builderPreviewTitle");
    const showBtn = $("showHtmlBtn");

    state.lastPreviewHtml = String(html || "");
    state.lastPreviewTitle = String(title || "Simo Builder Preview");
    state.currentPreviewMode = "render";

    if (titleEl) titleEl.textContent = state.lastPreviewTitle;
    if (frame) frame.srcdoc = state.lastPreviewHtml;
    if (htmlEl) {
      htmlEl.textContent = state.lastPreviewHtml;
      hide(htmlEl);
    }
    if (frame) show(frame);
    if (showBtn) showBtn.textContent = "Show HTML";

    saveLastPreview(state.lastPreviewHtml, state.lastPreviewTitle);
    modalOpen(modal);
    scrollAfterUiChange();
  }

  function closePreviewModal() {
    modalClose($("builderPreviewModal"));
    updateReopenLastPreviewVisibility();
    updateRecentBuildsVisibility();
  }

  function togglePreviewHtml() {
    const frame = $("builderPreviewFrame");
    const htmlEl = $("builderPreviewHtml");
    const btn = $("showHtmlBtn");

    if (!frame || !htmlEl || !btn) return;

    if (state.currentPreviewMode === "render") {
      hide(frame);
      show(htmlEl);
      btn.textContent = "Show Preview";
      state.currentPreviewMode = "html";
    } else {
      show(frame);
      hide(htmlEl);
      btn.textContent = "Show HTML";
      state.currentPreviewMode = "render";
    }
  }

  function openPreviewInNewTab() {
    const html = state.lastPreviewHtml || "";
    if (!html) {
      toast("No preview is loaded.", "error");
      return;
    }

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function downloadPreviewHtml() {
    const html = state.lastPreviewHtml || "";
    if (!html) {
      toast("No HTML available to download.", "error");
      return;
    }

    try {
      const filename = `${slugify(state.lastPreviewTitle || "simo-build")}.html`;

      try {
        const res = await fetch("/api/download-html", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html, filename }),
        });

        if (!res.ok) throw new Error("Server download failed.");

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast("HTML downloaded.", "success");
        return;
      } catch {
        // local fallback
      }

      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast("HTML downloaded.", "success");
    } catch (err) {
      toast(err.message || "Download failed.", "error");
    }
  }

  function saveCurrentBuild() {
    const html = state.lastPreviewHtml || state.draftHtml || "";
    if (!html) {
      toast("No build to save yet.", "error");
      return;
    }

    const items = getLibrary();
    const title = state.lastPreviewTitle || "Untitled Build";
    const item = generateLibraryItem({
      title,
      html,
      sourceText: state.lastAssistantText || "",
    });

    items.unshift(item);
    setLibrary(items);
    toast("Build saved to Builder Library.", "success");
    renderLibrary();
  }

  function updateReopenLastPreviewVisibility() {
    if (!reopenLastPreviewBtn) return;

    const last = getLastPreview();
    const hasPreview = !!(last && last.html);

    if (hasPreview) {
      revealPill(reopenLastPreviewBtn, "inline-flex");
    } else {
      concealPill(reopenLastPreviewBtn);
    }
  }

  function ensureRecentBuildsTrigger() {
    let btn = getRecentBuildsBtn();
    if (btn) {
      styleSidebarPill(btn);
      return btn;
    }

    const anchor = reopenLastPreviewBtn || openLibraryBtn;
    if (!anchor || !anchor.parentNode) return null;

    btn = document.createElement("button");
    btn.id = "recentBuildsBtn";
    btn.type = "button";
    btn.className = "pill hidden";
    btn.textContent = "Recent Builds";
    styleSidebarPill(btn);

    anchor.insertAdjacentElement("afterend", btn);
    syncLibraryTriggerVisuals();
    return btn;
  }

  function updateRecentBuildsVisibility() {
    const btn = ensureRecentBuildsTrigger();
    if (!btn) return;

    const history = getPreviewHistory();
    if (history.length) {
      revealPill(btn, "inline-flex");
    } else {
      concealPill(btn);
    }
  }

  function ensureRecentBuildsModalDom() {
    if ($("recentBuildsModal") && $("recentBuildsList")) return;

    const modal = document.createElement("div");
    modal.id = "recentBuildsModal";
    modal.hidden = true;
    modal.style.position = "fixed";
    modal.style.inset = "0";
    modal.style.background = "rgba(0,0,0,.72)";
    modal.style.zIndex = "99984";
    modal.style.display = "none";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";
    modal.style.padding = "20px";

    modal.innerHTML = `
      <div style="
        width:min(760px, 96vw);
        max-height:min(88vh, 900px);
        overflow:hidden;
        display:flex;
        flex-direction:column;
        border-radius:24px;
        background:linear-gradient(180deg, rgba(10,16,30,.98), rgba(7,12,22,.98));
        border:1px solid rgba(255,255,255,.10);
        box-shadow:0 30px 80px rgba(0,0,0,.42);
        color:#eef4ff;
      ">
        <div style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:12px;
          padding:14px 16px;
          border-bottom:1px solid rgba(255,255,255,.08);
        ">
          <div>
            <div style="font-size:17px; font-weight:800;">Recent Builds</div>
            <div style="font-size:12px; color:rgba(235,242,255,.70); margin-top:4px;">
              Simo remembers your most recent previews.
            </div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button id="clearRecentBuildsBtn" type="button">Clear</button>
            <button id="recentBuildsCloseBtn" type="button">Close</button>
          </div>
        </div>

        <div id="recentBuildsList" style="
          padding:16px;
          overflow:auto;
          display:grid;
          gap:12px;
        "></div>
      </div>
    `;

    document.body.appendChild(modal);

    ["clearRecentBuildsBtn", "recentBuildsCloseBtn"]
      .map($)
      .forEach(styleActionButton);
  }

  function renderRecentBuilds() {
    const list = $("recentBuildsList");
    if (!list) return;

    const history = getPreviewHistory();

    if (!history.length) {
      list.innerHTML = `
        <div style="
          padding:18px;
          border-radius:18px;
          background:rgba(255,255,255,.04);
          border:1px solid rgba(255,255,255,.08);
          color:#dbe6ff;
        ">
          No recent previews yet.
        </div>
      `;
      return;
    }

    list.innerHTML = history
      .map(
        (item) => `
          <div data-recent-preview-id="${escapeHtml(item.id)}" style="
            padding:14px;
            border-radius:18px;
            background:linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.035));
            border:1px solid rgba(255,255,255,.09);
            color:#eef4ff;
            display:grid;
            gap:10px;
          ">
            <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap;">
              <div style="min-width:220px; flex:1;">
                <div style="font-size:15px; font-weight:700;">${escapeHtml(item.title || "Untitled Preview")}</div>
                <div style="font-size:12px; color:rgba(235,242,255,.72); margin-top:6px;">
                  Saved ${escapeHtml(prettyDate(item.savedAt))}
                </div>
              </div>

              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button type="button" data-recent-action="open">Open</button>
                <button type="button" data-recent-action="copy-title">Copy Title</button>
                <button type="button" data-recent-action="remove">Remove</button>
              </div>
            </div>
          </div>
        `
      )
      .join("");

    $$("[data-recent-preview-id]", list).forEach((card) => {
      const id = card.getAttribute("data-recent-preview-id") || "";
      const historyNow = getPreviewHistory();
      const item = historyNow.find((x) => x.id === id);
      if (!item) return;

      $$("button[data-recent-action]", card).forEach((btn) => {
        styleActionButton(btn);

        btn.addEventListener("click", async () => {
          const action = btn.getAttribute("data-recent-action");

          if (action === "open") {
            openBuilderPreview(item.html || "", item.title || "Untitled Build");
            return;
          }

          if (action === "copy-title") {
            await copyTextToClipboard(item.title || "Untitled Preview", "Preview title copied.");
            return;
          }

          if (action === "remove") {
            const next = getPreviewHistory().filter((x) => x.id !== id);
            setPreviewHistory(next);
            updateRecentBuildsVisibility();
            if (!next.length) {
              closeRecentBuilds();
            }
          }
        });
      });
    });
  }

  function openRecentBuilds() {
    ensureRecentBuildsModalDom();
    renderRecentBuilds();
    modalOpen($("recentBuildsModal"));
  }

  function closeRecentBuilds() {
    modalClose($("recentBuildsModal"));
  }

  // -----------------------------
  // library
  // -----------------------------
  function computeLibraryStats(items) {
    return {
      total: items.length,
      active: items.filter((x) => !x.archived).length,
      archived: items.filter((x) => x.archived).length,
      pinned: items.filter((x) => x.pinned).length,
      tagged: items.filter((x) => x.tags && x.tags.length > 0).length,
    };
  }

  function statChip(label, value) {
    return `
      <div style="
        padding:8px 12px;
        border-radius:999px;
        background:rgba(255,255,255,.05);
        border:1px solid rgba(255,255,255,.08);
        color:#eef4ff;
        font-size:13px;
      ">
        <strong>${escapeHtml(label)}:</strong> ${value}
      </div>
    `;
  }

  function renderStatsBar(items) {
    const el = $("builderLibraryStats");
    if (!el) return;

    const s = computeLibraryStats(items);
    el.innerHTML = `
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        ${statChip("Total", s.total)}
        ${statChip("Active", s.active)}
        ${statChip("Archived", s.archived)}
        ${statChip("Pinned", s.pinned)}
        ${statChip("Tagged", s.tagged)}
      </div>
    `;
  }

  function renderFilterChips() {
    const wrap = $("builderLibraryFilters");
    if (!wrap) return;

    const chips = [
      ["all", "All"],
      ["pinned", "Pinned"],
      ["tagged", "Tagged"],
      ["with-notes", "With Notes"],
      ["archived", "Archived"],
    ];

    wrap.innerHTML = `
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        ${chips
          .map(
            ([key, label]) => `
          <button
            type="button"
            data-filter-chip="${escapeHtml(key)}"
            style="
              padding:8px 12px;
              border-radius:999px;
              border:1px solid rgba(255,255,255,.10);
              background:${state.currentFilter === key ? "rgba(97,140,255,.22)" : "rgba(255,255,255,.05)"};
              color:#eef4ff;
              cursor:pointer;
            "
          >${escapeHtml(label)}</button>
        `
          )
          .join("")}
      </div>
    `;

    $$("[data-filter-chip]", wrap).forEach((btn) => {
      btn.addEventListener("click", () => {
        state.currentFilter = btn.dataset.filterChip || "all";
        renderLibrary();
      });
    });
  }

  function sortLibrary(items) {
    const arr = [...items];
    const mode = state.currentSort || "newest";

    arr.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (mode === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
      if (mode === "title") {
        return String(a.title || "").localeCompare(String(b.title || ""), undefined, {
          sensitivity: "base",
        });
      }
      return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
    });

    return arr;
  }

  function filterLibrary(items) {
    let arr = [...items];
    const q = String(state.currentSearch || "").trim().toLowerCase();

    if (state.currentFilter === "archived") {
      arr = arr.filter((x) => x.archived);
    } else {
      if (!state.showArchived) arr = arr.filter((x) => !x.archived);
      if (state.currentFilter === "pinned") arr = arr.filter((x) => x.pinned);
      if (state.currentFilter === "tagged") arr = arr.filter((x) => x.tags && x.tags.length > 0);
      if (state.currentFilter === "with-notes") arr = arr.filter((x) => (x.notes || "").trim());
    }

    if (q) {
      arr = arr.filter((x) => {
        const hay = [x.title || "", x.notes || "", x.sourceText || "", ...(Array.isArray(x.tags) ? x.tags : [])]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    return sortLibrary(arr);
  }

  function updateLibraryItem(id, patch) {
    const items = getLibrary();
    const idx = items.findIndex((x) => x.id === id);
    if (idx < 0) return;

    items[idx] = {
      ...items[idx],
      ...patch,
      updatedAt: nowIso(),
    };

    setLibrary(items);
    renderLibrary();
  }

  function removeLibraryItem(id) {
    const items = getLibrary().filter((x) => x.id !== id);
    setLibrary(items);
    renderLibrary();
  }

  function duplicateLibraryItem(id) {
    const items = getLibrary();
    const found = items.find((x) => x.id === id);
    if (!found) return;

    const copy = {
      ...found,
      id: "build_" + Math.random().toString(36).slice(2, 10),
      title: `${found.title} (Copy)`,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    items.unshift(copy);
    setLibrary(items);
    renderLibrary();
    toast("Build duplicated.", "success");
  }

  function promptTags(currentTags) {
    const raw = window.prompt("Enter tags separated by commas:", (currentTags || []).join(", "));
    if (raw == null) return null;

    return raw
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 20);
  }

  function badgeHtml(text) {
    return `
      <span style="
        padding:4px 8px;
        border-radius:999px;
        background:rgba(255,255,255,.07);
        border:1px solid rgba(255,255,255,.10);
        font-size:11px;
      ">${escapeHtml(text)}</span>
    `;
  }

  function renderLibrary() {
    const list = $("builderLibraryList");
    if (!list) return;

    const all = getLibrary();
    renderStatsBar(all);
    renderFilterChips();
    updateDashboardUi();

    const visible = filterLibrary(all);

    if (!visible.length) {
      list.innerHTML = `
        <div style="
          padding:18px;
          border-radius:18px;
          background:rgba(255,255,255,.04);
          border:1px solid rgba(255,255,255,.08);
          color:#dbe6ff;
        ">
          No builds found.
        </div>
      `;
      return;
    }

    list.innerHTML = visible
      .map((item) => {
        const tagsHtml = (item.tags || [])
          .map(
            (tag) => `
              <span style="
                padding:5px 9px;
                border-radius:999px;
                background:rgba(97,140,255,.16);
                border:1px solid rgba(97,140,255,.22);
                color:#e8f0ff;
                font-size:12px;
              ">${escapeHtml(tag)}</span>
            `
          )
          .join("");

        return `
          <div data-build-id="${escapeHtml(item.id)}" style="
            padding:16px;
            border-radius:20px;
            background:linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.035));
            border:1px solid rgba(255,255,255,.09);
            color:#eef4ff;
            box-shadow:0 12px 30px rgba(0,0,0,.18);
          ">
            <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap;">
              <div style="min-width:220px; flex:1;">
                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                  <div style="font-size:16px; font-weight:700;">${escapeHtml(item.title || "Untitled Build")}</div>
                  ${item.pinned ? badgeHtml("Pinned") : ""}
                  ${item.archived ? badgeHtml("Archived") : ""}
                </div>
                <div style="font-size:12px; opacity:.8; margin-top:6px;">
                  Updated ${escapeHtml(prettyDate(item.updatedAt || item.createdAt))}
                </div>
                ${
                  item.notes
                    ? `<div style="margin-top:10px; font-size:13px; color:#d8e3ff;">${escapeHtml(item.notes)}</div>`
                    : ""
                }
                ${
                  tagsHtml
                    ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">${tagsHtml}</div>`
                    : ""
                }
              </div>

              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button type="button" data-action="open">Open</button>
                <button type="button" data-action="pin">${item.pinned ? "Unpin" : "Pin"}</button>
                <button type="button" data-action="notes">Notes</button>
                <button type="button" data-action="tags">Tags</button>
                <button type="button" data-action="rename">Rename</button>
                <button type="button" data-action="duplicate">Duplicate</button>
                <button type="button" data-action="archive">${item.archived ? "Unarchive" : "Archive"}</button>
                <button type="button" data-action="delete">Delete</button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    $$("[data-build-id]", list).forEach((card) => {
      const id = card.dataset.buildId;

      $$("button[data-action]", card).forEach((btn) => {
        styleActionButton(btn);

        btn.addEventListener("click", () => {
          const action = btn.dataset.action;
          const items = getLibrary();
          const item = items.find((x) => x.id === id);
          if (!item) return;

          if (action === "open") return openPreviewModal(item.html || "", item.title || "Untitled Build");
          if (action === "pin") return updateLibraryItem(id, { pinned: !item.pinned });
          if (action === "archive") return updateLibraryItem(id, { archived: !item.archived });

          if (action === "notes") {
            const notes = window.prompt("Edit notes:", item.notes || "");
            if (notes == null) return;
            return updateLibraryItem(id, { notes });
          }

          if (action === "tags") {
            const tags = promptTags(item.tags || []);
            if (tags == null) return;
            return updateLibraryItem(id, { tags });
          }

          if (action === "rename") {
            const title = window.prompt("Rename build:", item.title || "Untitled Build");
            if (title == null) return;
            return updateLibraryItem(id, { title: title.trim() || "Untitled Build" });
          }

          if (action === "duplicate") return duplicateLibraryItem(id);

          if (action === "delete") {
            if (window.confirm(`Delete "${item.title}"?`)) removeLibraryItem(id);
          }
        });
      });
    });
  }

  function ensureLibraryDom() {
    if ($("builderLibraryModal") && $("builderLibraryList")) return;

    const modal = document.createElement("div");
    modal.id = "builderLibraryModal";
    modal.hidden = true;
    modal.style.position = "fixed";
    modal.style.inset = "0";
    modal.style.background = "rgba(0,0,0,.72)";
    modal.style.zIndex = "99970";
    modal.style.display = "none";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";
    modal.style.padding = "20px";

    modal.innerHTML = `
      <div style="
        width:min(1180px, 96vw);
        height:min(860px, 93vh);
        display:flex;
        flex-direction:column;
        overflow:hidden;
        border-radius:24px;
        background:linear-gradient(180deg, rgba(10,16,30,.98), rgba(7,12,22,.98));
        border:1px solid rgba(255,255,255,.10);
        box-shadow:0 30px 80px rgba(0,0,0,.42);
        color:#eef4ff;
      ">
        <div style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:12px;
          padding:14px 16px;
          border-bottom:1px solid rgba(255,255,255,.08);
        ">
          <div style="font-weight:700;">Builder Library</div>
          <button id="builderLibraryClose" type="button">Close</button>
        </div>

        <div style="padding:14px 16px; display:grid; gap:12px; border-bottom:1px solid rgba(255,255,255,.06);">
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <input id="builderLibrarySearch" placeholder="Search title, notes, tags..." style="
              flex:1; min-width:220px; padding:12px 14px; border-radius:14px;
              border:1px solid rgba(255,255,255,.10); background:rgba(255,255,255,.05); color:#eef4ff;
            " />
            <select id="builderLibrarySort" style="
              padding:12px 14px; border-radius:14px;
              border:1px solid rgba(255,255,255,.10); background:rgba(16,24,42,.95); color:#eef4ff;
            ">
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="title">Title</option>
            </select>
            <button id="exportLibraryBtn" type="button">Export</button>
            <button id="importLibraryBtn" type="button">Import</button>
            <input id="importLibraryInput" type="file" accept=".json,application/json" hidden />
          </div>

          <div id="builderLibraryStats"></div>
          <div id="builderLibraryFilters"></div>
        </div>

        <div id="builderLibraryList" style="
          flex:1;
          overflow:auto;
          padding:16px;
          display:grid;
          grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));
          gap:14px;
        "></div>
      </div>
    `;

    document.body.appendChild(modal);

    ["builderLibraryClose", "exportLibraryBtn", "importLibraryBtn"]
      .map($)
      .forEach(styleActionButton);
  }

  function openLibrary() {
    ensureLibraryDom();

    const search = $("builderLibrarySearch");
    const sort = $("builderLibrarySort");

    if (search) search.value = state.currentSearch || "";
    if (sort) sort.value = state.currentSort || "newest";

    renderLibrary();
    modalOpen($("builderLibraryModal"));
  }

  function closeLibrary() {
    modalClose($("builderLibraryModal"));
  }

  function exportLibraryFile() {
    try {
      const json = exportLibraryJson();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `simo-builder-library-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("Library exported.", "success");
    } catch {
      toast("Export failed.", "error");
    }
  }

  async function importLibraryFile(file) {
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      mergeImportedLibrary(payload);
      renderLibrary();
      toast("Library imported.", "success");
    } catch (err) {
      toast(err.message || "Import failed.", "error");
    }
  }

  // -----------------------------
  // settings modal
  // -----------------------------
  function ensureSettingsDom() {
    if ($("settingsModal") && $("settingsThemeDefault")) return;

    const modal = document.createElement("div");
    modal.id = "settingsModal";
    modal.hidden = true;
    modal.style.position = "fixed";
    modal.style.inset = "0";
    modal.style.background = "rgba(0,0,0,.72)";
    modal.style.zIndex = "99985";
    modal.style.display = "none";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";
    modal.style.padding = "20px";

    modal.innerHTML = `
      <div style="
        width:min(720px, 96vw);
        max-height:min(88vh, 900px);
        overflow:auto;
        display:flex;
        flex-direction:column;
        border-radius:24px;
        background:linear-gradient(180deg, rgba(10,16,30,.98), rgba(7,12,22,.98));
        border:1px solid rgba(255,255,255,.10);
        box-shadow:0 30px 80px rgba(0,0,0,.42);
        color:#eef4ff;
      ">
        <div style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:12px;
          padding:16px 18px;
          border-bottom:1px solid rgba(255,255,255,.08);
        ">
          <div>
            <div style="font-size:18px; font-weight:800;">Settings & Voice</div>
            <div style="font-size:12px; color:rgba(235,242,255,.70); margin-top:4px;">Restore your visual controls without touching the rest of the product.</div>
          </div>
          <button id="settingsCloseBtn" type="button">Close</button>
        </div>

        <div style="padding:18px; display:grid; gap:18px;">
          <section style="
            border:1px solid rgba(255,255,255,.08);
            border-radius:18px;
            padding:16px;
            background:rgba(255,255,255,.04);
            display:grid;
            gap:12px;
          ">
            <div style="font-size:15px; font-weight:700;">Theme</div>
            <div style="font-size:12px; color:rgba(235,242,255,.72);">Choose the main visual atmosphere for Simo.</div>

            <div style="display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:10px;">
              <button id="settingsThemeDefault" data-simo-theme-option="default" type="button" style="
                padding:14px;
                border-radius:16px;
                border:1px solid rgba(255,255,255,.10);
                background:rgba(255,255,255,.04);
                color:#eef4ff;
              ">
                <div style="font-weight:700;">Default</div>
                <div style="font-size:12px; opacity:.72; margin-top:4px;">Classic Simo</div>
              </button>

              <button id="settingsThemeMidnight" data-simo-theme-option="midnight" type="button" style="
                padding:14px;
                border-radius:16px;
                border:1px solid rgba(255,255,255,.10);
                background:rgba(255,255,255,.04);
                color:#eef4ff;
              ">
                <div style="font-weight:700;">Midnight</div>
                <div style="font-size:12px; opacity:.72; margin-top:4px;">Darker and quieter</div>
              </button>

              <button id="settingsThemeAurora" data-simo-theme-option="aurora" type="button" style="
                padding:14px;
                border-radius:16px;
                border:1px solid rgba(255,255,255,.10);
                background:rgba(255,255,255,.04);
                color:#eef4ff;
              ">
                <div style="font-weight:700;">Aurora</div>
                <div style="font-size:12px; opacity:.72; margin-top:4px;">Brighter accent glow</div>
              </button>
            </div>
          </section>

          <section style="
            border:1px solid rgba(255,255,255,.08);
            border-radius:18px;
            padding:16px;
            background:rgba(255,255,255,.04);
            display:grid;
            gap:12px;
          ">
            <div style="font-size:15px; font-weight:700;">Accent</div>
            <div style="font-size:12px; color:rgba(235,242,255,.72);">Pick the accent color for buttons, focus, and glow.</div>

            <div style="display:flex; gap:12px; flex-wrap:wrap;">
              <button id="settingsAccentBlue" data-simo-accent-preview="blue" type="button" style="width:48px;height:48px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:#6ea8ff;"></button>
              <button id="settingsAccentPurple" data-simo-accent-preview="purple" type="button" style="width:48px;height:48px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:#b982ff;"></button>
              <button id="settingsAccentPink" data-simo-accent-preview="pink" type="button" style="width:48px;height:48px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:#ff8fca;"></button>
              <button id="settingsAccentEmerald" data-simo-accent-preview="emerald" type="button" style="width:48px;height:48px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:#56f0a9;"></button>
            </div>
          </section>

          <section style="
            border:1px solid rgba(255,255,255,.08);
            border-radius:18px;
            padding:16px;
            background:rgba(255,255,255,.04);
            display:grid;
            gap:12px;
          ">
            <div style="font-size:15px; font-weight:700;">Voice</div>
            <div style="font-size:13px; color:rgba(235,242,255,.78);">Voice controls are still coming soon, but Settings is live again now.</div>
            <div style="
              display:inline-flex;
              width:max-content;
              padding:8px 12px;
              border-radius:999px;
              border:1px solid rgba(255,255,255,.10);
              background:rgba(255,255,255,.05);
              color:#eef4ff;
              font-size:12px;
            ">Voice coming soon</div>
          </section>

          <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">
            <button id="settingsResetBtn" type="button">Reset</button>
            <button id="settingsSaveBtn" type="button">Save</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    [
      "settingsCloseBtn",
      "settingsResetBtn",
      "settingsSaveBtn",
      "settingsThemeDefault",
      "settingsThemeMidnight",
      "settingsThemeAurora",
      "settingsAccentBlue",
      "settingsAccentPurple",
      "settingsAccentPink",
      "settingsAccentEmerald",
    ]
      .map($)
      .forEach(styleActionButton);
  }

  function openSettings() {
    ensureSettingsDom();
    applyUiSettings();
    modalOpen($("settingsModal"));
  }

  function closeSettings() {
    modalClose($("settingsModal"));
  }

  function wireSettings() {
    ensureSettingsDom();

    const closeBtn = $("settingsCloseBtn");
    const saveBtn = $("settingsSaveBtn");
    const resetBtn = $("settingsResetBtn");
    const modal = $("settingsModal");

    if (closeBtn && closeBtn.dataset.boundClick !== "true") {
      closeBtn.dataset.boundClick = "true";
      closeBtn.addEventListener("click", closeSettings);
    }

    if (saveBtn && saveBtn.dataset.boundClick !== "true") {
      saveBtn.dataset.boundClick = "true";
      saveBtn.addEventListener("click", () => {
        saveUiSettings();
        applyUiSettings();
        toast("Settings saved.", "success", 1800);
        closeSettings();
      });
    }

    if (resetBtn && resetBtn.dataset.boundClick !== "true") {
      resetBtn.dataset.boundClick = "true";
      resetBtn.addEventListener("click", () => {
        state.ui.theme = "default";
        state.ui.accent = "blue";
        saveUiSettings();
        applyUiSettings();
        toast("Settings reset.", "success", 1800);
      });
    }

    if (modal && modal.dataset.boundOverlay !== "true") {
      modal.dataset.boundOverlay = "true";
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeSettings();
      });
    }

    $$("[data-simo-theme-option]", modal).forEach((btn) => {
      if (btn.dataset.boundTheme !== "true") {
        btn.dataset.boundTheme = "true";
        btn.addEventListener("click", () => {
          state.ui.theme = btn.getAttribute("data-simo-theme-option") || "default";
          applyUiSettings();
        });
      }
    });

    const accentMap = {
      settingsAccentBlue: "blue",
      settingsAccentPurple: "purple",
      settingsAccentPink: "pink",
      settingsAccentEmerald: "emerald",
    };

    Object.entries(accentMap).forEach(([id, value]) => {
      const btn = $(id);
      if (!btn || btn.dataset.boundAccent === "true") return;
      btn.dataset.boundAccent = "true";
      btn.addEventListener("click", () => {
        state.ui.accent = value;
        applyUiSettings();
      });
    });
  }

  // -----------------------------
// send / session
// -----------------------------
function applyComposerText(text) {
  const value = String(text || "");
  if (!inputEl) return false;

  inputEl.value = value;
  autoGrow(inputEl);

  inputEl.dispatchEvent(new Event("input", { bubbles: true }));
  inputEl.dispatchEvent(new Event("change", { bubbles: true }));

  try {
    inputEl.focus();
    if (typeof inputEl.setSelectionRange === "function") {
      inputEl.setSelectionRange(value.length, value.length);
    }
  } catch {}

  return true;
}

async function sendMessage(overrideMessage = "") {
  if (state.sending) return;

  const text = String(overrideMessage || inputEl?.value || "").trim();
  if (!text) return;

  addMessage("user", text);

  if (inputEl) {
    inputEl.value = "";
    autoGrow(inputEl);
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
  }

  setSending(true);
  scrollAfterUiChange();

  try {
    const data = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: text }),
    });

    const reply = String(data.reply || "").trim();

    const model3d = data && data.model3d ? data.model3d : null;
    const topLevelOptions =
      data && Array.isArray(data.model3d_options) ? data.model3d_options : [];
    const allOptions = normalizeModelOptions(model3d, topLevelOptions);

    const builderResult = reply
      ? maybeHandleBuilderResponse(reply)
      : { handled: false, html: "", title: "" };

    if (builderResult.handled) {
      state.lastAssistantText = `Builder preview ready: ${builderResult.title || "Untitled Build"}`;
      addAssistantMessageWith3D(
        `Preview ready${builderResult.title ? ` — ${builderResult.title}` : "."}`,
        model3d,
        topLevelOptions
      );
    } else {
      state.lastAssistantText = reply;

      if (
        model3d &&
        model3d.route_type === "candidate" &&
        !allOptions.length &&
        Array.isArray(model3d.search_candidates)
      ) {
        addCandidateMessage(
          reply || "I found candidate assets to review.",
          model3d.search_candidates || [],
          model3d.object_name || ""
        );
      } else {
        addAssistantMessageWith3D(reply || "Done.", model3d, topLevelOptions);
      }
    }

    if (typeof data.pro === "boolean") state.me.pro = !!data.pro;
    if (typeof data.usage_today === "number") state.usageToday = Number(data.usage_today || 0);
    if (typeof data.free_daily_limit === "number") {
      state.freeDailyLimit = Number(data.free_daily_limit || state.freeDailyLimit || 50);
    }

    updateUserUi();
    scrollAfterUiChange();

    if (!builderResult.handled) {
      tryOpenVerified3DFromPayload(data);
    }

    maybeToastRouteInfo(data);
  } catch (err) {
    const msg = err.message || "Message failed.";

    if (/daily limit/i.test(msg)) {
      addAssistantMessageWith3D(msg);
      toast(msg, "error", 4000);
    } else {
      addAssistantMessageWith3D(`Something went wrong: ${msg}`);
      toast(msg, "error");
    }

    scrollAfterUiChange();
  } finally {
    setSending(false);
    setTimeout(() => scrollChatToBottom(true), 80);
    setTimeout(() => scrollChatToBottom(true), 220);
  }
}

function wireComposerHook() {
  window.__SIMO_COMPOSER_HOOK__ = {
    setText(text) {
      return applyComposerText(text);
    },
    sendText(text) {
      return sendMessage(text);
    },
    focus() {
      if (!inputEl) return false;
      inputEl.focus();
      return true;
    },
    getValue() {
      return String(inputEl?.value || "");
    },
  };
}

async function clearSessionHistory() {
  try {
    await api("/api/session/clear", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const target = ensureChatShell();
    target.innerHTML = "";

    state.lastAssistantText = "";
    state.draftHtml = "";
    state.selectedImageUrl = "";
    state.selectedImageFilename = "";

    toast("History cleared.", "success");
    scrollAfterUiChange();
  } catch (err) {
    toast(err.message || "Could not clear history.", "error");
  }
}

async function startNewChat() {
  try {
    await api("/api/session/clear", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const target = ensureChatShell();
    target.innerHTML = "";

    state.lastAssistantText = "";
    state.draftHtml = "";
    state.selectedImageUrl = "";
    state.selectedImageFilename = "";

    if (inputEl) {
      inputEl.value = "";
      autoGrow(inputEl);
      inputEl.focus();
    }

    toast("Started a new chat.", "success");
    scrollAfterUiChange();
  } catch (err) {
    toast(err.message || "Could not start a new chat.", "error");
  }
}

// -----------------------------
// wiring
// -----------------------------
function wireChat() {
  if (inputEl) {
    autoGrow(inputEl);
    inputEl.addEventListener("input", () => autoGrow(inputEl));
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  if (sendBtn && sendBtn.dataset.boundClick !== "true") {
    sendBtn.dataset.boundClick = "true";
    sendBtn.addEventListener("click", () => sendMessage());
  }

  if (imageBtn && imageInput && imageBtn.dataset.boundClick !== "true") {
    imageBtn.dataset.boundClick = "true";
    imageBtn.addEventListener("click", () => imageInput.click());
  }

  if (imageInput && imageInput.dataset.boundChange !== "true") {
    imageInput.dataset.boundChange = "true";
    imageInput.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      try {
        await uploadSelectedImage(file);
      } catch (err) {
        toast(err.message || "Image upload failed.", "error");
      } finally {
        imageInput.value = "";
        setTimeout(() => scrollChatToBottom(true), 100);
        setTimeout(() => scrollChatToBottom(true), 260);
      }
    });
  }

  if (analyzeImageBtn && analyzeImageBtn.dataset.boundClick !== "true") {
    analyzeImageBtn.dataset.boundClick = "true";
    analyzeImageBtn.addEventListener("click", analyzeLastImage);
  }

  if (upgradeBtn && upgradeBtn.dataset.boundClick !== "true") {
    upgradeBtn.dataset.boundClick = "true";
    upgradeBtn.addEventListener("click", startUpgradeFlow);
  }

  if (clearHistoryBtn && clearHistoryBtn.dataset.boundClick !== "true") {
    clearHistoryBtn.dataset.boundClick = "true";
    clearHistoryBtn.addEventListener("click", clearSessionHistory);
  }

  if (newChatBtn && newChatBtn.dataset.boundClick !== "true") {
    newChatBtn.dataset.boundClick = "true";
    newChatBtn.addEventListener("click", startNewChat);
  }
}

function wirePreview() {
  ensurePreviewModalDom();
  ensurePublishModalDom();
  ensureRecentBuildsTrigger();
  ensureRecentBuildsModalDom();

  const closeBtn = $("builderPreviewClose");
  const showBtn = $("showHtmlBtn");
  const openBtn = $("openPreviewTabBtn");
  const downloadBtn = $("downloadHtmlBtn");
  const saveBtn = $("saveBuildBtn");
  const publishPreviewBtn = $("publishBuildBtn");
  const modal = $("builderPreviewModal");

  const publishCloseBtn = $("publishResultCloseBtn");
  const copyPublishUrlBtn = $("copyPublishUrlBtn");
  const openPublishUrlBtn = $("openPublishUrlBtn");
  const publishModal = $("publishResultModal");

  const recentBtn = getRecentBuildsBtn();
  const recentModal = $("recentBuildsModal");
  const recentCloseBtn = $("recentBuildsCloseBtn");
  const clearRecentBtn = $("clearRecentBuildsBtn");

  [closeBtn, showBtn, openBtn, downloadBtn, saveBtn, publishPreviewBtn].forEach(styleActionButton);

  if (closeBtn && closeBtn.dataset.boundClick !== "true") {
    closeBtn.dataset.boundClick = "true";
    closeBtn.addEventListener("click", closePreviewModal);
  }
  if (showBtn && showBtn.dataset.boundClick !== "true") {
    showBtn.dataset.boundClick = "true";
    showBtn.addEventListener("click", togglePreviewHtml);
  }
  if (openBtn && openBtn.dataset.boundClick !== "true") {
    openBtn.dataset.boundClick = "true";
    openBtn.addEventListener("click", openPreviewInNewTab);
  }
  if (downloadBtn && downloadBtn.dataset.boundClick !== "true") {
    downloadBtn.dataset.boundClick = "true";
    downloadBtn.addEventListener("click", downloadPreviewHtml);
  }
  if (saveBtn && saveBtn.dataset.boundClick !== "true") {
    saveBtn.dataset.boundClick = "true";
    saveBtn.addEventListener("click", saveCurrentBuild);
  }
  if (publishPreviewBtn && publishPreviewBtn.dataset.boundClick !== "true") {
    publishPreviewBtn.dataset.boundClick = "true";
    publishPreviewBtn.addEventListener("click", publishCurrentBuild);
  }

  if (modal && modal.dataset.boundOverlay !== "true") {
    modal.dataset.boundOverlay = "true";
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closePreviewModal();
    });
  }

  if (reopenLastPreviewBtn && reopenLastPreviewBtn.dataset.boundClick !== "true") {
    reopenLastPreviewBtn.dataset.boundClick = "true";
    reopenLastPreviewBtn.addEventListener("click", () => {
      const last = getLastPreview();
      if (!last || !last.html) {
        toast("No previous preview found.", "error");
        return;
      }
      openPreviewModal(last.html, last.title || "Last Preview");
    });
  }

  if (recentBtn && recentBtn.dataset.boundClick !== "true") {
    recentBtn.dataset.boundClick = "true";
    recentBtn.addEventListener("click", openRecentBuilds);
  }

  if (recentCloseBtn && recentCloseBtn.dataset.boundClick !== "true") {
    recentCloseBtn.dataset.boundClick = "true";
    recentCloseBtn.addEventListener("click", closeRecentBuilds);
  }

  if (clearRecentBtn && clearRecentBtn.dataset.boundClick !== "true") {
    clearRecentBtn.dataset.boundClick = "true";
    clearRecentBtn.addEventListener("click", () => {
      if (!getPreviewHistory().length) {
        toast("No recent builds to clear.", "info", 1800);
        return;
      }
      clearPreviewHistory();
      localStorage.removeItem(LAST_PREVIEW_KEY);
      state.lastPreviewHtml = "";
      state.lastPreviewTitle = "";
      updateReopenLastPreviewVisibility();
      updateRecentBuildsVisibility();
      renderRecentBuilds();
      toast("Recent builds cleared.", "success", 1800);
    });
  }

  if (recentModal && recentModal.dataset.boundOverlay !== "true") {
    recentModal.dataset.boundOverlay = "true";
    recentModal.addEventListener("click", (e) => {
      if (e.target === recentModal) closeRecentBuilds();
    });
  }

  if (publishCloseBtn && publishCloseBtn.dataset.boundClick !== "true") {
    publishCloseBtn.dataset.boundClick = "true";
    publishCloseBtn.addEventListener("click", closePublishResultModal);
  }

  if (copyPublishUrlBtn && copyPublishUrlBtn.dataset.boundClick !== "true") {
    copyPublishUrlBtn.dataset.boundClick = "true";
    copyPublishUrlBtn.addEventListener("click", async () => {
      await copyTextToClipboard(state.publish.lastUrl || "", "Publish link copied.");
    });
  }

  if (openPublishUrlBtn && openPublishUrlBtn.dataset.boundClick !== "true") {
    openPublishUrlBtn.dataset.boundClick = "true";
    openPublishUrlBtn.addEventListener("click", () => {
      const url = state.publish.lastUrl || "";
      if (!url) {
        toast("No published link is available yet.", "error");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    });
  }

  if (publishModal && publishModal.dataset.boundOverlay !== "true") {
    publishModal.dataset.boundOverlay = "true";
    publishModal.addEventListener("click", (e) => {
      if (e.target === publishModal) closePublishResultModal();
    });
  }

  updateReopenLastPreviewVisibility();
  updateRecentBuildsVisibility();
  renderRecentBuilds();
}

function wireLibrary() {
  ensureLibraryDom();
  syncLibraryTriggerVisuals();

  if (builderLibraryCard && builderLibraryCard.dataset.boundClick !== "true") {
    builderLibraryCard.dataset.boundClick = "true";
    builderLibraryCard.addEventListener("click", openLibrary);
    builderLibraryCard.setAttribute("tabindex", "0");
    builderLibraryCard.setAttribute("role", "button");
    builderLibraryCard.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openLibrary();
      }
    });
  }

  if (openLibraryBtn && openLibraryBtn.dataset.boundClick !== "true") {
    openLibraryBtn.dataset.boundClick = "true";
    openLibraryBtn.addEventListener("click", openLibrary);
  }

  const closeBtn = $("builderLibraryClose");
  if (closeBtn && closeBtn.dataset.boundClose !== "true") {
    closeBtn.dataset.boundClose = "true";
    closeBtn.addEventListener("click", closeLibrary);
  }

  const modal = $("builderLibraryModal");
  if (modal && modal.dataset.boundModal !== "true") {
    modal.dataset.boundModal = "true";
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeLibrary();
    });
  }

  const searchEl = $("builderLibrarySearch");
  if (searchEl && searchEl.dataset.boundSearch !== "true") {
    searchEl.dataset.boundSearch = "true";
    searchEl.addEventListener("input", () => {
      state.currentSearch = searchEl.value || "";
      renderLibrary();
    });
  }

  const sortEl = $("builderLibrarySort");
  if (sortEl && sortEl.dataset.boundSort !== "true") {
    sortEl.dataset.boundSort = "true";
    sortEl.addEventListener("change", () => {
      state.currentSort = sortEl.value || "newest";
      renderLibrary();
    });
  }

  const exportBtn = $("exportLibraryBtn");
  if (exportBtn && exportBtn.dataset.boundExport !== "true") {
    exportBtn.dataset.boundExport = "true";
    exportBtn.addEventListener("click", exportLibraryFile);
  }

  const importBtn = $("importLibraryBtn");
  const importInputEl = $("importLibraryInput");
  if (importBtn && importInputEl) {
    if (importBtn.dataset.boundImportClick !== "true") {
      importBtn.dataset.boundImportClick = "true";
      importBtn.addEventListener("click", () => importInputEl.click());
    }

    if (importInputEl.dataset.boundImportChange !== "true") {
      importInputEl.dataset.boundImportChange = "true";
      importInputEl.addEventListener("change", async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        await importLibraryFile(file);
        importInputEl.value = "";
      });
    }
  }
}

function wireTopbarButtons() {
  if (profileBtn && profileBtn.dataset.boundClick !== "true") {
    profileBtn.dataset.boundClick = "true";
    profileBtn.addEventListener("click", async () => {
      await refreshMe();
      const label = state.me.loggedIn
        ? `${state.me.email || "Signed in"} • ${state.me.team ? "Team" : state.me.pro ? "Pro" : "Free"}`
        : "Guest • Free";
      toast(label, "info", 2600);
    });
  }

  if (settingsBtn && settingsBtn.dataset.boundClick !== "true") {
    settingsBtn.dataset.boundClick = "true";
    settingsBtn.addEventListener("click", openSettings);
  }

  if (easySignupBtn && easySignupBtn.dataset.boundClick !== "true") {
    easySignupBtn.dataset.boundClick = "true";
    easySignupBtn.addEventListener("click", () => {
      toast("Easy Signup flow is not wired yet.", "info", 3200);
    });
  }

  if (publishBtn && publishBtn.dataset.boundClick !== "true") {
    publishBtn.dataset.boundClick = "true";
    publishBtn.addEventListener("click", publishCurrentBuild);
    styleActionButton(publishBtn);
  }
}

function wireGlobal() {
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    const preview = $("builderPreviewModal");
    const lib = $("builderLibraryModal");
    const settings = $("settingsModal");
    const publish = $("publishResultModal");
    const recent = $("recentBuildsModal");

    if (preview && !preview.hidden) closePreviewModal();
    if (lib && !lib.hidden) closeLibrary();
    if (settings && !settings.hidden) closeSettings();
    if (publish && !publish.hidden) closePublishResultModal();
    if (recent && !recent.hidden) closeRecentBuilds();

    const viewerModal = document.getElementById("viewer3dModal");
    if (window.Simo3DViewer && viewerModal && !viewerModal.hidden) {
      window.Simo3DViewer.close();
    }
  });

  const params = new URLSearchParams(window.location.search);
  const checkout = params.get("checkout");

  if (checkout === "success") {
    toast("Upgrade successful.", "success", 3500);
    refreshProStatus();
    params.delete("checkout");
    history.replaceState({}, "", `${location.pathname}${params.toString() ? "?" + params.toString() : ""}`);
  } else if (checkout === "cancel") {
    toast("Checkout canceled.", "info", 3000);
    params.delete("checkout");
    history.replaceState({}, "", `${location.pathname}${params.toString() ? "?" + params.toString() : ""}`);
  }

  window.addEventListener("storage", (e) => {
    if ([LIB_KEY, LAST_PREVIEW_KEY, PREVIEW_HISTORY_KEY].includes(e.key)) {
      updateDashboardUi();
      updateReopenLastPreviewVisibility();
      updateRecentBuildsVisibility();
      renderRecentBuilds();
      if ($("builderLibraryModal") && !$("builderLibraryModal").hidden) {
        renderLibrary();
      }
    }
    if (e.key === SETTINGS_KEY) {
      state.ui = { ...state.ui, ...getUiSettings() };
      applyUiSettings();
    }
  });

  window.addEventListener("load", () => {
    scrollChatToBottom(true);
    setTimeout(() => scrollChatToBottom(true), 120);
    setTimeout(() => scrollChatToBottom(true), 300);
    syncLibraryTriggerVisuals();
    updateReopenLastPreviewVisibility();
    updateRecentBuildsVisibility();
  });

  window.addEventListener("resize", () => {
    scrollChatToBottom(false);
  });
}

// -----------------------------
// boot
// -----------------------------
async function boot() {
  if (state.booted) return;
  state.booted = true;

  state.ui = { ...state.ui, ...getUiSettings() };

  wireChat();
  wirePreview();
  wireLibrary();
  wireSettings();
  wireTopbarButtons();
  wireGlobal();
  wireComposerHook();
  updateUserUi();
  updateReopenLastPreviewVisibility();
  updateRecentBuildsVisibility();
  updateDashboardUi();
  applyUiSettings();

  if (loadingHintEl) loadingHintEl.textContent = "Ready.";

  await refreshMe();
  await refreshProStatus();

  scrollAfterUiChange();
  setTimeout(() => scrollChatToBottom(true), 200);

  console.log("Simo script.js Phase 2.6 memory upgrade booted.");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

function showPublishSuccess(url) {
  if (!url) return;

  const existing = document.getElementById("publishSuccessCard");
  if (existing) existing.remove();

  const card = document.createElement("div");
  card.id = "publishSuccessCard";

  card.style.marginTop = "12px";
  card.style.padding = "12px";
  card.style.borderRadius = "10px";
  card.style.background = "rgba(0,255,150,0.08)";
  card.style.border = "1px solid rgba(0,255,150,0.25)";
  card.style.color = "#d1ffe8";

  card.innerHTML = `
    <div style="font-weight:600; margin-bottom:6px;">
      ✅ Your site is live
    </div>

    <div style="font-size:12px; opacity:0.8; margin-bottom:8px;">
      ${url}
    </div>

    <div style="display:flex; gap:8px;">
      <button id="copyPublishLinkBtn" style="
        padding:6px 10px;
        border-radius:6px;
        border:none;
        cursor:pointer;
        background:#1e90ff;
        color:white;
      ">Copy Link</button>

      <button id="openPublishLinkBtn" style="
        padding:6px 10px;
        border-radius:6px;
        border:none;
        cursor:pointer;
        background:#22c55e;
        color:white;
      ">View Site</button>
    </div>
  `;

  const target =
    document.getElementById("previewWrap") ||
    document.body;

  target.appendChild(card);

  card.querySelector("#copyPublishLinkBtn").onclick = () => {
    navigator.clipboard.writeText(url);
  };

  card.querySelector("#openPublishLinkBtn").onclick = () => {
    window.open(url, "_blank");
  };
}
})();

// ==============================
// Simo Phase 2.9C — Builder State Sync (SAFE EXTENSION)
// ==============================

(async function simoBuilderStateSync() {
  try {
    const res = await fetch("/health");
    if (!res.ok) return;

    const data = await res.json();

    window.__SIMO_BUILDER_STATE__ = {
      active: data.builder_active || false,
      revision: data.builder_revision || 0,
      turnCount: data.builder_turn_count || 0,
      meta: data.builder_meta || {},
      lastKind: data.builder_last_request_kind || ""
    };

    console.log("Simo Builder State Sync:", window.__SIMO_BUILDER_STATE__);
  } catch (err) {
    console.warn("Builder state sync skipped:", err);
  }
})();

// ==============================
// Simo Phase 2.9D — Visible Builder Intelligence UI (SAFE)
// ==============================

(function simoBuilderUIOverlay() {
  if (window.__SIMO_BUILDER_UI__) return;
  window.__SIMO_BUILDER_UI__ = true;

  function createUI() {
    if (document.getElementById("simoBuilderStatus")) return;

    const wrap = document.createElement("div");
    wrap.id = "simoBuilderStatus";

    wrap.style.position = "fixed";
    wrap.style.bottom = "20px";
    wrap.style.right = "20px";
    wrap.style.zIndex = "9999";
    wrap.style.padding = "10px 14px";
    wrap.style.borderRadius = "12px";
    wrap.style.fontSize = "12px";
    wrap.style.fontWeight = "500";
    wrap.style.backdropFilter = "blur(10px)";
    wrap.style.background = "rgba(20,20,30,0.75)";
    wrap.style.color = "#fff";
    wrap.style.boxShadow = "0 0 12px rgba(0,0,0,0.3)";
    wrap.style.transition = "all 0.25s ease";
    wrap.style.opacity = "0";
    wrap.style.pointerEvents = "none";

    wrap.innerHTML = `
      <div id="simoBuilderDot" style="
        width:8px;
        height:8px;
        border-radius:50%;
        background:#666;
        display:inline-block;
        margin-right:6px;
        box-shadow:0 0 0 rgba(0,0,0,0);
      "></div>
      <span id="simoBuilderText">Builder idle</span>
    `;

    document.body.appendChild(wrap);
  }

  function getLabel(lastKind) {
    const kind = String(lastKind || "").toLowerCase();

    if (kind === "create") return "Generating build...";
    if (kind === "edit") return "Editing build...";
    if (kind === "refine") return "Refining build...";
    if (kind === "enhance") return "Enhancing build...";
    if (kind === "continue") return "Continuing build...";
    if (kind === "update") return "Updating build...";

    return "Builder active...";
  }

  function updateUI() {
    const state = window.__SIMO_BUILDER_STATE__;
    if (!state) return;

    const el = document.getElementById("simoBuilderStatus");
    const dot = document.getElementById("simoBuilderDot");
    const text = document.getElementById("simoBuilderText");

    if (!el || !dot || !text) return;

    if (state.active) {
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
      dot.style.background = "#00ffcc";
      dot.style.boxShadow = "0 0 12px rgba(0,255,204,0.65)";
      text.textContent = getLabel(state.lastKind);
    } else {
      el.style.opacity = "0";
      el.style.transform = "translateY(8px)";
      dot.style.background = "#666";
      dot.style.boxShadow = "0 0 0 rgba(0,0,0,0)";
      text.textContent = "Builder idle";
    }
  }

  function loop() {
    try {
      updateUI();
    } catch (e) {
      console.warn("Builder UI loop skipped:", e);
    }
    requestAnimationFrame(loop);
  }

  createUI();
  loop();
})();

// ==============================
// Simo Phase 2.9E — Builder Memory Visualization (SAFE)
// ==============================

(function simoBuilderMemoryVisualization() {
  if (window.__SIMO_BUILDER_MEMORY_UI__) return;
  window.__SIMO_BUILDER_MEMORY_UI__ = true;

  function ensureMemoryUi() {
    if (document.getElementById("simoBuilderMemoryCard")) return;

    const card = document.createElement("div");
    card.id = "simoBuilderMemoryCard";

    card.style.position = "fixed";
    card.style.right = "18px";
    card.style.bottom = "58px";
    card.style.zIndex = "9998";
    card.style.width = "220px";
    card.style.padding = "12px 14px";
    card.style.borderRadius = "14px";
    card.style.background = "rgba(15,15,24,0.82)";
    card.style.backdropFilter = "blur(10px)";
    card.style.webkitBackdropFilter = "blur(10px)";
    card.style.boxShadow = "0 10px 30px rgba(0,0,0,0.28)";
    card.style.border = "1px solid rgba(255,255,255,0.08)";
    card.style.color = "#ffffff";
    card.style.fontSize = "12px";
    card.style.lineHeight = "1.45";
    card.style.opacity = "0";
    card.style.transform = "translateY(8px)";
    card.style.transition = "opacity 0.22s ease, transform 0.22s ease";
    card.style.pointerEvents = "none";

    card.innerHTML = `
      <div style="font-size:11px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;opacity:0.72;margin-bottom:8px;">
        Builder Memory
      </div>

      <div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:6px;">
        <span style="opacity:0.72;">Revision</span>
        <span id="simoBuilderMemoryRevision">0</span>
      </div>

      <div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:6px;">
        <span style="opacity:0.72;">Turns</span>
        <span id="simoBuilderMemoryTurns">0</span>
      </div>

      <div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:6px;">
        <span style="opacity:0.72;">Last Action</span>
        <span id="simoBuilderMemoryKind">idle</span>
      </div>

      <div style="display:flex;justify-content:space-between;gap:10px;">
        <span style="opacity:0.72;">Status</span>
        <span id="simoBuilderMemoryStatus">Idle</span>
      </div>
    `;

    document.body.appendChild(card);
  }

  function prettyKind(value) {
    const kind = String(value || "").trim().toLowerCase();
    if (!kind) return "idle";

    if (kind === "create") return "Create";
    if (kind === "edit") return "Edit";
    if (kind === "refine") return "Refine";
    if (kind === "enhance") return "Enhance";
    if (kind === "continue") return "Continue";
    if (kind === "update") return "Update";
    if (kind === "build") return "Build";

    return kind.charAt(0).toUpperCase() + kind.slice(1);
  }

  function renderMemoryUi() {
    ensureMemoryUi();

    const state = window.__SIMO_BUILDER_STATE__ || null;
    const card = document.getElementById("simoBuilderMemoryCard");
    const revisionEl = document.getElementById("simoBuilderMemoryRevision");
    const turnsEl = document.getElementById("simoBuilderMemoryTurns");
    const kindEl = document.getElementById("simoBuilderMemoryKind");
    const statusEl = document.getElementById("simoBuilderMemoryStatus");

    if (!card || !revisionEl || !turnsEl || !kindEl || !statusEl) return;
    if (!state) return;

    revisionEl.textContent = String(Number(state.revision || 0));
    turnsEl.textContent = String(Number(state.turnCount || 0));
    kindEl.textContent = prettyKind(state.lastKind);
    statusEl.textContent = state.active ? "Active" : "Idle";

    if (state.active || Number(state.revision || 0) > 0 || Number(state.turnCount || 0) > 0) {
      card.style.opacity = "1";
      card.style.transform = "translateY(0)";
    } else {
      card.style.opacity = "0";
      card.style.transform = "translateY(8px)";
    }
  }

  function loop() {
    try {
      renderMemoryUi();
    } catch (err) {
      console.warn("Builder memory visualization skipped:", err);
    }
    requestAnimationFrame(loop);
  }

  ensureMemoryUi();
  loop();
})();

// ==============================
// Simo Phase 2.9F — What Changed Intelligence Layer (SAFE)
// ==============================

(function simoBuilderWhatChangedUI() {
  if (window.__SIMO_BUILDER_WHAT_CHANGED_UI__) return;
  window.__SIMO_BUILDER_WHAT_CHANGED_UI__ = true;

  function ensureWhatChangedUi() {
    if (document.getElementById("simoBuilderWhatChangedCard")) return;

    const card = document.createElement("div");
    card.id = "simoBuilderWhatChangedCard";

    card.style.position = "fixed";
    card.style.right = "18px";
    card.style.bottom = "240px";
    card.style.zIndex = "9997";
    card.style.width = "260px";
    card.style.padding = "12px 14px";
    card.style.borderRadius = "14px";
    card.style.background = "rgba(15,15,24,0.86)";
    card.style.backdropFilter = "blur(10px)";
    card.style.webkitBackdropFilter = "blur(10px)";
    card.style.boxShadow = "0 10px 30px rgba(0,0,0,0.28)";
    card.style.border = "1px solid rgba(255,255,255,0.08)";
    card.style.color = "#ffffff";
    card.style.fontSize = "12px";
    card.style.lineHeight = "1.45";
    card.style.opacity = "0";
    card.style.transform = "translateY(8px)";
    card.style.transition = "opacity 0.22s ease, transform 0.22s ease";
    card.style.pointerEvents = "none";

    card.innerHTML = `
      <div style="font-size:11px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;opacity:0.72;margin-bottom:8px;">
        What Changed
      </div>
      <div id="simoBuilderWhatChangedText" style="opacity:0.96;">
        Waiting for builder activity...
      </div>
    `;

    document.body.appendChild(card);
  }

  function inferChangeText(state) {
    const kind = String(state?.lastKind || "").trim().toLowerCase();
    const revision = Number(state?.revision || 0);
    const turns = Number(state?.turnCount || 0);
    const active = !!state?.active;

    if (kind === "create") {
      return active
        ? `Creating a new build now. Revision ${revision} is in progress.`
        : `Created a new build. Current revision: ${revision}.`;
    }

    if (kind === "build") {
      return active
        ? `Generating the current build. Revision ${revision} is in progress.`
        : `Generated the current build. Current revision: ${revision}.`;
    }

    if (kind === "edit") {
      return active
        ? `Applying edits to the current build now.`
        : `Applied edits to the current build.`;
    }

    if (kind === "refine") {
      return active
        ? `Refining the design and improving the current version.`
        : `Refined the design and improved the current version.`;
    }

    if (kind === "enhance") {
      return active
        ? `Enhancing the current build with a stronger version update.`
        : `Enhanced the current build with a stronger version update.`;
    }

    if (kind === "continue") {
      return active
        ? `Continuing the previous build instead of starting over.`
        : `Continued the previous build without resetting progress.`;
    }

    if (kind === "update") {
      return active
        ? `Updating the current build with new changes.`
        : `Updated the current build with new changes.`;
    }

    if (revision > 0 || turns > 0) {
      return active
        ? `Builder activity detected. Revision ${revision} is currently active.`
        : `Builder history is available. Current revision: ${revision}.`;
    }

    return "Waiting for builder activity...";
  }

  function renderWhatChangedUi() {
    ensureWhatChangedUi();

    const state = window.__SIMO_BUILDER_STATE__ || null;
    const card = document.getElementById("simoBuilderWhatChangedCard");
    const text = document.getElementById("simoBuilderWhatChangedText");

    if (!card || !text) return;
    if (!state) return;

    const revision = Number(state.revision || 0);
    const turns = Number(state.turnCount || 0);

    text.textContent = inferChangeText(state);

    if (state.active || revision > 0 || turns > 0) {
      card.style.opacity = "1";
      card.style.transform = "translateY(0)";
    } else {
      card.style.opacity = "0";
      card.style.transform = "translateY(8px)";
    }
  }

  function loop() {
    try {
      renderWhatChangedUi();
    } catch (err) {
      console.warn("Builder what-changed UI skipped:", err);
    }
    requestAnimationFrame(loop);
  }

  ensureWhatChangedUi();
  loop();
})();

// ==============================
// Simo Phase 2.9M — Confidence Highlight (SAFE)
// ==============================

(function simoBuilderSuggestionsUI() {
  if (window.__SIMO_BUILDER_SUGGESTIONS_UI__) return;
  window.__SIMO_BUILDER_SUGGESTIONS_UI__ = true;

  let lastSignature = "";
  let lastInteraction = Date.now();

  const recentActions = [];

  function remember(action) {
    recentActions.push(action);
    if (recentActions.length > 6) {
      recentActions.shift();
    }
  }

  function wasRecentlyUsed(action) {
    return recentActions.includes(action);
  }

  document.addEventListener("click", () => {
    lastInteraction = Date.now();
  });

  document.addEventListener("keydown", () => {
    lastInteraction = Date.now();
  });

  function isIdle() {
    return Date.now() - lastInteraction > 6000;
  }

  function ensureSuggestionsUi() {
    if (document.getElementById("simoBuilderSuggestionsCard")) return;

    const card = document.createElement("div");
    card.id = "simoBuilderSuggestionsCard";

    card.style.position = "fixed";
    card.style.right = "18px";
    card.style.bottom = "320px";
    card.style.zIndex = "9996";
    card.style.width = "260px";
    card.style.padding = "12px 14px";
    card.style.borderRadius = "14px";
    card.style.background = "rgba(15,15,24,0.92)";
    card.style.backdropFilter = "blur(12px)";
    card.style.border = "1px solid rgba(255,255,255,0.08)";
    card.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
    card.style.color = "rgba(255,255,255,0.9)";
    card.style.fontSize = "12px";

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;">
        <div style="font-size:11px;font-weight:700;opacity:0.95;">
          Suggestions
        </div>
        <div style="font-size:10px;opacity:0.7;">
          Smart Mode
        </div>
      </div>
      <div id="simoBuilderSuggestionsList" style="margin-top:8px;display:flex;flex-direction:column;gap:8px;"></div>
    `;

    document.body.appendChild(card);
  }

  function baseSuggestions(state) {
    const kind = (state?.lastKind || "").toLowerCase();
    const turns = state?.turnCount || 0;

    let list = [];

    if (isIdle()) {
      list = ["Enhance visual design", "Improve the hero section"];
    } else if (turns > 5) {
      list = ["Prepare for publishing", "Optimize for conversions"];
    } else if (kind === "build") {
      list = [
        "Improve the hero section",
        "Add a call-to-action section",
        "Enhance visual design"
      ];
    } else if (kind === "enhance") {
      list = [
        "Improve section spacing",
        "Upgrade typography",
        "Optimize for conversions"
      ];
    } else if (kind === "edit") {
      list = [
        "Add testimonials",
        "Add pricing section",
        "Improve layout flow"
      ];
    }

    return list;
  }

  function scoreSuggestions(list, state) {
    const kind = (state?.lastKind || "").toLowerCase();
    const turns = state?.turnCount || 0;

    return list
      .map(item => {
        let score = 0;

        if (turns > 5 && item === "Prepare for publishing") score += 5;
        if (turns > 5 && item === "Optimize for conversions") score += 4;

        if (kind === "build" && item.includes("hero")) score += 4;
        if (kind === "enhance" && item.includes("visual")) score += 3;
        if (kind === "edit" && item.includes("layout")) score += 3;

        if (wasRecentlyUsed(item)) score -= 5;

        return { item, score };
      })
      .sort((a, b) => b.score - a.score)
      .map(x => x.item);
  }

  function buildPrompt(text, state) {
    return `${text} for my current build. Keep the design consistent and improve overall quality. This is revision ${state?.revision || 0}.`;
  }

  function createChip(text, state, isTop) {
    const chip = document.createElement("button");
    chip.textContent = text;

    chip.style.padding = "8px 10px";
    chip.style.borderRadius = "10px";
    chip.style.cursor = "pointer";
    chip.style.textAlign = "left";

    if (isTop) {
      chip.style.background = "rgba(0,255,200,0.18)";
      chip.style.border = "1px solid rgba(0,255,200,0.45)";
      chip.style.boxShadow = "0 0 10px rgba(0,255,200,0.25)";
    } else {
      chip.style.background = "rgba(255,255,255,0.06)";
      chip.style.border = "1px solid rgba(255,255,255,0.12)";
    }

    chip.style.color = "rgba(255,255,255,0.9)";

    chip.onmouseenter = () => {
      chip.style.background = "rgba(0,255,200,0.22)";
    };

    chip.onmouseleave = () => {
      chip.style.background = isTop
        ? "rgba(0,255,200,0.18)"
        : "rgba(255,255,255,0.06)";
    };

    chip.onclick = async (e) => {
      const hook = window.__SIMO_COMPOSER_HOOK__;
      if (!hook) return;

      const prompt = buildPrompt(text, state);

      remember(text);

      hook.setText(prompt);

      if (e.shiftKey) {
        await hook.sendText(prompt);
      }
    };

    return chip;
  }

  function render() {
    ensureSuggestionsUi();

    const state = window.__SIMO_BUILDER_STATE__;
    if (!state) return;

    const listEl = document.getElementById("simoBuilderSuggestionsList");

    let suggestions = baseSuggestions(state);
    suggestions = scoreSuggestions(suggestions, state);

    const sig = JSON.stringify(suggestions);
    if (sig === lastSignature) return;
    lastSignature = sig;

    listEl.innerHTML = "";

    suggestions.forEach((s, i) => {
      listEl.appendChild(createChip(s, state, i === 0));
    });
  }

  function loop() {
    render();
    requestAnimationFrame(loop);
  }

  loop();
})();

// ==============================
// Simo Phase 2.9N — Suggestion Action Bar (SAFE)
// paste at very bottom under 2.9M
// ==============================

(function simoBuilderSuggestionActions() {
  if (window.__SIMO_BUILDER_SUGGESTION_ACTIONS__) return;
  window.__SIMO_BUILDER_SUGGESTION_ACTIONS__ = true;

  let forceRefreshTick = 0;

  function ensureActionUi() {
    const card = document.getElementById("simoBuilderSuggestionsCard");
    if (!card) return null;

    let helper = document.getElementById("simoBuilderSuggestionsHelper");
    let actions = document.getElementById("simoBuilderSuggestionsActions");

    if (!helper) {
      helper = document.createElement("div");
      helper.id = "simoBuilderSuggestionsHelper";
      helper.style.marginTop = "8px";
      helper.style.fontSize = "10px";
      helper.style.lineHeight = "1.35";
      helper.style.opacity = "0.72";
      helper.textContent = "Click to load into composer • Shift+Click to send instantly";
      card.appendChild(helper);
    }

    if (!actions) {
      actions = document.createElement("div");
      actions.id = "simoBuilderSuggestionsActions";
      actions.style.display = "flex";
      actions.style.gap = "8px";
      actions.style.marginTop = "10px";
      actions.style.flexWrap = "wrap";

      const useTopBtn = document.createElement("button");
      useTopBtn.id = "simoSuggestionUseTopBtn";
      useTopBtn.type = "button";
      useTopBtn.textContent = "Use Top Suggestion";

      const refreshBtn = document.createElement("button");
      refreshBtn.id = "simoSuggestionRefreshBtn";
      refreshBtn.type = "button";
      refreshBtn.textContent = "Refresh Ideas";

      [useTopBtn, refreshBtn].forEach((btn) => {
        btn.style.padding = "7px 10px";
        btn.style.borderRadius = "10px";
        btn.style.border = "1px solid rgba(255,255,255,0.12)";
        btn.style.background = "rgba(255,255,255,0.06)";
        btn.style.color = "rgba(255,255,255,0.92)";
        btn.style.cursor = "pointer";
        btn.style.fontSize = "11px";
      });

      useTopBtn.addEventListener("mouseenter", () => {
        useTopBtn.style.background = "rgba(0,255,200,0.18)";
      });
      useTopBtn.addEventListener("mouseleave", () => {
        useTopBtn.style.background = "rgba(255,255,255,0.06)";
      });

      refreshBtn.addEventListener("mouseenter", () => {
        refreshBtn.style.background = "rgba(255,255,255,0.12)";
      });
      refreshBtn.addEventListener("mouseleave", () => {
        refreshBtn.style.background = "rgba(255,255,255,0.06)";
      });

      actions.appendChild(useTopBtn);
      actions.appendChild(refreshBtn);
      card.appendChild(actions);
    }

    return card;
  }

  function getSuggestionButtons() {
    return Array.from(
      document.querySelectorAll("#simoBuilderSuggestionsList button")
    );
  }

  function getTopSuggestionText() {
    const buttons = getSuggestionButtons();
    if (!buttons.length) return "";
    return String(buttons[0].textContent || "").trim();
  }

  function buildPrompt(text, state) {
    const revision = Number(state?.revision || 0);
    return `${text} for my current build. Keep the design consistent and improve overall quality. This is revision ${revision}.`;
  }

  function maybeToast(message, type = "info", ms = 1800) {
    if (typeof window.toast === "function") {
      window.toast(message, type, ms);
      return;
    }

    if (window.__SIMO_TOAST_FALLBACK__) {
      clearTimeout(window.__SIMO_TOAST_FALLBACK__);
    }

    let el = document.getElementById("simoSuggestionMiniToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "simoSuggestionMiniToast";
      el.style.position = "fixed";
      el.style.left = "50%";
      el.style.bottom = "20px";
      el.style.transform = "translateX(-50%)";
      el.style.padding = "10px 14px";
      el.style.borderRadius = "12px";
      el.style.background = "rgba(15,15,24,0.92)";
      el.style.color = "#fff";
      el.style.fontSize = "12px";
      el.style.zIndex = "999999";
      el.style.border = "1px solid rgba(255,255,255,0.10)";
      el.style.boxShadow = "0 10px 30px rgba(0,0,0,0.28)";
      document.body.appendChild(el);
    }

    el.textContent = message;
    el.style.opacity = "1";

    window.__SIMO_TOAST_FALLBACK__ = setTimeout(() => {
      el.style.opacity = "0";
    }, ms);
  }

  function useTopSuggestion(sendNow = false) {
    const hook = window.__SIMO_COMPOSER_HOOK__;
    const state = window.__SIMO_BUILDER_STATE__ || {};
    if (!hook) return;

    const topText = getTopSuggestionText();
    if (!topText) {
      maybeToast("No suggestion is ready yet.", "info", 1600);
      return;
    }

    const prompt = buildPrompt(topText, state);
    hook.setText(prompt);

    if (sendNow) {
      hook.sendText(prompt);
      maybeToast("Top suggestion sent.", "success", 1600);
    } else {
      maybeToast("Top suggestion loaded into composer.", "success", 1600);
    }
  }

  function wireButtons() {
    ensureActionUi();

    const useTopBtn = document.getElementById("simoSuggestionUseTopBtn");
    const refreshBtn = document.getElementById("simoSuggestionRefreshBtn");

    if (useTopBtn && useTopBtn.dataset.boundClick !== "true") {
      useTopBtn.dataset.boundClick = "true";
      useTopBtn.addEventListener("click", (e) => {
        useTopSuggestion(!!e.shiftKey);
      });
    }

    if (refreshBtn && refreshBtn.dataset.boundClick !== "true") {
      refreshBtn.dataset.boundClick = "true";
      refreshBtn.addEventListener("click", () => {
        forceRefreshTick = Date.now();

        const list = document.getElementById("simoBuilderSuggestionsList");
        if (list) {
          const buttons = getSuggestionButtons();
          if (buttons.length > 1) {
            const first = buttons.shift();
            buttons.push(first);
            list.innerHTML = "";
            buttons.forEach((btn) => list.appendChild(btn));
          }
        }

        maybeToast("Suggestion order refreshed.", "info", 1500);
      });
    }
  }

  function updateVisibility() {
    const card = ensureActionUi();
    if (!card) return;

    const state = window.__SIMO_BUILDER_STATE__ || {};
    const revision = Number(state.revision || 0);
    const turns = Number(state.turnCount || 0);
    const active = !!state.active;

    const hasMeaningfulHistory = active || revision > 0 || turns > 0;

    card.style.display = hasMeaningfulHistory ? "" : "none";
  }

  function addConfidenceLabels() {
    const list = document.getElementById("simoBuilderSuggestionsList");
    if (!list) return;

    const buttons = getSuggestionButtons();
    if (!buttons.length) return;

    buttons.forEach((btn, index) => {
      if (btn.dataset.confidenceDecorated === "true") return;
      btn.dataset.confidenceDecorated = "true";

      const label = document.createElement("div");
      label.style.fontSize = "10px";
      label.style.opacity = "0.72";
      label.style.marginTop = "4px";

      if (index === 0) label.textContent = "Highest confidence";
      else if (index === 1) label.textContent = "Strong follow-up";
      else label.textContent = "Alternative path";

      btn.appendChild(label);
    });
  }

  function loop() {
    try {
      wireButtons();
      updateVisibility();
      addConfidenceLabels();
      window.__SIMO_SUGGESTION_REFRESH_TICK__ = forceRefreshTick;
    } catch (err) {
      console.warn("Suggestion action bar skipped:", err);
    }

    requestAnimationFrame(loop);
  }

  loop();
})();

// ==============================
// Simo Phase 2.9O — Builder Goal Awareness (SAFE)
// paste at very bottom under 2.9N
// ==============================

(function simoBuilderGoalAwareness() {
  if (window.__SIMO_BUILDER_GOAL_AWARENESS__) return;
  window.__SIMO_BUILDER_GOAL_AWARENESS__ = true;

  function ensureGoalCard() {
    if (document.getElementById("simoBuilderGoalCard")) return;

    const card = document.createElement("div");
    card.id = "simoBuilderGoalCard";

    card.style.position = "fixed";
    card.style.right = "18px";
    card.style.bottom = "410px";
    card.style.zIndex = "9995";
    card.style.width = "260px";
    card.style.padding = "12px 14px";
    card.style.borderRadius = "14px";
    card.style.background = "rgba(15,15,24,0.90)";
    card.style.backdropFilter = "blur(12px)";
    card.style.border = "1px solid rgba(255,255,255,0.08)";
    card.style.boxShadow = "0 10px 30px rgba(0,0,0,0.32)";
    card.style.color = "rgba(255,255,255,0.92)";
    card.style.fontSize = "12px";
    card.style.lineHeight = "1.45";
    card.style.opacity = "0";
    card.style.transform = "translateY(8px)";
    card.style.transition = "opacity 0.22s ease, transform 0.22s ease";
    card.style.pointerEvents = "none";

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;opacity:0.72;">
          Current Goal
        </div>
        <div id="simoBuilderGoalBadge" style="
          padding:3px 8px;
          border-radius:999px;
          background:rgba(0,255,200,0.10);
          border:1px solid rgba(0,255,200,0.18);
          font-size:10px;
          opacity:0.9;
        ">Active</div>
      </div>

      <div id="simoBuilderGoalTitle" style="
        margin-top:8px;
        font-size:13px;
        font-weight:700;
        color:#ffffff;
      ">Waiting for builder activity...</div>

      <div id="simoBuilderGoalText" style="
        margin-top:6px;
        color:rgba(255,255,255,0.78);
      ">
        Simo will show the current goal here once the builder starts working.
      </div>
    `;

    document.body.appendChild(card);
  }

  function inferGoal(state) {
    const kind = String(state?.lastKind || "").trim().toLowerCase();
    const revision = Number(state?.revision || 0);
    const turns = Number(state?.turnCount || 0);
    const active = !!state?.active;

    if (kind === "create" || kind === "build") {
      return {
        title: active ? "Building the foundation" : "Foundation created",
        text: active
          ? "Simo is shaping the main structure, layout, and first version of the page."
          : "The main structure is in place and ready for the next pass.",
        badge: active ? "Building" : "Ready"
      };
    }

    if (kind === "edit" || kind === "update") {
      return {
        title: active ? "Applying focused edits" : "Focused edits applied",
        text: active
          ? "Simo is updating the current build without starting over."
          : "The current version has been updated and is ready for refinement.",
        badge: active ? "Editing" : "Updated"
      };
    }

    if (kind === "refine") {
      return {
        title: active ? "Refining polish and flow" : "Refinement pass complete",
        text: active
          ? "Simo is improving spacing, hierarchy, clarity, and overall smoothness."
          : "The build has been refined and is ready for stronger visual upgrades.",
        badge: active ? "Refining" : "Refined"
      };
    }

    if (kind === "enhance") {
      return {
        title: active ? "Enhancing overall quality" : "Enhancement complete",
        text: active
          ? "Simo is pushing the build toward a more premium, impressive final result."
          : "The build is stronger now and may be ready for conversion or publishing improvements.",
        badge: active ? "Enhancing" : "Enhanced"
      };
    }

    if (kind === "continue") {
      return {
        title: active ? "Continuing previous progress" : "Continuation complete",
        text: active
          ? "Simo is carrying the earlier version forward instead of resetting the build."
          : "The previous build has been continued successfully with progress preserved.",
        badge: active ? "Continuing" : "Continued"
      };
    }

    if (turns >= 6 || revision >= 6) {
      return {
        title: "Preparing for final direction",
        text: "This build has enough history that the next best move is likely optimization, conversion work, or publish prep.",
        badge: "Advanced"
      };
    }

    if (turns > 0 || revision > 0) {
      return {
        title: "Growing the current build",
        text: "Simo has builder context and can keep improving this version step by step.",
        badge: "Tracked"
      };
    }

    return {
      title: "Waiting for builder activity...",
      text: "Simo will show the current goal here once the builder starts working.",
      badge: "Idle"
    };
  }

  function applyGoalToSuggestions(goal) {
    window.__SIMO_BUILDER_GOAL_CONTEXT__ = {
      title: String(goal?.title || ""),
      text: String(goal?.text || ""),
      badge: String(goal?.badge || "")
    };
  }

  function renderGoalCard() {
    ensureGoalCard();

    const state = window.__SIMO_BUILDER_STATE__ || {};
    const card = document.getElementById("simoBuilderGoalCard");
    const titleEl = document.getElementById("simoBuilderGoalTitle");
    const textEl = document.getElementById("simoBuilderGoalText");
    const badgeEl = document.getElementById("simoBuilderGoalBadge");

    if (!card || !titleEl || !textEl || !badgeEl) return;

    const goal = inferGoal(state);
    applyGoalToSuggestions(goal);

    titleEl.textContent = goal.title;
    textEl.textContent = goal.text;
    badgeEl.textContent = goal.badge;

    const active = !!state.active;
    const revision = Number(state.revision || 0);
    const turns = Number(state.turnCount || 0);
    const showCard = active || revision > 0 || turns > 0;

    if (goal.badge === "Building") {
      badgeEl.style.background = "rgba(110,168,255,0.12)";
      badgeEl.style.border = "1px solid rgba(110,168,255,0.22)";
    } else if (goal.badge === "Editing" || goal.badge === "Updated") {
      badgeEl.style.background = "rgba(255,205,110,0.10)";
      badgeEl.style.border = "1px solid rgba(255,205,110,0.18)";
    } else if (goal.badge === "Refining" || goal.badge === "Refined") {
      badgeEl.style.background = "rgba(185,130,255,0.12)";
      badgeEl.style.border = "1px solid rgba(185,130,255,0.20)";
    } else if (goal.badge === "Enhancing" || goal.badge === "Enhanced") {
      badgeEl.style.background = "rgba(0,255,200,0.10)";
      badgeEl.style.border = "1px solid rgba(0,255,200,0.18)";
    } else if (goal.badge === "Advanced") {
      badgeEl.style.background = "rgba(255,120,180,0.10)";
      badgeEl.style.border = "1px solid rgba(255,120,180,0.18)";
    } else {
      badgeEl.style.background = "rgba(255,255,255,0.06)";
      badgeEl.style.border = "1px solid rgba(255,255,255,0.10)";
    }

    if (showCard) {
      card.style.opacity = "1";
      card.style.transform = "translateY(0)";
    } else {
      card.style.opacity = "0";
      card.style.transform = "translateY(8px)";
    }
  }

  function upgradeSuggestionHelper() {
    const helper = document.getElementById("simoBuilderSuggestionsHelper");
    const goal = window.__SIMO_BUILDER_GOAL_CONTEXT__;
    if (!helper || !goal || !goal.title) return;

    const goalLine = `Goal: ${goal.title}`;
    helper.textContent = `${goalLine} • Click to load into composer • Shift+Click to send instantly`;
  }

  function maybeBoostTopSuggestionLabel() {
    const goal = window.__SIMO_BUILDER_GOAL_CONTEXT__;
    const list = document.getElementById("simoBuilderSuggestionsList");
    if (!goal || !list) return;

    const buttons = Array.from(list.querySelectorAll("button"));
    if (!buttons.length) return;

    const top = buttons[0];
    if (!top) return;

    if (!top.dataset.goalDecorated) {
      top.dataset.goalDecorated = "true";
    }

    const existing = top.querySelector(".simo-goal-hint");
    if (existing) existing.remove();

    const hint = document.createElement("div");
    hint.className = "simo-goal-hint";
    hint.style.fontSize = "10px";
    hint.style.opacity = "0.78";
    hint.style.marginTop = "4px";
    hint.textContent = `Best fit for current goal`;
    top.appendChild(hint);
  }

  function loop() {
    try {
      renderGoalCard();
      upgradeSuggestionHelper();
      maybeBoostTopSuggestionLabel();
    } catch (err) {
      console.warn("Builder goal awareness skipped:", err);
    }

    requestAnimationFrame(loop);
  }

  loop();
})();

// ==============================
// Simo Phase 2.9P — Goal-Aware Suggestion Ranking (SAFE)
// paste at very bottom under 2.9O
// ==============================

(function simoGoalAwareSuggestionRanking() {
  if (window.__SIMO_GOAL_AWARE_SUGGESTIONS__) return;
  window.__SIMO_GOAL_AWARE_SUGGESTIONS__ = true;

  let lastRenderedSignature = "";

  function getGoalContext() {
    return window.__SIMO_BUILDER_GOAL_CONTEXT__ || {
      title: "",
      text: "",
      badge: ""
    };
  }

  function getBuilderState() {
    return window.__SIMO_BUILDER_STATE__ || {
      active: false,
      revision: 0,
      turnCount: 0,
      lastKind: ""
    };
  }

  function normalize(text) {
    return String(text || "").trim().toLowerCase();
  }

  function suggestionPrompt(text, state) {
    return `${text} for my current build. Keep the design consistent and improve overall quality. This is revision ${state?.revision || 0}.`;
  }

  function useSuggestion(text, sendNow = false) {
    const hook = window.__SIMO_COMPOSER_HOOK__;
    const state = getBuilderState();
    if (!hook || !text) return;

    const prompt = suggestionPrompt(text, state);
    hook.setText(prompt);

    if (sendNow) {
      hook.sendText(prompt);
    }
  }

  function goalBucket(goal, state) {
    const title = normalize(goal.title);
    const badge = normalize(goal.badge);
    const kind = normalize(state.lastKind);
    const turns = Number(state.turnCount || 0);
    const revision = Number(state.revision || 0);

    if (title.includes("foundation") || badge === "building" || kind === "build" || kind === "create") {
      return "foundation";
    }

    if (title.includes("focused edits") || badge === "editing" || badge === "updated" || kind === "edit" || kind === "update") {
      return "editing";
    }

    if (title.includes("refining") || badge === "refining" || badge === "refined" || kind === "refine") {
      return "refinement";
    }

    if (title.includes("enhancing") || badge === "enhancing" || badge === "enhanced" || kind === "enhance") {
      return "enhancement";
    }

    if (title.includes("continuing") || badge === "continuing" || badge === "continued" || kind === "continue") {
      return "continuation";
    }

    if (title.includes("final direction") || badge === "advanced" || turns >= 6 || revision >= 6) {
      return "advanced";
    }

    return "general";
  }

  function rankedSuggestionsForBucket(bucket) {
    if (bucket === "foundation") {
      return [
        "Improve the hero section",
        "Add a call-to-action section",
        "Improve layout flow",
        "Strengthen headline clarity",
        "Add testimonials"
      ];
    }

    if (bucket === "editing") {
      return [
        "Improve layout flow",
        "Tighten section spacing",
        "Upgrade typography",
        "Improve the hero section",
        "Add testimonials"
      ];
    }

    if (bucket === "refinement") {
      return [
        "Improve section spacing",
        "Upgrade typography",
        "Refine visual hierarchy",
        "Enhance visual design",
        "Polish button styling"
      ];
    }

    if (bucket === "enhancement") {
      return [
        "Enhance visual design",
        "Upgrade typography",
        "Add premium polish",
        "Improve the hero section",
        "Strengthen call-to-action"
      ];
    }

    if (bucket === "continuation") {
      return [
        "Continue improving this version",
        "Preserve the current style while upgrading polish",
        "Improve layout flow",
        "Refine visual hierarchy",
        "Prepare the next revision"
      ];
    }

    if (bucket === "advanced") {
      return [
        "Prepare for publishing",
        "Optimize for conversions",
        "Strengthen call-to-action",
        "Improve mobile polish",
        "Do a final premium polish pass"
      ];
    }

    return [
      "Enhance visual design",
      "Improve the hero section",
      "Improve layout flow",
      "Upgrade typography",
      "Prepare for publishing"
    ];
  }

  function dedupeSuggestions(items) {
    const seen = new Set();
    const out = [];

    for (const item of items) {
      const key = normalize(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }

    return out;
  }

  function scoreSuggestions(items, bucket, state) {
    const turns = Number(state.turnCount || 0);
    const revision = Number(state.revision || 0);

    return items
      .map((item) => {
        const text = normalize(item);
        let score = 0;

        if (bucket === "foundation") {
          if (text.includes("hero")) score += 5;
          if (text.includes("call-to-action")) score += 4;
          if (text.includes("headline")) score += 3;
        }

        if (bucket === "editing") {
          if (text.includes("layout")) score += 5;
          if (text.includes("spacing")) score += 4;
          if (text.includes("typography")) score += 3;
        }

        if (bucket === "refinement") {
          if (text.includes("spacing")) score += 5;
          if (text.includes("hierarchy")) score += 4;
          if (text.includes("visual")) score += 3;
          if (text.includes("button")) score += 2;
        }

        if (bucket === "enhancement") {
          if (text.includes("visual")) score += 5;
          if (text.includes("premium")) score += 4;
          if (text.includes("hero")) score += 3;
          if (text.includes("call-to-action")) score += 2;
        }

        if (bucket === "continuation") {
          if (text.includes("continue")) score += 5;
          if (text.includes("preserve")) score += 4;
          if (text.includes("revision")) score += 3;
        }

        if (bucket === "advanced") {
          if (text.includes("publishing")) score += 6;
          if (text.includes("conversions")) score += 5;
          if (text.includes("final")) score += 4;
          if (text.includes("mobile")) score += 3;
        }

        if (turns >= 6 || revision >= 6) {
          if (text.includes("publishing")) score += 3;
          if (text.includes("conversions")) score += 2;
          if (text.includes("final")) score += 2;
        }

        return { item, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((x) => x.item);
  }

  function confidenceLabel(index, bucket) {
    if (index === 0) {
      if (bucket === "advanced") return "Highest confidence";
      if (bucket === "foundation") return "Best next structure move";
      if (bucket === "editing") return "Best edit follow-up";
      if (bucket === "refinement") return "Best polish move";
      if (bucket === "enhancement") return "Best visual upgrade";
      return "Highest confidence";
    }

    if (index === 1) return "Strong follow-up";
    return "Alternative path";
  }

  function subtitleForBucket(bucket) {
    if (bucket === "foundation") return "Structure-aware";
    if (bucket === "editing") return "Edit-aware";
    if (bucket === "refinement") return "Polish-aware";
    if (bucket === "enhancement") return "Upgrade-aware";
    if (bucket === "continuation") return "Continuation-aware";
    if (bucket === "advanced") return "Launch-aware";
    return "Smart Mode";
  }

  function ensureSuggestionsHeaderSubtitle(bucket) {
    const card = document.getElementById("simoBuilderSuggestionsCard");
    if (!card) return;

    const labels = Array.from(card.querySelectorAll("div"));
    const smartModeEl = labels.find((el) => normalize(el.textContent) === "smart mode");
    if (!smartModeEl) return;

    smartModeEl.textContent = subtitleForBucket(bucket);
  }

  function makeSuggestionButton(text, index, bucket) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.goalAwareSuggestion = "true";
    btn.dataset.suggestionText = text;

    btn.style.padding = "8px 10px";
    btn.style.borderRadius = "10px";
    btn.style.cursor = "pointer";
    btn.style.textAlign = "left";
    btn.style.color = "rgba(255,255,255,0.92)";
    btn.style.display = "flex";
    btn.style.flexDirection = "column";
    btn.style.gap = "3px";

    if (index === 0) {
      btn.style.background = "rgba(0,255,200,0.18)";
      btn.style.border = "1px solid rgba(0,255,200,0.45)";
      btn.style.boxShadow = "0 0 10px rgba(0,255,200,0.25)";
    } else {
      btn.style.background = "rgba(255,255,255,0.06)";
      btn.style.border = "1px solid rgba(255,255,255,0.12)";
    }

    const title = document.createElement("div");
    title.textContent = text;
    title.style.fontSize = "12px";
    title.style.lineHeight = "1.25";

    const meta = document.createElement("div");
    meta.textContent = confidenceLabel(index, bucket);
    meta.style.fontSize = "10px";
    meta.style.opacity = "0.74";

    btn.appendChild(title);
    btn.appendChild(meta);

    btn.addEventListener("mouseenter", () => {
      btn.style.background = "rgba(0,255,200,0.22)";
    });

    btn.addEventListener("mouseleave", () => {
      btn.style.background = index === 0
        ? "rgba(0,255,200,0.18)"
        : "rgba(255,255,255,0.06)";
    });

    btn.addEventListener("click", async (e) => {
      useSuggestion(text, !!e.shiftKey);
    });

    return btn;
  }

  function renderGoalAwareSuggestions() {
    const listEl = document.getElementById("simoBuilderSuggestionsList");
    if (!listEl) return;

    const goal = getGoalContext();
    const state = getBuilderState();
    const bucket = goalBucket(goal, state);

    const suggestions = scoreSuggestions(
      dedupeSuggestions(rankedSuggestionsForBucket(bucket)),
      bucket,
      state
    ).slice(0, 5);

    const signature = JSON.stringify({
      bucket,
      suggestions,
      revision: Number(state.revision || 0),
      turns: Number(state.turnCount || 0),
      active: !!state.active
    });

    if (signature === lastRenderedSignature) {
      ensureSuggestionsHeaderSubtitle(bucket);
      return;
    }

    lastRenderedSignature = signature;
    listEl.innerHTML = "";

    suggestions.forEach((text, index) => {
      listEl.appendChild(makeSuggestionButton(text, index, bucket));
    });

    ensureSuggestionsHeaderSubtitle(bucket);
  }

  function patchTopSuggestionButtonBehavior() {
    const useTopBtn = document.getElementById("simoSuggestionUseTopBtn");
    if (!useTopBtn || useTopBtn.dataset.goalAwarePatched === "true") return;

    useTopBtn.dataset.goalAwarePatched = "true";

    useTopBtn.addEventListener("click", (e) => {
      const first = document.querySelector("#simoBuilderSuggestionsList button[data-goal-aware-suggestion='true']");
      if (!first) return;

      const text = first.dataset.suggestionText || "";
      if (!text) return;

      e.stopImmediatePropagation();
      useSuggestion(text, !!e.shiftKey);
    }, true);
  }

  function patchRefreshIdeasBehavior() {
    const refreshBtn = document.getElementById("simoSuggestionRefreshBtn");
    if (!refreshBtn || refreshBtn.dataset.goalAwarePatched === "true") return;

    refreshBtn.dataset.goalAwarePatched = "true";

    refreshBtn.addEventListener("click", (e) => {
      const listEl = document.getElementById("simoBuilderSuggestionsList");
      if (!listEl) return;

      const buttons = Array.from(
        listEl.querySelectorAll("button[data-goal-aware-suggestion='true']")
      );

      if (buttons.length > 1) {
        const first = buttons.shift();
        buttons.push(first);
        listEl.innerHTML = "";
        buttons.forEach((btn, index) => {
          const text = btn.dataset.suggestionText || btn.textContent || "";
          listEl.appendChild(makeSuggestionButton(text, index, "general"));
        });
      }

      lastRenderedSignature = "";
      e.stopImmediatePropagation();
    }, true);
  }

  function loop() {
    try {
      renderGoalAwareSuggestions();
      patchTopSuggestionButtonBehavior();
      patchRefreshIdeasBehavior();
    } catch (err) {
      console.warn("Goal-aware suggestion ranking skipped:", err);
    }

    requestAnimationFrame(loop);
  }

  loop();
})();

// ==============================
// Simo Phase 2.9Q — Smart Auto-Run Assist Mode (SAFE)
// paste at very bottom under 2.9P
// ==============================

(function simoSmartAutoRunAssistMode() {
  if (window.__SIMO_SMART_AUTORUN_ASSIST__) return;
  window.__SIMO_SMART_AUTORUN_ASSIST__ = true;

  const AUTO_ASSIST_KEY = "simo_auto_assist_v1";

  let idleSince = Date.now();
  let lastAutoRunAt = 0;
  let lastAutoRunSignature = "";
  let countdownStartAt = 0;

  const ARM_AFTER_MS = 7000;
  const RUN_AFTER_MS = 12000;
  const COOLDOWN_MS = 20000;

  function loadEnabled() {
    try {
      return localStorage.getItem(AUTO_ASSIST_KEY) === "true";
    } catch {
      return false;
    }
  }

  function saveEnabled(value) {
    try {
      localStorage.setItem(AUTO_ASSIST_KEY, value ? "true" : "false");
    } catch {}
  }

  const autoState = {
    enabled: loadEnabled(),
  };

  function markInteraction() {
    idleSince = Date.now();
    countdownStartAt = 0;
  }

  ["click", "keydown", "mousedown", "touchstart", "input"].forEach((evt) => {
    document.addEventListener(evt, markInteraction, { passive: true });
  });

  function getBuilderState() {
    return window.__SIMO_BUILDER_STATE__ || {
      active: false,
      revision: 0,
      turnCount: 0,
      lastKind: "",
    };
  }

  function getTopSuggestionButton() {
    return document.querySelector(
      "#simoBuilderSuggestionsList button[data-goal-aware-suggestion='true'], #simoBuilderSuggestionsList button"
    );
  }

  function getTopSuggestionText() {
    const btn = getTopSuggestionButton();
    if (!btn) return "";
    return String(btn.dataset.suggestionText || btn.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getTopSuggestionSignature() {
    const state = getBuilderState();
    return JSON.stringify({
      suggestion: getTopSuggestionText(),
      revision: Number(state.revision || 0),
      turns: Number(state.turnCount || 0),
      kind: String(state.lastKind || ""),
    });
  }

  function ensureAutoAssistUi() {
    const card = document.getElementById("simoBuilderSuggestionsCard");
    if (!card) return;

    let wrap = document.getElementById("simoAutoAssistWrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "simoAutoAssistWrap";
      wrap.style.marginTop = "10px";
      wrap.style.paddingTop = "10px";
      wrap.style.borderTop = "1px solid rgba(255,255,255,0.08)";
      wrap.style.display = "grid";
      wrap.style.gap = "8px";

      wrap.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
          <div style="display:grid;gap:2px;">
            <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.92);">Auto Assist</div>
            <div style="font-size:10px;opacity:0.72;">Optionally auto-runs the top suggestion after idle.</div>
          </div>

          <button
            id="simoAutoAssistToggle"
            type="button"
            style="
              position:relative;
              width:52px;
              height:30px;
              border-radius:999px;
              border:1px solid rgba(255,255,255,0.14);
              background:rgba(255,255,255,0.08);
              cursor:pointer;
              padding:0;
            "
            aria-pressed="false"
            title="Toggle Auto Assist"
          >
            <span
              id="simoAutoAssistKnob"
              style="
                position:absolute;
                top:3px;
                left:3px;
                width:22px;
                height:22px;
                border-radius:999px;
                background:#ffffff;
                transition:all .2s ease;
                box-shadow:0 2px 8px rgba(0,0,0,0.22);
              "
            ></span>
          </button>
        </div>

        <div
          id="simoAutoAssistStatus"
          style="
            font-size:10px;
            line-height:1.35;
            color:rgba(255,255,255,0.76);
            min-height:14px;
          "
        >Auto Assist is off.</div>
      `;

      card.appendChild(wrap);
    }

    const toggle = document.getElementById("simoAutoAssistToggle");
    const knob = document.getElementById("simoAutoAssistKnob");

    if (toggle && toggle.dataset.boundClick !== "true") {
      toggle.dataset.boundClick = "true";
      toggle.addEventListener("click", () => {
        autoState.enabled = !autoState.enabled;
        saveEnabled(autoState.enabled);
        markInteraction();
        renderAutoAssistUi();
      });
    }

    renderAutoAssistUi();
  }

  function renderAutoAssistUi() {
    const toggle = document.getElementById("simoAutoAssistToggle");
    const knob = document.getElementById("simoAutoAssistKnob");
    const status = document.getElementById("simoAutoAssistStatus");

    if (!toggle || !knob || !status) return;

    toggle.setAttribute("aria-pressed", autoState.enabled ? "true" : "false");

    if (autoState.enabled) {
      toggle.style.background = "rgba(0,255,200,0.18)";
      toggle.style.border = "1px solid rgba(0,255,200,0.34)";
      knob.style.left = "25px";
    } else {
      toggle.style.background = "rgba(255,255,255,0.08)";
      toggle.style.border = "1px solid rgba(255,255,255,0.14)";
      knob.style.left = "3px";
      status.textContent = "Auto Assist is off.";
      return;
    }

    const state = getBuilderState();
    const hasHistory =
      !!state.active ||
      Number(state.revision || 0) > 0 ||
      Number(state.turnCount || 0) > 0;

    if (!hasHistory) {
      status.textContent = "Waiting for builder activity before auto-run can arm.";
      return;
    }

    const top = getTopSuggestionText();
    if (!top) {
      status.textContent = "Waiting for a top suggestion.";
      return;
    }

    const now = Date.now();
    const idleMs = now - idleSince;
    const sinceLastRun = now - lastAutoRunAt;

    if (sinceLastRun < COOLDOWN_MS) {
      const left = Math.ceil((COOLDOWN_MS - sinceLastRun) / 1000);
      status.textContent = `Cooling down after last auto-run. Ready in ${left}s.`;
      return;
    }

    if (idleMs < ARM_AFTER_MS) {
      const left = Math.ceil((ARM_AFTER_MS - idleMs) / 1000);
      status.textContent = `Watching for idle… arming in ${left}s.`;
      return;
    }

    if (!countdownStartAt) countdownStartAt = now;

    if (idleMs < RUN_AFTER_MS) {
      const left = Math.ceil((RUN_AFTER_MS - idleMs) / 1000);
      status.textContent = `Auto Assist armed. Running top suggestion in ${left}s if you stay idle.`;
      return;
    }

    status.textContent = `Ready to auto-run: ${top}`;
  }

  function maybeToast(message, type = "info", ms = 1800) {
    if (typeof window.toast === "function") {
      window.toast(message, type, ms);
      return;
    }

    let wrap = document.getElementById("toastWrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "toastWrap";
      wrap.style.position = "fixed";
      wrap.style.right = "18px";
      wrap.style.bottom = "18px";
      wrap.style.zIndex = "999999";
      wrap.style.display = "flex";
      wrap.style.flexDirection = "column";
      wrap.style.gap = "10px";
      document.body.appendChild(wrap);
    }

    const item = document.createElement("div");
    item.style.maxWidth = "390px";
    item.style.padding = "12px 14px";
    item.style.borderRadius = "14px";
    item.style.backdropFilter = "blur(10px)";
    item.style.color = "#fff";
    item.style.border = "1px solid rgba(255,255,255,.12)";
    item.style.boxShadow = "0 8px 30px rgba(0,0,0,.25)";
    item.style.fontSize = "14px";
    item.style.background =
      type === "error"
        ? "rgba(180,30,60,.92)"
        : type === "success"
        ? "rgba(24,110,72,.92)"
        : "rgba(16,22,36,.92)";
    item.textContent = message;

    wrap.appendChild(item);

    setTimeout(() => {
      item.style.opacity = "0";
      item.style.transform = "translateY(8px)";
      item.style.transition = "all .25s ease";
      setTimeout(() => item.remove(), 250);
    }, ms);
  }

  async function runTopSuggestion() {
    const hook = window.__SIMO_COMPOSER_HOOK__;
    const text = getTopSuggestionText();
    const state = getBuilderState();

    if (!hook || !text) return false;

    const prompt = `${text} for my current build. Keep the design consistent and improve overall quality. This is revision ${state?.revision || 0}.`;

    lastAutoRunAt = Date.now();
    lastAutoRunSignature = getTopSuggestionSignature();
    countdownStartAt = 0;

    try {
      await hook.sendText(prompt);
      maybeToast("Auto Assist ran the top suggestion.", "success", 1800);
      return true;
    } catch (err) {
      maybeToast("Auto Assist could not run that suggestion.", "error", 2200);
      return false;
    }
  }

  async function maybeAutoRun() {
    if (!autoState.enabled) return;

    const state = getBuilderState();
    const hasHistory =
      !!state.active ||
      Number(state.revision || 0) > 0 ||
      Number(state.turnCount || 0) > 0;

    if (!hasHistory) return;
    if (state.active) return;

    const top = getTopSuggestionText();
    if (!top) return;

    const now = Date.now();
    const idleMs = now - idleSince;
    const sinceLastRun = now - lastAutoRunAt;
    const signature = getTopSuggestionSignature();

    if (sinceLastRun < COOLDOWN_MS) return;
    if (idleMs < RUN_AFTER_MS) return;
    if (signature && signature === lastAutoRunSignature) return;

    await runTopSuggestion();
    markInteraction();
  }

  function pulseTopSuggestionWhenArmed() {
    const btn = getTopSuggestionButton();
    if (!btn) return;

    const now = Date.now();
    const idleMs = now - idleSince;
    const armed = autoState.enabled && idleMs >= ARM_AFTER_MS && idleMs < RUN_AFTER_MS;

    if (armed) {
      btn.style.boxShadow = "0 0 0 1px rgba(0,255,200,0.35), 0 0 18px rgba(0,255,200,0.14)";
    } else if (btn === getTopSuggestionButton()) {
      // let existing styles remain mostly intact
      if (idleMs < ARM_AFTER_MS || !autoState.enabled) {
        btn.style.boxShadow = "";
      }
    }
  }

  function loop() {
    try {
      ensureAutoAssistUi();
      renderAutoAssistUi();
      pulseTopSuggestionWhenArmed();
      maybeAutoRun();
    } catch (err) {
      console.warn("Smart Auto-Run Assist skipped:", err);
    }

    requestAnimationFrame(loop);
  }

  loop();
})();

// ==============================
// Simo Phase 2.9R — Visible Countdown + Cancel Safety (SAFE)
// full-block replacement
// ==============================

(function simoAutoAssistCountdownSafety() {
  if (window.__SIMO_AUTORUN_COUNTDOWN_SAFETY__) return;
  window.__SIMO_AUTORUN_COUNTDOWN_SAFETY__ = true;

  const CANCEL_KEY = "__SIMO_AUTORUN_CANCEL_UNTIL__";
  const ARM_AFTER_MS = 7000;
  const RUN_AFTER_MS = 12000;
  const CANCEL_GRACE_MS = 12000;

  function now() {
    return Date.now();
  }

  function isAutoAssistEnabled() {
    const toggle = document.getElementById("simoAutoAssistToggle");
    return !!(toggle && toggle.getAttribute("aria-pressed") === "true");
  }

  function getBuilderState() {
    return window.__SIMO_BUILDER_STATE__ || {
      active: false,
      revision: 0,
      turnCount: 0,
      lastKind: "",
    };
  }

  function getTopSuggestionButton() {
    return document.querySelector(
      "#simoBuilderSuggestionsList button[data-goal-aware-suggestion='true'], #simoBuilderSuggestionsList button"
    );
  }

  function getTopSuggestionText() {
    const btn = getTopSuggestionButton();
    if (!btn) return "";

    if (btn.dataset && btn.dataset.suggestionText) {
      return String(btn.dataset.suggestionText).replace(/\s+/g, " ").trim();
    }

    const clone = btn.cloneNode(true);

    clone.querySelectorAll("*").forEach((el) => {
      const txt = String(el.textContent || "").trim().toLowerCase();

      if (
        txt.includes("confidence") ||
        txt.includes("best fit") ||
        txt.includes("follow-up") ||
        txt.includes("alternative") ||
        txt.includes("best edit") ||
        txt.includes("best visual") ||
        txt.includes("best next")
      ) {
        el.remove();
      }
    });

    return String(clone.textContent || "").replace(/\s+/g, " ").trim();
  }

  function isTopSuggestionHighConfidence() {
    const btn = getTopSuggestionButton();
    if (!btn) return false;

    const txt = String(btn.textContent || "").toLowerCase();
    return txt.includes("highest confidence") || txt.includes("best fit");
  }

  function setCancelUntil(ts) {
    window[CANCEL_KEY] = Number(ts || 0);
  }

  function getCancelUntil() {
    return Number(window[CANCEL_KEY] || 0);
  }

  function cancelAutoRunWindow() {
    setCancelUntil(now() + CANCEL_GRACE_MS);
    renderSafetyUi();
  }

  function hasBuilderHistory() {
    const state = getBuilderState();
    return (
      !!state.active ||
      Number(state.revision || 0) > 0 ||
      Number(state.turnCount || 0) > 0
    );
  }

  function getIdleReference() {
    const autoState = window.__SIMO_SMART_AUTORUN_ASSIST__;
    if (
      autoState &&
      typeof autoState === "object" &&
      typeof autoState.idleSince === "number"
    ) {
      return autoState.idleSince;
    }

    if (typeof window.__SIMO_IDLE_SINCE__ === "number") {
      return window.__SIMO_IDLE_SINCE__;
    }

    return now();
  }

  function inferIdleMs() {
    const autoState = window.__SIMO_SMART_AUTORUN_ASSIST__;
    if (autoState && typeof autoState.getIdleMs === "function") {
      return Number(autoState.getIdleMs() || 0);
    }

    const idleSince = getIdleReference();
    return Math.max(0, now() - idleSince);
  }

  function ensureSafetyUi() {
    const wrap =
      document.getElementById("simoAutoAssistWrap") ||
      document.querySelector("[data-section='auto-assist']") ||
      document.querySelector("#simoBuilderSuggestionsList");

    if (!wrap) return;

    wrap.style.overflow = "visible";

    let progressWrap = document.getElementById("simoAutoAssistProgressWrap");
    if (!progressWrap) {
      progressWrap = document.createElement("div");
      progressWrap.id = "simoAutoAssistProgressWrap";
      progressWrap.style.display = "grid";
      progressWrap.style.gap = "8px";
      progressWrap.style.marginTop = "2px";

      progressWrap.innerHTML = `
        <div
          id="simoAutoAssistProgressBarShell"
          style="
            width:100%;
            height:8px;
            border-radius:999px;
            background:rgba(255,255,255,0.08);
            border:1px solid rgba(255,255,255,0.08);
            overflow:hidden;
            display:none;
          "
        >
          <div
            id="simoAutoAssistProgressBar"
            style="
              width:0%;
              height:100%;
              border-radius:999px;
              background:linear-gradient(90deg, rgba(0,255,200,0.72), rgba(110,168,255,0.82));
              box-shadow:0 0 14px rgba(0,255,200,0.25);
              transition:width .16s linear;
            "
          ></div>
        </div>

        <div
          id="simoAutoAssistControlRow"
          style="
            display:none;
            align-items:center;
            justify-content:space-between;
            gap:8px;
            flex-wrap:wrap;
          "
        >
          <div
            id="simoAutoAssistCountdownText"
            style="
              font-size:10px;
              line-height:1.35;
              color:rgba(255,255,255,0.78);
            "
          >Auto-run not armed.</div>

          <button
            id="simoAutoAssistCancelBtn"
            type="button"
            style="
              padding:6px 9px;
              border-radius:10px;
              border:1px solid rgba(255,120,140,0.24);
              background:rgba(255,120,140,0.10);
              color:#ffffff;
              cursor:pointer;
              font-size:10px;
              line-height:1;
              white-space:nowrap;
            "
          >Cancel Auto-Run</button>
        </div>
      `;

      wrap.insertBefore(progressWrap, wrap.firstChild);
    }

    const cancelBtn = document.getElementById("simoAutoAssistCancelBtn");
    if (cancelBtn && cancelBtn.dataset.boundClick !== "true") {
      cancelBtn.dataset.boundClick = "true";
      cancelBtn.addEventListener("click", () => {
        cancelAutoRunWindow();
      });
    }
  }

  function renderSafetyUi() {
    ensureSafetyUi();

    const shell = document.getElementById("simoAutoAssistProgressBarShell");
    const bar = document.getElementById("simoAutoAssistProgressBar");
    const row = document.getElementById("simoAutoAssistControlRow");
    const countdownText = document.getElementById("simoAutoAssistCountdownText");
    const status = document.getElementById("simoAutoAssistStatus");

    if (!shell || !bar || !row || !countdownText || !status) return;

    if (!isAutoAssistEnabled()) {
      shell.style.display = "none";
      row.style.display = "none";
      return;
    }

    if (!hasBuilderHistory()) {
      shell.style.display = "none";
      row.style.display = "none";
      return;
    }

    const state = getBuilderState();
    if (state.active) {
      shell.style.display = "none";
      row.style.display = "none";
      return;
    }

    const topBtn = getTopSuggestionButton();
    const topSuggestion = getTopSuggestionText();

    if (!topSuggestion || !topBtn) {
      shell.style.display = "none";
      row.style.display = "none";
      return;
    }

    if (!isTopSuggestionHighConfidence()) {
      shell.style.display = "none";
      row.style.display = "flex";
      countdownText.textContent = "Top suggestion not strong enough for auto-run.";
      status.textContent = "Auto Assist waiting for a stronger suggestion.";
      return;
    }

    const cancelledUntil = getCancelUntil();
    if (cancelledUntil > now()) {
      const left = Math.ceil((cancelledUntil - now()) / 1000);
      shell.style.display = "none";
      row.style.display = "flex";
      countdownText.textContent = `Auto-run cancelled. Re-arming in ${left}s.`;
      status.textContent = "Auto Assist paused after cancel.";
      return;
    }

    const idleMs = inferIdleMs();

    if (idleMs < ARM_AFTER_MS) {
      shell.style.display = "none";
      row.style.display = "none";
      return;
    }

    const armedProgress = Math.max(
      0,
      Math.min(1, (idleMs - ARM_AFTER_MS) / (RUN_AFTER_MS - ARM_AFTER_MS))
    );

    shell.style.display = "block";
    row.style.display = "flex";
    bar.style.width = `${Math.round(armedProgress * 100)}%`;

    if (idleMs < RUN_AFTER_MS) {
      const left = Math.ceil((RUN_AFTER_MS - idleMs) / 1000);
      countdownText.textContent = `Auto-run in ${left}s unless you interact or cancel.`;
      status.textContent = "Auto Assist armed. Running top suggestion soon if you stay idle.";
    } else {
      countdownText.textContent = "Auto-run is ready now.";
      status.textContent = `Ready to auto-run: ${topSuggestion}`;
      bar.style.width = "100%";
    }
  }

  function softenOnInteraction() {
    const shell = document.getElementById("simoAutoAssistProgressBarShell");
    const bar = document.getElementById("simoAutoAssistProgressBar");
    const row = document.getElementById("simoAutoAssistControlRow");
    if (!shell || !bar || !row) return;

    shell.style.display = "none";
    row.style.display = "none";
    bar.style.width = "0%";
  }

  ["click", "keydown", "mousedown", "touchstart", "input"].forEach((evt) => {
    document.addEventListener(
      evt,
      () => {
        softenOnInteraction();
      },
      { passive: true }
    );
  });

  function exposeSafeHooks() {
    window.__SIMO_AUTORUN_SAFETY__ = {
      cancel: cancelAutoRunWindow,
      getCancelUntil,
      isCancelled() {
        return getCancelUntil() > now();
      },
    };
  }

  function loop() {
    try {
      renderSafetyUi();
      exposeSafeHooks();
    } catch (err) {
      console.warn("Auto Assist countdown safety skipped:", err);
    }

    requestAnimationFrame(loop);
  }

  loop();
})();

// ==============================
// Simo Phase 2.9T — Multi-Option Smart Auto Assist (SAFE)
// paste at very bottom under 2.9S
// ==============================

(function simoMultiOptionSmartAutoAssist() {
  if (window.__SIMO_MULTI_OPTION_AUTORUN__) return;
  window.__SIMO_MULTI_OPTION_AUTORUN__ = true;

  const HISTORY_KEY = "__SIMO_AUTORUN_SUGGESTION_HISTORY__";
  const MAX_HISTORY = 8;

  function getBuilderState() {
    return window.__SIMO_BUILDER_STATE__ || {
      active: false,
      revision: 0,
      turnCount: 0,
      lastKind: "",
    };
  }

  function normalize(text) {
    return String(text || "").trim().toLowerCase();
  }

  function getSuggestionButtons() {
    return Array.from(
      document.querySelectorAll("#simoBuilderSuggestionsList button")
    ).filter(Boolean);
  }

  function extractSuggestionText(btn) {
    if (!btn) return "";

    if (btn.dataset && btn.dataset.suggestionText) {
      return String(btn.dataset.suggestionText).replace(/\s+/g, " ").trim();
    }

    const clone = btn.cloneNode(true);

    clone.querySelectorAll("*").forEach((el) => {
      const txt = normalize(el.textContent);
      if (
        txt.includes("confidence") ||
        txt.includes("best fit") ||
        txt.includes("follow-up") ||
        txt.includes("alternative") ||
        txt.includes("best edit") ||
        txt.includes("best visual") ||
        txt.includes("best next")
      ) {
        el.remove();
      }
    });

    return String(clone.textContent || "").replace(/\s+/g, " ").trim();
  }

  function getSuggestionMeta(btn) {
    const text = extractSuggestionText(btn);
    const raw = normalize(btn.textContent);

    return {
      button: btn,
      text,
      raw,
      isHighConfidence: raw.includes("highest confidence") || raw.includes("best fit"),
      isFollowUp: raw.includes("strong follow-up"),
      isAlternative: raw.includes("alternative"),
    };
  }

  function getHistory() {
    const raw = window[HISTORY_KEY];
    return Array.isArray(raw) ? raw : [];
  }

  function saveHistory(items) {
    window[HISTORY_KEY] = Array.isArray(items) ? items.slice(0, MAX_HISTORY) : [];
  }

  function rememberSuggestion(text) {
    const clean = String(text || "").trim();
    if (!clean) return;

    const existing = getHistory().filter((x) => x !== clean);
    saveHistory([clean, ...existing]);
  }

  function wasRecentlyUsed(text) {
    return getHistory().includes(String(text || "").trim());
  }

  function scoreSuggestion(item, state) {
    const text = normalize(item.text);
    const kind = normalize(state.lastKind);
    const turns = Number(state.turnCount || 0);
    const revision = Number(state.revision || 0);

    let score = 0;

    if (item.isHighConfidence) score += 12;
    if (item.isFollowUp) score += 6;
    if (item.isAlternative) score += 1;

    if (wasRecentlyUsed(item.text)) score -= 10;

    if (kind === "edit" || kind === "update") {
      if (text.includes("layout")) score += 5;
      if (text.includes("spacing")) score += 4;
      if (text.includes("typography")) score += 3;
      if (text.includes("hero")) score += 2;
    }

    if (kind === "refine") {
      if (text.includes("spacing")) score += 5;
      if (text.includes("hierarchy")) score += 4;
      if (text.includes("visual")) score += 4;
      if (text.includes("button")) score += 2;
    }

    if (kind === "enhance") {
      if (text.includes("visual")) score += 6;
      if (text.includes("premium")) score += 5;
      if (text.includes("hero")) score += 3;
      if (text.includes("call-to-action")) score += 3;
    }

    if (kind === "build" || kind === "create") {
      if (text.includes("hero")) score += 5;
      if (text.includes("call-to-action")) score += 4;
      if (text.includes("headline")) score += 3;
      if (text.includes("layout")) score += 2;
    }

    if (turns >= 6 || revision >= 6) {
      if (text.includes("publishing")) score += 4;
      if (text.includes("conversions")) score += 4;
      if (text.includes("final")) score += 3;
      if (text.includes("mobile")) score += 2;
    }

    return score;
  }

  function chooseBestSuggestion() {
    const state = getBuilderState();
    const items = getSuggestionButtons()
      .map(getSuggestionMeta)
      .filter((item) => item.text);

    if (!items.length) return null;

    const ranked = items
      .map((item) => ({
        ...item,
        score: scoreSuggestion(item, state),
      }))
      .sort((a, b) => b.score - a.score);

    return ranked[0] || null;
  }

  function decorateWinner() {
    const all = getSuggestionButtons();
    all.forEach((btn) => {
      btn.style.outline = "";
      btn.style.outlineOffset = "";
    });

    const winner = chooseBestSuggestion();
    if (!winner || !winner.button) return;

    winner.button.style.outline = "1px solid rgba(255,255,255,0.10)";
    winner.button.style.outlineOffset = "0px";
  }

  function patchTopSuggestionTextSource() {
    const safety = window.__SIMO_AUTORUN_SAFETY__;
    if (!safety || safety.__multiOptionPatched) return;

    safety.__multiOptionPatched = true;
    safety.getBestSuggestion = function () {
      return chooseBestSuggestion();
    };
  }

  function patchAutoAssistStatus() {
    const status = document.getElementById("simoAutoAssistStatus");
    if (!status) return;

    const current = String(status.textContent || "");
    const winner = chooseBestSuggestion();
    if (!winner || !winner.text) return;

    if (
      current.includes("Ready to auto-run:") ||
      current.includes("Running top suggestion soon") ||
      current.includes("Running top suggestion in")
    ) {
      status.textContent = current
        .replace("top suggestion", "best suggestion")
        .replace(/Ready to auto-run:.*$/, `Ready to auto-run: ${winner.text}`);
    }
  }

  function patchUseTopSuggestionButton() {
    const btn = document.getElementById("simoSuggestionUseTopBtn");
    if (!btn || btn.dataset.multiOptionPatched === "true") return;

    btn.dataset.multiOptionPatched = "true";

    btn.addEventListener(
      "click",
      (e) => {
        const hook = window.__SIMO_COMPOSER_HOOK__;
        const state = getBuilderState();
        const winner = chooseBestSuggestion();

        if (!hook || !winner || !winner.text) return;

        const prompt = `${winner.text} for my current build. Keep the design consistent and improve overall quality. This is revision ${state?.revision || 0}.`;

        hook.setText(prompt);

        if (e.shiftKey) {
          hook.sendText(prompt);
          rememberSuggestion(winner.text);
        }

        e.stopImmediatePropagation();
      },
      true
    );
  }

  function patchRefreshBehavior() {
    const btn = document.getElementById("simoSuggestionRefreshBtn");
    if (!btn || btn.dataset.multiOptionPatched === "true") return;

    btn.dataset.multiOptionPatched = "true";

    btn.addEventListener(
      "click",
      () => {
        const buttons = getSuggestionButtons();
        if (buttons.length > 1) {
          const first = buttons.shift();
          buttons.push(first);

          const list = document.getElementById("simoBuilderSuggestionsList");
          if (list) {
            list.innerHTML = "";
            buttons.forEach((b) => list.appendChild(b));
          }
        }
      },
      true
    );
  }

  function patchSendHookTracking() {
    const hook = window.__SIMO_COMPOSER_HOOK__;
    if (!hook || hook.__multiOptionPatched) return;

    const originalSendText = hook.sendText;
    if (typeof originalSendText !== "function") return;

    hook.__multiOptionPatched = true;

    hook.sendText = async function patchedSendText(text) {
      const clean = String(text || "");
      const winner = chooseBestSuggestion();

      if (winner && clean.toLowerCase().includes(winner.text.toLowerCase())) {
        rememberSuggestion(winner.text);
      }

      return originalSendText.call(this, text);
    };
  }

  function exposeSelector() {
    window.__SIMO_AUTORUN_SELECTOR__ = {
      chooseBestSuggestion,
      getHistory,
      rememberSuggestion,
    };
  }

  function loop() {
    try {
      decorateWinner();
      patchTopSuggestionTextSource();
      patchAutoAssistStatus();
      patchUseTopSuggestionButton();
      patchRefreshBehavior();
      patchSendHookTracking();
      exposeSelector();
    } catch (err) {
      console.warn("Multi-option smart auto assist skipped:", err);
    }

    requestAnimationFrame(loop);
  }

  loop();
})();

// ==============================
// Simo Phase 2.9U — Memory + Fatigue Avoidance (SAFE)
// paste at very bottom under 2.9T
// ==============================

(function simoAutoAssistFatigueMemory() {
  if (window.__SIMO_AUTORUN_FATIGUE__) return;
  window.__SIMO_AUTORUN_FATIGUE__ = true;

  const TYPE_HISTORY_KEY = "__SIMO_AUTORUN_TYPE_HISTORY__";
  const MAX_TYPE_HISTORY = 6;

  function normalize(text) {
    return String(text || "").toLowerCase();
  }

  function getTypeHistory() {
    const raw = window[TYPE_HISTORY_KEY];
    return Array.isArray(raw) ? raw : [];
  }

  function saveTypeHistory(list) {
    window[TYPE_HISTORY_KEY] = Array.isArray(list)
      ? list.slice(0, MAX_TYPE_HISTORY)
      : [];
  }

  function rememberType(type) {
    if (!type) return;
    const existing = getTypeHistory().filter((t) => t !== type);
    saveTypeHistory([type, ...existing]);
  }

  function classifyType(text) {
    const t = normalize(text);

    if (t.includes("layout") || t.includes("structure")) return "layout";
    if (t.includes("spacing") || t.includes("padding")) return "spacing";
    if (t.includes("typography") || t.includes("font")) return "typography";
    if (t.includes("hero") || t.includes("headline")) return "hero";
    if (t.includes("visual") || t.includes("design")) return "visual";
    if (t.includes("conversion") || t.includes("cta")) return "conversion";
    if (t.includes("testimonial") || t.includes("trust")) return "trust";
    if (t.includes("publish") || t.includes("final")) return "finalize";

    return "general";
  }

  function fatiguePenalty(type) {
    const history = getTypeHistory();

    let penalty = 0;

    history.forEach((t, idx) => {
      if (t === type) {
        penalty += 6 - idx; // stronger penalty for recent repeats
      }
    });

    return penalty;
  }

  function boostDiversity(type) {
    const history = getTypeHistory();

    if (!history.length) return 0;

    // reward types not seen recently
    if (!history.includes(type)) return 5;

    return 0;
  }

  function patchScoring() {
    const selector = window.__SIMO_AUTORUN_SELECTOR__;
    if (!selector || selector.__fatiguePatched) return;

    selector.__fatiguePatched = true;

    const originalChoose = selector.chooseBestSuggestion;

    selector.chooseBestSuggestion = function () {
      const winner = originalChoose ? originalChoose() : null;

      if (!winner || !winner.text) return winner;

      const type = classifyType(winner.text);
      const penalty = fatiguePenalty(type);

      if (penalty < 6) {
        return winner;
      }

      // Try to find alternative suggestion
      const all = document.querySelectorAll("#simoBuilderSuggestionsList button");

      let bestAlt = null;
      let bestScore = -Infinity;

      all.forEach((btn) => {
        const text = String(btn.textContent || "");
        const clean = text.replace(/\s+/g, " ").trim();
        if (!clean || clean === winner.text) return;

        const t = classifyType(clean);
        const p = fatiguePenalty(t);
        const bonus = boostDiversity(t);

        const score = bonus - p;

        if (score > bestScore) {
          bestScore = score;
          bestAlt = { button: btn, text: clean };
        }
      });

      return bestAlt || winner;
    };
  }

  function trackExecution() {
    const hook = window.__SIMO_COMPOSER_HOOK__;
    if (!hook || hook.__fatigueTracking) return;

    const originalSend = hook.sendText;
    if (typeof originalSend !== "function") return;

    hook.__fatigueTracking = true;

    hook.sendText = async function (text) {
      const clean = String(text || "");
      const type = classifyType(clean);
      rememberType(type);

      return originalSend.call(this, text);
    };
  }

  function exposeFatigue() {
    window.__SIMO_AUTORUN_FATIGUE_STATE__ = {
      getTypeHistory,
      classifyType,
    };
  }

  function loop() {
    try {
      patchScoring();
      trackExecution();
      exposeFatigue();
    } catch (err) {
      console.warn("Auto Assist fatigue memory skipped:", err);
    }

    requestAnimationFrame(loop);
  }

  loop();
})();

// ==============================
// Simo Phase 2.9V — Intent Prediction (SAFE)
// paste at very bottom under 2.9U
// ==============================

(function simoAutoAssistIntentPrediction() {
  if (window.__SIMO_AUTORUN_INTENT__) return;
  window.__SIMO_AUTORUN_INTENT__ = true;

  function getBuilderState() {
    return window.__SIMO_BUILDER_STATE__ || {
      revision: 0,
      turnCount: 0,
    };
  }

  function getStage() {
    const state = getBuilderState();
    const rev = Number(state.revision || 0);
    const turns = Number(state.turnCount || 0);

    const progress = Math.max(rev, turns);

    if (progress <= 3) return "early";
    if (progress <= 8) return "mid";
    return "late";
  }

  function classifyType(text) {
    const t = String(text || "").toLowerCase();

    if (t.includes("layout") || t.includes("structure")) return "layout";
    if (t.includes("spacing") || t.includes("padding")) return "spacing";
    if (t.includes("typography") || t.includes("font")) return "typography";
    if (t.includes("hero") || t.includes("headline")) return "hero";
    if (t.includes("visual") || t.includes("design")) return "visual";
    if (t.includes("conversion") || t.includes("cta")) return "conversion";
    if (t.includes("testimonial") || t.includes("trust")) return "trust";
    if (t.includes("publish") || t.includes("final")) return "finalize";

    return "general";
  }

  function intentBoost(type, stage) {
    if (stage === "early") {
      if (type === "layout" || type === "spacing" || type === "hero") return 6;
      if (type === "visual" || type === "typography") return 2;
      return 0;
    }

    if (stage === "mid") {
      if (type === "visual" || type === "typography") return 6;
      if (type === "layout" || type === "spacing") return 2;
      return 1;
    }

    if (stage === "late") {
      if (type === "conversion" || type === "trust" || type === "finalize") return 6;
      if (type === "visual" || type === "typography") return 2;
      return 0;
    }

    return 0;
  }

  function patchSelector() {
    const selector = window.__SIMO_AUTORUN_SELECTOR__;
    if (!selector || selector.__intentPatched) return;

    selector.__intentPatched = true;

    const originalChoose = selector.chooseBestSuggestion;

    selector.chooseBestSuggestion = function () {
      const base = originalChoose ? originalChoose() : null;

      const all = document.querySelectorAll("#simoBuilderSuggestionsList button");

      if (!all || !all.length) return base;

      const stage = getStage();

      let best = null;
      let bestScore = -Infinity;

      all.forEach((btn) => {
        const text = String(btn.textContent || "")
          .replace(/\s+/g, " ")
          .trim();

        if (!text) return;

        const type = classifyType(text);
        const boost = intentBoost(type, stage);

        const score = boost;

        if (score > bestScore) {
          bestScore = score;
          best = { button: btn, text };
        }
      });

      // fallback to original if something weird
      return best || base;
    };
  }

  function exposeIntent() {
    window.__SIMO_AUTORUN_INTENT_STATE__ = {
      getStage,
    };
  }

  function loop() {
    try {
      patchSelector();
      exposeIntent();
    } catch (err) {
      console.warn("Auto Assist intent prediction skipped:", err);
    }

    requestAnimationFrame(loop);
  }

  loop();
})();

// ==============================
// Simo Phase 2.9W — Multi-Step Planning (SAFE)
// paste at very bottom under 2.9V
// ==============================

(function simoAutoAssistPlanner() {
  if (window.__SIMO_AUTORUN_PLANNER__) return;
  window.__SIMO_AUTORUN_PLANNER__ = true;

  const PLAN_KEY = "__SIMO_AUTORUN_PLAN__";
  const MAX_PLAN = 3;

  function getBuilderState() {
    return window.__SIMO_BUILDER_STATE__ || {
      revision: 0,
      turnCount: 0,
    };
  }

  function normalize(text) {
    return String(text || "").toLowerCase();
  }

  function classifyType(text) {
    const t = normalize(text);

    if (t.includes("layout") || t.includes("structure")) return "layout";
    if (t.includes("spacing") || t.includes("padding")) return "spacing";
    if (t.includes("typography") || t.includes("font")) return "typography";
    if (t.includes("hero") || t.includes("headline")) return "hero";
    if (t.includes("visual") || t.includes("design")) return "visual";
    if (t.includes("conversion") || t.includes("cta")) return "conversion";
    if (t.includes("testimonial") || t.includes("trust")) return "trust";
    if (t.includes("publish") || t.includes("final")) return "finalize";

    return "general";
  }

  function getStage() {
    const state = getBuilderState();
    const progress = Math.max(
      Number(state.revision || 0),
      Number(state.turnCount || 0)
    );

    if (progress <= 3) return "early";
    if (progress <= 8) return "mid";
    return "late";
  }

  function buildPlan(stage) {
    if (stage === "early") {
      return ["layout", "spacing", "hero"];
    }
    if (stage === "mid") {
      return ["visual", "typography", "hero"];
    }
    if (stage === "late") {
      return ["conversion", "trust", "finalize"];
    }
    return ["general"];
  }

  function getPlan() {
    return window[PLAN_KEY] || [];
  }

  function setPlan(plan) {
    window[PLAN_KEY] = Array.isArray(plan)
      ? plan.slice(0, MAX_PLAN)
      : [];
  }

  function refreshPlan() {
    const stage = getStage();
    const current = getPlan();

    if (!current.length) {
      setPlan(buildPlan(stage));
      return;
    }

    // If stage changes, rebuild
    const expected = buildPlan(stage);
    if (current[0] !== expected[0]) {
      setPlan(expected);
    }
  }

  function consumeStep(type) {
    const plan = getPlan();
    if (!plan.length) return;

    if (plan[0] === type) {
      plan.shift();
      setPlan(plan);
    }
  }

  function planBoost(type) {
    const plan = getPlan();
    if (!plan.length) return 0;

    if (plan[0] === type) return 8; // immediate next step
    if (plan[1] === type) return 4;
    if (plan[2] === type) return 2;

    return 0;
  }

  function patchSelector() {
    const selector = window.__SIMO_AUTORUN_SELECTOR__;
    if (!selector || selector.__plannerPatched) return;

    selector.__plannerPatched = true;

    const originalChoose = selector.chooseBestSuggestion;

    selector.chooseBestSuggestion = function () {
      refreshPlan();

      const all = document.querySelectorAll("#simoBuilderSuggestionsList button");

      if (!all || !all.length) {
        return originalChoose ? originalChoose() : null;
      }

      let best = null;
      let bestScore = -Infinity;

      all.forEach((btn) => {
        const text = String(btn.textContent || "")
          .replace(/\s+/g, " ")
          .trim();

        if (!text) return;

        const type = classifyType(text);
        const boost = planBoost(type);

        const score = boost;

        if (score > bestScore) {
          bestScore = score;
          best = { button: btn, text };
        }
      });

      return best || (originalChoose ? originalChoose() : null);
    };
  }

  function trackExecution() {
    const hook = window.__SIMO_COMPOSER_HOOK__;
    if (!hook || hook.__plannerTracking) return;

    const originalSend = hook.sendText;
    if (typeof originalSend !== "function") return;

    hook.__plannerTracking = true;

    hook.sendText = async function (text) {
      const type = classifyType(text);
      consumeStep(type);
      return originalSend.call(this, text);
    };
  }

  function exposePlan() {
    window.__SIMO_AUTORUN_PLAN_STATE__ = {
      getPlan,
    };
  }

  function loop() {
    try {
      patchSelector();
      trackExecution();
      exposePlan();
    } catch (err) {
      console.warn("Auto Assist planner skipped:", err);
    }

    requestAnimationFrame(loop);
  }

  loop();
})();

// ==============================
// Simo Phase 2.9X — Adaptive Learning (SAFE)
// paste at very bottom under 2.9W
// ==============================

(function simoAdaptiveLearning() {
  if (window.__SIMO_ADAPTIVE_LEARNING__) return;
  window.__SIMO_ADAPTIVE_LEARNING__ = true;

  const LEARN_KEY = "__SIMO_AUTORUN_LEARNED_WEIGHTS__";

  function normalize(text) {
    return String(text || "").toLowerCase();
  }

  function getWeights() {
    const raw = window[LEARN_KEY];
    if (!raw || typeof raw !== "object") {
      return {
        layout: 0,
        spacing: 0,
        typography: 0,
        hero: 0,
        visual: 0,
        conversion: 0,
        trust: 0,
        finalize: 0,
        general: 0,
      };
    }
    return {
      layout: Number(raw.layout || 0),
      spacing: Number(raw.spacing || 0),
      typography: Number(raw.typography || 0),
      hero: Number(raw.hero || 0),
      visual: Number(raw.visual || 0),
      conversion: Number(raw.conversion || 0),
      trust: Number(raw.trust || 0),
      finalize: Number(raw.finalize || 0),
      general: Number(raw.general || 0),
    };
  }

  function setWeights(next) {
    window[LEARN_KEY] = {
      layout: Number(next.layout || 0),
      spacing: Number(next.spacing || 0),
      typography: Number(next.typography || 0),
      hero: Number(next.hero || 0),
      visual: Number(next.visual || 0),
      conversion: Number(next.conversion || 0),
      trust: Number(next.trust || 0),
      finalize: Number(next.finalize || 0),
      general: Number(next.general || 0),
    };
  }

  function classifyType(text) {
    const t = normalize(text);

    if (t.includes("layout") || t.includes("structure")) return "layout";
    if (t.includes("spacing") || t.includes("padding")) return "spacing";
    if (t.includes("typography") || t.includes("font")) return "typography";
    if (t.includes("hero") || t.includes("headline")) return "hero";
    if (t.includes("visual") || t.includes("design")) return "visual";
    if (t.includes("conversion") || t.includes("cta")) return "conversion";
    if (t.includes("testimonial") || t.includes("trust")) return "trust";
    if (t.includes("publish") || t.includes("final")) return "finalize";

    return "general";
  }

  function rewardType(type, amount = 1) {
    const weights = getWeights();
    if (!(type in weights)) return;

    weights[type] = Math.min(12, Number(weights[type] || 0) + amount);
    setWeights(weights);
  }

  function decayWeights() {
    const weights = getWeights();
    Object.keys(weights).forEach((key) => {
      const value = Number(weights[key] || 0);
      if (value > 0) {
        weights[key] = Math.max(0, value - 0.05);
      }
    });
    setWeights(weights);
  }

  function learningBoost(type) {
    const weights = getWeights();
    return Number(weights[type] || 0);
  }

  function cleanSuggestionText(btn) {
    if (!btn) return "";

    if (btn.dataset && btn.dataset.suggestionText) {
      return String(btn.dataset.suggestionText).replace(/\s+/g, " ").trim();
    }

    const clone = btn.cloneNode(true);

    clone.querySelectorAll("*").forEach((el) => {
      const txt = normalize(el.textContent);
      if (
        txt.includes("confidence") ||
        txt.includes("best fit") ||
        txt.includes("follow-up") ||
        txt.includes("alternative") ||
        txt.includes("best edit") ||
        txt.includes("best visual") ||
        txt.includes("best next")
      ) {
        el.remove();
      }
    });

    return String(clone.textContent || "").replace(/\s+/g, " ").trim();
  }

  function patchSelector() {
    const selector = window.__SIMO_AUTORUN_SELECTOR__;
    if (!selector || selector.__adaptiveLearningPatched) return;

    selector.__adaptiveLearningPatched = true;

    const originalChoose = selector.chooseBestSuggestion;

    selector.chooseBestSuggestion = function () {
      const base = originalChoose ? originalChoose() : null;
      const buttons = Array.from(
        document.querySelectorAll("#simoBuilderSuggestionsList button")
      );

      if (!buttons.length) return base;

      let best = null;
      let bestScore = -Infinity;

      buttons.forEach((btn) => {
        const text = cleanSuggestionText(btn);
        if (!text) return;

        const type = classifyType(text);
        const boost = learningBoost(type);

        let score = boost;

        const raw = normalize(btn.textContent || "");
        if (raw.includes("highest confidence")) score += 6;
        if (raw.includes("best fit")) score += 5;
        if (raw.includes("strong follow-up")) score += 2;

        if (score > bestScore) {
          bestScore = score;
          best = { button: btn, text, type, adaptiveScore: score };
        }
      });

      return best || base;
    };
  }

  function patchTracking() {
    const hook = window.__SIMO_COMPOSER_HOOK__;
    if (!hook || hook.__adaptiveLearningTracking) return;

    const originalSend = hook.sendText;
    if (typeof originalSend !== "function") return;

    hook.__adaptiveLearningTracking = true;

    hook.sendText = async function patchedAdaptiveSend(text) {
      const clean = String(text || "");
      const type = classifyType(clean);

      rewardType(type, 1);
      decayWeights();

      return originalSend.call(this, text);
    };
  }

  function exposeLearning() {
    window.__SIMO_ADAPTIVE_LEARNING_STATE__ = {
      getWeights,
      classifyType,
      rewardType,
      decayWeights,
    };
  }

  function loop() {
    try {
      patchSelector();
      patchTracking();
      exposeLearning();
    } catch (err) {
      console.warn("Adaptive learning skipped:", err);
    }

    requestAnimationFrame(loop);
  }

  loop();
})();

// ==============================
// Simo Polish — Suggestion Reasoning (CLEAN FINAL)
// ==============================

(function simoSuggestionReasoning() {
  if (window.__SIMO_REASONING__) return;
  window.__SIMO_REASONING__ = true;

  function getStage() {
    const s = window.__SIMO_AUTORUN_INTENT_STATE__;
    return s && s.getStage ? s.getStage() : "mid";
  }

  function explain(text) {
    const t = String(text || "").toLowerCase();
    const stage = getStage();

    if (t.includes("layout")) return "Improves structure and flow.";
    if (t.includes("spacing")) return "Creates cleaner visual rhythm.";
    if (t.includes("typography")) return "Enhances readability and polish.";
    if (t.includes("hero")) return "Strengthens first impression.";
    if (t.includes("visual")) return "Boosts overall design quality.";
    if (t.includes("testimonial")) return "Builds trust before publish.";
    if (t.includes("conversion")) return "Improves user action and engagement.";

    if (stage === "early") return "Best next step for building structure.";
    if (stage === "mid") return "Refines and improves visual quality.";
    if (stage === "late") return "Prepares your build for final polish.";

    return "";
  }

  function injectReasoning() {
    const cards = document.querySelectorAll("#simoBuilderSuggestionsList button");

    cards.forEach((btn) => {
      if (btn.dataset.reasonInjected === "true") return;

      const text = btn.innerText || "";
      const reason = explain(text);

      if (!reason) return;

      const el = document.createElement("div");
      el.style.fontSize = "10px";
      el.style.opacity = "0.7";
      el.style.marginTop = "4px";
      el.textContent = "Why: " + reason;

      btn.appendChild(el);
      btn.dataset.reasonInjected = "true";
    });
  }

  function loop() {
    try {
      injectReasoning();
    } catch {}
    requestAnimationFrame(loop);
  }

  loop();
})();

// ==============================
// Simo Polish — Next Step Preview (SAFE)
// ==============================

(function simoNextStepPreview() {
  if (window.__SIMO_NEXT_PREVIEW__) return;
  window.__SIMO_NEXT_PREVIEW__ = true;

  function inject() {
    const container = document.getElementById("simoAutoAssistStatus");
    if (!container) return;

    const planState = window.__SIMO_AUTORUN_PLAN_STATE__;
    if (!planState || !planState.getPlan) return;

    const plan = planState.getPlan();
    if (!plan.length) return;

    const existing = document.getElementById("simoNextStepPreview");
    if (existing) existing.remove();

    const el = document.createElement("div");
    el.id = "simoNextStepPreview";
    el.style.marginTop = "6px";
    el.style.fontSize = "10px";
    el.style.opacity = "0.72";
    el.textContent = `Next: ${plan.join(" → ")}`;

    container.appendChild(el);
  }

  function loop() {
    try {
      inject();
    } catch {}
    requestAnimationFrame(loop);
  }

  loop();
})();

// ==============================
// Simo Polish — Confidence Glow (SAFE)
// ==============================

(function simoConfidenceGlow() {
  if (window.__SIMO_GLOW__) return;
  window.__SIMO_GLOW__ = true;

  function applyGlow() {
    const top = document.querySelector("#simoBuilderSuggestionsList button");
    if (!top) return;

    top.style.boxShadow =
      "0 0 0 1px rgba(0,255,200,0.4), 0 0 18px rgba(0,255,200,0.25)";
  }

  function loop() {
    try {
      applyGlow();
    } catch {}
    requestAnimationFrame(loop);
  }

  loop();
})();

// ==============================
// Simo Polish — Auto Assist Messaging (SAFE)
// ==============================

(function simoAutoAssistMessaging() {
  if (window.__SIMO_MSG_PATCH__) return;
  window.__SIMO_MSG_PATCH__ = true;

  function update() {
    const el = document.getElementById("simoAutoAssistStatus");
    if (!el) return;

    const txt = el.textContent || "";

    if (/Watching for idle\.\.\. arming in \d+s\./i.test(txt)) {
      const num = txt.match(/\d+/)?.[0] || "7";
      el.textContent = `Simo will improve your build in ${num}s if you stay idle.`;
      return;
    }

    if (/Auto Assist armed\. Running best suggestion in \d+s if you stay idle\./i.test(txt)) {
      const num = txt.match(/\d+/)?.[0] || "3";
      el.textContent = `Simo will improve your build automatically in ${num}s if you stay idle.`;
    }
  }

  function loop() {
    try {
      update();
    } catch {}
    requestAnimationFrame(loop);
  }

  loop();

// ==============================
// Simo Phase 2.7 — Smart Starter Prompts (FIXED LISTENER)
// ==============================

(function simoSmartStarters() {
  function init() {
    const input = document.getElementById("chatInput");
    if (!input) return;

    const starters = {
      build: "Build a modern landing page for my business",
      business: "Give me a startup idea I can launch quickly",
      design: "Design something creative and unique for me",
      image: "Analyze this image and tell me what you see",
      chat: "Let’s just chat"
    };

    function applyPrompt(text) {
      input.value = text;
      input.focus();
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    document.addEventListener("click", function (e) {
      const el = e.target.closest("[data-simo-starter]");
      if (!el) return;

      const key = el.getAttribute("data-simo-starter");
      if (!starters[key]) return;

      applyPrompt(starters[key]);
    });

    console.log("✅ Simo Starter Prompts Ready");
  }

  // ensure DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

// ==============================
// Simo Phase 2.8 — Starter UX Enhancements (SAFE ADD-ON)
// ==============================

(function simoStarterUXEnhancements() {
  function init() {
    const buttons = Array.from(document.querySelectorAll("[data-simo-starter]"));
    const input = document.getElementById("chatInput");
    if (!buttons.length || !input) return;

    function setActive(clicked) {
      buttons.forEach(btn => {
        btn.style.opacity = "0.6";
        btn.style.transform = "scale(0.98)";
      });

      clicked.style.opacity = "1";
      clicked.style.transform = "scale(1.05)";
    }

    function scrollToInput() {
      input.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        setActive(btn);
        scrollToInput();
      });
    });

    console.log("✨ Starter UX Enhancements Active");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

})();
