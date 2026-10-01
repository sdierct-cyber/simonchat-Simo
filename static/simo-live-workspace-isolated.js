// PHASE 14M-R10.30 — CAREFUL WORKSPACE INTENT LOCK + REGEX FIX
// Base: R10.29 safe clickable workspace. Fixes the hidden variation/options regex bug and refreshes the isolated workspace phase label only.
// PHASE 14M-R10.14C — EMERGENCY ROLLBACK TO LAST CLICKABLE WORKSPACE
// File: static/simo-live-workspace-isolated.js
// R10.30 cautious change list:
// - Keeps the isolated workspace architecture.
// - Leaves app.py, index.html, script.js, phase31, auth, Stripe, Library layout, and image intake untouched.
// - Fixes a hidden regex bug where the variation/options detector contained backspace control characters.
// - Keeps 3D/Rotate paused so it cannot open stale/older designs.
// Purpose: restore Library button clickability after R10.14B aggressive 3D cleanup blocked buttons.
// Base: R10.14A Best Friend Workspace Core.
// Scope: isolated workspace file only. Does not touch app.py, index.html, script.js, phase31, starter buttons, image analysis, auth, Stripe, or Library layout.

// PHASE 14M-R10.41 — Stable Workspace MVP (Safe Controls Only)
// File: static/simo-live-workspace-isolated.js
//
// Full-file replacement.
// Safe scope:
// - Touch only this isolated workspace file.
// - Do not change app.py, static/script.js, static/phase31-design-actions-safe.js, templates/index.html,
//   login, Stripe, Builder Library layout, image intake, or main chat systems.
//
// Direction:
// - Open Workspace in New Tab is the focused design workspace.
// - Universal: not bottle-only. It works with whatever image/design the user opens.
// - Logo/text/brand/etched/engraved/name edits are applied locally onto the current workspace image,
//   so the material/object does not get regenerated or changed.
// - Other edits still use the main Simo generation flow.
// - Save Edited Version saves directly from the workspace tab with localStorage + server fallback.

