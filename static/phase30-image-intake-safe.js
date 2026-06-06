// PHASE 14M-R10.59J — Image Intake Chat Preview Safe
// Safe add-on only.
// Owns image button click, file picker, paste image, upload preview, /api/upload-image, and /api/analyze-image.
// Does not touch app.py, core visual logic, subject lock, library, account sync, or normal Send/Enter behavior.
// It only intercepts Send/Enter when an uploaded image is staged so the image_url can be attached to /api/chat.

(function () {
  "use strict";

  if (window.__SIMO_PHASE30_IMAGE_INTAKE_SAFE__) return;
  window.__SIMO_PHASE30_IMAGE_INTAKE_SAFE__ = true;

  const PHASE = "PHASE 14M-R10.59J — Image Intake Chat Preview Safe";
  const MAX_BYTES = 18 * 1024 * 1024;
  const UPLOAD_TIMEOUT_MS = 65000;

  let staged = null;
  let objectUrl = "";
  let busy = false;
  let analysisInFlight = false;

  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function getChat() {
    return $("chatMessages") || $("chat") || document.querySelector(".chat-wrap") || document.body;
  }

  function getInput() {
    return $("chatInput") || document.querySelector("textarea, input[type='text']");
  }

  function getStatusEl() {
    return $("loadingHint") || document.querySelector(".loading-hint, [data-simo-status]");
  }

  function setStatus(text, isBusy) {
    const el = getStatusEl();
    if (el) {
      el.textContent = text || "Ready.";
      el.dataset.simoImageBusy = isBusy ? "true" : "false";
    }
  }

  function scrollDown() {
    const wrap = document.querySelector(".chat-wrap") || $("chat") || document.scrollingElement || document.documentElement;
    try { wrap.scrollTop = wrap.scrollHeight; } catch {}
    try { window.scrollTo(0, document.documentElement.scrollHeight); } catch {}
  }

  function addRow(role, html) {
    const chat = getChat();
    const row = document.createElement("div");
    row.className = `msg-row msg-${role} simo-phase30-image-row`;
    row.innerHTML = html;
    chat.appendChild(row);
    scrollDown();
    return row;
  }

  function addUser(text, imageUrl) {
    const image = imageUrl ? `<div style="margin-top:10px;border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.14);background:#050b14;max-width:320px;"><img src="${esc(imageUrl)}" alt="Uploaded image" style="display:block;width:100%;height:auto;max-height:260px;object-fit:contain;background:#050b14;" /></div>` : "";
    return addRow("user", `<div class="msg-bubble msg-bubble-user">${esc(text)}${image}</div>`);
  }

  function markdownToSafeHtml(text) {
    const safe = esc(text || "");
    return safe
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function (_, alt, url) {
        return `<div style="margin:12px 0;border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,.12);background:#050b14;"><img src="${esc(url)}" alt="${esc(alt || "Simo image")}" style="display:block;width:100%;max-height:640px;object-fit:contain;background:#050b14;" /></div>`;
      })
      .replace(/\n/g, "<br>");
  }

  function addAssistant(text, title) {
    const safeTitle = title ? `<div style="font-size:11px;text-transform:uppercase;letter-spacing:.13em;color:#cfe0ff;font-weight:950;margin-bottom:8px;">${esc(title)}</div>` : "";
    return addRow("assistant", `<div class="msg-bubble msg-bubble-assistant" style="max-width:min(1080px,96%);width:100%;"><div style="border:1px solid rgba(255,255,255,.10);border-radius:18px;padding:14px;background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.025));">${safeTitle}<div style="color:#edf4ff;line-height:1.55;">${markdownToSafeHtml(text || "")}</div></div></div>`);
  }

  function addImageAnalysis(reply, imageUrl) {
    const img = imageUrl ? `![Uploaded image](${imageUrl})

` : "";
    return addAssistant(img + (reply || "Image analyzed."), "Image Analysis");
  }

  function ensureStyles() {
    if ($("simoPhase30ImageIntakeStyles")) return;
    const style = document.createElement("style");
    style.id = "simoPhase30ImageIntakeStyles";
    style.textContent = `
      .simo-phase30-image-tray{display:none;margin:10px 0 0;border:1px solid rgba(255,255,255,.11);background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.028));border-radius:18px;padding:10px;box-shadow:0 10px 26px rgba(0,0,0,.18);}
      .simo-phase30-image-tray[data-open="true"]{display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
      .simo-phase30-image-thumb{width:64px;height:64px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:#050b14;object-fit:cover;display:block;}
      .simo-phase30-image-meta{display:grid;gap:3px;min-width:180px;flex:1;color:#dce8ff;font-size:12px;line-height:1.35;}
      .simo-phase30-image-meta strong{font-size:13px;color:#f5f8ff;}
      .simo-phase30-image-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
      .simo-phase30-image-actions button{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#eef4ff;border-radius:999px;padding:8px 11px;font-size:12px;font-weight:900;cursor:pointer;}
      .simo-phase30-image-actions button:hover{background:rgba(255,255,255,.10);transform:translateY(-1px);}
      .simo-phase30-image-actions button:disabled{opacity:.62;cursor:not-allowed;transform:none;}
      .composer-wrap[data-simo-phase30-image-ready="true"]{border-color:rgba(110,168,255,.22)!important;box-shadow:0 0 0 1px rgba(110,168,255,.10),0 10px 26px rgba(0,0,0,.22)!important;}
    `;
    document.head.appendChild(style);
  }

  function ensureTray() {
    ensureStyles();
    let tray = $("simoPhase30ImageTray");
    if (tray) return tray;

    const composer = document.querySelector(".composer-wrap") || getInput()?.parentElement || document.body;
    tray = document.createElement("div");
    tray.id = "simoPhase30ImageTray";
    tray.className = "simo-phase30-image-tray";
    tray.setAttribute("data-open", "false");
    tray.innerHTML = `
      <img class="simo-phase30-image-thumb" id="simoPhase30ImageThumb" alt="Selected image preview" />
      <div class="simo-phase30-image-meta">
        <strong id="simoPhase30ImageName">No image selected</strong>
        <span id="simoPhase30ImageState">Choose or paste an image to attach it safely.</span>
      </div>
      <div class="simo-phase30-image-actions">
        <button type="button" id="simoPhase30AnalyzeBtn">Analyze</button>
        <button type="button" id="simoPhase30ClearBtn">Remove</button>
      </div>
    `;
    if (composer.parentElement) composer.parentElement.insertBefore(tray, composer.nextSibling);
    else document.body.appendChild(tray);

    const clearBtn = $("simoPhase30ClearBtn");
    const analyzeBtn = $("simoPhase30AnalyzeBtn");
    if (clearBtn) clearBtn.addEventListener("click", clearStagedImage);
    if (analyzeBtn) analyzeBtn.addEventListener("click", function () { analyzeStagedImage(true); });
    return tray;
  }

  function setComposerImageReady(ready) {
    const composer = document.querySelector(".composer-wrap");
    if (composer) composer.dataset.simoPhase30ImageReady = ready ? "true" : "false";
  }

  function updateTray(stateText) {
    const tray = ensureTray();
    const thumb = $("simoPhase30ImageThumb");
    const name = $("simoPhase30ImageName");
    const state = $("simoPhase30ImageState");
    const analyzeBtn = $("simoPhase30AnalyzeBtn");

    if (!staged) {
      tray.setAttribute("data-open", "false");
      if (thumb) thumb.removeAttribute("src");
      setComposerImageReady(false);
      return;
    }

    tray.setAttribute("data-open", "true");
    if (thumb) thumb.src = staged.previewUrl || staged.url || "";
    if (name) name.textContent = staged.filename || staged.fileName || "Selected image";
    if (state) state.textContent = stateText || staged.status || "Image ready. Type what you want Simo to do with it, then press Send.";
    if (analyzeBtn) analyzeBtn.disabled = busy || analysisInFlight || !staged.url;
    setComposerImageReady(true);
  }

  function clearStagedImage() {
    staged = null;
    busy = false;
    analysisInFlight = false;
    if (objectUrl) {
      try { URL.revokeObjectURL(objectUrl); } catch {}
      objectUrl = "";
    }
    const input = $("imageInput");
    if (input) input.value = "";
    updateTray();
    setStatus("Image removed. Ready.", false);
    try { window.__SIMO_STAGED_IMAGE__ = null; } catch {}
  }

  function validateFile(file) {
    if (!file) return "No image selected.";
    if (!/^image\//i.test(file.type || "")) return "That file is not an image.";
    if (file.size > MAX_BYTES) return "Image is too large. Please use an image under 18 MB.";
    return "";
  }

  async function uploadFile(file, source) {
    const error = validateFile(file);
    if (error) {
      setStatus(error, false);
      addAssistant(error, "Image Upload");
      return;
    }
    if (busy) return;

    busy = true;
    if (objectUrl) {
      try { URL.revokeObjectURL(objectUrl); } catch {}
    }
    objectUrl = URL.createObjectURL(file);
    staged = {
      fileName: file.name || `${source || "image"}.png`,
      filename: file.name || `${source || "image"}.png`,
      previewUrl: objectUrl,
      url: "",
      status: "Uploading image safely…",
      source: source || "selected",
      uploadedAt: Date.now()
    };
    try { window.__SIMO_STAGED_IMAGE__ = staged; } catch {}
    updateTray("Uploading image safely…");
    setStatus("Uploading image…", true);

    const controller = new AbortController();
    const timer = setTimeout(function () { try { controller.abort(); } catch {} }, UPLOAD_TIMEOUT_MS);

    try {
      const form = new FormData();
      form.append("image", file, staged.fileName);
      const res = await fetch("/api/upload-image", {
        method: "POST",
        credentials: "same-origin",
        body: form,
        signal: controller.signal
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.ok) throw new Error(data.error || `Upload failed: ${res.status}`);

      staged = {
        ...staged,
        filename: data.filename || staged.filename,
        url: data.url || "",
        status: "Image uploaded and staged. You can analyze it or send a prompt with it."
      };
      try { window.__SIMO_STAGED_IMAGE__ = staged; } catch {}
      updateTray(staged.status);
      setStatus("Image uploaded. Ready for analysis or your next prompt.", false);
      await analyzeStagedImage(false);
    } catch (err) {
      const message = err && err.name === "AbortError" ? "Image upload timed out before Simo could finish." : (err && err.message ? err.message : "Image upload failed.");
      if (staged) staged.status = message;
      updateTray(message);
      setStatus(message, false);
      addAssistant(message, "Image Upload");
    } finally {
      clearTimeout(timer);
      busy = false;
      updateTray(staged ? staged.status : "Ready.");
    }
  }

  async function analyzeStagedImage(manual) {
    if (!staged || !staged.url || analysisInFlight) return;
    analysisInFlight = true;
    updateTray("Analyzing image…");
    setStatus("Analyzing uploaded image…", true);
    const analyzeBtn = $("simoPhase30AnalyzeBtn");
    if (analyzeBtn) analyzeBtn.disabled = true;

    try {
      const res = await fetch("/api/analyze-image", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "Analyze this uploaded image for Simo. Describe what it shows, style, colors, layout/composition, useful design clues, and what the user could ask Simo to build or improve from it. Keep it concise and practical."
        })
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.ok) throw new Error(data.error || `Analysis failed: ${res.status}`);

      const reply = data.reply || "Image uploaded. I can use it as context for your next prompt.";
      staged.analysis = reply;
      staged.status = "Image analyzed. Type what you want Simo to do with it, then press Send.";
      try { window.__SIMO_STAGED_IMAGE__ = staged; } catch {}
      updateTray(staged.status);
      setStatus("Image analyzed. Ready.", false);
      if (manual || !staged.__autoAnalysisShown) {
        staged.__autoAnalysisShown = true;
        addImageAnalysis(reply, staged.previewUrl || staged.url);
      }
    } catch (err) {
      const message = err && err.message ? err.message : "Image analysis failed.";
      staged.status = "Image uploaded. Analysis did not finish, but the image can still be attached to your next prompt.";
      updateTray(staged.status);
      setStatus(staged.status, false);
      if (manual) addImageAnalysis(message, staged.previewUrl || staged.url);
    } finally {
      analysisInFlight = false;
      updateTray(staged ? staged.status : "Ready.");
    }
  }

  function openPicker(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    }
    const input = $("imageInput");
    if (!input) {
      addAssistant("I could not find the image input on this page.", "Image Upload");
      return;
    }
    input.click();
  }

  function onFileChange(event) {
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    const file = event.target && event.target.files && event.target.files[0];
    if (file) uploadFile(file, "file picker");
  }

  function onPaste(event) {
    const items = event.clipboardData && event.clipboardData.items ? Array.from(event.clipboardData.items) : [];
    const imageItem = items.find(function (item) { return item && item.type && /^image\//i.test(item.type); });
    if (!imageItem) return;
    const file = imageItem.getAsFile && imageItem.getAsFile();
    if (!file) return;
    event.preventDefault();
    uploadFile(file, "pasted image");
  }

  async function sendWithImage(event) {
    if (!staged || !staged.url || busy) return false;
    const input = getInput();
    const message = clean(input && input.value);
    if (!message) {
      setStatus("Type what you want Simo to do with the image, then press Send.", false);
      updateTray("Type what you want Simo to do with the image, then press Send.");
      return true;
    }

    if (event) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    }

    busy = true;
    updateTray("Sending prompt with uploaded image…");
    setStatus("Sending image prompt…", true);
    addUser(message, staged.previewUrl || staged.url);
    if (input) {
      input.value = "";
      try { input.dispatchEvent(new Event("input", { bubbles: true })); } catch {}
    }

    const imagePayload = staged;
    const working = addAssistant("Simo is using the uploaded image as context…", "Image Prompt");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message,
          has_image: true,
          image_url: imagePayload.url,
          image_filename: imagePayload.filename || imagePayload.fileName || "uploaded-image"
        })
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.ok) throw new Error(data.error || `Chat failed: ${res.status}`);

      try { working.remove(); } catch {}
      addAssistant(data.reply || "Done.", data.reply_format === "visual" ? "Simo Visual" : "Simo");
      setStatus("Ready.", false);
      if (data.image_attached) {
        staged.status = "Image is still staged if you want another follow-up about it.";
        updateTray(staged.status);
      }
    } catch (err) {
      try { working.remove(); } catch {}
      const message = err && err.message ? err.message : "Image prompt failed.";
      addAssistant(message, "Image Prompt");
      setStatus(message, false);
      updateTray("Image is still staged. You can retry your prompt.");
    } finally {
      busy = false;
      updateTray(staged ? staged.status : "Ready.");
    }
    return true;
  }

  function onSendClick(event) {
    if (staged && staged.url) sendWithImage(event);
  }

  function onKeyDown(event) {
    if (!staged || !staged.url) return;
    if (event.key !== "Enter" || event.shiftKey) return;
    sendWithImage(event);
  }

  function bind() {
    ensureTray();
    const imageBtn = $("imageBtn");
    const imageInput = $("imageInput");
    const sendBtn = $("sendBtn");
    const input = getInput();

    if (imageBtn && imageBtn.dataset.simoPhase30Bound !== "true") {
      imageBtn.dataset.simoPhase30Bound = "true";
      imageBtn.addEventListener("click", openPicker, true);
    }
    if (imageInput && imageInput.dataset.simoPhase30Bound !== "true") {
      imageInput.dataset.simoPhase30Bound = "true";
      imageInput.addEventListener("change", onFileChange, true);
    }
    if (sendBtn && sendBtn.dataset.simoPhase30Bound !== "true") {
      sendBtn.dataset.simoPhase30Bound = "true";
      sendBtn.addEventListener("click", onSendClick, true);
    }
    if (input && input.dataset.simoPhase30Bound !== "true") {
      input.dataset.simoPhase30Bound = "true";
      input.addEventListener("keydown", onKeyDown, true);
    }
    if (document.body && document.body.dataset.simoPhase30PasteBound !== "true") {
      document.body.dataset.simoPhase30PasteBound = "true";
      document.body.addEventListener("paste", onPaste, true);
    }
  }

  function boot() {
    bind();
    const observer = new MutationObserver(bind);
    observer.observe(document.body, { childList: true, subtree: true });
    console.log("[SIMO] " + PHASE + " loaded");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
