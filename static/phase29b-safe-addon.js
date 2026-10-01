// PHASE 14M-R10.2 NEXT — Isolated Design Suggestions Helper
// Safe add-on only.
// Includes the missing toTitleCase utility restore.
// Adds "Design Suggestions" inside Simo visual design cards.
// No image upload code. No fetch wrapper. No send patch. No floating helper. No sidebar/library/account changes.

(function () {
  "use strict";

  if (window.__SIMO_R102_ISOLATED_DESIGN_HELPER__) return;
  window.__SIMO_R102_ISOLATED_DESIGN_HELPER__ = true;

  const PHASE = "PHASE 14M-R10.2 NEXT — Isolated Design Suggestions Helper";

  if (typeof window.toTitleCase !== "function") {
    window.toTitleCase = function (value) {
      return String(value || "")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\w\S*/g, function (word) {
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        });
    };
  }

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
    return String(value || "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function setComposerText(text) {
    const input = $("chatInput") || document.querySelector("textarea, input[type='text']");
    if (!input) return;
    input.value = text || "";
    input.focus();
    try { input.dispatchEvent(new Event("input", { bubbles: true })); } catch {}
    try { input.dispatchEvent(new Event("change", { bubbles: true })); } catch {}
    const hint = $("loadingHint") || document.querySelector(".loading-hint, [data-simo-status]");
    if (hint) hint.textContent = "Design suggestion loaded into composer.";
  }

  function decodeProject(card) {
    const raw = card && card.getAttribute("data-simo-project");
    if (raw) {
      try { return JSON.parse(decodeURIComponent(raw)); } catch {}
    }
    const title = card?.querySelector("h1,h2,h3,strong")?.textContent || card?.textContent?.slice(0, 120) || "this design concept";
    return { title, item: title, category: "", prompt: title };
  }

  function projectTitle(project) {
    return String(project?.title || project?.item || project?.latestPrompt || project?.prompt || "this design concept").trim();
  }

  function categoryFor(project) {
    const blob = clean([project?.title, project?.item, project?.category, project?.kind, project?.prompt, project?.latestPrompt].filter(Boolean).join(" "));
    if (/\b(guitar|bass|instrument|pickup|headstock|fretboard|strings?|tuning|bridge|knobs?)\b/.test(blob)) return "instrument";
    if (/\b(house|home|mansion|villa|cabin|garage|pool|architecture|roof|windows?|landscape)\b/.test(blob)) return "home";
    if (/\b(rim|rims|wheel|alloy|tire|car|vehicle|supercar|truck|motorcycle)\b/.test(blob)) return "vehicle";
    if (/\b(app|website|dashboard|ui|ux|screen|interface|software|digital)\b/.test(blob)) return "digital";
    if (/\b(book cover|book jacket|cover design|editorial|novel|memoir|autobiography)\b/.test(blob)) return "editorial";
    if (/\b(chair|table|sofa|desk|cabinet|furniture)\b/.test(blob)) return "furniture";
    return "product";
  }

  function suggestionsFor(project) {
    const title = projectTitle(project);
    const cat = categoryFor(project);
    function p(label, prompt) { return { label, prompt: prompt.replace(/\{\{TITLE\}\}/g, title) }; }
    if (cat === "instrument") return [
      p("Body shape", 'For "{{TITLE}}", suggest 4 stronger body-shape directions while keeping the same instrument concept.'),
      p("Neck / headstock", 'For "{{TITLE}}", suggest neck and headstock refinements that fit this exact design.'),
      p("Pickups", 'For "{{TITLE}}", suggest pickup layouts and how they affect the visual identity.'),
      p("Hardware", 'For "{{TITLE}}", refine the bridge, tuners, knobs, and metal finish.'),
      p("Materials & finish", 'For "{{TITLE}}", suggest premium woods, materials, and finish options.'),
      p("Colors & graphics", 'For "{{TITLE}}", suggest bold color and graphic directions.'),
      p("Stage version", 'For "{{TITLE}}", make it look more stage-ready and premium while keeping the same concept.')
    ];
    if (cat === "home") return [
      p("Exterior style", 'For "{{TITLE}}", suggest stronger exterior style directions while keeping this same home concept.'),
      p("Garage design", 'For "{{TITLE}}", suggest garage layout upgrades, including a 3-car option if it fits.'),
      p("Pool / outdoor", 'For "{{TITLE}}", suggest pool and outdoor living upgrades.'),
      p("Windows & glass", 'For "{{TITLE}}", improve the windows, glass, and natural-light strategy.'),
      p("Roofline", 'For "{{TITLE}}", suggest roofline and architecture refinements.'),
      p("Materials", 'For "{{TITLE}}", suggest premium exterior materials and finishes.'),
      p("Landscape", 'For "{{TITLE}}", suggest landscaping and lighting ideas.')
    ];
    if (cat === "vehicle") return [
      p("Shape / stance", 'For "{{TITLE}}", suggest shape and stance refinements while keeping this same vehicle/wheel concept.'),
      p("Rim / wheel style", 'For "{{TITLE}}", suggest rim, spoke, lip, and finish directions.'),
      p("Lighting", 'For "{{TITLE}}", suggest lighting accents or reflective details that fit.'),
      p("Paint / finish", 'For "{{TITLE}}", suggest premium paint, coating, or metal finish options.'),
      p("Performance details", 'For "{{TITLE}}", suggest performance-inspired details that still fit the design.'),
      p("Premium version", 'For "{{TITLE}}", make it feel more luxury/premium without switching the subject.')
    ];
    if (cat === "digital") return [
      p("Layout", 'For "{{TITLE}}", suggest a cleaner layout and hierarchy.'),
      p("Navigation", 'For "{{TITLE}}", suggest navigation and user-flow improvements.'),
      p("Colors", 'For "{{TITLE}}", suggest a stronger color system.'),
      p("Cards / panels", 'For "{{TITLE}}", suggest card, panel, and dashboard improvements.'),
      p("Mobile version", 'For "{{TITLE}}", suggest how this should adapt on mobile.'),
      p("Premium polish", 'For "{{TITLE}}", suggest premium UI polish without changing the product.')
    ];
    if (cat === "editorial") return [
      p("Title treatment", 'For "{{TITLE}}", suggest stronger title typography and placement.'),
      p("Author layout", 'For "{{TITLE}}", suggest author-name placement and visual hierarchy.'),
      p("Mood", 'For "{{TITLE}}", suggest mood, lighting, and cover atmosphere.'),
      p("Symbolism", 'For "{{TITLE}}", suggest symbolic visual elements that match the story.'),
      p("Back cover", 'For "{{TITLE}}", suggest back-cover and spine ideas.'),
      p("Premium edition", 'For "{{TITLE}}", make it feel like a premium published book cover.')
    ];
    if (cat === "furniture") return [
      p("Shape / silhouette", 'For "{{TITLE}}", suggest shape and silhouette refinements.'),
      p("Materials", 'For "{{TITLE}}", suggest premium material options.'),
      p("Comfort / function", 'For "{{TITLE}}", suggest comfort and functional improvements.'),
      p("Colors / finish", 'For "{{TITLE}}", suggest color and finish directions.'),
      p("Room setting", 'For "{{TITLE}}", suggest matching interior setting ideas.'),
      p("Premium version", 'For "{{TITLE}}", make it feel more high-end while keeping the same furniture concept.')
    ];
    return [
      p("Shape / form", 'For "{{TITLE}}", suggest shape and form refinements while keeping the same concept.'),
      p("Materials", 'For "{{TITLE}}", suggest premium material options.'),
      p("Color / finish", 'For "{{TITLE}}", suggest color and finish directions.'),
      p("Functional details", 'For "{{TITLE}}", suggest functional detail improvements.'),
      p("Size / proportions", 'For "{{TITLE}}", suggest better size and proportion options.'),
      p("Texture / grip", 'For "{{TITLE}}", suggest texture, grip, or surface treatment ideas.'),
      p("Accessories", 'For "{{TITLE}}", suggest matching accessory ideas.'),
      p("Use case", 'For "{{TITLE}}", suggest use-case variations for different users.')
    ];
  }

  function ensureStyles() {
    if ($("simoR102DesignHelperStyles")) return;
    const style = document.createElement("style");
    style.id = "simoR102DesignHelperStyles";
    style.textContent = `
      .simo-r102-actions-spaced{gap:12px!important;row-gap:12px!important;align-items:center!important;}
      .simo-r102-actions-spaced > button,.simo-r102-actions-spaced > a{margin:0!important;min-height:38px!important;line-height:1.15!important;}
      .simo-r102-design-suggestions-wrap{display:grid;gap:10px;margin-top:4px;padding-top:12px;border-top:1px solid rgba(255,255,255,.075);}
      .simo-r102-design-suggestions-toggle-row{display:flex;justify-content:flex-start;align-items:center;gap:10px;flex-wrap:wrap;}
      .simo-r101-design-suggestions-panel{display:none;margin-top:0;padding:14px;border-radius:16px;border:1px solid rgba(255,255,255,.10);background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.025));}
      .simo-r101-design-suggestions-panel[data-open="true"]{display:block;}
      .simo-r101-design-suggestions-title{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#c7d8ff;font-weight:950;margin-bottom:8px;}
      .simo-r101-design-suggestions-note{font-size:12px;color:#d7e3fb;margin-bottom:12px;}
      .simo-r101-design-suggestions-row{display:flex;flex-wrap:wrap;gap:10px;row-gap:10px;}
      .simo-r101-design-suggestions-btn,.simo-r101-design-suggestions-chip{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#eef4ff;border-radius:999px;padding:9px 12px;font-size:12px;font-weight:900;cursor:pointer;line-height:1.15;}
      .simo-r101-design-suggestions-btn{background:rgba(110,168,255,.12);border-color:rgba(110,168,255,.26);box-shadow:0 8px 20px rgba(0,0,0,.14);}
      .simo-r101-design-suggestions-btn:hover,.simo-r101-design-suggestions-chip:hover{background:rgba(255,255,255,.10);transform:translateY(-1px);}
      @media (max-width:720px){.simo-r102-actions-spaced{gap:10px!important;}.simo-r102-actions-spaced > button,.simo-r102-actions-spaced > a,.simo-r101-design-suggestions-btn,.simo-r101-design-suggestions-chip{width:auto;max-width:100%;}}
    `;
    document.head.appendChild(style);
  }

  function findActionBar(card) {
    const special3d = card.querySelector('[data-simo-vc-special="open-3d"]');
    if (special3d && special3d.parentElement) return special3d.parentElement;
    const buttons = Array.from(card.querySelectorAll("button, a")).filter((el) => {
      const t = clean(el.textContent);
      return t.includes("generate realistic") || t.includes("generate variation") || t.includes("continue editing") || t.includes("3d") || t.includes("save to library") || t.includes("open image");
    });
    if (buttons.length) return buttons[0].parentElement;
    return null;
  }

  function makePanel(project) {
    const panel = document.createElement("div");
    panel.className = "simo-r101-design-suggestions-panel";
    const items = suggestionsFor(project);
    panel.__simoSuggestions = items;
    panel.innerHTML = `
      <div class="simo-r101-design-suggestions-title">Design Suggestions</div>
      <div class="simo-r101-design-suggestions-note">Click one to load a smart edit prompt for this exact concept.</div>
      <div class="simo-r101-design-suggestions-row">
        ${items.map((item, index) => `<button type="button" class="simo-r101-design-suggestions-chip" data-simo-r101-suggestion="${index}">${esc(item.label)}</button>`).join("")}
      </div>
    `;
    panel.addEventListener("click", function (event) {
      const btn = event.target.closest("[data-simo-r101-suggestion]");
      if (!btn) return;
      const index = Number(btn.getAttribute("data-simo-r101-suggestion"));
      const item = panel.__simoSuggestions && panel.__simoSuggestions[index];
      if (item) setComposerText(item.prompt);
    });
    return panel;
  }

  function findSuggestionAnchor(actionBar) {
    const parent = actionBar && actionBar.parentElement;
    if (!parent) return null;
    const children = Array.from(parent.children || []);
    const controlBlock = children.find((child) => clean(child.textContent).includes("design controls for this exact concept"));
    return controlBlock || children[children.length - 1] || actionBar;
  }

  function attachToCard(card) {
    if (!card || card.dataset.simoR102DesignHelperAttached === "true" || card.dataset.simoR101DesignHelperAttached === "true") return;
    const actionBar = findActionBar(card);
    if (!actionBar) return;
    card.dataset.simoR102DesignHelperAttached = "true";
    card.dataset.simoR101DesignHelperAttached = "true";
    actionBar.classList.add("simo-r102-actions-spaced");

    const project = decodeProject(card);
    const panel = makePanel(project);
    const wrap = document.createElement("div");
    wrap.className = "simo-r102-design-suggestions-wrap";

    const toggleRow = document.createElement("div");
    toggleRow.className = "simo-r102-design-suggestions-toggle-row";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "simo-r101-design-suggestions-btn";
    toggle.textContent = "Design Suggestions";
    toggle.addEventListener("click", function () {
      const open = panel.getAttribute("data-open") === "true";
      panel.setAttribute("data-open", open ? "false" : "true");
      toggle.setAttribute("aria-expanded", open ? "false" : "true");
    });
    toggle.setAttribute("aria-expanded", "false");

    toggleRow.appendChild(toggle);
    wrap.appendChild(toggleRow);
    wrap.appendChild(panel);

    const anchor = findSuggestionAnchor(actionBar);
    if (anchor && anchor.parentElement) anchor.parentElement.insertBefore(wrap, anchor.nextSibling);
    else if (actionBar.parentElement) actionBar.parentElement.appendChild(wrap);
  }

  function attachAll() {
    ensureStyles();
    document.querySelectorAll(".simo-vc-card").forEach(attachToCard);
    document.querySelectorAll(".msg-bubble-assistant, .simo105d-row").forEach((node) => {
      if (node.querySelector(".simo-vc-card")) return;
      if (findActionBar(node)) attachToCard(node);
    });
  }

  function boot() {
    attachAll();
    const observer = new MutationObserver(attachAll);
    observer.observe(document.body, { childList: true, subtree: true });
    console.log("[SIMO] " + PHASE + " loaded");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
