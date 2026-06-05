/*
  SIMO PHASE 14M-R10.47 — Workspace Card Bridge Marker + Safe Reopen
  Frontend-only. No backend, no Stripe, no image generation, no credit use.
*/
(function () {
  "use strict";
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__SIMO_OPEN_WORKSPACE_CARD_BRIDGE_R1047_LOADED__) return;

  window.__SIMO_OPEN_WORKSPACE_CARD_BRIDGE_R1047_LOADED__ = true;
  window.__SIMO_OPEN_WORKSPACE_CARD_BRIDGE_R1046__ = true;
  window.__SIMO_OPEN_WORKSPACE_CARD_BRIDGE_R1047__ = true;

  var PHASE = "PHASE 14M-R10.47 Workspace Card Bridge";

  function clean(v) { return String(v || "").replace(/\s+/g, " ").trim(); }
  function low(v) { return clean(v).toLowerCase(); }
  function fixUrl(src) {
    src = String(src || "").trim();
    if (!src) return "";
    if (src.indexOf("data:image/") === 0 || src.indexOf("blob:") === 0) return src;
    src = src.replace(/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?/i, window.location.origin);
    try { return new URL(src, window.location.origin).href; } catch (e) { return src; }
  }
  function isImage(src) {
    src = fixUrl(src);
    return !!(src && src.indexOf("127.0.0.1") < 0 && src.indexOf("localhost") < 0 && (
      src.indexOf("data:image/") === 0 ||
      src.indexOf("blob:") === 0 ||
      src.indexOf("/generated-images/") >= 0 ||
      src.indexOf("/generated_images/") >= 0 ||
      /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(src)
    ));
  }
  function closestCard(el) {
    return el && el.closest ? el.closest("[data-simo-live-library-id], [data-simo-workspace-saved-id], [data-simo-library-card], [data-library-card], .builder-library-card, .simo-library-card, .library-card, .build-card, .builder-card, article, .card") : null;
  }
  function bestImage(card) {
    if (!card || !card.querySelectorAll) return "";
    var imgs = Array.prototype.slice.call(card.querySelectorAll("img"));
    for (var i = 0; i < imgs.length; i += 1) {
      var src = fixUrl(imgs[i].getAttribute("src") || imgs[i].src || "");
      if (isImage(src)) return src;
    }
    return "";
  }
  function titleFromCard(card) {
    if (!card) return "Simo Saved Design";
    var titleEl = card.querySelector("h1,h2,h3,h4,.title,.card-title,strong,b");
    return clean(titleEl && titleEl.textContent) || clean(card.textContent).split("Open")[0] || "Simo Saved Design";
  }
  function openViaLibrary(card) {
    if (window.SimoLibrary && typeof window.SimoLibrary.openItem === "function") {
      var id = card && (card.getAttribute("data-simo-live-library-id") || card.getAttribute("data-simo-workspace-saved-id") || card.getAttribute("data-id") || "");
      var img = bestImage(card);
      window.SimoLibrary.openItem({
        id: id || ("simo_card_" + Date.now()),
        title: titleFromCard(card),
        imageUrl: img,
        image_url: img,
        previewUrl: img,
        displayImageUrl: img,
        currentImage: img,
        image: img,
        originalImageUrl: img,
        sourceImageUrl: img,
        workspaceSubject: titleFromCard(card),
        tags: ["visual", "design", "workspace"]
      });
      return true;
    }
    return false;
  }
  function clickCapture(e) {
    var target = e.target;
    if (!target || !target.closest) return;

    var btn = target.closest("button, a, [role='button']");
    if (!btn) return;
    var label = low(btn.textContent || btn.value || btn.getAttribute("aria-label") || btn.title || "");

    if (label.indexOf("open library") >= 0 || label.indexOf("builder library") >= 0) {
      if (typeof window.openLibrary === "function") {
        e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        window.openLibrary();
        return false;
      }
    }

    if (!(label === "open" || label === "preview" || label === "continue" || label === "workspace" || label.indexOf("open workspace") >= 0)) return;
    var card = closestCard(btn);
    if (!card || !isImage(bestImage(card))) return;
    var cardText = low(card.textContent || "");
    if (!(cardText.indexOf("workspace") >= 0 || cardText.indexOf("visual") >= 0 || cardText.indexOf("design") >= 0)) return;

    e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    openViaLibrary(card);
    return false;
  }

  document.addEventListener("click", clickCapture, true);
  if (document.documentElement) document.documentElement.addEventListener("click", clickCapture, true);
  window.addEventListener("click", clickCapture, true);

  window.SimoOpenWorkspaceCardBridge = Object.assign({}, window.SimoOpenWorkspaceCardBridge || {}, {
    phase: PHASE,
    openViaLibrary: openViaLibrary
  });

  console.log(PHASE + " loaded.");
})();