(function () {
  "use strict";

  if (window.__SIMO_LIVE_WORKSPACE_ISOLATED_R1030__) return;
  window.__SIMO_LIVE_WORKSPACE_ISOLATED_R1030__ = true;

  var PHASE = "PHASE 14M-R10.41 — Stable Workspace MVP";
  var pendingWorkspaceButton = null;
  var clickLockUntil = 0;
  var latestPayload = null;

  function $(id) { return document.getElementById(id); }
  function clean(v) { return String(v || "").toLowerCase().replace(/\s+/g, " ").trim(); }
  function uid() { return "simo_workspace_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9); }

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeParse(raw, fallback) {
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  function absoluteUrl(src) {
    src = String(src || "").trim();
    if (!src) return "";
    if (src.indexOf("data:image/") === 0) return src;
    if (/^https?:\/\//i.test(src)) return src;
    if (src.indexOf("blob:") === 0) return src;
    try { return new URL(src, window.location.origin).href; } catch (e) { return src; }
  }

  function sourceFriendlyUrl(src) {
    src = absoluteUrl(src);
    if (!src) return "";
    if (src.indexOf("data:image/") === 0) return "";
    if (src.indexOf("blob:") === 0) return "";
    return src;
  }

  function isUsefulImage(src) {
    src = absoluteUrl(src);
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

  function getButton(target) {
    if (!target || !target.closest) return null;
    return target.closest("button, a, [role='button']");
  }

  function buttonText(btn) {
    return clean(btn && (btn.textContent || btn.getAttribute("aria-label") || btn.title || ""));
  }

  function isThreeDButton(target) {
    var btn = getButton(target);
    if (!btn) return false;
    var text = buttonText(btn);
    return (text.indexOf("3d") >= 0 || text.indexOf("rotate") >= 0) &&
      text.indexOf("open workspace in new tab") < 0 &&
      text.indexOf("open source image") < 0;
  }

  function isWorkspaceButton(target) {
    var btn = getButton(target);
    if (!btn) return false;
    var text = buttonText(btn);
    if (btn.matches("[data-open-workspace-tab], [data-simo-open-workspace]")) return true;
    return text.indexOf("open workspace in new tab") >= 0;
  }

  function isOpenTabButton(target) {
    var btn = getButton(target);
    var text = buttonText(btn);
    if (btn && btn.matches("[data-open-workspace-tab]")) return true;
    return text.indexOf("open workspace in new tab") >= 0;
  }

  function stopEvent(event) {
    try { event.preventDefault(); } catch (e) {}
    try { event.stopPropagation(); } catch (e) {}
    try { if (event.stopImmediatePropagation) event.stopImmediatePropagation(); } catch (e) {}
  }

  function setStatus(message) {
    var el = $("loadingHint") || $("statusText") || $("readyStatus") || document.querySelector(".status, .footer-status, .loading-hint, [data-simo-status]");
    if (el) el.textContent = message || "Ready.";
  }

  function nearestDesignRoot(start) {
    if (!start || !start.closest) return null;
    return start.closest(
      ".simo-r107-live-modal, [data-simo-r107-live-modal], .simo-vc-card, [data-simo-project], " +
      ".simo-r9-card, .simo-r9-library-card, .simo-library-card, [data-r9-index], [data-library-card], " +
      "[data-simo-library-card], .builder-library-card, .library-card, article, .card"
    );
  }

  function titleFromElement(root) {
    if (!root || !root.querySelector) return "";
    var node = root.querySelector("h1,h2,h3,h4,strong,b,.simo-r9-title,[class*='title']");
    var text = node ? String(node.textContent || "").trim() : "";
    if (!text) {
      var lines = String(root.textContent || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
      text = lines[0] || "";
    }
    return text.replace(/^Ask:\s*/i, "").replace(/^Continue Editing:\s*/i, "").trim() || "Simo Saved Design";
  }

  function scoreImage(img) {
    if (!img) return 0;
    var src = absoluteUrl(img.getAttribute("src") || img.src || "");
    if (!isUsefulImage(src)) return 0;

    var r = img.getBoundingClientRect ? img.getBoundingClientRect() : { width: 0, height: 0 };
    var area = Math.max(0, r.width) * Math.max(0, r.height);
    var natural = Math.max(0, img.naturalWidth || 0) * Math.max(0, img.naturalHeight || 0);
    var score = area || natural || 1;

    if (src.indexOf("/generated-images/") >= 0 || src.indexOf("/generated_images/") >= 0) score += 1000000;
    if (src.indexOf("data:image/") === 0) score += 900000;
    if (src.indexOf("blob:") === 0) score += 800000;

    return score;
  }

  function bestImageElement(root) {
    var candidates = [];
    if (root && root.querySelectorAll) candidates = candidates.concat(Array.prototype.slice.call(root.querySelectorAll("img")));
    candidates = candidates.concat(Array.prototype.slice.call(document.querySelectorAll(
      ".simo-r107-live-modal img, [data-simo-r107-live-modal] img, .simo-vc-card img, " +
      ".chat-wrap img, #chatMessages img, .msg-bubble img, .builder-library-card img, .library-card img, img"
    )));

    var best = null;
    var bestScore = 0;
    candidates.forEach(function (img) {
      var s = scoreImage(img);
      if (s > bestScore) {
        best = img;
        bestScore = s;
      }
    });
    return best;
  }

  function latestImageElement() {
    var imgs = Array.prototype.slice.call(document.querySelectorAll("#chatMessages img, .chat-wrap img, .simo-vc-card img, .msg-bubble img, article img, .card img, img"));
    for (var i = imgs.length - 1; i >= 0; i -= 1) {
      var src = absoluteUrl(imgs[i].getAttribute("src") || imgs[i].src || "");
      if (isUsefulImage(src)) return imgs[i];
    }
    return bestImageElement(document);
  }

  function imageSet() {
    var set = {};
    Array.prototype.slice.call(document.querySelectorAll("#chatMessages img, .chat-wrap img, .simo-vc-card img, .msg-bubble img, article img, .card img, img")).forEach(function (img) {
      var src = absoluteUrl(img.getAttribute("src") || img.src || "");
      if (isUsefulImage(src)) set[src] = true;
    });
    return set;
  }

  function newestUsefulImageNotIn(beforeSet) {
    var imgs = Array.prototype.slice.call(document.querySelectorAll("#chatMessages img, .chat-wrap img, .simo-vc-card img, .msg-bubble img, article img, .card img, img"));
    var best = null;
    var bestScore = 0;

    for (var i = imgs.length - 1; i >= 0; i -= 1) {
      var img = imgs[i];
      var src = absoluteUrl(img.getAttribute("src") || img.src || "");
      if (!isUsefulImage(src)) continue;
      if (beforeSet && beforeSet[src]) continue;

      var score = scoreImage(img) + (imgs.length - i) * 1000;
      if (score > bestScore) {
        best = img;
        bestScore = score;
      }
    }
    return best;
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function imageElementToDataUrl(img) {
    return new Promise(function (resolve) {
      if (!img) return resolve("");
      var src = absoluteUrl(img.getAttribute("src") || img.src || "");
      if (!src) return resolve("");
      if (src.indexOf("data:image/") === 0) return resolve(src);

      fetch(src)
        .then(function (res) {
          if (!res.ok) throw new Error("image fetch failed");
          return res.blob();
        })
        .then(blobToDataUrl)
        .then(function (dataUrl) {
          resolve(dataUrl && dataUrl.indexOf("data:image/") === 0 ? dataUrl : src);
        })
        .catch(function () {
          try {
            var canvas = document.createElement("canvas");
            var w = img.naturalWidth || img.width || 1200;
            var h = img.naturalHeight || img.height || 1200;
            canvas.width = Math.max(1, w);
            canvas.height = Math.max(1, h);
            var ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            var dataUrl = canvas.toDataURL("image/png");
            resolve(dataUrl && dataUrl.indexOf("data:image/") === 0 ? dataUrl : src);
          } catch (e) {
            resolve(src);
          }
        });
    });
  }

  function isGenericWorkspaceTitle(title) {
    var t = clean(title);
    return !t ||
      t.indexOf("product concept") >= 0 ||
      t.indexOf("exact active workspace") >= 0 ||
      t.indexOf("simo saved design") >= 0 ||
      t.indexOf("continue editing") >= 0 ||
      t.indexOf("edit — product") >= 0 ||
      t.indexOf("edit - product") >= 0;
  }

  function firstMeaningfulTitleFromItem(item) {
    if (!item) return "";
    var fields = [item.workspaceSubject, item.projectTitle, item.title, item.name, item.sourcePrompt, item.latestPrompt, item.prompt, item.notes];
    for (var i = 0; i < fields.length; i += 1) {
      var v = String(fields[i] || "").trim();
      if (!v) continue;
      if (isGenericWorkspaceTitle(v)) continue;
      return v;
    }
    return "";
  }

  function imagesLookSame(a, b) {
    a = absoluteUrl(a || "");
    b = absoluteUrl(b || "");
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.indexOf("data:image/") === 0 && b.indexOf("data:image/") === 0) {
      return a.slice(0, 240) === b.slice(0, 240) && Math.abs(a.length - b.length) < 1800;
    }
    var aa = a.split("?")[0].split("#")[0];
    var bb = b.split("?")[0].split("#")[0];
    return !!(aa && bb && aa === bb);
  }

  function findLibraryItemForImage(src) {
    src = absoluteUrl(src || "");
    if (!src) return null;
    var keys = ["simo_builder_library_v5_1_builder_first", "simo_builder_library_v5", "simo_visual_concepts_library_v1"];
    var imageFields = ["imageUrl", "image_url", "generated_visual_url", "generatedImageUrl", "previewUrl", "thumbnail", "visualUrl", "displayImageUrl", "sourceImageUrl", "originalImageUrl"];
    for (var k = 0; k < keys.length; k += 1) {
      var store = readStore(keys[k]);
      var arr = store && store.arr ? store.arr : [];
      for (var i = 0; i < arr.length; i += 1) {
        var item = arr[i] || {};
        for (var f = 0; f < imageFields.length; f += 1) {
          if (imagesLookSame(src, item[imageFields[f]])) return item;
        }
      }
    }
    return null;
  }

  function getWorkspaceData(start) {
    var root = nearestDesignRoot(start) || document;
    var img = bestImageElement(root);
    var title = titleFromElement(root);
    var src = img ? absoluteUrl(img.getAttribute("src") || img.src || "") : "";
    var matchedItem = findLibraryItemForImage(src);
    var matchedTitle = firstMeaningfulTitleFromItem(matchedItem);
    if (matchedTitle && isGenericWorkspaceTitle(title)) title = matchedTitle;
    var subject = matchedTitle || title;
    if (matchedItem && matchedItem.workspaceSubject && !isGenericWorkspaceTitle(matchedItem.workspaceSubject)) {
      subject = matchedItem.workspaceSubject;
    }
    return {
      id: uid(),
      phase: PHASE,
      title: title,
      image: src,
      currentImage: src,
      sourceImage: sourceFriendlyUrl(src),
      currentSourceImage: sourceFriendlyUrl(src),
      originalImage: src,
      workspaceSubject: subject,
      projectTitle: matchedItem && (matchedItem.projectTitle || matchedItem.title || matchedItem.name) || title,
      edits: [],
      createdAt: new Date().toISOString(),
      _imageElement: img
    };
  }

  function hydrateWorkspaceData(data) {
    data = data || getWorkspaceData(document.body);
    return imageElementToDataUrl(data._imageElement).then(function (safeImage) {
      var raw = data.image || data.currentImage || data.sourceImage || "";
      if (safeImage) {
        data.image = safeImage;
        data.currentImage = safeImage;
        if (!data.originalImage) data.originalImage = safeImage;
      }
      data.currentSourceImage = data.currentSourceImage || sourceFriendlyUrl(raw);
      data.sourceImage = data.sourceImage || sourceFriendlyUrl(raw);
      delete data._imageElement;
      return data;
    });
  }

  function isLocalTextEdit(label) {
    var t = clean(label);
    return t.indexOf("logo") >= 0 ||
      t.indexOf("brand") >= 0 ||
      t.indexOf("text") >= 0 ||
      t.indexOf("word") >= 0 ||
      t.indexOf("name") >= 0 ||
      t.indexOf("etched") >= 0 ||
      t.indexOf("engraved") >= 0 ||
      t.indexOf("write") >= 0 ||
      t.indexOf("type") >= 0 ||
      t.indexOf("letter") >= 0;
  }

  function extractLogoText(label) {
    var raw = String(label || "").trim();

    var quoted = raw.match(/["“”']([^"“”']{1,40})["“”']/);
    if (quoted && quoted[1]) return quoted[1].trim();

    var lower = clean(raw);
    var properWords = raw.match(/\b[A-Z][A-Za-z0-9]{1,24}\b/g) || [];
    var skip = {
      "Add": true, "Make": true, "Put": true, "Type": true, "Write": true, "Etch": true, "Engrave": true,
      "Logo": true, "Brand": true, "Name": true, "Text": true, "The": true, "This": true, "Without": true,
      "Changing": true, "Material": true, "Elegant": true
    };

    var usable = properWords.filter(function (w) { return !skip[w]; });
    if (usable.length) return usable[usable.length - 1];

    var afterName = raw.match(/\b(?:name|word|text|logo|brand)\s+(?:as|is|says|with|named|called)?\s*([A-Za-z0-9]{2,28})/i);
    if (afterName && afterName[1]) return afterName[1].trim();

    if (lower.indexOf("gojcaj") >= 0) return "Gojcaj";
    if (lower.indexOf("simo") >= 0) return "SIMO";

    return "LOGO";
  }

  function localLogoEdit(data, label) {
    return new Promise(function (resolve) {
      var src = data.currentImage || data.image || data.originalImage || "";
      if (!src) {
        resolve({ ok: false, message: "No workspace image found for local logo edit." });
        return;
      }

      var text = extractLogoText(label);
      var img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = function () {
        try {
          var canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;

          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          var w = canvas.width;
          var h = canvas.height;
          var fontSize = Math.max(28, Math.round(w * 0.075));
          var x = Math.round(w * 0.5);
          var y = Math.round(h * 0.56);

          ctx.save();
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = "700 " + fontSize + "px Georgia, Times New Roman, serif";

          // Soft etched/printed effect that preserves the underlying material image.
          ctx.shadowColor = "rgba(255,255,255,0.42)";
          ctx.shadowBlur = Math.max(2, Math.round(fontSize * 0.05));
          ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.045));
          ctx.strokeStyle = "rgba(255,255,255,0.42)";
          ctx.strokeText(text, x, y);

          ctx.globalAlpha = 0.82;
          ctx.fillStyle = "rgba(25,25,25,0.72)";
          ctx.fillText(text, x, y);

          ctx.globalAlpha = 0.20;
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.fillText(text, x - Math.round(fontSize * 0.035), y - Math.round(fontSize * 0.035));
          ctx.restore();

          var out = canvas.toDataURL("image/png");
          resolve({
            ok: true,
            image: out,
            sourceImage: "",
            message: "Applied logo/text directly in the workspace so the material stayed unchanged.",
            localEdit: true,
            editLabel: label
          });
        } catch (e) {
          resolve({ ok: false, message: "Could not apply local logo/text edit." });
        }
      };

      img.onerror = function () {
        resolve({ ok: false, message: "Could not load workspace image for local logo/text edit." });
      };

      img.src = src;
    });
  }

  function preservePrompt(data, label) {
    var title = data && (data.title || data.workspaceSubject) || "the current active design";
    return [
      "Continue editing this exact active workspace design: " + title + ".",
      "Apply only this requested edit: " + String(label || "continue editing") + ".",
      "Preserve the same object/category/concept, shape, material, finish, color palette, proportions, camera angle, and composition unless the user explicitly requested a change to one of those.",
      "This is a surgical edit, not a redesign.",
      "Do not replace the subject or switch materials.",
      "Show the updated visual first. Do not save to library unless I click Save."
    ].join(" ");
  }

  function sendPrompt(prompt) {
    var input = document.getElementById("chatInput") || document.querySelector("textarea, input[type='text']");
    var send = document.getElementById("sendBtn") || document.querySelector("button[type='submit'], .send-btn, [data-send]");
    if (!input) return false;
    input.value = prompt;
    input.focus();
    try { input.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
    setTimeout(function () {
      if (send && typeof send.click === "function") send.click();
    }, 80);
    return true;
  }

  function waitForNewImage(beforeSet, timeoutMs) {
    timeoutMs = timeoutMs || 120000;
    return new Promise(function (resolve) {
      var start = Date.now();
      var done = false;

      function finish(value) {
        if (done) return;
        done = true;
        try { obs.disconnect(); } catch (e) {}
        resolve(value || null);
      }

      function check() {
        var img = newestUsefulImageNotIn(beforeSet);
        if (img) {
          imageElementToDataUrl(img).then(function (safe) {
            var src = absoluteUrl(img.getAttribute("src") || img.src || "");
            var payload = {
              ok: true,
              image: safe || src,
              sourceImage: sourceFriendlyUrl(src),
              message: "Updated workspace image from newest Simo result."
            };
            latestPayload = payload;
            try { localStorage.setItem("simo_workspace_latest_payload_v4", JSON.stringify(payload)); } catch (e) {}
            finish(payload);
          });
          return;
        }

        if (Date.now() - start > timeoutMs) finish(null);
      }

      var obs = new MutationObserver(check);
      try { obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] }); } catch (e) {}
      check();

      var interval = setInterval(function () {
        if (done) {
          clearInterval(interval);
          return;
        }
        check();
      }, 900);
    });
  }


  function normalizeReturnedWorkspaceImage(src) {
    src = absoluteUrl(src || "");
    if (!src) return Promise.resolve("");
    if (src.indexOf("data:image/") === 0) return Promise.resolve(src);

    // Blob workspace tabs can display data URLs reliably. Convert returned backend
    // image URLs in the main Simo tab before sending them back to the workspace.
    return fetch(src, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("edited image fetch failed");
        return res.blob();
      })
      .then(blobToDataUrl)
      .then(function (dataUrl) {
        return dataUrl && dataUrl.indexOf("data:image/") === 0 ? dataUrl : src;
      })
      .catch(function () {
        return src;
      });
  }

  function requestEdit(data, label) {
    data = data || {};

    var image = data.currentImage || data.image || data.displayImageUrl || data.sourceImage || data.originalImage || "";
    if (!image) {
      return Promise.resolve({ ok: false, message: "No workspace image found. Reopen this item from Library and try again." });
    }

    return fetch("/api/workspace-image-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        edit: String(label || "continue editing"),
        prompt: String(label || "continue editing"),
        title: data.title || data.projectTitle || data.name || data.workspaceSubject || "",
        workspaceSubject: data.workspaceSubject || data.title || "",
        currentImage: image,
        image: image,
        sourceImage: data.currentSourceImage || data.sourceImage || "",
        originalImage: data.originalImage || ""
      })
    }).then(function (res) {
      return res.json().catch(function () { return { ok: false, error: "Workspace edit returned invalid JSON." }; });
    }).then(function (payload) {
      if (!payload || !payload.ok || !(payload.image || payload.image_url || payload.generated_visual_url)) {
        return { ok: false, message: (payload && (payload.message || payload.error)) || "Workspace image edit failed." };
      }
      var returnedImage = payload.image_data_url || payload.image || payload.image_url || payload.generated_visual_url || "";
      var returnedSource = payload.sourceImage || payload.image_url || payload.generated_visual_url || returnedImage || "";

      return normalizeReturnedWorkspaceImage(returnedImage).then(function (safeImage) {
        latestPayload = {
          ok: true,
          image: safeImage || returnedImage,
          sourceImage: absoluteUrl(returnedSource || returnedImage),
          message: payload.message || "Real workspace image edit complete.",
          prompt: payload.prompt || String(label || ""),
          mode: payload.mode || "workspace-image-edit"
        };
        try { localStorage.setItem("simo_workspace_latest_payload_v4", JSON.stringify(latestPayload)); } catch (e) {}
        return latestPayload;
      });
    }).catch(function (err) {
      return { ok: false, message: "Workspace image edit route failed: " + (err && err.message ? err.message : err) };
    });
  }

  function getLatestImage(previousImage) {
    var prev = absoluteUrl(previousImage || "");

    if (latestPayload && latestPayload.image && latestPayload.image !== prev) {
      return Promise.resolve({ image: latestPayload.image, sourceImage: latestPayload.sourceImage || "" });
    }

    try {
      var stored = safeParse(localStorage.getItem("simo_workspace_latest_payload_v4"), null);
      if (stored && stored.image && stored.image !== prev) {
        return Promise.resolve({ image: stored.image, sourceImage: stored.sourceImage || "" });
      }
    } catch (e) {}

    var img = latestImageElement();
    if (!img) return Promise.resolve(null);

    var src = absoluteUrl(img.getAttribute("src") || img.src || "");
    if (!src || src === prev) return Promise.resolve(null);

    return imageElementToDataUrl(img).then(function (safe) {
      return { image: safe || src, sourceImage: sourceFriendlyUrl(src) };
    });
  }

  function makeLibraryItem(data) {
    data = data || {};
    var title = data.title || data.projectTitle || data.name || "Simo Workspace Design";
    var image = data.currentImage || data.image || data.displayImageUrl || data.sourceImage || data.originalImage || "";
    var sourceImage = data.currentSourceImage || data.sourceImage || sourceFriendlyUrl(image) || "";
    var edits = Array.isArray(data.edits) ? data.edits : [];

    return {
      id: uid(),
      title: title + (edits.length ? " — Edited Workspace Version" : ""),
      name: title + (edits.length ? " — Edited Workspace Version" : ""),
      projectTitle: title,
      prompt: "Saved from isolated live workspace: " + title,
      latestPrompt: edits.length ? edits[edits.length - 1] : title,
      sourcePrompt: title,
      type: "visual",
      kind: "visual",
      source: "simo_live_workspace_isolated",
      category: "product",
      domain: "product",
      tags: ["visual", "design", "workspace", "image-first", "edited-version"],
      notes: "Saved from the isolated live workspace. Original Library item remains untouched. Continue refining from this edited visual version.",
      imageUrl: image,
      image_url: image,
      generated_visual_url: image,
      generatedImageUrl: image,
      previewUrl: image,
      thumbnail: image,
      visualUrl: image,
      displayImageUrl: image,
      sourceImageUrl: sourceImage,
      originalImageUrl: data.originalImage || "",
      workspaceEdits: edits,
      workspaceSubject: data.workspaceSubject || title,
      workspaceOpen: true,
      simoWorkspaceVersion: "R10.30",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      html: ""
    };
  }

  function readStore(key) {
    try {
      var parsed = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(parsed)) return { obj: parsed, arr: parsed, mode: "array" };
      if (parsed && Array.isArray(parsed.items)) return { obj: parsed, arr: parsed.items, mode: "items" };
      if (parsed && Array.isArray(parsed.builds)) return { obj: parsed, arr: parsed.builds, mode: "builds" };
      if (parsed && Array.isArray(parsed.library)) return { obj: parsed, arr: parsed.library, mode: "library" };
    } catch (e) {}
    return { obj: [], arr: [], mode: "array" };
  }

  function writeStore(key, store, arr) {
    if (store.mode === "array") {
      localStorage.setItem(key, JSON.stringify(arr));
    } else {
      var obj = store.obj && typeof store.obj === "object" ? store.obj : {};
      obj[store.mode] = arr;
      localStorage.setItem(key, JSON.stringify(obj));
    }
  }

  function saveLocal(item) {
    ["simo_design_library_v1"].forEach(function (key) {
      try {
        var store = readStore(key);
        var arr = store.arr || [];
        arr.unshift(item);
        writeStore(key, store, arr);
      } catch (e) {}
    });

    try {
      localStorage.setItem("simo_workspace_last_saved_item_v1", JSON.stringify(item));
      window.dispatchEvent(new CustomEvent("simo:library-updated", { detail: { source: "workspace-r" } }));
      document.dispatchEvent(new CustomEvent("simo:library-updated", { detail: { source: "workspace-r" } }));
    } catch (e) {}
  }

  function saveWorkspace(data) {
    var item = makeLibraryItem(data);
    saveLocal(item);

    if (typeof fetch === "function") {
      fetch("/api/library/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item)
      }).catch(function () {});
    }

    return true;
  }

  function buttonLabels() {
    return ["Material", "Size / Proportions", "Handle Design", "Hardware", "Comfort", "Color / Pattern", "Functional Details", "Brand Tag", "Packaging", "Generate Variations", "Premium finish"];
  }

  function workspaceTabHtml(data) {
    var encoded = encodeURIComponent(JSON.stringify(data));
    var imageHtml = data.currentImage || data.image
      ? '<img id="workspaceImage" src="' + esc(data.currentImage || data.image) + '" alt="' + esc(data.title) + '">'
      : '<div class="missing">Image not found.</div>';

    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(data.title) + '</title><style>html,body{margin:0;height:100%;background:#050b14;color:#eef4ff;font-family:Inter,system-ui,Segoe UI,Arial,sans-serif;overflow:hidden}.shell{height:100vh;display:grid;grid-template-columns:minmax(0,1fr) 370px;background:radial-gradient(circle at 42% 40%,#142239 0,#050b14 45%,#030812 100%)}.stage{display:grid;place-items:center;padding:34px;min-width:0;position:relative}.stage img{max-width:min(100%,1100px);max-height:88vh;object-fit:contain;border-radius:22px;box-shadow:0 30px 90px rgba(0,0,0,.45);background:#fff;transition:transform .18s ease;transform-origin:center center}.badge{position:absolute;left:28px;bottom:24px;background:rgba(3,8,18,.70);border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:10px 14px;font-size:13px;color:#dce9ff}.zoomBar{position:absolute;left:28px;top:24px;display:flex;gap:8px;align-items:center;background:rgba(3,8,18,.68);border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:8px;backdrop-filter:blur(12px)}.zoomBar button{padding:9px 12px;font-size:13px;min-height:0}.zoomBar span{font-size:12px;color:#dce9ff;padding:0 6px;min-width:46px;text-align:center}.side{border-left:1px solid rgba(255,255,255,.12);background:rgba(18,29,47,.96);padding:28px;overflow:auto}.kicker{font-size:12px;font-weight:900;letter-spacing:.18em;color:#9fc5ff;margin-bottom:14px}h1{font-size:27px;line-height:1.08;margin:0 0 18px}p{color:#d6e4ff;line-height:1.45;margin:0 0 18px}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:18px}button,a{border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#fff;border-radius:999px;padding:13px 16px;font-weight:900;font-size:15px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}button:hover,a:hover{background:rgba(110,168,255,.18);border-color:rgba(110,168,255,.52)}button:disabled{opacity:.55;cursor:not-allowed}.save{width:100%;margin:10px 0 14px;background:linear-gradient(135deg,rgba(61,104,197,.95),rgba(28,79,174,.9))}.custom{margin-top:18px;display:grid;gap:10px}.custom textarea{width:100%;min-height:94px;border-radius:18px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.24);color:white;padding:13px;font:inherit;resize:vertical;box-sizing:border-box}.custom button{background:linear-gradient(135deg,rgba(61,104,197,.95),rgba(28,79,174,.9))}.row{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.progressWrap{display:none;margin-top:14px;height:8px;border-radius:999px;background:rgba(255,255,255,.10);overflow:hidden}.progressWrap.active{display:block}.progressBar{height:100%;width:32%;border-radius:999px;background:linear-gradient(90deg,#6ea8ff,#b9d6ff);animation:simoProgress 1.05s ease-in-out infinite alternate}@keyframes simoProgress{from{transform:translateX(-15%)}to{transform:translateX(230%)}}.status{margin-top:18px;padding:14px;border-radius:14px;background:rgba(0,0,0,.25);color:#dce9ff;font-size:14px;line-height:1.4}.edits{margin-top:12px;font-size:13px;color:#b9c9e6;line-height:1.45}</style></head><body><div class="shell"><main class="stage">' + imageHtml + '<div class="zoomBar"><button id="zoomOutBtn" type="button">−</button><span id="zoomText">100%</span><button id="zoomInBtn" type="button">+</button><button id="zoomResetBtn" type="button">Reset</button></div><div class="badge" id="imageBadge">Workspace image</div></main><aside class="side"><div class="kicker">SIMO BEST FRIEND DESIGN WORKSPACE</div><h1>' + esc(data.title) + '</h1><p>Simo Design Workspace uses the current image plus your natural-language request. Save/reopen, zoom, undo, restore, and AI image edits remain available.</p><button class="save" id="saveBtn">Save Edited Version to Design Library</button><div class="actions" id="actions"></div><div class="custom"><textarea id="customPrompt" placeholder="Tell Simo what to change in normal words — for example: etch Simon in an elegant font on the mug."></textarea><button id="customBtn">Apply Custom Edit</button></div><div class="row"><button id="pullBtn" type="button">Pull Latest Image</button><button id="undoBtn" type="button">Undo Last Edit</button><button id="restoreBtn" type="button">Restore Original Image</button></div><div class="progressWrap" id="progressWrap" aria-hidden="true"><div class="progressBar"></div></div><div class="status" id="status">Natural-language Design Workspace editing is active. Simo will reason from the current image and preserve unrelated details.</div><div class="edits" id="edits"></div></aside></div><script>let DATA=JSON.parse(decodeURIComponent("' + encoded + '"));DATA.currentImage=DATA.currentImage||DATA.image||"";DATA.originalImage=DATA.originalImage||DATA.currentImage||"";DATA.edits=DATA.edits||[];DATA.history=Array.isArray(DATA.history)?DATA.history:[];function workspaceSubjectText(){return String((DATA&& (DATA.workspaceSubject||DATA.title||DATA.projectTitle||DATA.name))||"").toLowerCase();}function subjectAwareLabels(){const s=workspaceSubjectText();if(s.includes("water bottle")||s.includes("bottle")){return ["Bottle material polish: safe local premium finish","Bottle engraving/text: local only, preserve exact name","Advanced shape edits locked: prevents watermarks/name changes"];}if(s.includes("book cover")||s.includes("cover")){return ["Cover text/branding: local only","Advanced cover redraw locked: generate new concept separately"];}return ["Material polish: safe local premium finish","Text/branding: local only","Advanced shape edits locked: prevents watermarks/name changes"];}const labels=subjectAwareLabels();const img=document.getElementById("workspaceImage");const statusEl=document.getElementById("status");const editsEl=document.getElementById("edits");const badge=document.getElementById("imageBadge");let ZOOM_LEVEL=1;const zoomText=document.getElementById("zoomText");function applyZoom(){ZOOM_LEVEL=Math.max(.5,Math.min(2.5,ZOOM_LEVEL));if(img)img.style.transform="scale("+ZOOM_LEVEL.toFixed(2)+")";if(zoomText)zoomText.textContent=Math.round(ZOOM_LEVEL*100)+"%";}function setStatus(t){statusEl.textContent=t;}function renderEdits(){editsEl.textContent=DATA.edits.length?("Edits applied: "+DATA.edits.join(" → ")):"No edits applied yet.";badge.textContent=DATA.edits.length?"Edited workspace image":"Workspace image";}function setBusy(b){document.querySelectorAll("button").forEach(x=>x.disabled=!!b);const p=document.getElementById("progressWrap");if(p){p.classList.toggle("active",!!b);p.setAttribute("aria-hidden",b?"false":"true");}}function applyImage(payload,label,msg){let newImage=typeof payload==="string"?payload:(payload&&payload.image)||"";let newSource=(payload&&payload.sourceImage)||"";if(newImage){if(DATA.currentImage&&DATA.currentImage!==newImage){DATA.history.push({image:DATA.currentImage,label:label||"Previous image"});if(DATA.history.length>12)DATA.history.shift();}DATA.currentImage=newImage;DATA.image=newImage;if(newSource)DATA.currentSourceImage=newSource;if(label)DATA.edits.push(label);if(img)img.src=newImage;setStatus(msg||"Workspace image updated.");renderEdits();return true;}return false;}function lower(v){return String(v||"").toLowerCase();}function squeezeSpaces(s){s=String(s||"").trim();while(s.indexOf("  ")>=0){s=s.replace("  "," ");}return s;}let EDIT_PATH="preserve";let BRAND_MODE="auto";let SURFACE_MODE="auto";let LAST_BRAND_TEXT="";function isExplicitTransform(label){const t=lower(label);return t.includes("change the item")||t.includes("change this item")||t.includes("turn this")||t.includes("turn it")||t.includes("transform this")||t.includes("transform it")||t.includes("replace this")||t.includes("replace it")||t.includes("make it into")||t.includes("convert this")||t.includes("convert it")||t.includes("different item")||t.includes("new item");}function isExplicitMaterial(label){const t=lower(label);return t.includes("change material")||t.includes("change the material")||t.includes("make it metal")||t.includes("make it steel")||t.includes("make it glass")||t.includes("make it plastic")||t.includes("make it wood")||t.includes("matte black")||t.includes("brushed steel")||t.includes("brushed titanium")||t.includes("chrome");}function isExplicitStructure(label){const t=lower(label);return t.includes("change shape")||t.includes("make it taller")||t.includes("make it shorter")||t.includes("add a handle")||t.includes("remove the handle")||t.includes("two bulb")||t.includes("2 bulb")||t.includes("three bulb")||t.includes("3 bulb")||t.includes("add another bulb")||t.includes("change the cap")||t.includes("change cap");}function inferBrandMode(label){if(BRAND_MODE&&BRAND_MODE!=="auto")return BRAND_MODE;const t=lower(label);if(t.includes("engrave")||t.includes("engraved")||t.includes("etch")||t.includes("etched")||t.includes("carve")||t.includes("emboss"))return"engrave";if(t.includes("sticker")||t.includes("tag"))return"sticker";if(t.includes("label"))return"label";if(t.includes("print")||t.includes("printed")||t.includes("decal")||t.includes("logo")||t.includes("brand"))return"print";return"print";}function isLocalBrandingEdit(label){const t=lower(label);if(EDIT_PATH==="transform"||isExplicitTransform(label)||isExplicitMaterial(label)||isExplicitStructure(label))return false;return t.includes("etch")||t.includes("engrave")||t.includes("engraved")||t.includes("logo")||t.includes("brand")||t.includes("label")||t.includes("sticker")||t.includes("tag")||t.includes("text")||t.includes("name")||t.includes("write")||t.includes("type ")||t.includes("print")||t.includes("decal");}function phraseBeforeAny(s,markers){let l=lower(s),best=s.length;markers.forEach(m=>{const i=l.indexOf(m);if(i>=0&&i<best)best=i;});return s.slice(0,best).trim();}function removeEndPunctuation(s){while(s.length&&".,;:!?".includes(s.charAt(s.length-1))){s=s.slice(0,-1);}return s.trim();}function extractBrandText(label){let raw=String(label||"").trim();let quoted=raw.match(/["“”]([^"“”]{1,60})["“”]/);if(quoted&&quoted[1])return quoted[1].trim();let cut=phraseBeforeAny(raw,[" without "," do not "," dont "," keep "," preserve "," preserving "," leave "]);let low=lower(cut);function cleanPhrase(v){v=String(v||"").trim();let markers=[" in the bottle"," on the bottle"," into the bottle"," onto the bottle"," in the product"," on the product"," onto the product"," into the product"," on the image"," in the image"," on the surface"," into the surface"," to the bottle"," to the product"," on it"," into it"," onto it"];v=phraseBeforeAny(v,markers);["the text ","text ","the name ","name ","the logo ","logo ","the brand ","brand ","a label that says ","label that says ","a label ","label ","a sticker that says ","sticker that says ","a sticker ","sticker ","a tag that says ","tag that says ","a tag ","tag "].forEach(m=>{if(lower(v).startsWith(m))v=v.slice(m.length).trim();});[" etched"," engraved"," printed"," decal"," label"," sticker"," tag"," logo"].forEach(m=>{if(lower(v).endsWith(m))v=v.slice(0,v.length-m.length).trim();});return removeEndPunctuation(v).trim();}let patterns=[/\badd\s+(.+?)\s+(?:etched|engraved|printed|as\s+a\s+label|as\s+a\s+sticker|as\s+a\s+tag|label|sticker|tag)\b/i,/\b(?:etch|engrave|write|print|type)\s+(.+?)(?:\s+(?:in|on|onto|into|to)\s+(?:the\s+)?(?:bottle|product|image|surface|front|it)|$)/i,/\b(?:put|place|apply)\s+(.+?)(?:\s+(?:in|on|onto|into|to)\s+(?:the\s+)?(?:bottle|product|image|surface|front|it)|$)/i,/\b(?:label|sticker|tag)\s+(?:that\s+says\s+)?(.+?)(?:\s+(?:in|on|onto|into|to)\s+(?:the\s+)?(?:bottle|product|image|surface|front|it)|$)/i];for(let i=0;i<patterns.length;i++){let m=cut.match(patterns[i]);if(m&&m[1]){let v=cleanPhrase(m[1]);if(v)return v;}}if(low.includes("living water"))return"Living Water";if(low.includes("healthy living"))return"Healthy Living";if(low.includes("simon gojcaj"))return"Simon Gojcaj";if(low.includes("gojcaj"))return"Gojcaj";if(low.includes("simo"))return"SIMO";let words=cut.match(/\b[A-Z][A-Za-z0-9-]{1,28}\b/g)||[];let skip={Add:1,Make:1,Put:1,Place:1,Apply:1,Type:1,Write:1,Etch:1,Etched:1,Engrave:1,Engraved:1,Logo:1,Brand:1,Name:1,Text:1,The:1,This:1,Without:1,Changing:1,Material:1,Bottle:1,Product:1};let usable=words.filter(w=>!skip[w]);if(usable.length>=2)return usable.slice(0,2).join(" ");if(usable.length===1)return usable[0];return"LOGO";}function splitBrandLines(text){text=squeezeSpaces(text);const parts=text.split(" ").filter(Boolean);if(parts.length>=2&&text.length>8){}else if(text.length<=12)return[text];if(parts.length<2)return[text];let best=[text],diff=999;for(let i=1;i<parts.length;i++){const a=parts.slice(0,i).join(" "),b=parts.slice(i).join(" "),d=Math.abs(a.length-b.length);if(d<diff){best=[a,b];diff=d;}}return best;}function loadWorkspaceImage(src){return new Promise((resolve,reject)=>{const im=new Image();im.crossOrigin="anonymous";im.onload=()=>resolve(im);im.onerror=reject;im.src=src;});}function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}function drawEtchedGlyph(ctx,g,x,y,size,squeeze){ctx.save();ctx.translate(x,y);ctx.scale(squeeze,1);ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="700 "+size+"px Georgia, Times New Roman, serif";ctx.globalCompositeOperation="multiply";ctx.globalAlpha=.24;ctx.fillStyle="rgba(20,20,20,.58)";ctx.fillText(g,size*.018,size*.024);ctx.globalAlpha=.34;ctx.lineWidth=Math.max(1.2,size*.026);ctx.strokeStyle="rgba(0,0,0,.42)";ctx.strokeText(g,0,0);ctx.fillStyle="rgba(25,25,25,.24)";ctx.fillText(g,0,0);ctx.globalCompositeOperation="screen";ctx.globalAlpha=.30;ctx.lineWidth=Math.max(1,size*.018);ctx.strokeStyle="rgba(255,255,255,.66)";ctx.strokeText(g,-size*.018,-size*.018);ctx.globalCompositeOperation="multiply";ctx.globalAlpha=.16;ctx.lineWidth=Math.max(1,size*.014);ctx.strokeStyle="rgba(0,0,0,.60)";ctx.strokeText(g,size*.018,size*.018);ctx.restore();}function drawCurvedLine(ctx,text,cx,cy,size,maxWidth,curveDepth){ctx.save();ctx.font="700 "+size+"px Georgia, Times New Roman, serif";const chars=String(text||"").split("");const widths=chars.map(ch=>Math.max(size*.22,ctx.measureText(ch).width));let raw=widths.reduce((a,b)=>a+b,0);let tracking=Math.max(size*.006,Math.min(size*.030,(maxWidth-raw)/Math.max(1,chars.length-1)));if(!isFinite(tracking))tracking=size*.012;let total=raw+tracking*Math.max(0,chars.length-1);let cursor=-total/2;chars.forEach((ch,i)=>{const w=widths[i];const flatMid=cursor+w/2;let n=total>0?flatMid/(total/2):0;n=Math.max(-1,Math.min(1,n));const theta=n*1.05;const curvedX=cx+Math.sin(theta)*(maxWidth*.50);const y=cy+curveDepth*(1-Math.cos(theta));const squeeze=Math.max(.58,Math.cos(theta)*.98);const oldAlpha=ctx.globalAlpha;drawEtchedGlyph(ctx,ch,curvedX,y,size,squeeze);ctx.globalAlpha=oldAlpha;cursor+=w+tracking;});ctx.restore();}function drawPrintedLines(ctx,lines,cx,cy,size,gap){ctx.save();ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="800 "+size+"px Georgia, Times New Roman, serif";lines.forEach((line,i)=>{const y=cy+(i-(lines.length-1)/2)*gap;ctx.globalCompositeOperation="multiply";ctx.globalAlpha=.42;ctx.fillStyle="rgba(35,35,35,.58)";ctx.fillText(line,cx,y);ctx.globalCompositeOperation="screen";ctx.globalAlpha=.16;ctx.strokeStyle="rgba(255,255,255,.70)";ctx.lineWidth=Math.max(1,size*.025);ctx.strokeText(line,cx-size*.01,y-size*.01);});ctx.restore();}function drawLabel(ctx,lines,cx,cy,size,mode){ctx.save();ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="800 "+size+"px Arial, sans-serif";const widest=Math.max(...lines.map(l=>ctx.measureText(l).width));const padX=size*.75,padY=size*.55,gap=size*1.05;const w=Math.min(ctx.canvas.width*.36,widest+padX*2),h=lines.length*gap+padY*1.35;const x=cx-w/2,y=cy-h/2;ctx.globalCompositeOperation="source-over";ctx.globalAlpha=mode==="sticker"?.82:.72;ctx.fillStyle=mode==="sticker"?"rgba(255,255,255,.88)":"rgba(248,248,242,.78)";roundRect(ctx,x,y,w,h,size*.28);ctx.fill();ctx.globalAlpha=.28;ctx.strokeStyle="rgba(0,0,0,.45)";ctx.lineWidth=Math.max(1,size*.035);ctx.stroke();lines.forEach((line,i)=>{ctx.globalAlpha=.78;ctx.fillStyle="rgba(20,20,20,.88)";ctx.fillText(line,cx,cy+(i-(lines.length-1)/2)*gap);});ctx.restore();}function inferSurfaceMode(label){if(SURFACE_MODE&&SURFACE_MODE!=="auto")return SURFACE_MODE;const t=lower(label);if(t.includes("rim")||t.includes("tire")||t.includes("sidewall")||t.includes("outer ring")||t.includes("edge")||t.includes("lip"))return"ring";if(t.includes("curve")||t.includes("curvature")||t.includes("wrap")||t.includes("follow")||t.includes("around")||t.includes("contour")||t.includes("bottle")||t.includes("engrave")||t.includes("etch"))return"curved";return"center";}function isSurfaceAdjustmentRequest(label){const t=lower(label);return (t.includes("curve")||t.includes("curvature")||t.includes("wrap")||t.includes("follow")||t.includes("around")||t.includes("contour")||t.includes("surface")||t.includes("cure"))&&(t.includes("etch")||t.includes("etching")||t.includes("engrave")||t.includes("engraving")||t.includes("text")||t.includes("brand")||t.includes("label")||t.includes("logo")||t.includes("word"));}function lastBrandText(){if(LAST_BRAND_TEXT)return LAST_BRAND_TEXT;for(let i=DATA.edits.length-1;i>=0;i--){let e=String(DATA.edits[i]||"");let m=e.match(/branding:\s*(.+)$/i);if(m&&m[1])return m[1].trim();}return"";}function reapplyCurvedSurface(){let txt=lastBrandText();if(!txt){setStatus("Tell me the exact text to curve, like: engrave Living Water on the bottle.");return true;}SURFACE_MODE="curved";BRAND_MODE="engrave";let prev=DATA.history.pop();if(prev&&prev.image&&img){DATA.currentImage=prev.image;DATA.image=prev.image;img.src=prev.image;DATA.edits.push("Recurved last branding from previous image");renderEdits();}else if(DATA.originalImage&&img&&DATA.currentImage!==DATA.originalImage){DATA.currentImage=DATA.originalImage;DATA.image=DATA.originalImage;img.src=DATA.originalImage;DATA.edits.push("Recurved last branding from original image");renderEdits();}applyLocalBrandingEdit("engrave "+txt+" on the bottle");return true;}function applyLocalPremiumPolish(label){const src=DATA.currentImage||DATA.image||DATA.originalImage||"";if(!src){setStatus("No workspace image found.");return Promise.resolve(false);}setBusy(true);setStatus("Applying visible local material polish while preserving exact text...");return loadWorkspaceImage(src).then(im=>{const c=document.createElement("canvas");c.width=im.naturalWidth||im.width;c.height=im.naturalHeight||im.height;const ctx=c.getContext("2d");try{ctx.filter="contrast(1.16) saturate(1.08) brightness(1.045)";}catch(e){}ctx.drawImage(im,0,0,c.width,c.height);try{ctx.filter="none";}catch(e){}const w=c.width,h=c.height;ctx.globalCompositeOperation="soft-light";let g=ctx.createLinearGradient(0,0,w,0);g.addColorStop(0,"rgba(0,0,0,.16)");g.addColorStop(.22,"rgba(255,255,255,.12)");g.addColorStop(.44,"rgba(0,0,0,.10)");g.addColorStop(.62,"rgba(255,255,255,.18)");g.addColorStop(.82,"rgba(0,0,0,.13)");g.addColorStop(1,"rgba(255,255,255,.06)");ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.globalCompositeOperation="screen";let shine=ctx.createLinearGradient(w*.18,0,w*.78,0);shine.addColorStop(0,"rgba(255,255,255,0)");shine.addColorStop(.48,"rgba(255,255,255,.13)");shine.addColorStop(.52,"rgba(255,255,255,.20)");shine.addColorStop(1,"rgba(255,255,255,0)");ctx.fillStyle=shine;ctx.fillRect(0,0,w,h);ctx.globalCompositeOperation="multiply";let edge=ctx.createLinearGradient(0,0,w,0);edge.addColorStop(0,"rgba(0,0,0,.04)");edge.addColorStop(.5,"rgba(0,0,0,0)");edge.addColorStop(1,"rgba(0,0,0,.08)");ctx.fillStyle=edge;ctx.fillRect(0,0,w,h);ctx.globalCompositeOperation="source-over";const v=ctx.createRadialGradient(w*.5,h*.46,Math.min(w,h)*.18,w*.5,h*.5,Math.max(w,h)*.72);v.addColorStop(0,"rgba(255,255,255,0)");v.addColorStop(1,"rgba(0,0,0,.14)");ctx.fillStyle=v;ctx.fillRect(0,0,w,h);const out=c.toDataURL("image/jpeg",.96);applyImage({image:out,sourceImage:""},label||"Visible local material polish","Applied a visible local premium material polish. Exact visible text and the current image were preserved.");setBusy(false);return true;}).catch(()=>{setStatus("Could not apply local premium polish.");setBusy(false);return false;});}function isLocalPremiumPolish(label){const t=lower(label);return t.includes("premium finish")||t.includes("local polish")||t.includes("material: premium")||t.includes("material polish")||t.includes("premium material");}function applyLocalBrandingEdit(label){const src=DATA.currentImage||DATA.image||DATA.originalImage||"";if(!src){setStatus("No workspace image found.");return Promise.resolve(false);}setBusy(true);setStatus("Applying preserve-first branding edit locally...");return loadWorkspaceImage(src).then(im=>{const c=document.createElement("canvas");c.width=im.naturalWidth||im.width;c.height=im.naturalHeight||im.height;const ctx=c.getContext("2d");ctx.drawImage(im,0,0,c.width,c.height);const txt=extractBrandText(label);LAST_BRAND_TEXT=txt;const lines=splitBrandLines(txt);const mode=inferBrandMode(label);const surface=inferSurfaceMode(label);const two=lines.length>1;let cx=Math.round(c.width*.50);let cy=Math.round(c.height*(two?.535:.545));if(mode==="engrave"){let size=two?Math.max(13,Math.round(c.width*.023)):Math.max(15,Math.round(c.width*.028));let gap=Math.round(size*1.06);let mw=Math.round(c.width*(surface==="curved"?.135:surface==="ring"?.22:.155));let curve=Math.max(3,Math.round(size*(surface==="curved"?.45:surface==="ring"?.34:.10)));if(two){drawCurvedLine(ctx,lines[0],cx,cy-gap*.52,size,mw,curve);drawCurvedLine(ctx,lines[1],cx,cy+gap*.52,size,mw,curve);}else{drawCurvedLine(ctx,lines[0],cx,cy,size,mw,curve);}}else if(mode==="label"||mode==="sticker"){const size=two?Math.max(14,Math.round(c.width*.025)):Math.max(16,Math.round(c.width*.030));drawLabel(ctx,lines,cx,cy,size,mode);}else{const size=two?Math.max(16,Math.round(c.width*.030)):Math.max(18,Math.round(c.width*.036));const gap=Math.round(size*1.05);drawPrintedLines(ctx,lines,cx,cy,size,gap);}const out=c.toDataURL("image/jpeg",.92);applyImage({image:out,sourceImage:""},"Preserve-first branding: "+txt,"Applied "+mode+" branding with "+surface+" surface placement. Same item and material were kept.");setBusy(false);return true;}).catch(()=>{setStatus("Could not apply local branding edit.");setBusy(false);return false;});}function strongFeaturePrompt(label){ const base=squeezeSpaces(String(label||"")); const t=lower(base); const subject=workspaceSubjectText(); function sameItemRules(extra){return extra+" Keep the same subject/object identity, same general camera angle, same studio background, and same overall composition unless the user clearly asks to transform the item. Make the requested change visually obvious enough for the user to notice immediately."; } if(subject.includes("water bottle")||subject.includes("bottle")){ if(t.includes("bottle material"))return sameItemRules("WATER BOTTLE MATERIAL FEATURE EDIT ONLY: refine the bottle material/finish in a premium realistic way. Preserve the exact bottle identity, cap, handle/carabiner, existing engraved or printed text exactly as it appears, camera angle, background, and composition. Do not add floating words, captions, watermarks, instruction text, or fake labels."); if(t.includes("cap")||t.includes("lid"))return sameItemRules("WATER BOTTLE CAP/LID FEATURE EDIT ONLY: improve only the cap, lid loop, drinking opening, or top hardware so the change is visible. Preserve the metal bottle body, existing engraved or printed text exactly as it appears, color/material, camera angle, background, and composition. No floating text, no captions, no watermarks."); if(t.includes("handle")||t.includes("carabiner"))return sameItemRules("WATER BOTTLE HANDLE/CARABINER FEATURE EDIT ONLY: refine only the carry handle, clip, loop, or carabiner hardware so it looks stronger and more premium. Preserve the bottle body, cap, existing engraved or printed text exactly as it appears, camera angle, background, and composition. No floating text, no captions, no watermarks."); if(t.includes("engraving")||t.includes("text"))return "WATER BOTTLE TEXT/ENGRAVING EDIT ONLY: preserve the same water bottle and material. If changing text, place it on the bottle surface only. If preserving existing text, keep it exactly as it appears. Never place words floating across the image. Never add captions, watermarks, instruction words, or unrelated text."; if(t.includes("shape")||t.includes("proportions"))return sameItemRules("WATER BOTTLE SHAPE FEATURE EDIT ONLY: refine the silhouette/proportions in a subtle premium way while preserving the same water bottle concept, cap/handle style, existing engraved or printed text exactly as it appears, camera angle, background, and composition. No floating text, no captions, no watermarks."); if(t.includes("color")||t.includes("accent"))return sameItemRules("WATER BOTTLE COLOR/ACCENT EDIT ONLY: add a tasteful accent color or finish treatment while preserving the bottle identity, cap/handle, existing engraved or printed text exactly as it appears, camera angle, background, and composition. No floating text, no captions, no watermarks."); if(t.includes("functional"))return sameItemRules("WATER BOTTLE FUNCTIONAL DETAILS FEATURE EDIT ONLY: add or refine practical details like grip texture, insulation cues, base ring, or measurement marks only if they belong on the bottle. Preserve the existing engraved or printed text exactly as it appears. No floating text, no captions, no watermarks."); if(t.includes("packaging"))return sameItemRules("Show matching premium water bottle retail packaging beside or slightly behind the same bottle while keeping the bottle as the main subject. Preserve any existing bottle engraving exactly as it appears. The packaging may have simple abstract branding only; no readable instruction text, no watermarks, no floating words."); if(t.includes("variation"))return "WATER BOTTLE VARIATIONS: produce a clean product concept board with three distinct realistic water bottle options side by side. All three must clearly be water bottles. Make the options visibly different in finish, cap/handle detail, accent color, or silhouette. Do not place any floating words over the image. Do not render captions, labels, watermarks, prompt words, instruction words, or the phrase Create EXACTLY. If text appears on a bottle, keep it subtle and physically attached to the bottle only; never across the background."; if(t.includes("premium finish"))return "LOCAL_PREMIUM_POLISH"; }if(subject.includes("toaster")){ if(t.includes("toaster controls"))return "TOASTER CONTROLS FEATURE EDIT ONLY: change ONLY the controls area, but make it visibly obvious. Redesign the browning dial into a more premium larger dial with a clear raised outer ring, numbered browning scale, stronger tick marks, and one small indicator dot. Make the lever look more premium with a slightly refined shape and cleaner shadow. You may add one tiny related indicator/button near the dial if it helps the control area read clearly. Preserve the toaster body material/color, slots, feet/base, camera angle, background, and composition. Do not repaint the toaster body."; if(t.includes("toaster feet/base"))return "TOASTER FEET/BASE FEATURE EDIT ONLY: change ONLY the lower feet and base trim, but make it visibly obvious. Make the feet larger, more rounded, and more premium; make the black lower base/trim cleaner, thicker, and more defined like an anti-slip platform. Preserve the toaster body material/color, slots, lever, dial, top surface, camera angle, background, and composition. Do not repaint the main toaster body."; if(t.includes("toaster slots"))return "TOASTER SLOTS FEATURE EDIT ONLY: change ONLY the bread-slot area so the improvement is clearly visible. Make the slots wider, cleaner, more symmetrical, and more crisply trimmed with premium dark inner slot detail. Preserve the toaster body material/color, controls, feet/base, camera angle, background, and composition. Do not repaint the main toaster body."; if(t.includes("toaster details"))return "TOASTER DETAILS FEATURE EDIT ONLY: add only physical appliance details such as small vent holes, subtle crumb tray seam, tiny perforations, edge seam, or slot trim. Do NOT add words, letters, fake labels, fake brand names, watermark text, LOGO text, or nonsensical markings. Preserve toaster body material/color, slots, controls, feet/base, camera angle, background, and composition."; if(t.includes("toaster comfort"))return "TOASTER COMFORT FEATURE EDIT ONLY: improve only comfort and safe-touch cues in a visible way. Add subtle cool-touch side-panel cues, softened touchpoint edges, a more comfortable lever touch surface, and small safe-touch visual details. Preserve the toaster body material/color, slots, dial, feet/base, camera angle, background, and composition. Do not repaint the whole toaster."; if(t.includes("toaster material"))return "Change only the toaster material/finish into a clearly visible premium appliance finish such as brushed black stainless steel, satin stainless, matte ceramic, or polished chrome. Keep the same toaster identity, slots, lever, dial, feet/base, camera angle, studio background, and overall composition."; if(t.includes("toaster color"))return "Change only the toaster color/accent treatment in a clearly visible way. Keep the same toaster identity, slots, controls, feet/base, camera angle, studio background, and overall composition."; if(t.includes("toaster branding"))return "Apply only a small tasteful toaster front badge or tiny appliance branding. Keep the same toaster body, material/color, slots, controls, feet/base, camera angle, and composition. Do not cover the toaster with large text."; if(t.includes("toaster packaging"))return "Show matching premium toaster retail packaging beside or slightly behind the same toaster while keeping the toaster as the main subject. The packaging should read clearly as a real retail box with attractive product presentation. Do not replace the toaster."; if(t.includes("toaster variations"))return "Create one single image that shows EXACTLY THREE distinct premium toaster design variations in a clean 3-up presentation. Show three different toaster options side by side or in a neat concept board. Each option must clearly be a toaster, but each should be visibly different from the others in at least two areas such as material/color, controls, base, or slot trim. Do not return only one toaster."; if(t.includes("toaster premium finish"))return "Render the same toaster as a high-end premium appliance product shot with especially refined finish quality, premium studio lighting, crisp realism, and better product presentation while preserving the toaster identity."; } if(subject.includes("fire extinguisher")||subject.includes("extinguisher")){ if(t.includes("gauge"))return sameItemRules("FIRE EXTINGUISHER GAUGE FEATURE EDIT ONLY: make the pressure gauge clearer, larger, more premium, and easier to read. Preserve canister, hose/nozzle, handle, safety pin, label area, and composition."); if(t.includes("hose")||t.includes("nozzle"))return sameItemRules("FIRE EXTINGUISHER HOSE/NOZZLE FEATURE EDIT ONLY: refine the hose and nozzle so they look more practical, premium, and clearly visible. Preserve the canister, handle, gauge, label area, and composition."); if(t.includes("handle"))return sameItemRules("FIRE EXTINGUISHER HANDLE FEATURE EDIT ONLY: improve the trigger handle/safety pin area with a more ergonomic premium look. Preserve the canister, hose/nozzle, gauge, label area, and composition."); if(t.includes("label")||t.includes("branding"))return sameItemRules("FIRE EXTINGUISHER LABEL/BRANDING EDIT ONLY: add or refine a realistic safety label area or tasteful product badge. Preserve the extinguisher shape, handle, hose/nozzle, gauge, and composition."); if(t.includes("packaging"))return sameItemRules("Show matching safety-product packaging or a wall-mount kit beside the extinguisher while keeping the extinguisher as the main subject."); if(t.includes("variations"))return "Create one single image showing EXACTLY THREE distinct premium fire extinguisher design variations in a clean 3-up presentation. Each must remain a realistic fire extinguisher with canister, handle, gauge, and hose/nozzle, but each option should be visibly different."; } if(subject.includes("soap dispenser")||subject.includes("dispenser")){ if(t.includes("pump"))return sameItemRules("SOAP DISPENSER PUMP FEATURE EDIT ONLY: improve only the pump/nozzle/collar area so it looks more premium and practical. Make the pump change clearly visible. Preserve the bottle body, material family, camera angle, and composition."); if(t.includes("label")||t.includes("branding"))return sameItemRules("SOAP DISPENSER LABEL/BRANDING EDIT ONLY: add or refine a tasteful front label or small branding treatment. Preserve the dispenser body, pump, material, angle, and composition."); if(t.includes("base"))return sameItemRules("SOAP DISPENSER BASE FEATURE EDIT ONLY: add or refine a non-slip base or cleaner bottom detail. Preserve body, pump, material, angle, and composition."); if(t.includes("variations"))return "Create one single image showing EXACTLY THREE distinct premium soap dispenser design variations in a clean 3-up presentation. Each must remain a soap dispenser with pump and bottle body, but each option should be visibly different."; } if(subject.includes("rim")||subject.includes("wheel")){ if(t.includes("spoke"))return sameItemRules("RIM SPOKES FEATURE EDIT ONLY: change only the spoke pattern so the difference is obvious, such as sharper split spokes or a more performance-focused spoke layout. Preserve the rim identity, center, lip, camera angle, and composition."); if(t.includes("lip"))return sameItemRules("RIM LIP FEATURE EDIT ONLY: deepen or polish only the outer lip area. Preserve spokes, center cap, bolts, camera angle, and composition."); if(t.includes("center"))return sameItemRules("RIM CENTER CAP FEATURE EDIT ONLY: refine the center cap/badge area only. Preserve spokes, lip, bolts, camera angle, and composition."); if(t.includes("variation"))return "Create one single image showing EXACTLY THREE distinct premium tire rim variations in a clean 3-up presentation. Each must remain a tire rim/wheel with visible spokes, lip, center cap, and performance styling."; } if(subject.includes("guitar")){ if(t.includes("body"))return sameItemRules("GUITAR BODY FEATURE EDIT ONLY: refine only the guitar body shape/contour so the change is visible and stage-ready. Preserve neck, headstock, pickups, hardware position, camera angle, and composition."); if(t.includes("pickup"))return sameItemRules("GUITAR PICKUPS FEATURE EDIT ONLY: change only the pickups/electronics area. Preserve body finish, neck, bridge, headstock, camera angle, and composition."); if(t.includes("hardware"))return sameItemRules("GUITAR HARDWARE FEATURE EDIT ONLY: refine only the bridge, tuners, knobs, or hardware details. Preserve body shape, finish, neck, pickups, angle, and composition."); if(t.includes("graphics")||t.includes("artwork"))return sameItemRules("GUITAR GRAPHICS EDIT ONLY: add or refine stage-ready artwork/graphics on the body. Preserve guitar shape, hardware, pickups, neck, camera angle, and composition."); if(t.includes("variation"))return "Create one single image showing EXACTLY THREE distinct wild guitar concept variations in a clean 3-up presentation. Each must remain a guitar with visible body, neck, pickups, and hardware."; } if(subject.includes("book cover")||subject.includes("cover")){ if(t.includes("title"))return sameItemRules("BOOK COVER TITLE FEATURE EDIT ONLY: improve the title treatment so it is clearer, stronger, and more attractive. Preserve the core cover subject, mood, and layout unless the user asks for a redesign."); if(t.includes("typography")||t.includes("author"))return sameItemRules("BOOK COVER TYPOGRAPHY FEATURE EDIT ONLY: refine typography, author/name placement, spacing, and readability. Preserve the artwork and overall mood."); if(t.includes("artwork"))return sameItemRules("BOOK COVER ARTWORK FEATURE EDIT ONLY: enrich the central artwork while preserving the book topic, genre mood, and title/author structure."); if(t.includes("variation"))return "Create one single image showing EXACTLY THREE distinct book cover design variations in a clean 3-up presentation. Each must match the same book/story context but use visibly different layout, palette, or artwork direction."; } if(t.includes("variations")||t.includes("3 strong options")||t.includes("3 premium options")||t.includes("three options")){ return "Show a clean product concept board with three distinct design variations of this same item arranged side by side. Keep all three clearly the same item type, but make each option visibly different in material, color, details, layout, or feature treatment. Do not return only one item. Do not render floating words, captions, watermarks, prompt text, or instruction words."; } if(t.includes("packaging"))return sameItemRules("Show matching premium retail packaging beside or slightly behind this exact item while keeping the item as the main subject. The packaging should read clearly as a real product box, not replace the item."); if(t.includes("branding")||t.includes("brand tag")||t.includes("badge")||t.includes("logo"))return sameItemRules("Apply a tasteful, realistic small branding/badge treatment to this exact item. Keep branding proportional and attractive. Do not cover the object with large random text."); if(t.includes("material"))return sameItemRules("Change only the material/finish of this exact item in a clearly visible premium way. Preserve the item shape, feature layout, camera angle, background, and composition."); if(t.includes("color")||t.includes("pattern"))return sameItemRules("Change only the color/pattern/accent treatment of this exact item in a tasteful, visible way. Preserve the item shape, feature layout, camera angle, background, and composition."); if(t.includes("comfort"))return sameItemRules("Improve visible comfort/use-feel cues for this exact item, such as softened touchpoints, better grip areas, ergonomic cues, or safe-touch areas. Make it visible but preserve the object identity and composition."); return ""; }function guidedPrompt(label){const base=squeezeSpaces(String(label||""));const stronger=strongFeaturePrompt(base);if(stronger)return stronger;if(EDIT_PATH==="transform"||isExplicitTransform(base)){return "Transform this exact workspace item as requested: "+base+". A transformation may change the object only because the user asked for it. Keep quality high and show the updated visual first.";}if(EDIT_PATH==="material"||isExplicitMaterial(base)){return "Change only the material or finish as requested: "+base+". Preserve the same exact object, shape, proportions, details, camera angle, and composition.";}if(EDIT_PATH==="structure"||isExplicitStructure(base)){return "Change only the requested structural or feature detail: "+base+". Make that feature change clearly visible. Preserve the same material, finish, design family, camera angle, and composition unless explicitly asked otherwise.";}if(/\b(variations?|options?)\b/i.test(base)){return "Show a clean product concept board with three distinct design options for this same item, arranged side by side. Keep all three clearly in the same product family, and make each option visibly different from the others. Do not return a single-item refinement only. Do not place floating words, captions, labels, watermarks, prompt text, instruction words, or the phrase Create EXACTLY anywhere in the image.";}return "Preserve this exact workspace item by default. Apply only this edit: "+base+". Make the requested change visually obvious enough for the user to see. If the request is unclear, make the closest safe design improvement to the current item instead of switching objects. Do not change object identity, material, finish, shape, proportions, camera angle, lighting, or composition unless the user explicitly asked. Do not add floating words, captions, labels, watermarks, prompt text, or instruction text."; }function safeLocalButtonAction(label){const t=lower(label);if(t.includes("advanced")||t.includes("size")||t.includes("proportion")||t.includes("shape")||t.includes("handle")||t.includes("carabiner")||t.includes("hardware")||t.includes("comfort")||t.includes("color")||t.includes("pattern")||t.includes("functional")||t.includes("details")||t.includes("variations")||t.includes("options")||t.includes("packaging")||t.includes("cap")||t.includes("lid")||t.includes("redraw")||t.includes("generate")){setStatus("Advanced AI shape/design edits are locked in R10.41 because they caused watermarks or changed existing names. Use Material polish, local text/engraving, Save, Restore, or generate a new concept from main Simo later.");return true;}return false;}function sendAction(label){try{const request=String(label||"").trim();if(!request){setStatus("Type a custom edit first.");return;}if(!(window.opener&&!window.opener.closed&&window.opener.SimoWorkspaceBridge&&typeof window.opener.SimoWorkspaceBridge.requestEdit==="function")){setStatus("Simo Design Workspace edit owner is unavailable. Return to the main Simo tab and reopen this workspace.");return;}setBusy(true);setStatus("Simo is understanding your request and editing the current image…");window.opener.SimoWorkspaceBridge.requestEdit(DATA,request).then(payload=>{setBusy(false);if(payload&&payload.ok&&payload.image){applyImage(payload,request,payload.message||"Simo applied your requested edit.");}else{setStatus((payload&&(payload.message||payload.error))||"Simo could not complete that edit.");}}).catch(e=>{setBusy(false);setStatus("Edit failed: "+(e&&e.message?e.message:e));});}catch(e){setBusy(false);setStatus("Could not complete this workspace edit.");}}setTimeout(()=>{try{const box=document.createElement("div");box.style.cssText="margin:14px 0 10px;padding:12px;border-radius:16px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.10)";box.innerHTML=`<div style="font-size:11px;letter-spacing:.12em;font-weight:900;color:#9fc5ff;margin-bottom:8px">EDIT PATH</div><div style="display:flex;flex-wrap:wrap;gap:8px"><button type="button" data-path="preserve">Preserve/Add-on</button><button type="button" data-path="material">Change Material</button><button type="button" data-path="structure">Change Shape/Feature</button><button type="button" data-path="transform">Transform Item</button></div><div style="font-size:11px;letter-spacing:.12em;font-weight:900;color:#9fc5ff;margin:12px 0 8px">BRANDING STYLE</div><div style="display:flex;flex-wrap:wrap;gap:8px"><button type="button" data-brand="auto">Auto</button><button type="button" data-brand="engrave">Engrave/Etch</button><button type="button" data-brand="print">Printed/Decal</button><button type="button" data-brand="label">Flat Label</button><button type="button" data-brand="sticker">Sticker/Tag</button></div><div style="font-size:11px;letter-spacing:.12em;font-weight:900;color:#9fc5ff;margin:12px 0 8px">SURFACE PLACEMENT</div><div style="display:flex;flex-wrap:wrap;gap:8px"><button type="button" data-surface="auto">Auto Surface</button><button type="button" data-surface="curved">Curved Body</button><button type="button" data-surface="center">Centered Flat</button><button type="button" data-surface="ring">Ring/Edge</button><button type="button" data-recurve="1">Re-curve Last Branding</button><button type="button" data-clear-path="1">Clear Choices</button></div><div id="pathHint" style="font-size:12px;color:#c9d9f4;margin-top:9px;line-height:1.35">Default: preserve the same item. Auto chooses engraving, printed text, label, or sticker from the words you use.</div>`;const custom=document.querySelector(".custom");if(custom&&custom.parentNode)custom.parentNode.insertBefore(box,custom);box.querySelectorAll("[data-path]").forEach(b=>b.addEventListener("click",()=>{EDIT_PATH=b.dataset.path;box.querySelectorAll("[data-path]").forEach(x=>x.style.outline="none");b.style.outline="2px solid rgba(110,168,255,.75)";const hint=document.getElementById("pathHint");if(hint)hint.textContent=EDIT_PATH==="preserve"?"Preserve mode: add branding/text/details without changing the item.":EDIT_PATH==="material"?"Material mode: material or finish can change, but shape/item stay locked.":EDIT_PATH==="structure"?"Shape/Feature mode: only requested feature/shape changes.":"Transform mode: user is intentionally changing the item.";setStatus("Edit path selected: "+EDIT_PATH);}));box.querySelectorAll("[data-brand]").forEach(b=>b.addEventListener("click",()=>{BRAND_MODE=b.dataset.brand;box.querySelectorAll("[data-brand]").forEach(x=>x.style.outline="none");b.style.outline="2px solid rgba(110,168,255,.75)";setStatus("Branding style selected: "+BRAND_MODE);}));box.querySelectorAll("[data-surface]").forEach(b=>b.addEventListener("click",()=>{SURFACE_MODE=b.dataset.surface;box.querySelectorAll("[data-surface]").forEach(x=>x.style.outline="none");b.style.outline="2px solid rgba(110,168,255,.75)";setStatus("Surface placement selected: "+SURFACE_MODE);}));const recurveBtn=box.querySelector("[data-recurve]");if(recurveBtn)recurveBtn.addEventListener("click",()=>{reapplyCurvedSurface();});const clearBtn=box.querySelector("[data-clear-path]");if(clearBtn)clearBtn.addEventListener("click",()=>{EDIT_PATH="preserve";BRAND_MODE="auto";SURFACE_MODE="auto";box.querySelectorAll("[data-path],[data-brand],[data-surface]").forEach(x=>x.style.outline="none");const hint=document.getElementById("pathHint");if(hint)hint.textContent="Choices cleared. Default: preserve the same item and auto-detect branding/surface style.";setStatus("Choices cleared. Preserve/Add-on, Auto branding, and Auto Surface are active.");});}catch(e){}},0);function pullLatest(){try{if(window.opener&&!window.opener.closed&&window.opener.SimoWorkspaceBridge){setStatus("Pulling latest image…");window.opener.SimoWorkspaceBridge.getLatestImage(DATA.currentImage,DATA).then(payload=>{if(payload){applyImage(payload,"Pulled latest image","Pulled latest image into workspace.");}else{setStatus("No newer image found yet.");}});}else{setStatus("Main Simo tab bridge not found.");}}catch(e){setStatus("Could not pull latest image.");}}function directSaveReadStoreFrom(storage,key){try{const parsed=JSON.parse(storage.getItem(key)||"[]");if(Array.isArray(parsed))return{obj:parsed,arr:parsed,mode:"array"};if(parsed&&Array.isArray(parsed.items))return{obj:parsed,arr:parsed.items,mode:"items"};if(parsed&&Array.isArray(parsed.builds))return{obj:parsed,arr:parsed.builds,mode:"builds"};if(parsed&&Array.isArray(parsed.library))return{obj:parsed,arr:parsed.library,mode:"library"};}catch(e){}return{obj:[],arr:[],mode:"array"};}function directSaveWriteStoreTo(storage,key,store,arr){try{if(store.mode==="array"){storage.setItem(key,JSON.stringify(arr));return true;}const obj=store.obj&&typeof store.obj==="object"?store.obj:{};obj[store.mode]=arr;storage.setItem(key,JSON.stringify(obj));return true;}catch(e){return false;}}function directSaveGetMainStorage(){try{if(window.opener&&!window.opener.closed&&window.opener.localStorage){return window.opener.localStorage;}}catch(e){}try{return window.localStorage;}catch(e){return null;}}function directSaveCompressedImage(){return new Promise(resolve=>{try{const src=DATA.currentImage||DATA.image||DATA.displayImageUrl||DATA.sourceImage||DATA.originalImage||"";const sourceImg=document.getElementById("workspaceImage");const im=new Image();im.crossOrigin="anonymous";im.onload=()=>{try{const maxSide=760;let w=im.naturalWidth||im.width||760;let h=im.naturalHeight||im.height||760;const scale=Math.min(1,maxSide/Math.max(w,h));w=Math.max(1,Math.round(w*scale));h=Math.max(1,Math.round(h*scale));const c=document.createElement("canvas");c.width=w;c.height=h;const ctx=c.getContext("2d");ctx.drawImage(im,0,0,w,h);const out=c.toDataURL("image/jpeg",.76);resolve(out&&out.indexOf("data:image/")===0?out:src);}catch(e){resolve(src);}};im.onerror=()=>resolve(src);im.src=(sourceImg&&sourceImg.src)||src;}catch(e){resolve(DATA.currentImage||DATA.image||"");}});}function directSaveMakeItem(imageOverride){const title=DATA.title||DATA.projectTitle||DATA.name||"Simo Workspace Design";const image=imageOverride||DATA.currentImage||DATA.image||DATA.displayImageUrl||DATA.sourceImage||DATA.originalImage||"";const sourceImage=DATA.currentSourceImage||DATA.sourceImage||"";const edits=Array.isArray(DATA.edits)?DATA.edits.slice():[];const now=new Date().toISOString();return{id:"simo_workspace_saved_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,8),title:"SAVED WORKSPACE — "+title+(edits.length?" — Edited Workspace Version":""),name:"SAVED WORKSPACE — "+title+(edits.length?" — Edited Workspace Version":""),projectTitle:title,prompt:"Saved directly from isolated live workspace: "+title,latestPrompt:edits.length?edits[edits.length-1]:title,sourcePrompt:title,type:"visual",kind:"visual",source:"simo_live_workspace_isolated_R10_37",category:"product",domain:"product",tags:["visual","design","workspace","image-first","edited-version","saved-workspace"],notes:"Legacy direct-save helper retained but not used by canonical save. Canonical saves are owned by Design Library.",imageUrl:image,image_url:image,generated_visual_url:image,generatedImageUrl:image,previewUrl:image,thumbnail:image,visualUrl:image,displayImageUrl:image,sourceImageUrl:sourceImage,originalImageUrl:DATA.originalImage||"",workspaceEdits:edits,workspaceSubject:DATA.workspaceSubject||title,workspaceOpen:true,simoWorkspaceVersion:"R10.41",createdAt:now,updatedAt:now,html:""};}function directSaveWriteItemToStorage(storage,item){let wrote=false;if(!storage)return false;["simo_builder_library_v5_1_builder_first","simo_builder_library_v5","simo_visual_concepts_library_v1","simo_builder_library_v4","simo_builder_library","simo_library_items"].forEach(key=>{try{const store=directSaveReadStoreFrom(storage,key);const arr=store.arr||[];arr.unshift(item);if(arr.length>120)arr.length=120;if(directSaveWriteStoreTo(storage,key,store,arr))wrote=true;}catch(e){}});try{storage.setItem("simo_workspace_last_saved_item_v1",JSON.stringify(item));storage.setItem("simo_workspace_last_saved_item_v2",JSON.stringify(item));storage.setItem("simo_workspace_force_library_item_v1",JSON.stringify(item));}catch(e){}return wrote;}function directSaveToLibraryStores(imageOverride){const item=directSaveMakeItem(imageOverride);let wrote=false;try{wrote=directSaveWriteItemToStorage(directSaveGetMainStorage(),item)||wrote;}catch(e){}try{wrote=directSaveWriteItemToStorage(window.localStorage,item)||wrote;}catch(e){}try{window.dispatchEvent(new CustomEvent("simo:library-updated",{detail:{source:"workspace-direct-r1035",item:item}}));if(window.opener&&!window.opener.closed){window.opener.dispatchEvent(new CustomEvent("simo:library-updated",{detail:{source:"workspace-direct-r1035",item:item}}));try{if(typeof window.opener.refreshBuilderLibrary==="function")window.opener.refreshBuilderLibrary();}catch(e){}try{if(typeof window.opener.renderBuilderLibrary==="function")window.opener.renderBuilderLibrary();}catch(e){}try{if(typeof window.opener.openBuilderLibrary==="function")setTimeout(()=>window.opener.openBuilderLibrary(),100);}catch(e){}}}catch(e){}return{item:item,wrote:wrote};}function directServerSave(item){let url="/api/library/save";try{if(window.opener&&!window.opener.closed&&window.opener.location&&window.opener.location.origin){url=window.opener.location.origin+"/api/library/save";}}catch(e){}return fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(item)}).then(res=>res.ok?res.json().catch(()=>({ok:true})):Promise.reject(new Error("server status "+res.status))).catch(err=>({ok:false,error:String(err&&err.message?err.message:err)}));}function save(){setBusy(true);setStatus("Saving exact current edited image to Design Library…");directSaveCompressedImage().then(saveImage=>{DATA.currentImage=saveImage||DATA.currentImage;DATA.image=DATA.currentImage;if(img&&saveImage)img.src=saveImage;if(!(window.opener&&!window.opener.closed&&window.opener.SimoLibrary&&typeof window.opener.SimoLibrary.saveWorkspace==="function")){throw new Error("Design Library save owner is unavailable. Return to the main Simo tab and reopen this workspace.");}const payload=Object.assign({},DATA,{id:DATA.id||DATA.workspaceId||DATA.projectId||"",currentImage:DATA.currentImage,image:DATA.currentImage,displayImageUrl:DATA.currentImage,workspaceEdits:Array.isArray(DATA.edits)?DATA.edits.slice():[]});return window.opener.SimoLibrary.saveWorkspace(payload);}).then(result=>{setBusy(false);if(result&&result.ok&&result.item){setStatus("Saved and verified in Design Library.");try{window.opener.dispatchEvent(new CustomEvent("simo:library-updated",{detail:{source:"workspace-canonical-save",item:result.item}}));}catch(e){}}else{throw new Error((result&&result.error)||"Design Library did not confirm the save.");}}).catch(e=>{setBusy(false);setStatus("Save failed: "+(e&&e.message?e.message:e));});}function open3d(){setStatus("3D is paused. Use this workspace for editing and saving.");alert("3D is paused for now. Use this workspace for editing and saving so Simo stays stable.");}document.getElementById("actions").innerHTML=labels.map(l=>`<button type="button" data-label="${l}">${l}</button>`).join("");document.querySelectorAll("[data-label]").forEach(b=>b.addEventListener("click",()=>sendAction(b.dataset.label)));document.getElementById("customBtn").addEventListener("click",()=>{const v=document.getElementById("customPrompt").value.trim();if(!v){setStatus("Type a custom edit first.");return;}sendAction(v);});document.getElementById("saveBtn").addEventListener("click",save);document.getElementById("pullBtn").addEventListener("click",pullLatest);document.getElementById("undoBtn").addEventListener("click",()=>{const prev=DATA.history.pop();if(prev&&prev.image&&img){DATA.currentImage=prev.image;DATA.image=prev.image;img.src=prev.image;DATA.edits.push("Undid last edit");setStatus("Undid the last workspace edit.");renderEdits();}else{setStatus("No workspace edit to undo yet.");}});document.getElementById("restoreBtn").addEventListener("click",()=>{if(DATA.originalImage&&img){if(DATA.currentImage&&DATA.currentImage!==DATA.originalImage){DATA.history.push({image:DATA.currentImage,label:"Before restore"});}DATA.currentImage=DATA.originalImage;DATA.image=DATA.originalImage;DATA.edits.push("Restored original image");img.src=DATA.originalImage;setStatus("Restored original image.");renderEdits();}});const zOut=document.getElementById("zoomOutBtn");const zIn=document.getElementById("zoomInBtn");const zReset=document.getElementById("zoomResetBtn");if(zOut)zOut.addEventListener("click",()=>{ZOOM_LEVEL-=.15;applyZoom();});if(zIn)zIn.addEventListener("click",()=>{ZOOM_LEVEL+=.15;applyZoom();});if(zReset)zReset.addEventListener("click",()=>{ZOOM_LEVEL=1;applyZoom();});applyZoom();renderEdits();<\/script></body></html>';
  }

  function removeLegacyWorkspaceOverlays() {
    ["#simoVcWorkspaceModal", ".simo-vc-workspace-modal", ".simo-workspace-modal", "[id*='WorkspaceModal']:not(#simoIsolatedWorkspaceModal)", "[class*='workspace-modal']:not(#simoIsolatedWorkspaceModal)"].forEach(function (sel) {
      try { document.querySelectorAll(sel).forEach(function (el) { if (el && el.id !== "simoIsolatedWorkspaceModal") el.remove(); }); } catch (e) {}
    });
  }

  function openWorkspaceTab(data) {
    removeLegacyWorkspaceOverlays();
    var blob = new Blob([workspaceTabHtml(data)], { type: "text/html" });
    var url = URL.createObjectURL(blob);
    var win = window.open(url, "_blank", "noopener=false");
    if (!win) setStatus("Popup blocked. Allow popups for workspace.");
    else setStatus("Opened isolated workspace tab.");
  }

  function openSourceImageWindow(src, title) {
    src = absoluteUrl(src || "");
    if (!src) {
      setStatus("No source image found.");
      return;
    }
    var win = window.open(src, "_blank", "noopener,noreferrer");
    if (!win) setStatus("Popup blocked. Allow popups for source image.");
    else setStatus("Opened source image.");
  }

  function previewWindowHtml(data) {
    var title = esc((data && data.title) || "Simo Preview");
    var src = esc((data && (data.currentImage || data.image)) || "");
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + title + '</title><style>html,body{margin:0;height:100%;background:#050b14;color:#eef4ff;font-family:Inter,system-ui,Segoe UI,Arial,sans-serif}.shell{min-height:100vh;display:grid;grid-template-rows:auto 1fr;background:radial-gradient(circle at 42% 40%,#142239 0,#050b14 45%,#030812 100%)}.top{padding:18px 24px;border-bottom:1px solid rgba(255,255,255,.10)}.top h1{margin:0;font-size:24px;line-height:1.1}.top p{margin:8px 0 0;color:#cddcf5}.stage{display:grid;place-items:center;padding:28px}.stage img{max-width:min(96vw,1200px);max-height:86vh;object-fit:contain;border-radius:22px;box-shadow:0 30px 90px rgba(0,0,0,.45);background:#fff}</style></head><body><div class="shell"><div class="top"><h1>' + title + '</h1><p>Read-only preview of the clicked saved design.</p></div><div class="stage"><img src="' + src + '" alt="' + title + '"></div></div></body></html>';
  }

  function openModalWorkspace(data) {
    var blob = new Blob([previewWindowHtml(data)], { type: "text/html" });
    var url = URL.createObjectURL(blob);
    var win = window.open(url, "_blank", "noopener=false,width=1280,height=920");
    if (!win) setStatus("Popup blocked. Allow popups for preview.");
    else setStatus("Opened preview window.");
  }

  function openFromButton(button) {
    var raw = getWorkspaceData(button);
    setStatus("Preparing isolated workspace image…");
    hydrateWorkspaceData(raw).then(function (data) {
      openWorkspaceTab(data);
    });
  }

  function pointerGuard(event) {
    // Design Library buttons are owned by simo-library-rescue.js.
    // Do not let this older generic workspace guard swallow their pointer event.
    if (event.target && event.target.closest &&
        event.target.closest("#simoLiveLibraryFixModal")) return;
    if (isThreeDButton(event.target)) {
      stopEvent(event);
      return;
    }
    if (!isWorkspaceButton(event.target)) return;
    pendingWorkspaceButton = getButton(event.target);
    clickLockUntil = Date.now() + 2500;
    stopEvent(event);
  }

  function clickGuard(event) {
    // Design Library buttons are owned by simo-library-rescue.js.
    // Let its exact saved-item resolver receive the click.
    if (event.target && event.target.closest &&
        event.target.closest("#simoLiveLibraryFixModal")) return;
    if (isThreeDButton(event.target)) {
      stopEvent(event);
      setStatus("3D is paused for now. Use Open Workspace in New Tab for the clean design flow.");
      try { alert("3D is paused for now so Simo stays stable. Please use Open Workspace in New Tab."); } catch (e) {}
      pendingWorkspaceButton = null;
      clickLockUntil = 0;
      return false;
    }
    var active = isWorkspaceButton(event.target) || (pendingWorkspaceButton && Date.now() < clickLockUntil);
    if (!active) return;
    var button = getButton(event.target) || pendingWorkspaceButton;
    stopEvent(event);
    pendingWorkspaceButton = null;
    clickLockUntil = 0;
    openFromButton(button);
    return false;
  }

  function isWorkspaceSavedCard(card) {
    if (!card) return false;
    var text = clean(card.textContent || "");
    var attr = clean((card.getAttribute && (card.getAttribute("data-simo-workspace-saved-id") || card.getAttribute("data-simo-library-id") || card.getAttribute("data-id"))) || "");
    return attr.indexOf("simo_workspace") >= 0 ||
      text.indexOf("saved workspace") >= 0 ||
      text.indexOf("edited workspace version") >= 0 ||
      text.indexOf("workspace") >= 0 && text.indexOf("edited-version") >= 0 ||
      text.indexOf("saved from the isolated live workspace") >= 0 ||
      text.indexOf("saved directly from the isolated workspace") >= 0;
  }

  function bestImageInsideOnly(root) {
    if (!root || !root.querySelectorAll) return null;
    var imgs = Array.prototype.slice.call(root.querySelectorAll("img"));
    var best = null;
    var bestScore = 0;
    imgs.forEach(function (img) {
      var src = absoluteUrl(img.getAttribute("src") || img.src || "");
      if (!isUsefulImage(src)) return;
      var r = img.getBoundingClientRect ? img.getBoundingClientRect() : { width: 0, height: 0 };
      var score = Math.max(1, Math.max(0, r.width) * Math.max(0, r.height));
      if (src.indexOf("data:image/") === 0) score += 2000000;
      if (src.indexOf("/generated-images/") >= 0 || src.indexOf("/generated_images/") >= 0) score += 1000000;
      if (score > bestScore) { best = img; bestScore = score; }
    });
    return best;
  }

  function allLibraryItemsFromLocalStorage() {
    var out = [];
    ["simo_workspace_last_saved_item_v2", "simo_workspace_last_saved_item_v1"].forEach(function (key) {
      try {
        var single = JSON.parse(localStorage.getItem(key) || "null");
        if (single && typeof single === "object") out.push(single);
      } catch (e) {}
    });

    ["simo_design_library_v1"].forEach(function (key) {
      try {
        var parsed = JSON.parse(localStorage.getItem(key) || "[]");
        var arr = Array.isArray(parsed) ? parsed :
          parsed && Array.isArray(parsed.items) ? parsed.items :
          parsed && Array.isArray(parsed.builds) ? parsed.builds :
          parsed && Array.isArray(parsed.library) ? parsed.library : [];
        arr.forEach(function (item) { if (item && typeof item === "object") out.push(item); });
      } catch (e) {}
    });
    return out;
  }

  function imageFieldsFromItem(item) {
    if (!item) return [];
    return [item.imageUrl, item.image_url, item.generated_visual_url, item.generatedImageUrl, item.previewUrl, item.thumbnail, item.visualUrl, item.displayImageUrl].filter(Boolean).map(absoluteUrl);
  }

  function findMatchingSavedItem(card, src, title) {
    var items = allLibraryItemsFromLocalStorage();
    var cardText = clean(card && card.textContent || "");
    var srcStart = String(src || "").slice(0, 140);
    var titleClean = clean(title || "");
    var best = null;
    var bestScore = 0;
    var bestStamp = 0;

    items.forEach(function (item) {
      var score = 0;
      var itemTitle = clean(item.title || item.name || item.projectTitle || "");

      // Strong preference: exact clicked image match.
      // This prevents an older "last active" item with a similar title from hijacking the card.
      imageFieldsFromItem(item).forEach(function (v) {
        if (!v || !srcStart) return;
        if (src && v === src) score += 120;
        else if (v.slice(0, 140) === srcStart) score += 90;
      });

      // Title match helps, but should not override the clicked image.
      if (titleClean && itemTitle) {
        if (itemTitle === titleClean) score += 8;
        else if (itemTitle.indexOf(titleClean) >= 0 || titleClean.indexOf(itemTitle) >= 0) score += 5;
      }

      if (item.workspaceOpen || item.simoWorkspaceVersion || /workspace/i.test(String(item.source || "") + " " + String(item.notes || ""))) score += 8;
      if (Array.isArray(item.workspaceEdits) && item.workspaceEdits.length) score += 5;
      if (cardText && itemTitle && cardText.indexOf(itemTitle.slice(0, 24)) >= 0) score += 3;

      var stamp = Date.parse(item.updatedAt || item.createdAt || "") || 0;
      if (score > bestScore || (score === bestScore && stamp > bestStamp)) {
        best = item;
        bestScore = score;
        bestStamp = stamp;
      }
    });

    // Require a real match so weak title-only matches do not reopen a stale item.
    return bestScore >= 12 ? best : null;
  }

  function openWorkspaceSavedCard(card, mode) {
    mode = mode || "continue";
    var title = titleFromElement(card);

    // Important: use only the image inside the clicked saved card.
    var img = bestImageInsideOnly(card);
    var src = img ? absoluteUrl(img.getAttribute("src") || img.src || "") : "";

    var savedItem = findMatchingSavedItem(card, src, title);
    var itemImages = imageFieldsFromItem(savedItem);

    // The clicked card image is the source of truth.
    var chosen = src || itemImages[0] || "";

    // A saved item can only override if it matches the clicked card image.
    var exactSavedImageMatch = false;
    itemImages.forEach(function (v) {
      if (!v || !src) return;
      if (v === src || v.slice(0, 140) === String(src).slice(0, 140)) exactSavedImageMatch = true;
    });

    if (savedItem && exactSavedImageMatch && itemImages[0]) {
      chosen = itemImages[0];
    }

    var itemEdits = savedItem && Array.isArray(savedItem.workspaceEdits) ? savedItem.workspaceEdits.slice() : [];
    if (!itemEdits.length && savedItem && savedItem.latestPrompt) itemEdits = [String(savedItem.latestPrompt)];
    if (!itemEdits.length) itemEdits = ["Reopened edited workspace version"];

    var data = {
      id: uid(),
      phase: PHASE,
      title: (savedItem && (savedItem.title || savedItem.name || savedItem.projectTitle)) || title || "Workspace Saved Design",
      image: chosen,
      currentImage: chosen,
      originalImage: (savedItem && (savedItem.originalImageUrl || savedItem.originalImage)) || chosen,
      sourceImage: sourceFriendlyUrl(chosen),
      currentSourceImage: sourceFriendlyUrl(chosen),
      edits: itemEdits,
      displayText: savedItem && (savedItem.displayText || savedItem.brandText || savedItem.logoText) || "",
      workspaceSubject: (savedItem && (savedItem.workspaceSubject || savedItem.projectTitle || savedItem.title)) || title || "Workspace Saved Design"
    };

    hydrateWorkspaceData(Object.assign(data, { _imageElement: img })).then(function (resolved) {
      if (mode === "source") {
        openSourceImageWindow(resolved.currentSourceImage || resolved.currentImage || resolved.image, resolved.title);
        return;
      }
      if (mode === "preview") {
        openModalWorkspace(resolved);
        return;
      }
      openWorkspaceTab(resolved);
    });
  }

  function savedWorkspaceCardFromButton(btn) {
    if (!btn || !btn.closest) return null;
    var card = btn.closest("[data-simo-workspace-saved-id], [data-simo-library-card], [data-library-card], .builder-library-card, .library-card, article, .card");
    if (isWorkspaceSavedCard(card)) return card;
    var node = btn;
    for (var i = 0; i < 8 && node && node.parentElement; i += 1) {
      node = node.parentElement;
      if (isWorkspaceSavedCard(node) && node.querySelector && node.querySelector("img")) return node;
    }
    return card;
  }

  function libraryCardClickBridge(event) {
    var btn = getButton(event.target);
    if (!btn) return;

    var label = buttonText(btn);
    var card = savedWorkspaceCardFromButton(btn);
    if (!isWorkspaceSavedCard(card)) return;

    if (label.indexOf("open") >= 0 || label.indexOf("preview") >= 0 || label.indexOf("continue") >= 0) {
      stopEvent(event);
      openWorkspaceSavedCard(card, "continue");
      return;
    }
  }

  function openSavedItemAsWorkspace(item) {
    item = item || {};
    var img = item.imageUrl || item.image_url || item.generated_visual_url || item.generatedImageUrl || item.previewUrl || item.thumbnail || item.visualUrl || item.displayImageUrl || item.sourceImageUrl || item.originalImageUrl || "";
    var title = item.title || item.name || item.projectTitle || item.workspaceSubject || "Simo Saved Workspace";
    var data = {
      id: uid(),
      phase: PHASE,
      title: title,
      image: img,
      currentImage: img,
      originalImage: item.originalImageUrl || item.originalImage || img,
      sourceImage: sourceFriendlyUrl(img),
      currentSourceImage: sourceFriendlyUrl(img),
      edits: Array.isArray(item.workspaceEdits) ? item.workspaceEdits.slice() : ["Reopened saved workspace item"],
      workspaceSubject: item.workspaceSubject || item.projectTitle || title,
      projectTitle: item.projectTitle || title
    };
    hydrateWorkspaceData(data).then(openWorkspaceTab);
    return true;
  }

  window.SimoWorkspaceBridge = {
    phase: PHASE,
    requestEdit: requestEdit,
    getLatestImage: getLatestImage,
    save: saveWorkspace,
    openTab: function (data) { hydrateWorkspaceData(data || getWorkspaceData(document.body)).then(openWorkspaceTab); },
    openModal: function (data) { hydrateWorkspaceData(data || getWorkspaceData(document.body)).then(openModalWorkspace); },
    openSavedItem: openSavedItemAsWorkspace,
    open3D: function () {
      alert("3D is paused for now. Use Open Workspace in New Tab and keep editing there.");
      return Promise.resolve(false);
    }
  };

  window.SimoLiveWorkspaceIsolated = {
    phase: PHASE,
    openSavedItem: openSavedItemAsWorkspace,
    openTab: function (data) { hydrateWorkspaceData(data || getWorkspaceData(document.body)).then(openWorkspaceTab); }
  };

  window.addEventListener("pointerdown", pointerGuard, true);
  window.addEventListener("mousedown", pointerGuard, true);
  window.addEventListener("touchstart", pointerGuard, true);
  window.addEventListener("click", clickGuard, true);

  function hardQuarantine3D(event) {
    try {
      var btn = getButton(event.target);
      if (!btn) return;
      if (!isThreeDButton(btn)) return;
      stopEvent(event);
      setStatus("3D/Rotate is paused. Use Open Workspace in New Tab for the stable design flow.");
      try { alert("3D/Rotate is paused for now so it cannot open the wrong item. Use Open Workspace in New Tab."); } catch (e) {}
      return false;
    } catch (e) {}
  }

  document.addEventListener("click", clickGuard, true);
  document.addEventListener("click", hardQuarantine3D, true);

  console.log(PHASE + " loaded.");
})();


