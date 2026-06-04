/*
  SIMO PHASE 14M-R10.47 — LIVE FRONTEND LIBRARY BUTTON + SAVE/OPEN BRIDGE
  File: static/simo-library-rescue.js

  Frontend-only scope:
  - Open Library rescue
  - Workspace Save to Library proof-before-success
  - Saved card display
  - Saved card reopens the exact saved design/workspace image
  - No localhost / 127.0.0.1 fallback
  - No image generation / credit usage
*/
(function () {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__SIMO_PHASE14M_R1047_LIVE_LIBRARY_BUTTON_BRIDGE__) return;
  window.__SIMO_PHASE14M_R1047_LIVE_LIBRARY_BUTTON_BRIDGE__ = true;
  window.__SIMO_LIBRARY_RESCUE_R1046__ = true;
  window.__SIMO_LIBRARY_RESCUE_R1047__ = true;
  window.__SIMO_OPEN_WORKSPACE_CARD_BRIDGE_R1046__ = true;
  window.__SIMO_OPEN_WORKSPACE_CARD_BRIDGE_R1047__ = true;

  var PHASE = "PHASE 14M-R10.47 Live Library Button + Proof Save Bridge";
  var LIB_KEYS = [
    "simo_builder_library_v5_1_builder_first",
    "simo_builder_library_v5",
    "simo_visual_concepts_library_v1",
    "simo_builder_library_v4",
    "simo_builder_library",
    "simo_library_items"
  ];
  var LAST_KEY = "simo_workspace_last_saved_item_v2";
  var FORCE_KEY = "simo_workspace_force_library_item_v1";
  var MODAL_ID = "simoLiveLibraryFixModal";

  function $(id) { return document.getElementById(id); }
  function nowIso() { return new Date().toISOString(); }
  function uid(prefix) {
    return (prefix || "simo_saved") + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  }
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  function clean(v) { return String(v || "").replace(/\s+/g, " ").trim(); }
  function low(v) { return clean(v).toLowerCase(); }
  function parseJson(raw, fallback) {
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  function fixUrl(src) {
    src = String(src || "").trim();
    if (!src) return "";
    if (src.indexOf("data:image/") === 0 || src.indexOf("blob:") === 0) return src;
    // Hard block stale local dev paths on live. They cannot be readable to users.
    src = src.replace(/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?/i, window.location.origin);
    if (/^https?:\/\//i.test(src)) return src;
    try { return new URL(src, window.location.origin).href; } catch (e) { return src; }
  }

  function isUsefulImage(src) {
    src = fixUrl(src);
    return !!(
      src &&
      src.indexOf("127.0.0.1") < 0 &&
      src.indexOf("localhost") < 0 &&
      (
        src.indexOf("data:image/") === 0 ||
        src.indexOf("blob:") === 0 ||
        src.indexOf("/generated-images/") >= 0 ||
        src.indexOf("/generated_images/") >= 0 ||
        /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(src)
      )
    );
  }

  function readStore(key) {
    var parsed = parseJson(localStorage.getItem(key) || "[]", []);
    if (Array.isArray(parsed)) return { mode: "array", obj: parsed, arr: parsed };
    if (parsed && Array.isArray(parsed.items)) return { mode: "items", obj: parsed, arr: parsed.items };
    if (parsed && Array.isArray(parsed.builds)) return { mode: "builds", obj: parsed, arr: parsed.builds };
    if (parsed && Array.isArray(parsed.library)) return { mode: "library", obj: parsed, arr: parsed.library };
    return { mode: "array", obj: [], arr: [] };
  }

  function writeStore(key, store, arr) {
    try {
      if (store.mode === "array") {
        localStorage.setItem(key, JSON.stringify(arr));
        return true;
      }
      var obj = store.obj && typeof store.obj === "object" ? store.obj : {};
      obj[store.mode] = arr;
      localStorage.setItem(key, JSON.stringify(obj));
      return true;
    } catch (e) {
      return false;
    }
  }

  function allItems() {
    var out = [];
    var seen = {};
    LIB_KEYS.forEach(function (key) {
      try {
        var store = readStore(key);
        (store.arr || []).forEach(function (item) {
          if (!item || typeof item !== "object") return;
          var id = String(item.id || item._id || item.title || item.name || Math.random());
          var image = fixUrl(bestItemImage(item));
          var sig = id + "|" + image;
          if (seen[sig]) return;
          seen[sig] = true;
          out.push(normalizeItem(item));
        });
      } catch (e) {}
    });
    out.sort(function (a, b) {
      return Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0);
    });
    return out;
  }

  function bestItemImage(item) {
    item = item || {};
    var candidates = [
      item.imageUrl,
      item.image_url,
      item.generated_visual_url,
      item.generatedImageUrl,
      item.previewUrl,
      item.thumbnail,
      item.visualUrl,
      item.displayImageUrl,
      item.currentImage,
      item.image,
      item.sourceImageUrl,
      item.originalImageUrl
    ];
    if (item.workspaceData) {
      candidates.unshift(
        item.workspaceData.currentImage,
        item.workspaceData.image,
        item.workspaceData.displayImageUrl,
        item.workspaceData.sourceImage,
        item.workspaceData.originalImage
      );
    }
    for (var i = 0; i < candidates.length; i += 1) {
      var src = fixUrl(candidates[i]);
      if (isUsefulImage(src)) return src;
    }
    return "";
  }

  function titleFromItem(item) {
    return clean(item && (item.title || item.name || item.projectTitle || item.workspaceSubject || item.prompt)) || "Simo Saved Design";
  }

  function normalizeItem(item) {
    item = item && typeof item === "object" ? item : {};
    var img = fixUrl(bestItemImage(item));
    var id = String(item.id || uid("simo_saved"));
    var title = titleFromItem(item);
    var original = fixUrl(item.originalImageUrl || item.originalImage || (item.workspaceData && item.workspaceData.originalImage) || img);
    var source = fixUrl(item.sourceImageUrl || item.sourceImage || (item.workspaceData && item.workspaceData.sourceImage) || img);
    var edits = Array.isArray(item.workspaceEdits) ? item.workspaceEdits.slice() :
      (item.workspaceData && Array.isArray(item.workspaceData.edits) ? item.workspaceData.edits.slice() : []);
    var normalized = Object.assign({}, item, {
      id: id,
      title: title,
      name: title,
      projectTitle: item.projectTitle || title,
      type: item.type || "visual",
      kind: item.kind || "visual",
      source: item.source || "simo_phase14m_live_library_fix",
      tags: Array.isArray(item.tags) ? item.tags : ["visual", "design", "workspace"],
      notes: item.notes || "Saved from Simo workspace after frontend proof check.",
      imageUrl: img,
      image_url: img,
      generated_visual_url: img,
      generatedImageUrl: img,
      previewUrl: img,
      thumbnail: img,
      visualUrl: img,
      displayImageUrl: img,
      currentImage: img,
      image: img,
      sourceImageUrl: source,
      originalImageUrl: original,
      workspaceOpen: true,
      workspaceSubject: item.workspaceSubject || title,
      workspaceEdits: edits,
      simoWorkspaceVersion: "phase14m-live-library-fix",
      updatedAt: item.updatedAt || nowIso(),
      createdAt: item.createdAt || nowIso()
    });
    normalized.workspaceData = Object.assign({}, item.workspaceData || {}, {
      id: id,
      title: title,
      projectTitle: normalized.projectTitle,
      workspaceSubject: normalized.workspaceSubject,
      image: img,
      currentImage: img,
      displayImageUrl: img,
      sourceImage: source,
      currentSourceImage: source,
      originalImage: original,
      edits: edits
    });
    if (!normalized.html) normalized.html = visualHtml(normalized);
    return normalized;
  }

  function visualHtml(item) {
    var img = fixUrl(bestItemImage(item));
    var title = titleFromItem(item);
    return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title></head><body style="margin:0;background:#0b1020;color:#fff;font-family:Arial,sans-serif;"><main style="max-width:960px;margin:0 auto;padding:24px;"><h1>' + esc(title) + '</h1><img src="' + esc(img) + '" alt="' + esc(title) + '" style="max-width:100%;border-radius:18px;display:block;box-shadow:0 24px 80px rgba(0,0,0,.45);"><p>Saved Simo workspace design.</p></main></body></html>';
  }

  function writeItemEverywhere(item) {
    var normalized = normalizeItem(item);
    var wrote = false;
    LIB_KEYS.forEach(function (key) {
      try {
        var store = readStore(key);
        var arr = (store.arr || []).filter(function (existing) {
          return String(existing && existing.id || "") !== normalized.id;
        });
        arr.unshift(normalized);
        if (arr.length > 160) arr.length = 160;
        if (writeStore(key, store, arr)) wrote = true;
      } catch (e) {}
    });
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify(normalized));
      localStorage.setItem(FORCE_KEY, JSON.stringify(normalized));
    } catch (e) {}
    return wrote ? normalized : null;
  }

  function findById(id) {
    id = String(id || "");
    if (!id) return null;
    var items = allItems();
    for (var i = 0; i < items.length; i += 1) {
      if (String(items[i].id || "") === id) return normalizeItem(items[i]);
    }
    return null;
  }

  function verifyReadable(item) {
    item = normalizeItem(item);
    var found = findById(item.id);
    if (!found) return { ok: false, error: "Saved item was not found after write." };
    if (!isUsefulImage(bestItemImage(found))) return { ok: false, error: "Saved item has no readable image." };
    return { ok: true, item: found };
  }

  function compressIfPossible(src) {
    src = fixUrl(src);
    if (!src || src.indexOf("data:image/") !== 0) return Promise.resolve(src);
    return new Promise(function (resolve) {
      try {
        var img = new Image();
        img.onload = function () {
          try {
            var maxSide = 900;
            var w = img.naturalWidth || img.width || 900;
            var h = img.naturalHeight || img.height || 900;
            var scale = Math.min(1, maxSide / Math.max(w, h));
            var canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(w * scale));
            canvas.height = Math.max(1, Math.round(h * scale));
            var ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            var out = canvas.toDataURL("image/jpeg", 0.78);
            resolve(out && out.indexOf("data:image/") === 0 ? out : src);
          } catch (e) { resolve(src); }
        };
        img.onerror = function () { resolve(src); };
        img.src = src;
      } catch (e) { resolve(src); }
    });
  }

  function itemFromWorkspaceData(data) {
    data = data || {};
    var img = fixUrl(data.currentImage || data.image || data.displayImageUrl || data.previewUrl || data.sourceImage || data.originalImage || "");
    var title = clean(data.workspaceSubject || data.projectTitle || data.title || data.name) || "Simo Workspace Design";
    var edits = Array.isArray(data.edits) ? data.edits.slice() : [];
    var now = nowIso();
    return normalizeItem({
      id: data.id && String(data.id).indexOf("simo_workspace_") === 0 ? String(data.id) : uid("simo_workspace_saved"),
      title: title,
      projectTitle: title,
      prompt: data.prompt || data.latestPrompt || title,
      latestPrompt: edits.length ? String(edits[edits.length - 1]) : (data.latestPrompt || title),
      type: "visual",
      kind: "visual",
      source: "simo_phase14m_live_workspace_verified_save",
      tags: ["visual", "design", "workspace", "saved-workspace"],
      notes: "Saved only after Simo verified this item was readable in Library storage.",
      imageUrl: img,
      originalImageUrl: fixUrl(data.originalImage || img),
      sourceImageUrl: fixUrl(data.currentSourceImage || data.sourceImage || img),
      workspaceSubject: title,
      workspaceEdits: edits,
      createdAt: now,
      updatedAt: now
    });
  }

  function saveWorkspace(data) {
    var base = itemFromWorkspaceData(data || {});
    var img = bestItemImage(base);
    if (!isUsefulImage(img)) {
      return Promise.resolve({ ok: false, error: "No readable workspace image found. Nothing was saved." });
    }
    return compressIfPossible(img).then(function (safeImg) {
      base.imageUrl = safeImg || img;
      base = normalizeItem(base);
      var written = writeItemEverywhere(base);
      if (!written) return { ok: false, error: "Library write failed." };
      var proof = verifyReadable(written);
      if (!proof.ok) return proof;
      fireUpdated(proof.item);
      return { ok: true, item: proof.item, id: proof.item.id };
    });
  }

  function fireUpdated(item) {
    try { window.dispatchEvent(new CustomEvent("simo:library-updated", { detail: { phase: PHASE, item: item } })); } catch (e) {}
    try { document.dispatchEvent(new CustomEvent("simo:library-updated", { detail: { phase: PHASE, item: item } })); } catch (e) {}
    updateCount();
    if ($(MODAL_ID)) renderModal();
  }

  function updateCount() {
    var el = $("libraryCountValue");
    if (el) el.textContent = String(allItems().length);
  }

  function status(message) {
    var el = $("loadingHint") || $("statusText") || document.querySelector("[data-simo-status], .status, .loading-hint");
    if (el) el.textContent = message;
  }

  function openItemWorkspace(item) {
    item = normalizeItem(item);
    var data = Object.assign({}, item.workspaceData || {}, {
      id: uid("workspace_reopen"),
      title: titleFromItem(item),
      projectTitle: item.projectTitle || titleFromItem(item),
      workspaceSubject: item.workspaceSubject || titleFromItem(item),
      image: bestItemImage(item),
      currentImage: bestItemImage(item),
      displayImageUrl: bestItemImage(item),
      sourceImage: item.sourceImageUrl || bestItemImage(item),
      currentSourceImage: item.sourceImageUrl || bestItemImage(item),
      originalImage: item.originalImageUrl || bestItemImage(item),
      edits: Array.isArray(item.workspaceEdits) ? item.workspaceEdits : []
    });
    if (window.SimoWorkspaceBridge && typeof window.SimoWorkspaceBridge.openTab === "function") {
      window.SimoWorkspaceBridge.openTab(data);
      return true;
    }
    if (window.SimoLiveWorkspace && typeof window.SimoLiveWorkspace.open === "function") {
      window.SimoLiveWorkspace.open(data);
      return true;
    }
    // Safe fallback: view-only card, no localhost, no generation.
    var html = visualHtml(Object.assign({}, item, { workspaceData: data }));
    var blob = new Blob([html], { type: "text/html" });
    var url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener=false");
    return true;
  }

  function modalHtml(items) {
    var cards = items.map(function (item) {
      item = normalizeItem(item);
      var img = bestItemImage(item);
      var title = titleFromItem(item);
      return '<article class="simo-live-library-card" data-simo-live-library-id="' + esc(item.id) + '" style="background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.11);border-radius:18px;padding:14px;display:grid;gap:10px;">' +
        '<img src="' + esc(img) + '" alt="' + esc(title) + '" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:14px;background:#050914;">' +
        '<div style="font-weight:800;color:#fff;line-height:1.25;">' + esc(title) + '</div>' +
        '<div style="font-size:12px;color:#b9c6e8;">' + esc(item.updatedAt || item.createdAt || '') + '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button type="button" data-simo-live-open="' + esc(item.id) + '" style="border:0;border-radius:999px;padding:9px 12px;font-weight:800;cursor:pointer;background:#6ea8ff;color:#061225;">Open Workspace</button>' +
          '<button type="button" data-simo-live-preview="' + esc(item.id) + '" style="border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:9px 12px;font-weight:700;cursor:pointer;background:rgba(255,255,255,.08);color:#fff;">Preview</button>' +
        '</div>' +
      '</article>';
    }).join("");
    if (!cards) cards = '<div style="padding:18px;border-radius:18px;background:rgba(255,255,255,.055);color:#dbe6ff;">No saved designs found yet.</div>';
    return '<div id="' + MODAL_ID + '" style="position:fixed;inset:0;z-index:2147482600;background:rgba(2,6,18,.82);backdrop-filter:blur(12px);display:flex;align-items:flex-start;justify-content:center;padding:28px;overflow:auto;">' +
      '<section style="width:min(1120px,96vw);border:1px solid rgba(255,255,255,.14);border-radius:24px;background:#10172a;box-shadow:0 28px 90px rgba(0,0,0,.55);padding:18px;">' +
        '<header style="display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:14px;">' +
          '<div><div style="font-size:21px;font-weight:900;color:#fff;">Builder Library</div><div style="font-size:13px;color:#aebce4;margin-top:4px;">Verified local saved designs. Opening a card uses that exact saved image.</div></div>' +
          '<button type="button" data-simo-live-close style="border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:10px 14px;background:rgba(255,255,255,.08);color:#fff;font-weight:800;cursor:pointer;">Close</button>' +
        '</header>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;">' + cards + '</div>' +
      '</section>' +
    '</div>';
  }

  function renderModal() {
    var old = $(MODAL_ID);
    if (old) old.remove();
    document.body.insertAdjacentHTML("beforeend", modalHtml(allItems()));
  }

  function openLibrary() {
    renderModal();
    updateCount();
    status("Library opened.");
    return true;
  }

  function closeLibrary() {
    var modal = $(MODAL_ID);
    if (modal) modal.remove();
  }

  function buttonText(btn) {
    return low(btn && (btn.textContent || btn.value || btn.getAttribute("aria-label") || btn.title || ""));
  }

  function closestCard(el) {
    return el && el.closest ? el.closest("[data-simo-live-library-id], [data-simo-workspace-saved-id], [data-simo-library-card], [data-library-card], .builder-library-card, .simo-library-card, .library-card, .build-card, .builder-card, article, .card") : null;
  }

  function bestImageInCard(card) {
    if (!card || !card.querySelectorAll) return "";
    var imgs = Array.prototype.slice.call(card.querySelectorAll("img"));
    for (var i = 0; i < imgs.length; i += 1) {
      var src = fixUrl(imgs[i].getAttribute("src") || imgs[i].src || "");
      if (isUsefulImage(src)) return src;
    }
    return "";
  }

  function itemFromDomCard(card) {
    var id = card && (card.getAttribute("data-simo-live-library-id") || card.getAttribute("data-simo-workspace-saved-id") || card.getAttribute("data-id") || "");
    var found = findById(id);
    if (found) return found;
    var img = bestImageInCard(card);
    var title = clean(card && (card.querySelector("h1,h2,h3,h4,.title,.card-title,strong,b") || {}).textContent) || clean(card && card.textContent).split("Open")[0] || "Simo Saved Design";
    return normalizeItem({ id: id || uid("simo_card"), title: title, imageUrl: img, originalImageUrl: img, sourceImageUrl: img });
  }

  function handleClick(e) {
    var target = e.target;
    if (!target || !target.closest) return;

    // R10.47: stop the old visible sidebar/card Library buttons before they can fire
    // the stale "Library script is not loaded yet" alert. This uses the visible text
    // because the live DOM does not always keep the older IDs/data attributes.
    var libraryHit = target.closest("button, a, .nav-card, .sidebar-card, .side-card, [role='button'], [data-simo-open-library], #openLibraryBtn, #builderLibraryCard");
    var libraryText = buttonText(libraryHit);
    if (libraryHit && (
      libraryText.indexOf("open library") >= 0 ||
      libraryText.indexOf("builder library") >= 0 ||
      libraryText === "library"
    )) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      openLibrary();
      return false;
    }

    if (target.closest("[data-simo-live-close]")) {
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      closeLibrary(); return false;
    }

    var openIdBtn = target.closest("[data-simo-live-open], [data-simo-live-preview]");
    if (openIdBtn) {
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      var id = openIdBtn.getAttribute("data-simo-live-open") || openIdBtn.getAttribute("data-simo-live-preview");
      var item = findById(id);
      if (item) openItemWorkspace(item);
      return false;
    }

    var openLibraryBtn = target.closest("#openLibraryBtn, #builderLibraryCard, [data-simo-open-library]");
    if (openLibraryBtn) {
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      openLibrary(); return false;
    }

    var btn = target.closest("button, a, input[type='button'], input[type='submit'], [role='button']");
    if (!btn) return;
    var label = buttonText(btn);
    if (!(label === "open" || label === "preview" || label === "continue" || label === "workspace" || label.indexOf("open workspace") >= 0)) return;

    var card = closestCard(btn);
    if (!card) return;
    var img = bestImageInCard(card);
    var text = low(card.textContent || "");
    var looksSavedDesign = isUsefulImage(img) && (text.indexOf("workspace") >= 0 || text.indexOf("visual") >= 0 || text.indexOf("design") >= 0 || card.hasAttribute("data-simo-library-card") || card.hasAttribute("data-library-card"));
    if (!looksSavedDesign) return;

    e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    openItemWorkspace(itemFromDomCard(card));
    return false;
  }

  function installWorkspaceBridgeOverride() {
    var old = window.SimoWorkspaceBridge || {};
    window.SimoWorkspaceBridge = Object.assign({}, old, {
      phase: PHASE,
      save: function (data) {
        status("Saving to Library…");
        return saveWorkspace(data).then(function (result) {
          if (result && result.ok) {
            status("Saved and verified in Library.");
            return true;
          }
          status("Save failed verification — not shown as saved.");
          return Promise.reject(new Error((result && result.error) || "Save failed verification."));
        });
      },
      openLibrary: openLibrary,
      openSavedItem: openItemWorkspace
    });
  }

  function installPublicApi() {
    window.SimoLibrary = Object.assign({}, window.SimoLibrary || {}, {
      phase: PHASE,
      open: openLibrary,
      close: closeLibrary,
      saveWorkspace: saveWorkspace,
      getItems: allItems,
      openItem: openItemWorkspace,
      verifyReadable: verifyReadable,
      normalizeItem: normalizeItem
    });
    window.openLibrary = openLibrary;
    window.SimoOpenLibrary = openLibrary;
  }

  function boot() {
    installPublicApi();
    installWorkspaceBridgeOverride();
    document.addEventListener("click", handleClick, true);
    window.addEventListener("click", handleClick, true);
    if (document.documentElement) document.documentElement.addEventListener("click", handleClick, true);
    window.SimoLibraryButtonBridgeR1047 = { openLibrary: openLibrary, handleClick: handleClick, phase: PHASE };
    window.addEventListener("simo:library-updated", updateCount);
    document.addEventListener("simo:library-updated", updateCount);
    updateCount();
    setTimeout(function () { installWorkspaceBridgeOverride(); installPublicApi(); updateCount(); }, 500);
    setTimeout(function () { installWorkspaceBridgeOverride(); installPublicApi(); updateCount(); }, 1500);
    console.log(PHASE + " loaded.");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
