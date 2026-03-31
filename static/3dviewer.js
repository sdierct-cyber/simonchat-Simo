(() => {
  if (window.__SIMO_3D_VIEWER_BOOTED__) return;
  window.__SIMO_3D_VIEWER_BOOTED__ = true;

  const viewerModalId = "viewer3dModal";
  const viewerCardId = "viewer3dCard";
  const viewerFrameId = "viewer3dFrame";
  const viewerCloseId = "viewer3dCloseBtn";
  const viewerTitleId = "viewer3dTopTitle";

  function isHosted3DUrl(src) {
    const raw = String(src || "").trim();
    if (!raw) return false;
    if (!/^https?:\/\//i.test(raw)) return false;
    return /\.gltf?(?:[?#].*)?$/i.test(raw) || /\.glb(?:[?#].*)?$/i.test(raw);
  }

  function absolutizeModelUrl(src) {
    const raw = String(src || "").trim();
    if (!raw) return "";
    if (!/^https?:\/\//i.test(raw)) return "";
    return raw;
  }

  function escapeAttr(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;");
  }

  function setPageModalState(isOpen) {
    if (isOpen) {
      document.body.classList.add("modal-open");
      return;
    }

    const anyOtherVisible = Array.from(
      document.querySelectorAll("[data-modal-visible='true']")
    ).some((el) => el.id !== viewerModalId);

    if (!anyOtherVisible) {
      document.body.classList.remove("modal-open");
    }
  }

  function buildViewerHtml(src) {
    const absoluteSrc = absolutizeModelUrl(src);
    const safeSrc = escapeAttr(absoluteSrc);

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Simo 3D Viewer</title>
  <script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"><\/script>
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background:
        radial-gradient(circle at top, #13203a 0%, #08111f 55%, #050a13 100%);
      font-family: Arial, Helvetica, sans-serif;
      color: #eef3ff;
    }

    body {
      position: relative;
    }

    model-viewer {
      width: 100%;
      height: 100%;
      display: block;
      background: transparent;
      --poster-color: transparent;
      --progress-bar-height: 0px;
    }

    .title {
      position: fixed;
      top: 16px;
      left: 16px;
      z-index: 3;
      padding: 10px 14px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,.10);
      background: rgba(8,12,20,.60);
      color: #eef3ff;
      font: 700 12px/1.2 Arial, sans-serif;
      backdrop-filter: blur(10px);
      max-width: calc(100vw - 110px);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .hint {
      position: fixed;
      left: 16px;
      bottom: 16px;
      z-index: 3;
      padding: 10px 14px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,.08);
      background: rgba(8,12,20,.50);
      color: rgba(235,241,255,.85);
      font: 600 12px/1.2 Arial, sans-serif;
      backdrop-filter: blur(10px);
    }

    .loading {
      position: fixed;
      top: 58px;
      left: 16px;
      z-index: 3;
      padding: 10px 14px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,.08);
      background: rgba(8,12,20,.58);
      color: rgba(235,241,255,.92);
      font: 700 12px/1.2 Arial, sans-serif;
      backdrop-filter: blur(10px);
    }

    .loading.hidden {
      display: none;
    }

    .errorPanel {
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      z-index: 5;
      width: min(560px, calc(100vw - 40px));
      padding: 18px 18px 16px;
      border-radius: 18px;
      border: 1px solid rgba(255,120,140,.24);
      background: linear-gradient(180deg, rgba(20,12,16,.92), rgba(12,8,12,.94));
      color: #eef3ff;
      box-shadow: 0 18px 50px rgba(0,0,0,.35);
      display: none;
    }

    .errorPanel.show {
      display: block;
    }

    .errorTitle {
      font-size: 15px;
      font-weight: 800;
      margin-bottom: 10px;
      color: #ffd9df;
    }

    .errorBody {
      font-size: 13px;
      line-height: 1.6;
      color: rgba(240,230,235,.90);
      margin-bottom: 12px;
      word-break: break-word;
    }

    .errorUrl {
      font-size: 12px;
      line-height: 1.5;
      color: rgba(220,230,255,.76);
      padding: 10px 12px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,.08);
      background: rgba(255,255,255,.04);
      word-break: break-all;
    }
  </style>
</head>
<body>
  <div class="title">Simo 3D Viewer</div>
  <div class="loading" id="loadingBadge">Loading 3D model…</div>
  <div class="hint">Drag to rotate • Scroll to zoom</div>

  <div class="errorPanel" id="errorPanel">
    <div class="errorTitle">This 3D model could not be loaded.</div>
    <div class="errorBody" id="errorBody">
      The file may be invalid, unavailable, or not compatible with the viewer.
    </div>
    <div class="errorUrl">${safeSrc}</div>
  </div>

  <model-viewer
    id="viewer"
    src="${safeSrc}"
    camera-controls
    auto-rotate
    auto-rotate-delay="800"
    rotation-per-second="18deg"
    shadow-intensity="1"
    exposure="1"
    environment-image="legacy"
    interaction-prompt="none"
    touch-action="pan-y">
  </model-viewer>

  <script>
    const viewer = document.getElementById("viewer");
    const loadingBadge = document.getElementById("loadingBadge");
    const errorPanel = document.getElementById("errorPanel");
    const errorBody = document.getElementById("errorBody");
    let resolved = false;

    function hideLoading() {
      if (loadingBadge) loadingBadge.classList.add("hidden");
    }

    function showError(message) {
      resolved = true;
      hideLoading();
      if (errorBody) {
        errorBody.textContent = message || "The 3D model could not be loaded.";
      }
      if (errorPanel) {
        errorPanel.classList.add("show");
      }
    }

    viewer.addEventListener("load", () => {
      resolved = true;
      hideLoading();
      if (errorPanel) errorPanel.classList.remove("show");
    });

    viewer.addEventListener("error", () => {
      showError("The file loaded into the viewer failed to render. It may be missing or not compatible.");
    });

    setTimeout(() => {
      if (!resolved) {
        showError("The model did not finish loading. This usually means the file is missing, too slow, or not compatible.");
      }
    }, 12000);
  <\/script>
</body>
</html>`;
  }

  function closeViewer() {
    const modal = document.getElementById(viewerModalId);
    const frame = document.getElementById(viewerFrameId);

    if (!modal || !frame) return;

    modal.style.display = "none";
    modal.hidden = true;
    modal.removeAttribute("data-modal-visible");

    try {
      frame.srcdoc = "<!doctype html><html><body></body></html>";
    } catch {
      frame.srcdoc = "";
    }

    setPageModalState(false);
  }

  function ensureViewerModal() {
    let modal = document.getElementById(viewerModalId);
    let card = document.getElementById(viewerCardId);
    let frame = document.getElementById(viewerFrameId);
    let closeBtn = document.getElementById(viewerCloseId);
    let titleEl = document.getElementById(viewerTitleId);

    if (modal && card && frame && closeBtn && titleEl) {
      return { modal, card, frame, closeBtn, titleEl };
    }

    modal = document.createElement("div");
    modal.id = viewerModalId;
    modal.hidden = true;
    modal.style.position = "fixed";
    modal.style.inset = "0";
    modal.style.display = "none";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";
    modal.style.background = "rgba(0,0,0,.82)";
    modal.style.zIndex = "99999";
    modal.style.padding = "24px";

    card = document.createElement("div");
    card.id = viewerCardId;
    card.style.width = "min(1180px, 92vw)";
    card.style.height = "min(82vh, 900px)";
    card.style.position = "relative";
    card.style.background = "#000";
    card.style.borderRadius = "22px";
    card.style.overflow = "hidden";
    card.style.border = "1px solid rgba(255,255,255,.10)";
    card.style.boxShadow = "0 30px 80px rgba(0,0,0,.45)";

    titleEl = document.createElement("div");
    titleEl.id = viewerTitleId;
    titleEl.textContent = "Simo 3D Viewer";
    titleEl.style.position = "absolute";
    titleEl.style.top = "14px";
    titleEl.style.left = "14px";
    titleEl.style.padding = "10px 14px";
    titleEl.style.borderRadius = "999px";
    titleEl.style.border = "1px solid rgba(255,255,255,.12)";
    titleEl.style.background = "rgba(8,12,20,.72)";
    titleEl.style.color = "#eef3ff";
    titleEl.style.fontSize = "12px";
    titleEl.style.fontWeight = "700";
    titleEl.style.zIndex = "10";
    titleEl.style.backdropFilter = "blur(10px)";
    titleEl.style.maxWidth = "calc(100% - 90px)";
    titleEl.style.whiteSpace = "nowrap";
    titleEl.style.overflow = "hidden";
    titleEl.style.textOverflow = "ellipsis";

    closeBtn = document.createElement("button");
    closeBtn.id = viewerCloseId;
    closeBtn.type = "button";
    closeBtn.textContent = "✕";
    closeBtn.style.position = "absolute";
    closeBtn.style.top = "14px";
    closeBtn.style.right = "14px";
    closeBtn.style.width = "42px";
    closeBtn.style.height = "42px";
    closeBtn.style.borderRadius = "999px";
    closeBtn.style.border = "1px solid rgba(255,255,255,.12)";
    closeBtn.style.background = "rgba(8,12,20,.72)";
    closeBtn.style.color = "#eef3ff";
    closeBtn.style.fontSize = "18px";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.zIndex = "10";
    closeBtn.style.backdropFilter = "blur(10px)";

    frame = document.createElement("iframe");
    frame.id = viewerFrameId;
    frame.setAttribute("title", "Simo 3D Viewer");
    frame.setAttribute("allow", "fullscreen");
    frame.style.width = "100%";
    frame.style.height = "100%";
    frame.style.border = "0";
    frame.style.display = "block";
    frame.style.background = "#000";

    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeViewer();
    });

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeViewer();
      }
    });

    card.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    if (!window.__SIMO_3D_ESC_BOUND__) {
      window.__SIMO_3D_ESC_BOUND__ = true;
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          const modalEl = document.getElementById(viewerModalId);
          if (modalEl && !modalEl.hidden) {
            closeViewer();
          }
        }
      });
    }

    card.appendChild(titleEl);
    card.appendChild(closeBtn);
    card.appendChild(frame);
    modal.appendChild(card);
    document.body.appendChild(modal);

    return { modal, card, frame, closeBtn, titleEl };
  }

  function openViewer(src, title = "") {
    const raw = String(src || "").trim();
    if (!raw) return false;

    if (!isHosted3DUrl(raw)) {
      console.warn("Blocked non-verified 3D URL:", raw);
      return false;
    }

    const { modal, frame, titleEl } = ensureViewerModal();
    const fallbackTitle = `Simo 3D Viewer — ${raw.split("/").pop() || "model"}`;

    if (titleEl) {
      titleEl.textContent = title || fallbackTitle;
      titleEl.title = title || fallbackTitle;
    }

    frame.srcdoc = buildViewerHtml(raw);
    modal.hidden = false;
    modal.style.display = "flex";
    modal.dataset.modalVisible = "true";
    setPageModalState(true);
    return true;
  }

  window.Simo3DViewer = {
    open(src, title) {
      return openViewer(src, title);
    },
    close() {
      closeViewer();
    },
  };
})();