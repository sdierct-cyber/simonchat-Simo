/*
  SIMO PHASE 14M-R10.44E — Main Card Open Workspace Bridge
  File: static/simo-open-workspace-card-bridge.js

  Purpose:
  - Fix fresh generated visual cards that still show "3D / Rotate Workspace".
  - Relabel that button to "Open Workspace".
  - Route the clicked card's current image into the clean prompt-first workspace.
  - Do not touch app.py, auth, Stripe, Library layout, or the workspace image edit route.
*/
(function () {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__SIMO_OPEN_WORKSPACE_CARD_BRIDGE_R1044E__) return;
  window.__SIMO_OPEN_WORKSPACE_CARD_BRIDGE_R1044E__ = true;

  var PHASE = "PHASE 14M-R10.44E — Main Card Open Workspace Bridge";
  var scanTimer = null;
  var lastOpenAt = 0;

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function low(value) {
    return clean(value).toLowerCase();
  }

  function abs(src) {
    src = String(src || "").trim();
    if (!src) return "";
    if (/^(data:image\/|blob:|https?:\/\/)/i.test(src)) return src;
    try { return new URL(src, window.location.origin).href; } catch (e) { return src; }
  }

  function sourceFriendly(src) {
    src = abs(src);
    if (!src) return "";
    if (/^(data:image\/|blob:)/i.test(src)) return src;
    try {
      var u = new URL(src);
      if (u.origin === window.location.origin) return u.pathname + u.search;
    } catch (e) {}
    return src;
  }

  function decodeProjectAttr(value) {
    if (!value) return {};
    try {
      return JSON.parse(value);
    } catch (e1) {
      try {
        return JSON.parse(decodeURIComponent(value));
      } catch (e2) {
        try {
          var txt = document.createElement("textarea");
          txt.innerHTML = value;
          return JSON.parse(txt.value);
        } catch (e3) {
          return {};
        }
      }
    }
  }

  function textOf(el) {
    return clean(el && (el.textContent || el.innerText || el.value || el.getAttribute && (el.getAttribute("aria-label") || el.title)) || "");
  }

  function closestVisualCard(el) {
    if (!el || !el.closest) return null;
    return el.closest(".simo-vc-card, [data-simo-project], .simo105d-row, .msg-row, .msg-bubble, article, section");
  }

  function bestImage(card) {
    if (!card || !card.querySelectorAll) return null;
    var imgs = Array.prototype.slice.call(card.querySelectorAll("img"));
    var best = null;
    var bestScore = 0;

    imgs.forEach(function (img) {
      var src = abs(img.getAttribute("src") || img.src || "");
      if (!src) return;

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

  function titleFromCard(card, project) {
    var fromProject = clean(project && (project.title || project.projectTitle || project.item || project.workspaceSubject));
    if (fromProject) return fromProject;

    var titleNode = null;
    try {
      titleNode = card && card.querySelector && card.querySelector("h1,h2,h3,h4,[class*='title'],strong,b");
    } catch (e) {}

    var title = textOf(titleNode);
    if (title && title.length < 180) return title;

    return "Simo Design Workspace";
  }

  function subjectFrom(project, title) {
    var text = low([
      project && project.workspaceSubject,
      project && project.item,
      project && project.title,
      project && project.projectTitle,
      title
    ].filter(Boolean).join(" "));

    if (/\btoaster\b/.test(text)) return "toaster";
    if (/\b(bottle|water bottle|tumbler|flask)\b/.test(text)) return "water bottle";
    if (/\b(rim|wheel)\b/.test(text)) return "tire rim";
    if (/\bguitar\b/.test(text)) return "guitar";
    if (/\bbook cover\b/.test(text)) return "book cover";
    if (/\bsoap dispenser\b/.test(text)) return "soap dispenser";
    if (/\bfire extinguisher\b/.test(text)) return "fire extinguisher";
    return clean(project && (project.workspaceSubject || project.item) || title || "current design");
  }

  function payloadFromCard(card) {
    var project = {};
    try {
      var attr = card && card.getAttribute && card.getAttribute("data-simo-project");
      if (!attr && card && card.querySelector) {
        var withAttr = card.querySelector("[data-simo-project]");
        attr = withAttr && withAttr.getAttribute("data-simo-project");
      }
      project = decodeProjectAttr(attr);
    } catch (e) {
      project = {};
    }

    var img = bestImage(card);
    var src = img ? abs(img.getAttribute("src") || img.src || "") : abs(project.imageUrl || project.image || project.currentImage || "");
    var source = sourceFriendly(src || project.currentSourceImage || project.sourceImage || "");
    var title = titleFromCard(card, project);
    var subject = subjectFrom(project, title);
    var prompt = clean(project.latestPrompt || project.prompt || project.item || title);

    return {
      phase: PHASE,
      title: title,
      projectTitle: title,
      workspaceSubject: subject,
      prompt: prompt,
      image: src,
      currentImage: src,
      displayImageUrl: src,
      previewUrl: src,
      thumbnail: src,
      originalImage: src,
      sourceImage: source,
      currentSourceImage: source,
      edits: []
    };
  }

  function setStatus(message) {
    var el = document.getElementById("loadingHint") ||
      document.getElementById("statusText") ||
      document.querySelector(".status, .footer-status, .loading-hint, [data-simo-status]");
    if (el) el.textContent = message || "Ready.";
  }

  function openCleanWorkspace(data) {
    if (!data || (!data.image && !data.currentImage && !data.currentSourceImage && !data.sourceImage)) {
      setStatus("Could not find the card image for workspace.");
      try { alert("Simo could not find the design image on this card."); } catch (e) {}
      return false;
    }

    if (window.SimoWorkspaceBridge && typeof window.SimoWorkspaceBridge.openTab === "function") {
      return !!window.SimoWorkspaceBridge.openTab(data);
    }
    if (window.SimoWorkspaceBridge && typeof window.SimoWorkspaceBridge.openWorkspace === "function") {
      return !!window.SimoWorkspaceBridge.openWorkspace(data);
    }
    if (window.SimoLiveWorkspaceIsolated && typeof window.SimoLiveWorkspaceIsolated.openTab === "function") {
      return !!window.SimoLiveWorkspaceIsolated.openTab(data);
    }
    if (window.SimoLiveWorkspace && typeof window.SimoLiveWorkspace.open === "function") {
      return !!window.SimoLiveWorkspace.open(data);
    }

    setStatus("Clean workspace bridge is not loaded yet.");
    try { alert("Clean workspace bridge is not loaded. Make sure simo-live-workspace-isolated.js loads before this bridge."); } catch (e2) {}
    return false;
  }

  function isOldWorkspaceButton(btn) {
    if (!btn) return false;
    var label = low(textOf(btn));
    var special = String(btn.getAttribute && btn.getAttribute("data-simo-vc-special") || "").toLowerCase();

    if (special === "open-3d") return true;
    if (label.indexOf("3d") >= 0 && label.indexOf("rotate") >= 0 && label.indexOf("workspace") >= 0) return true;
    if (label === "open workspace" && closestVisualCard(btn)) return true;

    return false;
  }

  function relabelButton(btn) {
    if (!btn || !isOldWorkspaceButton(btn)) return false;

    if (btn.tagName && btn.tagName.toLowerCase() === "input") {
      btn.value = "Open Workspace";
    } else {
      btn.textContent = "Open Workspace";
    }

    btn.setAttribute("data-simo-open-workspace-card", "true");
    btn.setAttribute("data-simo-vc-special", "open-workspace-clean");
    btn.title = "Open this exact generated image in the clean prompt-first workspace";
    btn.setAttribute("aria-label", "Open Workspace");
    return true;
  }

  function relabelAll() {
    var buttons = Array.prototype.slice.call(document.querySelectorAll("button, a, input[type='button'], input[type='submit'], [role='button']"));
    buttons.forEach(relabelButton);
  }

  function handleClick(evt) {
    var target = evt && evt.target;
    if (!target || !target.closest) return;

    var btn = target.closest("[data-simo-open-workspace-card], [data-simo-vc-special='open-3d'], [data-simo-vc-special='open-workspace-clean'], button, a, [role='button']");
    if (!btn || !isOldWorkspaceButton(btn)) return;

    var card = closestVisualCard(btn);
    if (!card) return;

    var now = Date.now();
    if (now - lastOpenAt < 550) {
      try { evt.preventDefault(); evt.stopPropagation(); if (evt.stopImmediatePropagation) evt.stopImmediatePropagation(); } catch (e) {}
      return;
    }
    lastOpenAt = now;

    try { evt.preventDefault(); evt.stopPropagation(); if (evt.stopImmediatePropagation) evt.stopImmediatePropagation(); } catch (e2) {}

    relabelButton(btn);

    var data = payloadFromCard(card);
    setStatus("Opening clean prompt-first workspace…");
    openCleanWorkspace(data);
  }

  function scheduleScan() {
    if (scanTimer) window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(function () {
      scanTimer = null;
      relabelAll();
    }, 80);
  }

  function boot() {
    relabelAll();
    window.setTimeout(relabelAll, 250);
    window.setTimeout(relabelAll, 900);
    window.setTimeout(relabelAll, 1800);

    ["pointerdown", "mousedown", "touchstart", "click"].forEach(function (eventName) {
      document.addEventListener(eventName, handleClick, true);
      window.addEventListener(eventName, handleClick, true);
    });

    if (typeof MutationObserver !== "undefined") {
      var observer = new MutationObserver(scheduleScan);
      observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["data-simo-vc-special", "data-simo-project", "src", "class"]
      });
    } else {
      window.setInterval(relabelAll, 1200);
    }

    window.SIMO_OPEN_WORKSPACE_CARD_BRIDGE = {
      phase: PHASE,
      scan: relabelAll,
      openCard: function (card) {
        return openCleanWorkspace(payloadFromCard(card));
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