// PHASE 14M-R10.14A — Best Friend Workspace Core Overlay Overlay
// Appended safely to the isolated workspace file.
// Overrides only the bridge edit/save behavior and improves save payload size.
(function () {
  "use strict";

  if (window.__SIMO_LIVE_WORKSPACE_ISOLATED_R1011S_ETCHED_SAVE__) return;
  window.__SIMO_LIVE_WORKSPACE_ISOLATED_R1011S_ETCHED_SAVE__ = true;

  var PHASE = "PHASE 14M-R10.14A — Best Friend Workspace Core Overlay";
  var latestPayload = null;

  function clean(v) {
    return String(v || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function uid() {
    return "simo_workspace_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  }

  function absoluteUrl(src) {
    src = String(src || "").trim();
    if (!src) return "";
    if (src.indexOf("data:image/") === 0) return src;
    if (/^https?:\/\//i.test(src)) return src;
    if (src.indexOf("blob:") === 0) return src;
    try { return new URL(src, window.location.origin).href; } catch (e) { return src; }
  }

  function isTextEdit(label) {
    var t = clean(label);
    return t.indexOf("logo") >= 0 ||
      t.indexOf("brand") >= 0 ||
      t.indexOf("text") >= 0 ||
      t.indexOf("word") >= 0 ||
      t.indexOf("name") >= 0 ||
      t.indexOf("etched") >= 0 ||
      t.indexOf("engraved") >= 0 ||
      t.indexOf("write") >= 0 ||
      t.indexOf("type") >= 0 ||
      t.indexOf("letter") >= 0;
  }

  function extractText(label) {
    var raw = String(label || "").trim();
    if (!raw) return "LOGO";

    var quoted = raw.match(/["“”']([^"“”']{1,60})["“”']/);
    if (quoted && quoted[1]) return quoted[1].trim();

    var cleaned = raw
      .replace(/\bwithout\b[\s\S]*$/i, "")
      .replace(/\bdo not\b[\s\S]*$/i, "")
      .replace(/\bdon't\b[\s\S]*$/i, "")
      .replace(/\bkeep\b[\s\S]*$/i, "")
      .replace(/\bpreserv(?:e|ing)\b[\s\S]*$/i, "")
      .replace(/\bleave\b[\s\S]*$/i, "")
      .trim();

    var m = cleaned.match(/\b(?:etch|engrave|write|add|put|place|apply|set|use)\s+(.+?)(?:\s+(?:on|onto|into|in)\s+(?:the\s+)?(?:bottle|mug|cup|product|image|surface|front)|$)/i);
    if (m && m[1]) {
      var phrase = m[1].replace(/^(?:the\s+)?(?:text|name|word|logo|brand)\s+/i, "").trim();
      phrase = phrase.replace(/^(?:as|is|saying|that says)\s+/i, "").trim();
      phrase = phrase.replace(/\s+(?:in|with|using)\s+(?:an?\s+)?(?:elegant|luxury|luxurious|modern|classic|script|serif|sans[- ]?serif|bold|italic|handwritten)?\s*font.*$/i, "").trim();
      phrase = phrase.replace(/[.,;:!?]+$/g, "").trim();
      if (phrase) return phrase;
    }

    var named = cleaned.match(/\b(?:name|text|word|logo|brand)\s+(?:as|is|to|with|says|called|named)?\s*([A-Za-z0-9][A-Za-z0-9\s&'\-]{1,60})/i);
    if (named && named[1]) {
      var phrase2 = named[1].replace(/[.,;:!?]+$/g, "").trim();
      if (phrase2) return phrase2;
    }

    var lower = clean(raw);
    if (lower.indexOf("simon gojcaj") >= 0) return "Simon Gojcaj";
    if (lower.indexOf("gojcaj") >= 0) return "Gojcaj";
    if (lower.indexOf("simo") >= 0) return "SIMO";

    var caps = raw.match(/\b[A-Z][A-Za-z0-9'\-]{1,28}\b/g) || [];
    var skip = {
      "Add": true, "Make": true, "Put": true, "Type": true, "Write": true, "Etch": true, "Engrave": true,
      "Logo": true, "Brand": true, "Name": true, "Text": true, "The": true, "This": true, "Without": true,
      "Changing": true, "Material": true, "Elegant": true, "Bottle": true
    };
    var usable = caps.filter(function (w) { return !skip[w]; });
    if (usable.length >= 2) return usable.slice(0, 2).join(" ");
    if (usable.length === 1) return usable[0];

    return "LOGO";
  }

  function splitEtchLines(text) {
    text = String(text || "").trim().replace(/\s+/g, " ");
    if (!text) return ["LOGO"];
    if (text.length <= 14) return [text];
    var parts = text.split(" ");
    if (parts.length <= 1) return [text];

    var best = null;
    for (var i = 1; i < parts.length; i += 1) {
      var left = parts.slice(0, i).join(" ");
      var right = parts.slice(i).join(" ");
      var diff = Math.abs(left.length - right.length);
      if (!best || diff < best.diff) best = { left: left, right: right, diff: diff };
    }
    return best ? [best.left, best.right] : [text];
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

  function drawEtchedGlyph(ctx, glyph, x, y, fontSize, squeeze) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(squeeze, 1);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 " + fontSize + "px Georgia, Times New Roman, serif";

    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = "rgba(20,20,20,0.62)";
    ctx.fillText(glyph, fontSize * 0.02, fontSize * 0.028);

    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.40;
    ctx.lineWidth = Math.max(1.4, fontSize * 0.032);
    ctx.strokeStyle = "rgba(0,0,0,0.44)";
    ctx.strokeText(glyph, 0, 0);
    ctx.fillStyle = "rgba(25,25,25,0.30)";
    ctx.fillText(glyph, 0, 0);

    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.34;
    ctx.lineWidth = Math.max(1.1, fontSize * 0.022);
    ctx.strokeStyle = "rgba(255,255,255,0.70)";
    ctx.strokeText(glyph, -fontSize * 0.02, -fontSize * 0.02);

    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = Math.max(1, fontSize * 0.016);
    ctx.strokeStyle = "rgba(0,0,0,0.64)";
    ctx.strokeText(glyph, fontSize * 0.02, fontSize * 0.02);
    ctx.restore();
  }

  function drawCurvedEtchedLine(ctx, text, cx, cy, fontSize, maxWidth, curveDepth) {
    ctx.save();
    ctx.font = "700 " + fontSize + "px Georgia, Times New Roman, serif";
    var chars = String(text || "").split("");
    var widths = chars.map(function (ch) { return Math.max(fontSize * 0.22, ctx.measureText(ch).width); });
    var total = widths.reduce(function (a, b) { return a + b; }, 0);
    var tracking = Math.max(fontSize * 0.015, Math.min(fontSize * 0.065, (maxWidth - total) / Math.max(1, chars.length - 1)));
    if (!isFinite(tracking)) tracking = fontSize * 0.03;
    total = total + tracking * Math.max(0, chars.length - 1);

    var startX = cx - total / 2;
    var cursor = startX;
    for (var i = 0; i < chars.length; i += 1) {
      var ch = chars[i];
      var w = widths[i];
      var mid = cursor + w / 2;
      var norm = total > 0 ? ((mid - cx) / (total / 2)) : 0;
      if (norm < -1) norm = -1;
      if (norm > 1) norm = 1;
      var y = cy + curveDepth * (norm * norm);
      var squeeze = 1 - 0.14 * Math.abs(norm);
      drawEtchedGlyph(ctx, ch, mid, y, fontSize, squeeze);
      cursor += w + tracking;
    }
    ctx.restore();
  }

  function localEtchEdit(data, label) {
    data = data || {};
    var src = data.currentImage || data.image || data.displayImageUrl || data.originalImage || "";
    if (!src) return Promise.resolve({ ok: false, message: "No workspace image found for local etched edit." });

    return loadImage(src).then(function (img) {
      var canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;

      var ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      var text = extractText(label);
      var lines = splitEtchLines(text);
      var w = canvas.width;
      var h = canvas.height;
      var isTwo = lines.length > 1;

      var fontSize = isTwo ? Math.max(24, Math.round(w * 0.053)) : Math.max(26, Math.round(w * 0.062));
      var cx = Math.round(w * 0.5);
      var centerY = Math.round(h * (isTwo ? 0.54 : 0.555));
      var lineGap = Math.round(fontSize * 0.92);
      var maxWidth = Math.round(w * 0.34);
      var curveDepth = Math.max(4, Math.round(fontSize * 0.16));

      if (isTwo) {
        drawCurvedEtchedLine(ctx, lines[0], cx, centerY - lineGap * 0.52, fontSize, maxWidth, curveDepth);
        drawCurvedEtchedLine(ctx, lines[1], cx, centerY + lineGap * 0.52, fontSize, maxWidth, curveDepth);
      } else {
        drawCurvedEtchedLine(ctx, lines[0], cx, centerY, fontSize, maxWidth, curveDepth);
      }

      var out = canvas.toDataURL("image/jpeg", 0.92);
      latestPayload = {
        ok: true,
        image: out,
        sourceImage: "",
        message: "Applied curved etched branding directly in the workspace while preserving the current image and material.",
        localEdit: true,
        preserveOnly: true,
        label: label,
        extractedText: text,
        at: Date.now()
      };

      try {
        localStorage.setItem("simo_workspace_latest_payload_v5", JSON.stringify(latestPayload));
      } catch (e) {}

      return latestPayload;
    }).catch(function () {
      return { ok: false, message: "Could not apply etched text locally." };
    });
  }

  function compressImageData(src, maxW, quality) {
    maxW = maxW || 900;
    quality = quality || 0.82;

    if (!src) return Promise.resolve("");

    return loadImage(src).then(function (img) {
      var w = img.naturalWidth || img.width;
      var h = img.naturalHeight || img.height;
      if (!w || !h) return src;

      var scale = Math.min(1, maxW / w);
      var nw = Math.max(1, Math.round(w * scale));
      var nh = Math.max(1, Math.round(h * scale));

      var canvas = document.createElement("canvas");
      canvas.width = nw;
      canvas.height = nh;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, nw, nh);
      return canvas.toDataURL("image/jpeg", quality);
    }).catch(function () {
      return src;
    });
  }

  function imageNodes() {
    return Array.prototype.slice.call(document.querySelectorAll(
      "#chatMessages img, .chat-wrap img, .simo-vc-card img, .msg-bubble img, article img, .card img, img"
    ));
  }

  function isUsefulImage(src) {
    src = absoluteUrl(src);
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

  function imageSet() {
    var set = {};
    imageNodes().forEach(function (img) {
      var src = absoluteUrl(img.getAttribute("src") || img.src || "");
      if (isUsefulImage(src)) set[src] = true;
    });
    return set;
  }

  function scoreNode(img) {
    if (!img) return 0;
    var src = absoluteUrl(img.getAttribute("src") || img.src || "");
    if (!isUsefulImage(src)) return 0;
    var r = img.getBoundingClientRect ? img.getBoundingClientRect() : { width: 0, height: 0 };
    var area = Math.max(0, r.width) * Math.max(0, r.height);
    var natural = Math.max(0, img.naturalWidth || 0) * Math.max(0, img.naturalHeight || 0);
    var score = area || natural || 1;
    if (src.indexOf("/generated-images/") >= 0 || src.indexOf("/generated_images/") >= 0) score += 1000000;
    return score;
  }

  function newestUsefulImageNotIn(beforeSet) {
    var imgs = imageNodes();
    var best = null;
    var bestScore = 0;
    for (var i = imgs.length - 1; i >= 0; i -= 1) {
      var img = imgs[i];
      var src = absoluteUrl(img.getAttribute("src") || img.src || "");
      if (!isUsefulImage(src)) continue;
      if (beforeSet && beforeSet[src]) continue;
      var score = scoreNode(img) + (imgs.length - i) * 1000;
      if (score > bestScore) {
        best = img;
        bestScore = score;
      }
    }
    return best;
  }

  function imgToData(img) {
    var src = absoluteUrl(img && (img.getAttribute("src") || img.src || ""));
    if (!src) return Promise.resolve("");
    if (src.indexOf("data:image/") === 0) return Promise.resolve(src);
    return fetch(src).then(function (res) {
      return res.blob();
    }).then(function (blob) {
      return new Promise(function (resolve) {
        var reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result || src)); };
        reader.onerror = function () { resolve(src); };
        reader.readAsDataURL(blob);
      });
    }).catch(function () {
      return src;
    });
  }

  function sendPrompt(prompt) {
    var input = document.getElementById("chatInput") || document.querySelector("textarea, input[type='text']");
    var send = document.getElementById("sendBtn") || document.querySelector("button[type='submit'], .send-btn, [data-send]");
    if (!input) return false;
    input.value = prompt;
    input.focus();
    try { input.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
    setTimeout(function () {
      if (send && typeof send.click === "function") send.click();
    }, 80);
    return true;
  }

  function preservePrompt(data, label) {
    var title = data && (data.title || data.workspaceSubject) || "current design";
    var request = String(label || "continue editing");
    return [
      "Continue editing this exact active workspace design: " + title + ".",
      "Apply only this requested edit: " + request + ".",
      "Hard preserve constraints: keep the same subject, product identity, shape, material, finish, colors, proportions, camera angle, lighting, and composition unless the request explicitly asks to change one of those things.",
      "If the request is a text, logo, branding, etched, engraved, or name edit, do not redesign the product and do not change the material. Only add the requested branding onto the current product.",
      "Do not replace the subject. Do not switch material. Do not restyle the whole product for a text-only edit.",
      "Show the updated visual first. Do not save to library unless I click Save."
    ].join(" ");
  }

  function waitForNewImage(beforeSet, timeoutMs) {
    timeoutMs = timeoutMs || 120000;
    return new Promise(function (resolve) {
      var start = Date.now();
      var done = false;

      function finish(v) {
        if (done) return;
        done = true;
        try { obs.disconnect(); } catch (e) {}
        resolve(v || null);
      }

      function check() {
        var img = newestUsefulImageNotIn(beforeSet);
        if (img) {
          imgToData(img).then(function (dataUrl) {
            var src = absoluteUrl(img.getAttribute("src") || img.src || "");
            latestPayload = {
              ok: true,
              image: dataUrl || src,
              sourceImage: src.indexOf("data:image/") === 0 || src.indexOf("blob:") === 0 ? "" : src,
              message: "Updated workspace image from newest Simo result.",
              at: Date.now()
            };
            try { localStorage.setItem("simo_workspace_latest_payload_v5", JSON.stringify(latestPayload)); } catch (e) {}
            finish(latestPayload);
          });
          return;
        }
        if (Date.now() - start > timeoutMs) finish(null);
      }

      var obs = new MutationObserver(check);
      try { obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] }); } catch (e) {}
      check();
      var timer = setInterval(function () {
        if (done) {
          clearInterval(timer);
          return;
        }
        check();
      }, 900);
    });
  }

  function requestEdit(data, label) {
    data = data || {};
    var request = String(label || "continue editing").trim();

    var image = data.currentImage || data.image || data.displayImageUrl || data.sourceImage || data.originalImage || "";
    if (!image) {
      return Promise.resolve({ ok: false, message: "No workspace image found. Reopen this item from Library and try again." });
    }

    latestPayload = null;

    return fetch("/api/workspace-image-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        edit: request,
        prompt: request,
        title: data.title || data.projectTitle || data.name || data.workspaceSubject || "",
        workspaceSubject: data.workspaceSubject || data.title || "",
        currentImage: image,
        image: image,
        sourceImage: data.currentSourceImage || data.sourceImage || "",
        originalImage: data.originalImage || "",
        edits: Array.isArray(data.edits) ? data.edits : []
      })
    }).then(function (res) {
      return res.json().catch(function () { return { ok: false, error: "Workspace edit returned invalid JSON." }; });
    }).then(function (payload) {
      if (!payload || !payload.ok || !(payload.image || payload.image_url || payload.generated_visual_url)) {
        return {
          ok: false,
          message: (payload && (payload.message || payload.error)) || "Workspace image edit failed."
        };
      }

      latestPayload = {
        ok: true,
        image: payload.image || payload.image_url || payload.generated_visual_url,
        sourceImage: payload.sourceImage || payload.image_url || payload.generated_visual_url || "",
        message: payload.message || "Real workspace image edit complete.",
        prompt: payload.prompt || request,
        mode: payload.mode || "workspace-image-edit",
        phase: payload.phase || "PHASE 14M-R10.30"
      };

      try { localStorage.setItem("simo_workspace_latest_payload_v5", JSON.stringify(latestPayload)); } catch (e) {}
      return latestPayload;
    }).catch(function (err) {
      return {
        ok: false,
        message: "Workspace image edit route failed: " + (err && err.message ? err.message : err)
      };
    });
  }

  function getLatestImage(previousImage) {
    var prev = absoluteUrl(previousImage || "");
    if (latestPayload && latestPayload.image && latestPayload.image !== prev) {
      return Promise.resolve({ image: latestPayload.image, sourceImage: latestPayload.sourceImage || "" });
    }
    try {
      var stored = JSON.parse(localStorage.getItem("simo_workspace_latest_payload_v5") || "null");
      if (stored && stored.image && stored.image !== prev) {
        return Promise.resolve({ image: stored.image, sourceImage: stored.sourceImage || "" });
      }
    } catch (e) {}
    return Promise.resolve(null);
  }

  function makeItem(data, compressedImage) {
    data = data || {};
    var title = data.title || data.projectTitle || data.name || "Simo Workspace Design";
    var edits = Array.isArray(data.edits) ? data.edits : [];
    var image = compressedImage || data.currentImage || data.image || data.displayImageUrl || "";

    return {
      id: uid(),
      title: title + (edits.length ? " — Edited Workspace Version" : ""),
      name: title + (edits.length ? " — Edited Workspace Version" : ""),
      projectTitle: title,
      prompt: "Saved from isolated live workspace: " + title,
      latestPrompt: edits.length ? edits[edits.length - 1] : title,
      sourcePrompt: title,
      type: "visual",
      kind: "visual",
      source: "simo_live_workspace_isolated",
      category: "product",
      domain: "product",
      tags: ["visual", "design", "workspace", "image-first", "edited-version"],
      notes: "Saved from the isolated live workspace. Original Library item remains untouched. Continue refining from this edited visual version.",
      imageUrl: image,
      image_url: image,
      generated_visual_url: image,
      generatedImageUrl: image,
      previewUrl: image,
      thumbnail: image,
      visualUrl: image,
      displayImageUrl: image,
      originalImageUrl: data.originalImage || "",
      workspaceEdits: edits,
      workspaceSubject: data.workspaceSubject || title,
      workspaceOpen: true,
      simoWorkspaceVersion: "R10.30",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      html: ""
    };
  }

  function readStore(key) {
    try {
      var parsed = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(parsed)) return { obj: parsed, arr: parsed, mode: "array" };
      if (parsed && Array.isArray(parsed.items)) return { obj: parsed, arr: parsed.items, mode: "items" };
      if (parsed && Array.isArray(parsed.builds)) return { obj: parsed, arr: parsed.builds, mode: "builds" };
      if (parsed && Array.isArray(parsed.library)) return { obj: parsed, arr: parsed.library, mode: "library" };
    } catch (e) {}
    return { obj: [], arr: [], mode: "array" };
  }

  function writeStore(key, store, arr) {
    if (store.mode === "array") {
      localStorage.setItem(key, JSON.stringify(arr));
    } else {
      var obj = store.obj && typeof store.obj === "object" ? store.obj : {};
      obj[store.mode] = arr;
      localStorage.setItem(key, JSON.stringify(obj));
    }
  }

  function saveLocalItem(item) {
    var savedAny = false;
    ["simo_design_library_v1"].forEach(function (key) {
      try {
        var store = readStore(key);
        var arr = store.arr || [];
        arr.unshift(item);
        writeStore(key, store, arr);
        savedAny = true;
      } catch (e) {}
    });
    try {
      localStorage.setItem("simo_workspace_last_saved_item_v2", JSON.stringify(item));
      window.dispatchEvent(new CustomEvent("simo:library-updated", { detail: { source: "workspace-s" } }));
      document.dispatchEvent(new CustomEvent("simo:library-updated", { detail: { source: "workspace-s" } }));
    } catch (e) {}
    return savedAny;
  }

  function saveWorkspace(data) {
    data = data || {};
    if (window.SimoLibrary && typeof window.SimoLibrary.saveWorkspace === "function") {
      return window.SimoLibrary.saveWorkspace(data);
    }
    return Promise.resolve({ ok: false, error: "Design Library save owner is unavailable." });
  }

  function installBridge() {
    if (!window.SimoWorkspaceBridge) {
      setTimeout(installBridge, 200);
      return;
    }

    var old = window.SimoWorkspaceBridge;
    window.SimoWorkspaceBridge = {
      phase: PHASE,
      requestEdit: requestEdit,
      getLatestImage: getLatestImage,
      save: saveWorkspace,
      openTab: old.openTab,
      openModal: old.openModal,
      open3D: function () { alert("3D/Rotate is paused for now so it cannot open the wrong item. Use Open Workspace in New Tab."); return Promise.resolve(false); }
    };

    console.log(PHASE + " loaded. Feature-locked precision and safe zoom controls active.");
  }

  installBridge();
})();



// PHASE 14M-R10.13K — Hard pause stale 3D/Rotate buttons so they cannot open old unsaved designs.
(function () {
  "use strict";
  if (window.__SIMO_R1014A_HARD_PAUSE_3D__) return;
  window.__SIMO_R1014A_HARD_PAUSE_3D__ = true;

  function clean(v) { return String(v || "").toLowerCase().replace(/\s+/g, " ").trim(); }
  function isBad3DText(t) {
    t = clean(t);
    return (t.indexOf("3d") >= 0 || t.indexOf("rotate") >= 0) &&
      t.indexOf("open workspace in new tab") < 0 &&
      t.indexOf("source image") < 0;
  }
  function stop(e) {
    try { e.preventDefault(); } catch (x) {}
    try { e.stopPropagation(); } catch (x) {}
    try { if (e.stopImmediatePropagation) e.stopImmediatePropagation(); } catch (x) {}
  }
  function disable3DButtons() {
    try {
      Array.prototype.slice.call(document.querySelectorAll("button,a,[role='button']")).forEach(function (el) {
        var t = clean(el.textContent || el.getAttribute("aria-label") || el.title || "");
        if (!isBad3DText(t)) return;
        el.setAttribute("data-simo-3d-paused", "1");
        el.setAttribute("title", "3D/Rotate is paused so it cannot open the wrong saved item.");
        if (el.tagName === "A") el.removeAttribute("href");
        el.onclick = function (e) {
          stop(e || window.event);
          alert("3D/Rotate is paused for now so it cannot open the wrong item. Use Continue or Open Workspace in New Tab.");
          return false;
        };
      });
    } catch (e) {}
  }
  function guard(e) {
    var el = e && e.target && e.target.closest ? e.target.closest("button,a,[role='button']") : null;
    if (!el) return;
    var t = clean(el.textContent || el.getAttribute("aria-label") || el.title || "");
    if (!isBad3DText(t)) return;
    stop(e);
    alert("3D/Rotate is paused for now so it cannot open the wrong item. Use Continue or Open Workspace in New Tab.");
    return false;
  }
  ["pointerdown", "mousedown", "touchstart", "click"].forEach(function (ev) {
    window.addEventListener(ev, guard, true);
    document.addEventListener(ev, guard, true);
  });
  disable3DButtons();
  setInterval(disable3DButtons, 900);
})();



// PHASE 14M-R10.14A — Remove stale 3D/Rotate modal if an older module opens it anyway.
(function () {
  "use strict";
  if (window.__SIMO_R1014A_REMOVE_STALE_3D_MODAL__) return;
  window.__SIMO_R1014A_REMOVE_STALE_3D_MODAL__ = true;

  function clean(v) { return String(v || "").toLowerCase().replace(/\s+/g, " ").trim(); }

  function isStale3DModal(el) {
    if (!el || !el.textContent) return false;
    var t = clean(el.textContent);
    return (
      (t.indexOf("opened directly from the 3d / rotate workspace button") >= 0) ||
      (t.indexOf("drag to rotate preview") >= 0 && t.indexOf("brand design workspace") >= 0) ||
      (t.indexOf("3d / rotate workspace") >= 0 && t.indexOf("open workspace in new tab") >= 0 && t.indexOf("brand design workspace") >= 0)
    );
  }

  function removeStale3DModals() {
    try {
      Array.prototype.slice.call(document.querySelectorAll("div,section,article,dialog")).forEach(function (el) {
        if (!isStale3DModal(el)) return;
        var r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0 };
        if (r.width > 260 && r.height > 180) {
          el.remove();
        }
      });
    } catch (e) {}
  }

  removeStale3DModals();
  setInterval(removeStale3DModals, 750);
})();
