/* preview.js
   Drop-in preview modal that loads /preview.html in an iframe.
   Safe: no dependencies, no API calls, doesn't touch chat input handlers.
*/
(function () {
  "use strict";

  const DEFAULT_PREVIEW_PATH = "/preview.html";

  function ensureStyles() {
    if (document.getElementById("simo-preview-style")) return;

    const style = document.createElement("style");
    style.id = "simo-preview-style";
    style.textContent = `
      .simoPreviewOverlay{
        position:fixed; inset:0; z-index:9999;
        display:flex; align-items:center; justify-content:center;
        background:rgba(0,0,0,.55);
        padding:16px;
      }
      .simoPreviewModal{
        width:min(1100px, 100%);
        height:min(720px, 100%);
        background:#0b1220;
        border:1px solid rgba(255,255,255,.12);
        border-radius:14px;
        box-shadow:0 20px 70px rgba(0,0,0,.55);
        overflow:hidden;
        display:flex; flex-direction:column;
      }
      .simoPreviewBar{
        display:flex; align-items:center; justify-content:space-between;
        padding:10px 12px;
        background:rgba(255,255,255,.06);
        border-bottom:1px solid rgba(255,255,255,.10);
        color:#eaf1ff;
        font:600 14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
      }
      .simoPreviewBar .left{
        display:flex; gap:10px; align-items:center; min-width:0;
      }
      .simoPreviewPill{
        padding:4px 8px; border-radius:999px;
        background:rgba(99,102,241,.18);
        border:1px solid rgba(99,102,241,.35);
        color:#cfd7ff;
        font-weight:700;
        font-size:12px;
        flex:0 0 auto;
      }
      .simoPreviewTitle{
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        font-weight:700;
      }
      .simoPreviewBar .right{
        display:flex; gap:8px; align-items:center;
      }
      .simoPreviewBtn{
        appearance:none; border:1px solid rgba(255,255,255,.16);
        background:rgba(255,255,255,.08);
        color:#eaf1ff;
        padding:8px 10px;
        border-radius:10px;
        cursor:pointer;
        font:600 13px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial;
      }
      .simoPreviewBtn:hover{ background:rgba(255,255,255,.12); }
      .simoPreviewFrame{
        width:100%; height:100%;
        border:0;
        background:#ffffff;
      }
      .simoPreviewHint{
        padding:10px 12px;
        color:rgba(234,241,255,.85);
        font:500 12px/1.3 system-ui, -apple-system, Segoe UI, Roboto, Arial;
        border-top:1px solid rgba(255,255,255,.10);
        background:rgba(255,255,255,.04);
      }
    `;
    document.head.appendChild(style);
  }

  function closeModal() {
    const overlay = document.getElementById("simoPreviewOverlay");
    if (overlay) overlay.remove();
    document.removeEventListener("keydown", onEsc);
  }

  function onEsc(e) {
    if (e.key === "Escape") closeModal();
  }

  function openPreview(opts) {
    ensureStyles();

    const url = (opts && opts.url) ? opts.url : DEFAULT_PREVIEW_PATH;
    const title = (opts && opts.title) ? opts.title : "App preview";
    const badge = (opts && opts.badge) ? opts.badge : "PREVIEW";

    closeModal();

    const overlay = document.createElement("div");
    overlay.id = "simoPreviewOverlay";
    overlay.className = "simoPreviewOverlay";
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) closeModal();
    });

    const modal = document.createElement("div");
    modal.className = "simoPreviewModal";

    const bar = document.createElement("div");
    bar.className = "simoPreviewBar";

    const left = document.createElement("div");
    left.className = "left";

    const pill = document.createElement("span");
    pill.className = "simoPreviewPill";
    pill.textContent = badge;

    const ttl = document.createElement("div");
    ttl.className = "simoPreviewTitle";
    ttl.textContent = title;

    left.appendChild(pill);
    left.appendChild(ttl);

    const right = document.createElement("div");
    right.className = "right";

    const openNew = document.createElement("button");
    openNew.className = "simoPreviewBtn";
    openNew.type = "button";
    openNew.textContent = "Open in new tab";
    openNew.addEventListener("click", () => window.open(url, "_blank", "noopener"));

    const close = document.createElement("button");
    close.className = "simoPreviewBtn";
    close.type = "button";
    close.textContent = "Close";
    close.addEventListener("click", closeModal);

    right.appendChild(openNew);
    right.appendChild(close);

    bar.appendChild(left);
    bar.appendChild(right);

    const frame = document.createElement("iframe");
    frame.className = "simoPreviewFrame";
    frame.src = url;
    frame.title = title;

    const hint = document.createElement("div");
    hint.className = "simoPreviewHint";
    hint.textContent = "Tip: Press Esc to close. This preview is static (no API).";

    modal.appendChild(bar);
    modal.appendChild(frame);
    modal.appendChild(hint);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    document.addEventListener("keydown", onEsc);
  }

  function maybeHandlePreviewIntent(userText) {
    const t = String(userText || "").toLowerCase();

    const wantsPreview =
      t.includes("show me a preview") ||
      t.includes("show a preview") ||
      t.includes("ui mockup") ||
      t.includes("mock up") ||
      t.includes("mockup") ||
      t.includes("wireframe") ||
      t.includes("what would it look like") ||
      (t.includes("preview") && (t.includes("app") || t.includes("ui")));

    if (!wantsPreview) return { handled: false };

    let title = "App preview";
    if (t.includes("bakery")) title = "Bakery app — one-page mockup";
    if (t.includes("space") || t.includes("driveway") || t.includes("parking")) title = "Space renting app — one-page mockup";

    openPreview({ url: DEFAULT_PREVIEW_PATH, title, badge: "PREVIEW" });
    return { handled: true };
  }

  window.SimoPreview = {
    open: openPreview,
    close: closeModal,
    maybeHandle: maybeHandlePreviewIntent,
    path: DEFAULT_PREVIEW_PATH
  };
})();
