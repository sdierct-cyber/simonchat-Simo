// PHASE 14M-R10.11C — Foreground Workspace + Live Tab Image Fix
// Safe replacement for static/phase31-design-actions-safe.js.
// Purpose:
// 1) Keep button spacing polish.
// 2) Prevent non-save design/workspace actions from silently adding Builder Library items.
// 3) Make Save to Library / Save Workspace authoritative: one click = one saved item.
// 4) Remember deleted library cards locally so deleted items do not visually come back when the Library reopens.
// No app.py changes. No visual-core rewrite. No account/pro changes. No image intake changes. No normal send/enter patch.
(function () {
  "use strict";

  if (window.__SIMO_R1010_SERVER_OWNED_SAVE_LOCAL_DUP_BLOCK__) return;
  window.__SIMO_R1010_SERVER_OWNED_SAVE_LOCAL_DUP_BLOCK__ = true;

  const PHASE = "PHASE 14M-R10.11F — Live Tab Write + Foreground Fix";
  window.__SIMO_R103_PHASE__ = PHASE;
  window.__SIMO_R104_PHASE__ = PHASE;
  window.__SIMO_R105_PHASE__ = PHASE;
  window.__SIMO_R106_PHASE__ = PHASE;
  window.__SIMO_R107_PHASE__ = PHASE;
  window.__SIMO_R108_PHASE__ = PHASE;
  window.__SIMO_R109_PHASE__ = PHASE;
  window.__SIMO_R1010_PHASE__ = PHASE;

  const PRIMARY_LIB_KEY = "simo_builder_library_v5_1_builder_first";
  const TOMBSTONE_KEY = "simo_r106_library_tombstones_v1";

  const LIB_KEYS = [
    "simo_builder_library_v5_1_builder_first",
    "simo_builder_library_v5",
    "simo_builder_library_v4",
    "simo_builder_library_v3",
    "simo_visual_concepts_library_v1",
    "simo_saved_visual_concepts_v1",
    "simo_library_v1"
  ];

  const state = {
    explicitSaveUntil: 0,
    nonSaveDesignActionUntil: 0,
    lastNonSaveLabel: "",
    lastAuthoritativeSaveAt: 0,
    setItemPatched: false,
    originalSetItem: null,
    fetchPatched: false,
    originalFetch: null,
    lastSaveFetchFp: "",
    lastSaveFetchAt: 0,
    pruneBusy: false,
    saveClickArmedUntil: 0,
    authoritativeSaveBlockUntil: 0,
    authoritativeSaveFp: ""
  };

  function $(id) { return document.getElementById(id); }

  function clean(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function uid() {
    return "simo_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  }

  function safeJsonParse(raw, fallback) {
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  function getStatusEl() {
    return $("loadingHint") || $("statusText") || $("readyStatus") || document.querySelector(".status, .footer-status, .loading-hint, [data-simo-status]");
  }

  function setStatus(text) {
    const el = getStatusEl();
    if (el) el.textContent = text || "Ready.";
  }

  function injectStyles() {
    if ($("simoR107LibraryOpenDeleteGuardStyles")) return;
    const style = document.createElement("style");
    style.id = "simoR107LibraryOpenDeleteGuardStyles";
    style.textContent = `
      .simo-vc-card .simo-vc-actions,
      .simo-vc-card [data-simo-actions-row],
      .simo-vc-card [data-simo-vc-actions],
      .simo-vc-card .simo-design-actions,
      .simo-vc-card .simo-r101-suggestions-anchor{
        row-gap:12px!important;
        column-gap:12px!important;
      }

      .simo-vc-card [data-simo-vc-action],
      .simo-vc-card [data-simo-vc-special],
      #simoVcWorkspaceModal [data-simo-workspace-action],
      #simoVcWorkspaceModal [data-render],
      #simoVcWorkspaceModal [data-variation],
      #simoVcWorkspaceModal [data-save-workspace],
      #simoVcWorkspaceModal [data-open-workspace-tab]{
        min-height:40px!important;
        line-height:1.15!important;
        white-space:normal!important;
        text-align:center!important;
        margin:2px!important;
      }

      .simo-vc-card .simo-r101-suggestions,
      .simo-vc-card [data-simo-design-suggestions],
      .simo-vc-card [data-simo-suggestions-panel]{
        margin-top:16px!important;
        padding-top:14px!important;
      }

      .simo-r106-guard-ready [data-simo-vc-action],
      .simo-r106-guard-ready [data-simo-vc-special],
      #simoVcWorkspaceModal [data-simo-workspace-action]{
        box-shadow:0 9px 22px rgba(0,0,0,.14)!important;
      }
    `;
    document.head.appendChild(style);
  }

  function markCards() {
    document.querySelectorAll(".simo-vc-card").forEach(function (card) {
      card.classList.add("simo-r106-guard-ready");
    });
  }

  function isLibraryKey(key) {
    return LIB_KEYS.includes(String(key || ""));
  }

  function itemTitle(item) {
    if (!item || typeof item !== "object") return "";
    return item.title || item.name || item.projectTitle || item.label || item.prompt || item.latestPrompt || item.item || "";
  }

  function firstImageFromText(text) {
    const s = String(text || "");
    if (!s) return "";
    const patterns = [
      /<img[^>]+src=["']([^"']+)["']/i,
      /(?:imageUrl|image_url|generated_visual_url|generatedImageUrl|previewUrl|thumbnail|src)\s*[:=]\s*["']([^"']+)["']/i,
      /(\/generated-images\/[^"' <>)]+?\.(?:png|jpg|jpeg|webp|gif))/i,
      /(\/generated_images\/[^"' <>)]+?\.(?:png|jpg|jpeg|webp|gif))/i,
      /(\/static\/generated-images\/[^"' <>)]+?\.(?:png|jpg|jpeg|webp|gif))/i,
      /(data:image\/(?:png|jpg|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+)/i,
      /(https?:\/\/[^"' <>)]+?\.(?:png|jpg|jpeg|webp|gif))/i
    ];
    for (const pattern of patterns) {
      const m = s.match(pattern);
      if (m && m[1]) return m[1];
    }
    return "";
  }

  function deepFindImage(value, depth) {
    if (!value || depth > 5) return "";
    if (typeof value === "string") return firstImageFromText(value);
    if (Array.isArray(value)) {
      for (const entry of value) {
        const found = deepFindImage(entry, depth + 1);
        if (found) return found;
      }
      return "";
    }
    if (typeof value === "object") {
      const priorityKeys = [
        "imageUrl", "image_url", "generated_visual_url", "generatedImageUrl",
        "previewUrl", "preview_url", "thumbnail", "thumbnailUrl", "image",
        "img", "src", "url", "visualUrl", "visual_url", "coverImage",
        "cover_image", "screenshot", "screenshotUrl", "mediaUrl"
      ];
      for (const key of priorityKeys) {
        const found = deepFindImage(value[key], depth + 1);
        if (found) return found;
      }
      for (const key of Object.keys(value)) {
        const found = deepFindImage(value[key], depth + 1);
        if (found) return found;
      }
    }
    return "";
  }

  function getArraySlot(parsed) {
    if (Array.isArray(parsed)) return { arr: parsed, kind: "array" };
    if (parsed && typeof parsed === "object") {
      if (Array.isArray(parsed.items)) return { arr: parsed.items, kind: "items" };
      if (Array.isArray(parsed.builds)) return { arr: parsed.builds, kind: "builds" };
      if (Array.isArray(parsed.library)) return { arr: parsed.library, kind: "library" };
    }
    return { arr: null, kind: "" };
  }

  function serializeSlot(originalParsed, kind, arr) {
    if (kind === "array") return JSON.stringify(arr);
    const copy = originalParsed && typeof originalParsed === "object" ? { ...originalParsed } : {};
    copy[kind || "items"] = arr;
    return JSON.stringify(copy);
  }

  function readArray(key) {
    const parsed = safeJsonParse(localStorage.getItem(key), null);
    const slot = getArraySlot(parsed);
    return { parsed, arr: slot.arr || [], kind: slot.kind || "array" };
  }

  function writeArray(key, parsed, kind, arr) {
    const raw = serializeSlot(parsed, kind, arr);
    if (state.originalSetItem) state.originalSetItem.call(localStorage, key, raw);
    else localStorage.setItem(key, raw);
  }

  function getStoredLength(key) {
    const parsed = safeJsonParse(localStorage.getItem(key), null);
    const slot = getArraySlot(parsed);
    return slot.arr ? slot.arr.length : 0;
  }

  function normalizeImageUrl(url) {
    let out = String(url || "").trim().replace(/^https?:\/\/[^/]+/i, "");
    out = out.replace(/[?#].*$/, "");
    return out;
  }

  function primaryLibraryFingerprints() {
    try {
      return new Set(readArray(PRIMARY_LIB_KEY).arr.map(fingerprintItem).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  function fingerprintItem(item) {
    if (!item || typeof item !== "object") return "";
    const image = normalizeImageUrl(deepFindImage(item, 0));
    if (image) return "img:" + image;
    const title = clean(itemTitle(item));
    const prompt = clean(item.prompt || item.latestPrompt || item.sourcePrompt || item.description || item.notes || "").slice(0, 140);
    if (title || prompt) return "txt:" + title + "|" + prompt;
    return "";
  }

  function fingerprintDomCard(card) {
    if (!card) return "";
    const img = normalizeImageUrl(card.querySelector("img")?.getAttribute("src") || "");
    if (img) return "img:" + img;
    const title = clean(card.querySelector("h1,h2,h3,h4,strong,b")?.textContent || card.textContent || "").slice(0, 160);
    return title ? "txtdom:" + title : "";
  }

  function dedupePayload(rawValue) {
    const parsed = safeJsonParse(rawValue, null);
    const slot = getArraySlot(parsed);
    if (!slot.arr || slot.arr.length < 2) return rawValue;

    const seen = new Set();
    const keptReverse = [];
    for (let i = slot.arr.length - 1; i >= 0; i -= 1) {
      const item = slot.arr[i];
      const fp = fingerprintItem(item);
      if (fp && seen.has(fp)) continue;
      if (fp) seen.add(fp);
      keptReverse.push(item);
    }
    const deduped = keptReverse.reverse();
    if (deduped.length === slot.arr.length) return rawValue;
    return serializeSlot(parsed, slot.kind, deduped);
  }

  function labelForButton(btn) {
    return clean(btn && (btn.textContent || btn.getAttribute("aria-label") || btn.title || btn.dataset.simoWorkspaceAction || btn.dataset.simoVcAction || btn.dataset.simoVcSpecial) || "");
  }

  function isSaveButton(btn) {
    if (!btn) return false;
    const label = labelForButton(btn);
    if (btn.matches("[data-save-workspace], [data-simo-vc-special='save-library'], [data-simo-vc-special=\"save-library\"]")) return true;
    return /\bsave\b/.test(label) && /\b(library|workspace)\b/.test(label);
  }

  function isDeleteButton(btn) {
    if (!btn) return false;
    const label = labelForButton(btn);
    return /^delete$/.test(label) || /\bdelete\b/.test(label);
  }

  function isDesignActionButton(btn) {
    if (!btn) return false;
    if (isSaveButton(btn)) return false;
    if (btn.matches("#simoVcWorkspaceModal [data-simo-workspace-action]")) return true;
    if (btn.matches("#simoVcWorkspaceModal button")) {
      const label = labelForButton(btn);
      return /\b(material|size|proportion|handle|hardware|comfort|color|pattern|functional|brand|tag|packaging|usability|finish|mockup|exploded|detail|visual|source|shape|function|3d product notes)\b/.test(label);
    }
    return false;
  }

  function closestVisualCard(el) {
    return el && el.closest && el.closest(".simo-r107-live-modal, .simo-vc-card, [data-simo-project], .msg-row, .msg-bubble");
  }

  function decodeProject(card) {
    const raw = card && card.getAttribute && card.getAttribute("data-simo-project");
    if (raw) {
      try { return JSON.parse(decodeURIComponent(raw)); } catch {}
      try { return JSON.parse(raw); } catch {}
    }
    return null;
  }

  function workspaceModal() {
    return $("simoVcWorkspaceModal") || document.querySelector("[id*='WorkspaceModal'], .simo-vc-workspace-modal, .simo-workspace-modal");
  }

  function findCurrentVisualSource(startEl) {
    const modal = workspaceModal();
    const fromModal = modal && modal.querySelector("img")?.getAttribute("src");
    if (fromModal) return fromModal;
    const card = closestVisualCard(startEl) || document.querySelector(".simo-vc-card:last-of-type");
    const fromCard = card && card.querySelector("img")?.getAttribute("src");
    if (fromCard) return fromCard;
    const latestImg = Array.from(document.querySelectorAll(".simo-vc-card img, .msg-bubble-assistant img, .chat-wrap img")).pop();
    return latestImg ? latestImg.getAttribute("src") || "" : "";
  }

  function findCurrentTitle(startEl) {
    const modal = workspaceModal();
    const modalTitle = modal && modal.querySelector("h1,h2,h3,strong,b")?.textContent;
    if (modalTitle && clean(modalTitle) !== "product design workspace") return modalTitle.trim();

    const card = closestVisualCard(startEl) || document.querySelector(".simo-vc-card:last-of-type");
    const project = decodeProject(card);
    const projectTitle = project && (project.title || project.item || project.prompt || project.latestPrompt);
    if (projectTitle) return String(projectTitle).trim();

    const cardTitle = card && card.querySelector("h1,h2,h3,strong,b")?.textContent;
    if (cardTitle) return cardTitle.trim();

    return "Simo Visual Design";
  }

  function findCurrentPrompt(startEl) {
    const card = closestVisualCard(startEl) || document.querySelector(".simo-vc-card:last-of-type");
    const project = decodeProject(card);
    if (project) return String(project.sourcePrompt || project.latestPrompt || project.prompt || project.item || project.title || "").trim();
    const title = findCurrentTitle(startEl);
    return title || "Simo visual design";
  }

  function categoryFromTitleAndPrompt(title, prompt) {
    const blob = clean([title, prompt].join(" "));
    if (/\b(guitar|bass|instrument|pickup|headstock|fretboard|strings?|tuning|bridge|knobs?)\b/.test(blob)) return "instrument";
    if (/\b(house|home|mansion|villa|cabin|garage|pool|architecture|roof|windows?|landscape)\b/.test(blob)) return "home";
    if (/\b(rim|rims|wheel|alloy|tire|car|vehicle|supercar|truck|motorcycle)\b/.test(blob)) return "vehicle";
    if (/\b(app|website|dashboard|ui|ux|screen|interface|software|digital)\b/.test(blob)) return "digital";
    if (/\b(book cover|book jacket|cover design|editorial|novel|memoir|autobiography)\b/.test(blob)) return "editorial";
    if (/\b(chair|table|sofa|desk|cabinet|furniture)\b/.test(blob)) return "furniture";
    return "product";
  }

  function readTombstones() {
    const raw = safeJsonParse(localStorage.getItem(TOMBSTONE_KEY), []);
    if (!Array.isArray(raw)) return [];
    const cutoff = Date.now() - 1000 * 60 * 60 * 24 * 30;
    return raw.filter(function (t) { return t && t.fp && Number(t.at || 0) > cutoff; }).slice(-250);
  }

  function writeTombstones(list) {
    const trimmed = Array.isArray(list) ? list.slice(-250) : [];
    if (state.originalSetItem) state.originalSetItem.call(localStorage, TOMBSTONE_KEY, JSON.stringify(trimmed));
    else localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(trimmed));
  }

  function rememberTombstone(fp, label) {
    if (!fp) return;
    const list = readTombstones().filter(function (t) { return t.fp !== fp; });
    list.push({ fp, label: String(label || "Deleted item").slice(0, 180), at: Date.now() });
    writeTombstones(list);
  }

  function isTombstonedFp(fp) {
    if (!fp) return false;
    return readTombstones().some(function (t) { return t.fp === fp; });
  }

  function buildLibraryItem(startEl) {
    const title = findCurrentTitle(startEl).replace(/^Ask:\s*/i, "").trim() || "Simo Visual Design";
    const prompt = findCurrentPrompt(startEl) || title;
    const imageUrl = findCurrentVisualSource(startEl);
    const now = new Date().toISOString();
    const category = categoryFromTitleAndPrompt(title, prompt);

    return {
      id: uid(),
      __id: uid(),
      title: title,
      name: title,
      projectTitle: title,
      prompt: prompt,
      latestPrompt: prompt,
      sourcePrompt: prompt,
      item: title,
      category: category,
      domain: category,
      type: "visual",
      kind: "visual",
      source: "simo_r106_single_save",
      tags: ["visual", "design", "image-first", category].filter(Boolean),
      notes: "Saved from Simo visual design card. Continue this concept from the same visual prompt and controls.",
      imageUrl: imageUrl,
      image_url: imageUrl,
      generated_visual_url: imageUrl,
      generatedImageUrl: imageUrl,
      previewUrl: imageUrl,
      thumbnail: imageUrl,
      visualUrl: imageUrl,
      createdAt: now,
      updatedAt: now,
      savedAt: now,
      html: ""
    };
  }

  function saveSingleLibraryItem(btn) {
    const nowMs = Date.now();
    if (nowMs - state.lastAuthoritativeSaveAt < 1800) {
      setStatus("Save already received — blocking duplicate save.");
      return false;
    }
    state.lastAuthoritativeSaveAt = nowMs;
    state.explicitSaveUntil = nowMs + 6500;

    const item = buildLibraryItem(btn);
    const fp = fingerprintItem(item);
    state.authoritativeSaveBlockUntil = nowMs + 9000;
    state.saveClickArmedUntil = nowMs + 9000;
    state.authoritativeSaveFp = fp || "";
    if (fp && isTombstonedFp(fp)) {
      // If the user intentionally saves the same thing again after deleting it, restore it by removing the tombstone.
      writeTombstones(readTombstones().filter(function (t) { return t.fp !== fp; }));
    }

    const store = readArray(PRIMARY_LIB_KEY);
    const arr = store.arr.slice();

    const existingIndex = fp ? arr.findIndex(function (entry) { return fingerprintItem(entry) === fp; }) : -1;
    if (existingIndex >= 0) {
      arr[existingIndex] = { ...arr[existingIndex], ...item, id: arr[existingIndex].id || item.id, __id: arr[existingIndex].__id || item.__id, updatedAt: item.updatedAt };
      writeArray(PRIMARY_LIB_KEY, store.parsed, store.kind, arr);
      setStatus("Updated the existing Library item instead of saving a duplicate.");
    } else {
      arr.unshift(item);
      writeArray(PRIMARY_LIB_KEY, store.parsed, store.kind, arr);
      setStatus("Saved once to Builder Library.");
    }

    pruneLibraryStorageSoon();
    try { window.dispatchEvent(new CustomEvent("simo:library-updated", { detail: { phase: PHASE, source: "r106-single-save" } })); } catch {}
    try { document.dispatchEvent(new CustomEvent("simo:library-updated", { detail: { phase: PHASE, source: "r106-single-save" } })); } catch {}
    return true;
  }

  function pruneLibraryStorage() {
    if (state.pruneBusy) return;
    state.pruneBusy = true;
    try {
      const tombstones = readTombstones();
      const tombSet = new Set(tombstones.map(function (t) { return t.fp; }));
      const seen = new Set();

      LIB_KEYS.forEach(function (key) {
        const store = readArray(key);
        if (!store.arr.length) return;
        const kept = [];
        store.arr.forEach(function (item) {
          const fp = fingerprintItem(item);
          if (fp && tombSet.has(fp)) return;
          // Cross-key duplicate cleanup. Keep the first copy discovered, preferring PRIMARY_LIB_KEY order.
          if (fp && seen.has(fp)) return;
          if (fp) seen.add(fp);
          kept.push(item);
        });
        if (kept.length !== store.arr.length) writeArray(key, store.parsed, store.kind, kept);
      });
    } finally {
      state.pruneBusy = false;
    }
  }

  function pruneLibraryStorageSoon() {
    setTimeout(pruneLibraryStorage, 40);
    setTimeout(pruneLibraryStorage, 500);
  }

  function hideTombstonedDomCards() {
    const tombstones = readTombstones();
    if (!tombstones.length) return;
    const tombSet = new Set(tombstones.map(function (t) { return t.fp; }));
    const candidates = document.querySelectorAll(".simo-r9-card, .simo-r9-library-card, .simo-library-card, [data-r9-index], [data-library-card], [data-simo-library-card], .builder-library-card, .library-card");
    candidates.forEach(function (card) {
      const fp = fingerprintDomCard(card);
      if ((fp && tombSet.has(fp)) || domCardIsTombstoned(card)) {
        card.remove();
      }
    });
  }

  function captureDeleteTombstone(btn) {
    const card = btn.closest(".simo-r9-library-card, .simo-library-card, [data-library-card], [data-simo-library-card], .builder-library-card, .library-card, .side-card, article, li, .card");
    const fp = fingerprintDomCard(card);
    const label = card ? (card.querySelector("h1,h2,h3,h4,strong,b")?.textContent || card.textContent || "Deleted Library item") : "Deleted Library item";
    if (fp) {
      rememberTombstone(fp, label);
      setTimeout(function () {
        pruneLibraryStorage();
        hideTombstonedDomCards();
      }, 80);
      setTimeout(function () {
        pruneLibraryStorage();
        hideTombstonedDomCards();
      }, 800);
    }
  }

  function patchLocalStorageSetItem() {
    if (state.setItemPatched) return;
    state.setItemPatched = true;
    state.originalSetItem = Storage.prototype.setItem;

    Storage.prototype.setItem = function patchedSimoR1010SetItem(key, value) {
      if (this === window.localStorage && isLibraryKey(key)) {
        const now = Date.now();
        const oldLen = getStoredLength(key);
        const parsedNew = safeJsonParse(value, null);
        const newSlot = getArraySlot(parsedNew);
        const newLen = newSlot.arr ? newSlot.arr.length : oldLen;

        // A non-save workspace/design action may refine visuals, but cannot silently append a Library item.
        if (state.nonSaveDesignActionUntil > now && state.explicitSaveUntil < now && newLen > oldLen) {
          setStatus(`Design action ran without auto-saving to Library: ${state.lastNonSaveLabel || "design action"}.`);
          return undefined;
        }

        // During our guarded Save click, R10.9 writes the one authoritative item directly
        // through the original setItem. Any other localStorage append during this same
        // click is the older/core save path and must be blocked to prevent two cards.
        if (state.saveClickArmedUntil > now && newLen > oldLen) {
          setStatus("Blocked extra local Library write from the older save path.");
          return undefined;
        }

        value = dedupePayload(value);
      }
      return state.originalSetItem.call(this, key, value);
    };
  }

  function fetchUrl(input) {
    try { return typeof input === "string" ? input : (input && input.url) || ""; } catch { return ""; }
  }

  function parseFetchBody(init) {
    try {
      if (!init || !init.body || typeof init.body !== "string") return null;
      return JSON.parse(init.body);
    } catch {
      return null;
    }
  }

  function jsonResponse(payload, status) {
    return new Response(JSON.stringify(payload || { ok: true }), {
      status: status || 200,
      headers: { "Content-Type": "application/json", "X-Simo-R10-8-Guard": "true" }
    });
  }

  function isLibrarySaveUrl(url) {
    return /\/api\/library\/save(?:$|[?#/])/i.test(String(url || ""));
  }

  function isLibraryListUrl(url, init) {
    const method = String((init && init.method) || "GET").toUpperCase();
    return method === "GET" && /\/api\/library(?:$|[?#/])/i.test(String(url || ""));
  }

  function filterLibraryPayload(payload) {
    const tombs = new Set(readTombstones().map(t => t.fp));
    const seen = new Set();
    function keep(item) {
      const fp = fingerprintItem(item);
      if (fp && tombs.has(fp)) return false;
      // R10.10: do not hide a server/API item just because a local copy exists.
      // The visible Library is server-backed in this build, so hiding server
      // twins made successful saves disappear from the modal. Only remove
      // exact duplicates inside the same payload and tombstoned/deleted items.
      if (fp && seen.has(fp)) return false;
      if (fp) seen.add(fp);
      return true;
    }
    if (Array.isArray(payload)) return payload.filter(keep);
    if (payload && typeof payload === "object") {
      const copy = { ...payload };
      ["items", "builds", "library"].forEach(function (key) {
        if (Array.isArray(copy[key])) copy[key] = copy[key].filter(keep);
      });
      return copy;
    }
    return payload;
  }

  function patchFetch() {
    if (state.fetchPatched || typeof window.fetch !== "function") return;
    state.fetchPatched = true;
    state.originalFetch = window.fetch.bind(window);

    window.fetch = function simoR1010FetchGuard(input, init) {
      const url = fetchUrl(input);
      const now = Date.now();

      if (isLibrarySaveUrl(url)) {
        const body = parseFetchBody(init);
        const fp = fingerprintItem((body && (body.item || body.build || body.project || body)) || {});

        if (state.nonSaveDesignActionUntil > now && state.explicitSaveUntil < now) {
          setStatus(`Blocked Library auto-save from design action: ${state.lastNonSaveLabel || "design action"}.`);
          return Promise.resolve(jsonResponse({ ok: true, skipped: true, blocked_autosave: true, phase: PHASE }));
        }

        // R10.10: let the real server/API save be the source of truth.
        // Earlier guards blocked this request, which made the UI say “Saved”
        // while nothing appeared after reopening Library. We only block a
        // second near-identical save request from the same click.
        const requestKey = fp || (String(url || "") + "|" + String(init && init.body || "").slice(0, 500));
        if (requestKey && state.lastSaveFetchFp === requestKey && now - state.lastSaveFetchAt < 5000) {
          setStatus("Blocked duplicate Library save request, but kept the first server save.");
          return Promise.resolve(jsonResponse({ ok: true, skipped: true, duplicate: true, phase: PHASE }));
        }

        state.lastSaveFetchFp = requestKey || state.lastSaveFetchFp;
        state.lastSaveFetchAt = now;
        setStatus("Saving once through Simo’s normal Library sync…");
      }

      if (isLibraryListUrl(url, init)) {
        return state.originalFetch(input, init).then(function (res) {
          try {
            const ct = res.headers && res.headers.get && res.headers.get("content-type") || "";
            if (!ct.includes("application/json")) return res;
            return res.clone().json().then(function (data) {
              return jsonResponse(filterLibraryPayload(data), res.status);
            }).catch(function () { return res; });
          } catch {
            return res;
          }
        });
      }

      return state.originalFetch(input, init);
    };
  }



  function domCardImage(card) {
    if (!card) return "";
    const img = card.querySelector("img");
    const src = img && (img.getAttribute("src") || img.src || "");
    return normalizeImageUrl(src);
  }

  function domCardTitle(card) {
    if (!card) return "";
    const node = card.querySelector(".simo-r9-title, [class*='title'], h1,h2,h3,h4,strong,b");
    let text = String(node && node.textContent || "").trim();
    text = text.replace(/^⭐\s*/, "").trim();
    if (!text) text = String(card.textContent || "").split("\n").map(s => s.trim()).filter(Boolean)[0] || "Saved Simo Design";
    return text;
  }

  function r107FingerprintDomCard(card) {
    const img = domCardImage(card);
    const title = clean(domCardTitle(card));
    if (img && title) return "domimgtitle:" + img + "|" + title;
    if (img) return "img:" + img;
    if (title) return "domtitle:" + title;
    return "";
  }

  function r107ItemMatchesDom(item, card) {
    if (!item || !card) return false;
    const cardImg = domCardImage(card);
    const itemImg = normalizeImageUrl(deepFindImage(item, 0));
    const cardTitle = clean(domCardTitle(card));
    const title = clean(itemTitle(item));
    const prompt = clean(item.prompt || item.latestPrompt || item.sourcePrompt || item.notes || "");

    if (cardImg && itemImg && cardImg === itemImg) return true;
    if (cardImg && itemImg && (itemImg.endsWith(cardImg) || cardImg.endsWith(itemImg))) return true;
    if (cardImg && JSON.stringify(item).includes(cardImg)) return true;
    if (cardTitle && title && cardTitle === title && itemImg) return true;
    if (cardTitle && prompt && prompt.includes(cardTitle) && itemImg) return true;
    return false;
  }

  function removeDomCardFromAllLibraryStores(card) {
    if (!card) return 0;
    let removed = 0;
    LIB_KEYS.forEach(function (key) {
      const store = readArray(key);
      if (!store.arr.length) return;
      const next = store.arr.filter(function (item) {
        const match = r107ItemMatchesDom(item, card);
        if (match) removed += 1;
        return !match;
      });
      if (next.length !== store.arr.length) writeArray(key, store.parsed, store.kind, next);
    });
    return removed;
  }

  function rememberDomCardTombstones(card) {
    if (!card) return;
    const img = domCardImage(card);
    const title = domCardTitle(card);
    const titleClean = clean(title);
    const fps = [];
    // R10.9: never tombstone by title alone when an image exists. Many tests
    // share the same title, so title-only deletion was hiding multiple cards.
    if (img) {
      fps.push("img:" + img);
      if (titleClean) fps.push("domimgtitle:" + img + "|" + titleClean);
    } else if (titleClean) {
      fps.push("domtitle:" + titleClean);
    }
    fps.forEach(fp => rememberTombstone(fp, title));
  }

  function domCardIsTombstoned(card) {
    if (!card) return false;
    const img = domCardImage(card);
    const titleClean = clean(domCardTitle(card));
    const tombs = readTombstones().map(t => t.fp);
    if (img && tombs.includes("img:" + img)) return true;
    if (img && titleClean && tombs.includes("domimgtitle:" + img + "|" + titleClean)) return true;
    // Only use title-only tombstones for cards that have no image.
    if (!img && titleClean && tombs.includes("domtitle:" + titleClean)) return true;
    return false;
  }

  function closeR107Modal() {
    document.querySelectorAll("[data-simo-r107-live-modal]").forEach(el => { try { el.remove(); } catch {} });
  }

  function loadPromptAndSend(prompt, label) {
    state.nonSaveDesignActionUntil = Date.now() + 25000;
    state.explicitSaveUntil = 0;
    state.lastNonSaveLabel = String(label || "saved design edit");
    const input = $("chatInput") || document.querySelector("textarea, input[type='text']");
    const send = $("sendBtn") || document.querySelector("button[type='submit'], .send-btn, [data-send]");
    if (!input) return;
    input.value = prompt;
    input.focus();
    try { input.dispatchEvent(new Event("input", { bubbles: true })); } catch {}
    setStatus("Loaded saved-design edit into Simo.");
    // Use the existing Send path instead of calling any hidden library/save logic.
    setTimeout(function () {
      if (send && typeof send.click === "function") send.click();
    }, 80);
  }

  function conciseEditPrompt(title, label) {
    const t = String(title || "this saved design").replace(/^Ask:\s*/i, "").trim();
    const l = String(label || "continue editing").trim();
    return `Continue editing this saved design: ${t}. Apply this design change: ${l}. Keep the exact same object and product category. Show the updated visual first. Do not save to library unless I click Save.`;
  }

  function openSavedDesignLive(card, explicitImage) {
    const image = normalizeImageUrl(explicitImage || domCardImage(card));
    const title = domCardTitle(card).replace(/^Ask:\s*/i, "").trim() || "Saved Simo Design";
    if (!image) {
      setStatus("This saved item does not have a visual image to reopen.");
      return;
    }
    closeR107Modal();
    const wrap = document.createElement("div");
    wrap.className = "simo-r107-live-modal";
    wrap.setAttribute("data-simo-r107-live-modal", "true");
    wrap.innerHTML = `
      <div class="simo-r107-backdrop" data-r107-close></div>
      <section class="simo-r107-panel" role="dialog" aria-modal="true">
        <header class="simo-r107-head">
          <div>
            <div class="simo-r107-kicker">SIMO SAVED DESIGN</div>
            <h2>${esc(title)}</h2>
          </div>
          <button class="simo-r107-close" type="button" data-r107-close>×</button>
        </header>
        <div class="simo-r107-body">
          <div class="simo-r107-image-wrap"><img src="${esc(image)}" alt="${esc(title)}"></div>
          <aside class="simo-r107-side">
            <div class="simo-r107-note">Opened from Library as a live saved design view. These controls continue the same saved concept through Simo instead of opening a dead blob/raw image.</div>
            <div class="simo-r107-actions">
              <button type="button" class="simo-r107-primary" data-r107-workspace-modal="true">3D / Rotate Workspace</button>
              <button type="button" class="simo-r107-primary" data-open-workspace-tab="true">Open Workspace in New Tab</button>
              ${["Material", "Size / Proportions", "Handle Design", "Hardware", "Comfort", "Color / Pattern", "Functional Details", "Brand Tag", "Packaging", "Generate Variations", "Premium finish"].map(label => `<button type="button" data-r107-edit="${esc(label)}">${esc(label)}</button>`).join("")}
              <a class="simo-r107-plain" href="${esc(image)}" target="_blank" rel="noopener">Open source image only</a>
            </div>
          </aside>
        </div>
      </section>
    `;
    if (!$("simoR107Styles")) {
      const style = document.createElement("style");
      style.id = "simoR107Styles";
      style.textContent = `
        .simo-r107-live-modal{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:22px;color:#eef4ff;}
        .simo-r107-backdrop{position:absolute;inset:0;background:rgba(2,6,18,.76);backdrop-filter:blur(12px);}
        .simo-r107-panel{position:relative;width:min(1120px,96vw);max-height:92vh;overflow:hidden;border:1px solid rgba(255,255,255,.15);border-radius:24px;background:linear-gradient(135deg,rgba(21,32,49,.98),rgba(8,14,25,.98));box-shadow:0 26px 90px rgba(0,0,0,.55);display:grid;grid-template-rows:auto 1fr;}
        .simo-r107-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.11);}
        .simo-r107-kicker{font-size:11px;font-weight:900;letter-spacing:.15em;color:#9fc5ff;margin-bottom:7px;}
        .simo-r107-head h2{font-size:22px;margin:0;line-height:1.15;}
        .simo-r107-close{width:42px;height:42px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:white;font-size:24px;cursor:pointer;}
        .simo-r107-body{min-height:0;overflow:auto;display:grid;grid-template-columns:minmax(0,1fr) 320px;}
        .simo-r107-image-wrap{display:grid;place-items:center;padding:26px;background:#020711;}
        .simo-r107-image-wrap img{max-width:100%;max-height:72vh;border-radius:18px;object-fit:contain;box-shadow:0 18px 50px rgba(0,0,0,.42);}
        .simo-r107-side{padding:20px;border-left:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.035);display:grid;align-content:start;gap:14px;}
        .simo-r107-note{font-size:13px;line-height:1.45;color:#c8d6f0;}
        .simo-r107-actions{display:flex;flex-wrap:wrap;gap:10px;}
        .simo-r107-actions button,.simo-r107-plain{border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:white;border-radius:999px;padding:10px 13px;font-weight:850;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;}
        .simo-r107-actions button:hover,.simo-r107-plain:hover{background:rgba(110,168,255,.18);border-color:rgba(110,168,255,.45);}
        .simo-r107-actions .simo-r107-primary{background:linear-gradient(135deg,rgba(37,78,142,.92),rgba(48,95,197,.72));border-color:rgba(110,168,255,.52);}
        @media(max-width:820px){.simo-r107-body{grid-template-columns:1fr}.simo-r107-side{border-left:0;border-top:1px solid rgba(255,255,255,.11)}}
      `;
      document.head.appendChild(style);
    }
    document.body.appendChild(wrap);
    wrap.querySelectorAll("[data-r107-close]").forEach(btn => btn.addEventListener("click", closeR107Modal));
    wrap.querySelectorAll("[data-r107-edit]").forEach(btn => btn.addEventListener("click", function () {
      const label = btn.getAttribute("data-r107-edit") || btn.textContent || "continue editing";
      state.nonSaveDesignActionUntil = Date.now() + 25000;
      state.explicitSaveUntil = 0;
      state.lastNonSaveLabel = String(label || "saved design edit");
      closeR107Modal();
      loadPromptAndSend(conciseEditPrompt(title, label), label);
    }));
    wrap.querySelectorAll("[data-r107-workspace-modal]").forEach(btn => btn.addEventListener("click", function (ev) {
      try { ev.preventDefault(); ev.stopPropagation(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation(); } catch {}
      const workspaceInfo = { title: title, image: image, domain: categoryFromText(title, title), prompt: title };
      closeR107Modal();
      setTimeout(function(){
        document.querySelectorAll(".simo-r107-live-modal,[data-simo-r107-live-modal]").forEach(el => { try { el.remove(); } catch {} });
        openR1011CWorkspaceModal(workspaceInfo);
      }, 80);
    }, true));
    wrap.querySelectorAll("[data-open-workspace-tab]").forEach(btn => btn.addEventListener("click", function (ev) {
      try { ev.preventDefault(); ev.stopPropagation(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation(); } catch {}
      openLiveWorkspaceTab({
        phase: (window.__SIMO_R1011_PHASE__ || "PHASE 14M-R10.11C"),
        title: title,
        originalPrompt: title,
        currentPrompt: title,
        currentImage: image,
        sourceImageUrl: image,
        domain: categoryFromText(title, title),
        savedAt: new Date().toISOString()
      });
    }, true));
    setStatus("Reopened saved visual as a live Simo design view.");
  }

  function handleLibraryCardAction(event, btn) {
    const card = btn && btn.closest && btn.closest(".simo-r9-card, [data-r9-index], .simo-library-card, [data-library-card], [data-simo-library-card]");
    if (!card) return false;
    const action = btn.getAttribute("data-r9-action") || "";
    const label = labelForButton(btn);
    const isOpenAnchor = btn.tagName === "A" && /\bopen\b/.test(label);
    const isPreview = action === "preview" || /\bpreview\b/.test(label);
    const isContinue = action === "continue" || /^continue$/.test(label);
    const isDelete = action === "delete" || /^delete$/.test(label);

    if (isDelete) {
      // Record stronger tombstones and clean local copies, but do NOT block the existing delete handler.
      // The core Library may need its own click handler to delete server-backed items.
      rememberDomCardTombstones(card);
      removeDomCardFromAllLibraryStores(card);
      setTimeout(function () { try { card.remove(); } catch {} }, 120);
      pruneLibraryStorageSoon();
      setStatus("Delete guarded — allowing Simo's normal Library delete to finish too.");
      return false;
    }

    if (isOpenAnchor || isPreview) {
      const href = btn.getAttribute("href") || "";
      const image = href || domCardImage(card);
      if (image) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        openSavedDesignLive(card, image);
        return true;
      }
    }

    if (isContinue) {
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      openSavedDesignLive(card, domCardImage(card));
      return true;
    }

    return false;
  }

  function onPointerDownCapture(event) {
    const target = event.target;
    if (!target || !target.closest) return;
    const btn = target.closest("button, [role='button'], a");
    if (!btn) return;
    if (isSaveButton(btn)) {
      state.saveClickArmedUntil = Date.now() + 9000;
      state.authoritativeSaveBlockUntil = 0;
    }
    if (isDesignActionButton(btn)) {
      state.nonSaveDesignActionUntil = Date.now() + 25000;
      state.lastNonSaveLabel = labelForButton(btn) || "design action";
    }
  }

  function onClickCapture(event) {
    const target = event.target;
    if (!target || !target.closest) return;
    const btn = target.closest("button, [role='button'], a");
    if (!btn) return;

    if (handleLibraryCardAction(event, btn)) return;

    if (isDeleteButton(btn)) {
      captureDeleteTombstone(btn);
      return;
    }

    if (isSaveButton(btn)) {
      // R10.10: do not steal the Save click. Let Simo’s existing server-backed
      // save handler run, while this guard blocks only local duplicate appends
      // and duplicate server requests. This fixes “Saved” showing with no card.
      const now = Date.now();
      state.explicitSaveUntil = now + 9000;
      state.saveClickArmedUntil = now + 9000;
      state.authoritativeSaveBlockUntil = 0;
      setStatus("Saving once through the normal Library path…");
      return;
    }

    if (isDesignActionButton(btn)) {
      state.nonSaveDesignActionUntil = Date.now() + 10000;
      state.lastNonSaveLabel = labelForButton(btn) || "design action";
    }
  }

  function detectOldBridgePrompt() {
    const input = $("chatInput") || document.querySelector("textarea, input[type='text']");
    const text = String(input && input.value || "").trim();
    if (!text) return;
    const looksOldBridge = clean(text).includes("continue this same active visual/design project") && clean(text).includes("button clicked");
    if (looksOldBridge) {
      setStatus("R10.10 loaded — normal server save is restored, local duplicate appends are blocked, and precise delete is guarded.");
    }
  }

  function init() {
    injectStyles();
    markCards();
    patchLocalStorageSetItem();
    patchFetch();
    detectOldBridgePrompt();
    pruneLibraryStorageSoon();
    hideTombstonedDomCards();

    document.addEventListener("pointerdown", onPointerDownCapture, true);
    document.addEventListener("mousedown", onPointerDownCapture, true);
    document.addEventListener("touchstart", onPointerDownCapture, true);
    document.addEventListener("click", onClickCapture, true);

    const obs = new MutationObserver(function () {
      markCards();
      hideTombstonedDomCards();
    });
    try { obs.observe(document.body, { childList: true, subtree: true }); } catch {}

    setStatus("R10.10 loaded — server-owned save, local duplicate block, no autosave, and live Open/Preview are guarded.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

// PHASE 14M-R10.11H-ROLLBACK — workspace/new-tab experiments removed.
// Stable meaningful design controls remain above this line.

