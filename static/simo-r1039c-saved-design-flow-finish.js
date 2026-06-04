/*
  SIMO PHASE 14M-R10.39D — Saved Design Bridge Repair
  File: static/simo-r1039c-saved-design-flow-finish.js

  Purpose:
  - Stop the Library loop.
  - Make saved visual/image/workspace cards open the exact card image in the isolated workspace.
  - Do not touch backend data, auth, Stripe, app.py, script.js, phase31, or Library layout.
  - Leave Rename / Tags / Notes / Pin / Archive / Delete alone.
  - Keep existing Library UI, but repair Open / Preview / Continue / Workspace on visual cards.

  Required load order in index.html:
  <script src="/static/simo-live-workspace-isolated.js?v=phase14m-r1038"></script>
  <script src="/static/simo-r1039c-saved-design-flow-finish.js?v=1039d"></script>
*/

(function () {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__SIMO_R1039D_SAVED_DESIGN_BRIDGE__) return;
  window.__SIMO_R1039D_SAVED_DESIGN_BRIDGE__ = true;

  var PHASE = "PHASE 14M-R10.39D — Saved Design Bridge Repair";
  var scanTimer = null;
  var lastOpenAt = 0;

  function txt(el) {
    return String((el && (el.innerText || el.textContent || el.value || el.getAttribute && el.getAttribute("aria-label") || el.title)) || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function low(v) {
    return String(v || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function hasAny(text, words) {
    text = low(text);
    for (var i = 0; i < words.length; i += 1) {
      if (text.indexOf(words[i]) !== -1) return true;
    }
    return false;
  }

  function abs(src) {
    src = String(src || "").trim();
    if (!src) return "";
    if (src.indexOf("data:image/") === 0 || src.indexOf("blob:") === 0) return src;
    if (/^https?:\/\//i.test(src)) return src;
    try { return new URL(src, window.location.origin).href; } catch (e) { return src; }
  }

  function isUsefulImage(src) {
    src = abs(src);
    return !!(
      src &&
      (
        src.indexOf("data:image/") === 0 ||
        src.indexOf("blob:") === 0 ||
        src.indexOf("/generated-images/") >= 0 ||
        src.indexOf("/generated_images/") >= 0 ||
        /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(src)
      )
    );
  }

  function buttonFromTarget(target) {
    if (!target || !target.closest) return null;
    return target.closest("button, a, input[type='button'], input[type='submit'], [role='button']");
  }

  function buttonLabel(btn) {
    if (!btn) return "";
    return low(btn.value || btn.textContent || btn.getAttribute("aria-label") || btn.title || "");
  }

  function isLibraryActionButton(btn) {
    var b = buttonLabel(btn);
    return (
      b === "open" ||
      b === "preview" ||
      b === "continue" ||
      b === "workspace" ||
      b.indexOf("open workspace") >= 0 ||
      b.indexOf("edit workspace") >= 0
    );
  }

  function isProtectedLibraryButton(btn) {
    var b = buttonLabel(btn);
    return hasAny(b, [
      "rename",
      "tag",
      "tags",
      "notes",
      "note",
      "pin",
      "archive",
      "unarchive",
      "delete",
      "remove",
      "export",
      "import",
      "refresh"
    ]);
  }

  function closestCard(el) {
    if (!el || !el.closest) return null;
    return el.closest(
      "[data-simo-workspace-saved-id], [data-simo-library-card], [data-library-card], " +
      ".builder-library-card, .simo-library-card, .library-card, .build-card, .builder-card, article, .card"
    );
  }

  function bestImage(card) {
    if (!card || !card.querySelectorAll) return null;
    var imgs = Array.prototype.slice.call(card.querySelectorAll("img"));
    var best = null;
    var bestScore = 0;

    imgs.forEach(function (img) {
      var src = abs(img.getAttribute("src") || img.src || "");
      if (!isUsefulImage(src)) return;

      var rect = { width: 0, height: 0 };
      try { rect = img.getBoundingClientRect(); } catch (e) {}

      var area = Math.max(0, rect.width || 0) * Math.max(0, rect.height || 0);
      var natural = Math.max(0, img.naturalWidth || 0) * Math.max(0, img.naturalHeight || 0);
      var score = area || natural || 1;

      if (src.indexOf("/generated-images/") >= 0 || src.indexOf("/generated_images/") >= 0) score += 1000000;
      if (src.indexOf("data:image/") === 0) score += 900000;
      if (src.indexOf("blob:") === 0) score += 800000;

      if (score > bestScore) {
        best = img;
        bestScore = score;
      }
    });

    return best;
  }

  function titleFromCard(card) {
    if (!card || !card.querySelector) return "Simo Saved Design";
    var selectors = [
      "h1", "h2", "h3", "h4",
      ".title", ".card-title", ".build-title", ".library-title",
      "[class*='title']",
      "strong", "b"
    ];

    for (var i = 0; i < selectors.length; i += 1) {
      var node = null;
      try { node = card.querySelector(selectors[i]); } catch (e) {}
      var value = txt(node);
      if (value && value.length > 2 && value.length < 160) {
        return cleanTitle(value);
      }
    }

    var lines = String(card.innerText || card.textContent || "")
      .split("\n")
      .map(function (s) { return s.trim(); })
      .filter(Boolean);

    for (var j = 0; j < lines.length; j += 1) {
      var line = lines[j];
      if (!line) continue;
      if (hasAny(line, ["open", "preview", "continue", "rename", "tags", "notes", "archive", "delete"])) continue;
      if (line.length > 2 && line.length < 160) return cleanTitle(line);
    }

    return "Simo Saved Design";
  }

  function cleanTitle(value) {
    value = String(value || "").replace(/\s+/g, " ").trim();
    value = value.replace(/^recent saved design\s*/i, "");
    value = value.replace(/^saved workspace\s*[—-]\s*saved workspace\s*[—-]\s*/i, "Saved Workspace — ");
    value = value.replace(/^continue editing this exact active workspace:\s*/i, "Edit Workspace: ");
    value = value.replace(/^edit only this exact saved product\s*/i, "Edit Saved Product: ");
    return value || "Simo Saved Design";
  }

  function cardLooksVisual(card) {
    if (!card) return false;

    var img = bestImage(card);
    if (!img) return false;

    var t = low(card.innerText || card.textContent || "");
    var src = abs(img.getAttribute("src") || img.src || "");

    // Visual/product/workspace cards.
    if (hasAny(t, [
      "saved workspace",
      "image-first",
      "product concept",
      "edited version",
      "workspace",
      "water bottle",
      "toaster",
      "generated visual",
      "saved from the isolated",
      "saved from simo real image-first visual card"
    ])) return true;

    // Generated image cards without HTML builder content.
    if ((src.indexOf("/generated-images/") >= 0 || src.indexOf("/generated_images/") >= 0 || src.indexOf("data:image/") === 0) &&
        !hasAny(t, ["<!doctype html", "<html", "landing page", "website build", "simo build"])) {
      return true;
    }

    return false;
  }

  function sourceFriendly(src) {
    src = abs(src);
    if (!src) return "";
    if (src.indexOf("data:image/") === 0 || src.indexOf("blob:") === 0) return "";
    return src;
  }

  function dataFromCard(card) {
    var img = bestImage(card);
    var src = img ? abs(img.getAttribute("src") || img.src || "") : "";
    var title = titleFromCard(card);

    return {
      id: "simo_saved_bridge_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
      phase: PHASE,
      title: title,
      name: title,
      projectTitle: title,
      workspaceSubject: title,
      image: src,
      currentImage: src,
      displayImageUrl: src,
      previewUrl: src,
      thumbnail: src,
      originalImage: src,
      sourceImage: sourceFriendly(src),
      currentSourceImage: sourceFriendly(src),
      edits: ["Reopened exact saved Library card"],
      createdAt: new Date().toISOString(),
      source: "simo_r1039d_saved_design_bridge"
    };
  }

  function stop(evt) {
    try { evt.preventDefault(); } catch (e) {}
    try { evt.stopPropagation(); } catch (e) {}
    try { if (evt.stopImmediatePropagation) evt.stopImmediatePropagation(); } catch (e) {}
  }

  function setStatus(message) {
    var el = document.getElementById("loadingHint") ||
      document.getElementById("statusText") ||
      document.querySelector(".status, .footer-status, .loading-hint, [data-simo-status]");
    if (el) el.textContent = message || "Ready.";
  }

  function openWorkspace(data) {
    if (window.SimoWorkspaceBridge && typeof window.SimoWorkspaceBridge.openTab === "function") {
      window.SimoWorkspaceBridge.openTab(data);
      return true;
    }
    if (window.SimoLiveWorkspaceIsolated && typeof window.SimoLiveWorkspaceIsolated.openTab === "function") {
      window.SimoLiveWorkspaceIsolated.openTab(data);
      return true;
    }
    return false;
  }

  function handleLibraryAction(evt) {
    var btn = buttonFromTarget(evt.target);
    if (!btn) return;
    if (isProtectedLibraryButton(btn)) return;
    if (!isLibraryActionButton(btn)) return;

    var card = closestCard(btn);
    if (!card || !cardLooksVisual(card)) return;

    // Prevent double-open from pointer + click.
    var now = Date.now();
    if (now - lastOpenAt < 500) {
      stop(evt);
      return;
    }
    lastOpenAt = now;

    stop(evt);

    var data = dataFromCard(card);
    if (!data.image) {
      setStatus("Could not find the saved design image on this Library card.");
      try { alert("Simo could not find the saved image on this Library card."); } catch (e) {}
      return;
    }

    setStatus("Opening exact saved design in workspace…");

    if (!openWorkspace(data)) {
      setStatus("Workspace bridge is not loaded. Check script order: workspace file must load before saved-design-flow.");
      try {
        alert("Workspace bridge is not loaded yet. In index.html, load simo-live-workspace-isolated.js before simo-r1039c-saved-design-flow-finish.js.");
      } catch (e2) {}
    }
  }

  function relabelCard(card) {
    if (!card || card.getAttribute("data-simo-r1039d-normalized") === "yes") return;
    if (!cardLooksVisual(card)) return;

    card.setAttribute("data-simo-r1039d-normalized", "yes");
    card.setAttribute("data-simo-saved-design-card", "true");

    var buttons = Array.prototype.slice.call(card.querySelectorAll("button, a, input[type='button'], input[type='submit'], [role='button']"));
    buttons.forEach(function (btn) {
      var label = buttonLabel(btn);

      if (label === "preview") {
        if (btn.tagName && btn.tagName.toLowerCase() === "input") btn.value = "Workspace";
        else btn.textContent = "Workspace";
        btn.title = "Open this exact saved design in the workspace";
        btn.setAttribute("data-simo-r1039d-workspace-action", "true");
      }

      if (label === "continue") {
        btn.title = "Continue this exact saved design in the workspace";
        btn.setAttribute("data-simo-r1039d-workspace-action", "true");
        // Do not hide it. In this repair build, Continue works instead of becoming a dead/hidden button.
      }

      if (label === "open") {
        btn.title = "Open this exact saved design in the workspace";
        btn.setAttribute("data-simo-r1039d-workspace-action", "true");
      }
    });
  }

  function scan() {
    var cards = Array.prototype.slice.call(document.querySelectorAll(
      "[data-simo-workspace-saved-id], [data-simo-library-card], [data-library-card], " +
      ".builder-library-card, .simo-library-card, .library-card, .build-card, .builder-card, article, .card"
    ));

    cards.forEach(relabelCard);
  }

  function scheduleScan() {
    if (scanTimer) window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(function () {
      scanTimer = null;
      scan();
    }, 150);
  }

  function boot() {
    // Capture early so the old Library handlers do not steal Open/Preview/Continue first.
    ["pointerdown", "mousedown", "touchstart", "click"].forEach(function (ev) {
      document.addEventListener(ev, handleLibraryAction, true);
      window.addEventListener(ev, handleLibraryAction, true);
    });

    if (typeof MutationObserver !== "undefined") {
      var mo = new MutationObserver(scheduleScan);
      mo.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class", "src", "data-simo-library-card", "data-library-card"]
      });
    } else {
      window.setInterval(scan, 1500);
    }

    scan();
    window.setTimeout(scan, 400);
    window.setTimeout(scan, 1200);

    window.SIMO_R1039D_SAVED_DESIGN_BRIDGE = {
      phase: PHASE,
      scan: scan,
      openCard: function (card) {
        if (!cardLooksVisual(card)) return false;
        return openWorkspace(dataFromCard(card));
      }
    };

    try { console.log("[SIMO] " + PHASE + " loaded."); } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}());
