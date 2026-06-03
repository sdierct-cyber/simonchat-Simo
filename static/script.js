// PHASE 10.7B — Exact Object + Persistent Workspace
// Runs after the legacy script and stays isolated from its internals.
(function () {
  "use strict";

  const PHASE = "PHASE 14M-R10.45G-V1323/V1.3.22 — Server Image Credit Gate Compatible";
  const ACTIVE_KEY = "simo_phase105d_active_visual_project_v1";
  const LEGACY_ACTIVE_KEY = "simo_active_visual_project_v1";
  const LIB_KEY = "simo_builder_library_v5_1_builder_first";
  const LAST_PREVIEW_KEY = "simo_last_preview_v2";
  const PREVIEW_HISTORY_KEY = "simo_preview_history_v1";
  const VISUAL_CONCEPTS_KEY = "simo_visual_concepts_v1";
  const CREATIVE_KEY = "simo_active_creative_context_v1";

  window.__SIMO_PHASE_MARKER__ = PHASE;

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  function clean(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getCreativeContext() {
    try {
      const raw = localStorage.getItem(CREATIVE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function isPureWritingPrompt(prompt) {
    const t = clean(prompt);
    if (!t) return false;
    const writingWords = /\b(write|writing|autobiography|memoir|essay|story|novel|biography|chapter|outline|manuscript|book)\b/.test(t);
    const explicitVisual = /\b(book cover|book jacket|dust jacket|cover design|poster|flyer|illustration|image|visual|render|mockup|design a cover|build me a book cover|make me a book cover)\b/.test(t);
    const textOnlyAsk = /\b(help me write|write me|write an|write a|draft|outline|ghostwrite|summarize|edit this writing)\b/.test(t);
    if (explicitVisual) return false;
    return writingWords && textOnlyAsk;
  }

  function enrichPromptWithCreativeContext(prompt) {
    const raw = String(prompt || "").trim();
    const t = clean(raw);
    const creative = getCreativeContext();
    if (!creative || !creative.prompt) return raw;
    if (!/\b(book cover|book jacket|dust jacket|cover design)\b/.test(t)) return raw;
    return `${raw}\n\nActive writing project context: ${creative.prompt}\nDesign this as a visual continuation of that writing project. Keep the story theme and subject matter connected.`;
  }

  function titleCase(value) {
    return String(value || "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function slugify(value) {
    return clean(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function simo14fTextBlob(value) {
    if (!value || typeof value !== "object") return clean(value || "");
    return clean([
      value.lockedSubject, value.exactSubject, value.requestedAsset, value.item,
      value.title, value.alt, value.prompt, value.sourcePrompt, value.latestPrompt,
      value.category, value.domain, value.projectType,
      value.designState && value.designState.lockedSubject,
      value.designState && value.designState.item,
      value.designState && value.designState.domain,
    ].filter(Boolean).join(" "));
  }

  function simo14fIsRimText(value) {
    return /\b(tire\s+rim|wheel\s+rim|alloy\s+wheel|forged\s+wheel|custom\s+wheel|rim|rims)\b/i.test(clean(value || ""));
  }

  function simo14fIsGuitarText(value) {
    return /\b(bass\s+guitar|electric\s+guitar|guitar|headstock|fretboard|pickups?|strings?)\b/i.test(clean(value || ""));
  }

  function simo14fExactLockFromProject(project, fallbackPrompt) {
    const blob = `${simo14fTextBlob(project)} ${clean(fallbackPrompt || "")}`;
    if (simo14fIsRimText(blob)) return { kind: "rim", category: "product", item: "single standalone custom tire rim / alloy wheel", title: "Tire Rim — Product Concept" };
    if (simo14fIsGuitarText(blob)) return { kind: "guitar", category: "instrument", item: "single standalone custom guitar / bass guitar", title: "Instrument Concept" };
    return null;
  }

  function simo14fApplyExactLock(project, promptText) {
    if (!project || typeof project !== "object") return project;
    const lock = simo14fExactLockFromProject(project, promptText);
    if (!lock) return project;
    project.category = lock.category;
    project.kind = lock.category === "product" ? "product" : (project.kind || lock.category);
    project.item = lock.item;
    project.lockedSubject = lock.item;
    project.title = lock.title;
    project.controls = controlsFor(project.category);
    project.exactObjectLock = lock;
    return project;
  }

  function getChat() {
    return $("chatMessages") || $("chat") || document.querySelector(".chat-wrap") || document.body;
  }

  function getInput() {
    return $("chatInput") || document.querySelector("textarea, input[type='text']");
  }

  function scrollDown() {
    const chatWrap = document.querySelector(".chat-wrap") || $("chat") || document.scrollingElement || document.documentElement;
    try { chatWrap.scrollTop = chatWrap.scrollHeight; } catch {}
    try { window.scrollTo(0, document.documentElement.scrollHeight); } catch {}
  }

  function clearInput() {
    const input = getInput();
    if (!input) return;
    input.value = "";
    try { input.dispatchEvent(new Event("input", { bubbles: true })); } catch {}
  }

  function addRow(role, html) {
    const chat = getChat();
    const row = document.createElement("div");
    row.className = `msg-row msg-${role} simo105d-row`;
    row.innerHTML = html;
    chat.appendChild(row);
    scrollDown();
    return row;
  }

  function addUser(text) {
    return addRow("user", `<div class="msg-bubble msg-bubble-user">${esc(text)}</div>`);
  }

  function addAssistant(html) {
    return addRow("assistant", `<div class="msg-bubble msg-bubble-assistant" style="max-width:min(1080px,96%);width:100%;">${html}</div>`);
  }

  function removeRow(row) {
    try { row && row.remove(); } catch {}
  }

  function getStatusEl() {
    return $("loadingHint") || $("statusText") || $("readyStatus") || document.querySelector(".status, .footer-status, .loading-hint, [data-simo-status]");
  }

  function setSimoStatus(text, busy) {
    const value = String(text || "Ready.");
    const el = getStatusEl();
    if (el) {
      el.textContent = value;
      el.dataset.simoBusy = busy ? "true" : "false";
      el.style.opacity = busy ? "1" : "";
      el.style.color = busy ? "#dce8ff" : "";
    }
    try {
      window.__SIMO_VISUAL_STATUS__ = { text: value, busy: !!busy, at: Date.now() };
      window.dispatchEvent(new CustomEvent("simo:visual-status", { detail: window.__SIMO_VISUAL_STATUS__ }));
    } catch {}
  }

  function setButtonBusy(btn, busy, label) {
    if (!btn) return;
    if (busy) {
      if (!btn.dataset.simoOriginalText) btn.dataset.simoOriginalText = btn.textContent || "";
      btn.disabled = true;
      btn.style.opacity = "0.72";
      btn.style.pointerEvents = "none";
      btn.textContent = label || "Working…";
      btn.setAttribute("aria-busy", "true");
    } else {
      btn.disabled = false;
      btn.style.opacity = "";
      btn.style.pointerEvents = "";
      btn.textContent = btn.dataset.simoOriginalText || btn.textContent || "Done";
      btn.removeAttribute("aria-busy");
    }
  }

  function statusTextForAction(action, category) {
    const a = clean(action || "base");
    const c = titleCase(category || "design");
    if (a.includes("render")) return `Generating stronger ${c} render…`;
    if (a.includes("variation")) return `Generating ${c} variations…`;
    if (a.includes("workspace")) return `Opening ${c} rotate/design workspace…`;
    if (actionIsMeaningful(action)) return `Refining ${c} design…`;
    return `Building ${c} visual result…`;
  }

  function api(path, payload) {
    return fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    }).then(async (res) => {
      const ct = res.headers.get("content-type") || "";
      const data = ct.includes("application/json") ? await res.json() : await res.text();
      if (!res.ok) {
        const msg = data && (data.error || data.message) ? (data.error || data.message) : `Request failed: ${res.status}`;
        throw new Error(msg);
      }
      return data;
    });
  }


  function safeJsonParse(raw, fallback) {
    try { return JSON.parse(raw); } catch { return fallback; }
  }


function normalizeTitleWords(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b(show me|show|make|create|build|design|generate|give me|i want|for me to design|for me|please|can you|could you|concept|render|visualize|view|draw|draft|mockup|prototype|3d|three d|3 d|model|viewer|rotate|rotating|to design|for design|to edit|for editing)\b/gi, " ")
    .replace(/\b(a|an|the)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSubjectPhrase(value, fallback) {
  let text = String(value || "").trim();
  if (!text) return normalizeTitleWords(fallback) || "Visual Concept";

  text = text
    .replace(/^continue this same active visual\/design project\s*:\s*/i, "")
    .replace(/^user wants\s*:\s*/i, "")
    .replace(/\bdo not switch domains\b[\s\S]*$/i, "")
    .replace(/\bpreserve project identity\b[\s\S]*$/i, "")
    .replace(/\btreat this like a chatgpt\/grok image-first design refinement\b[\s\S]*$/i, "")
    .replace(/^(please\s+)?(can you\s+|could you\s+|would you\s+|i want\s+|i want you to\s+|i need\s+|show me\s+|show us\s+|build me\s+|build us\s+|build\s+|make me\s+|make us\s+|make\s+|create me\s+|create us\s+|create\s+|design me\s+|design us\s+|design\s+|generate me\s+|generate us\s+|generate\s+|give me\s+|give us\s+|render\s+|visualize\s+|draft\s+|draw\s+)/i, "")
    .replace(/^an?\s+/i, "")
    .replace(/^the\s+/i, "")
    .replace(/\b(that|which)\s+i\s+can\s+(edit|design|refine).*$/i, "")
    .replace(/\bfor me to\s+(edit|design|refine).*$/i, "")
    .replace(/\bto\s+(edit|design|refine).*$/i, "")
    .replace(/\b(with|featuring|including)\b\s+/i, " with ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return normalizeTitleWords(fallback) || "Visual Concept";
  const clipped = text.split(/\s+/).filter(Boolean).slice(0, 12).join(" ");
  return normalizeTitleWords(clipped) || normalizeTitleWords(fallback) || "Visual Concept";
}

function smartShortTitle(value, fallback) {
  const cleaned = extractSubjectPhrase(value, fallback);
  const words = cleaned.split(/\s+/).filter(Boolean);
  const clipped = words.slice(0, 8).join(" ");
  return titleCase(clipped || "Visual Concept");
}

function displayTitle(project) {

    const item = smartShortTitle(project && (project.item || project.latestPrompt || project.prompt), "Visual Concept");
    const category = String(project && project.category || "object").toLowerCase();
    const suffixMap = {
      vehicle: "Vehicle Concept",
      marine: "Marine Concept",
      instrument: "Instrument Concept",
      home: "Architecture Concept",
      interior: "Interior Concept",
      product: "Product Concept",
      industrial: "Industrial Product Concept",
      wearable: "Wearable Concept",
      furniture: "Furniture Concept",
      brand: "Brand Concept",
      digital: "Digital Product Concept",
      editorial: "Book Cover Concept",
      object: "Design Concept",
    };
    const suffix = suffixMap[category] || "Design Concept";
    const itemLow = item.toLowerCase();
    const core = suffix.toLowerCase().replace(" concept", "");
    if (itemLow.includes(core) || itemLow.endsWith("concept")) return item;
    return `${item} — ${suffix}`;
  }

  function libraryTagsFor(project) {
    const category = String(project && project.category || "visual").toLowerCase();
    return Array.from(new Set(["visual", "design", "image-first", category].filter(Boolean)));
  }

  function projectSourceText(project) {
    const title = displayTitle(project);
    const payload = {
      phase: PHASE,
      type: "simo_visual_project",
      title,
      category: project?.category || "object",
      kind: project?.kind || "design",
      item: project?.item || "",
      prompt: project?.prompt || "",
      latestPrompt: project?.latestPrompt || "",
      imageUrl: project?.imageUrl || "",
      controls: Array.isArray(project?.controls) ? project.controls : [],
      updatedAt: new Date().toISOString(),
    };
    return `[SIMO_VISUAL_PROJECT]\n${JSON.stringify(payload, null, 2)}`;
  }

  function setLastPreviewForVisual(html, title) {
    const now = new Date().toISOString();
    const payload = { html: String(html || ""), title: String(title || "Simo Visual Concept"), savedAt: now };
    try { localStorage.setItem(LAST_PREVIEW_KEY, JSON.stringify(payload)); } catch {}

    try {
      const existing = safeJsonParse(localStorage.getItem(PREVIEW_HISTORY_KEY), []);
      const list = Array.isArray(existing) ? existing : [];
      const next = [
        { id: `preview_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, title: payload.title, html: payload.html, savedAt: now },
        ...list.filter((item) => item && !(item.title === payload.title && item.html === payload.html)),
      ].slice(0, 8);
      localStorage.setItem(PREVIEW_HISTORY_KEY, JSON.stringify(next));
    } catch {}
  }

  function rememberVisualConcept(item, project) {
    try {
      const existing = safeJsonParse(localStorage.getItem(VISUAL_CONCEPTS_KEY), []);
      const list = Array.isArray(existing) ? existing : [];
      const next = [
        {
          id: item.id,
          title: item.title,
          url: project?.imageUrl || "",
          imageUrl: project?.imageUrl || "",
          category: project?.category || "object",
          item: project?.item || item.title,
          libraryId: item.id,
          savedAt: item.createdAt || new Date().toISOString(),
        },
        ...list.filter((x) => x && x.id !== item.id && x.url !== project?.imageUrl),
      ].slice(0, 40);
      localStorage.setItem(VISUAL_CONCEPTS_KEY, JSON.stringify(next));
    } catch {}
  }


  function actionIsMeaningful(action) {
    const a = clean(action || "");
    return !!a && !["base", "open", "workspace", "workspace-edit"].includes(a);
  }

  function actionTitleFromPrompt(prompt, fallback) {
    const raw = String(prompt || "");
    const match = raw.match(/User wants:\s*([^\.]+)\./i);
    const label = match && match[1] ? match[1].trim() : "";
    return label || fallback || "Refine";
  }

  function domainActionBrief(category, label) {
    const cat = String(category || "object").toLowerCase();
    const action = String(label || "Refine").trim() || "Refine";
    const actionLow = clean(action);

    const shared = {
      headline: `${action} design pass`,
      visual: "Create a visibly updated render, not just a text response.",
      keep: "Keep the same object, same project identity, and same domain.",
      camera: "Use a premium studio/product-render presentation unless the domain needs architecture or UI context.",
      details: ["visible form change", "material/finish change", "lighting upgrade", "clear design rationale"],
    };

    const map = {
      instrument: {
        headline: `${action} instrument pass`,
        visual: "Show a clearly changed guitar/instrument concept with visible body, neck, headstock, pickups, bridge, knobs, strings, graphics, and finish decisions.",
        keep: "Stay only in instrument/guitar/product design mode. No homes, garages, pools, cars, driveways, or buildings.",
        camera: "Use a clean studio turntable/product render angle so the user can imagine rotating and editing it.",
        details: ["body silhouette", "neck/headstock", "pickup/electronics", "hardware", "finish/graphics"],
      },
      home: {
        headline: `${action} architecture pass`,
        visual: "Show a visibly updated premium architectural render with clear exterior massing, garage/pool/landscape/material changes when relevant.",
        keep: "Stay only in home/architecture design mode. Keep the same luxury house direction.",
        camera: "Use a high-end architectural visualization angle with realistic lighting and depth.",
        details: ["exterior massing", "garage/pool options", "glass/windows", "materials", "landscape/lighting"],
      },
      digital: {
        headline: `${action} digital UI pass`,
        visual: "Show a visibly improved app/web UI screen with stronger layout, hierarchy, navigation, components, CTA flow, spacing, and polish.",
        keep: "Stay only in digital product/UI mode. Do not turn this into a house, product render, or physical object.",
        camera: "Use a crisp modern screen mockup, dashboard frame, or mobile/desktop product preview.",
        details: ["screen layout", "navigation", "components", "visual hierarchy", "CTA flow"],
      },
      editorial: {
        headline: `${action} book-cover pass`,
        visual: "Show a visibly changed premium book-cover concept with stronger typography, cover imagery, copy hierarchy, mood, and print-finish direction.",
        keep: "Stay only in editorial/book-cover design mode. Keep it tied to the same book/story theme.",
        camera: "Use a clean front-cover mockup or premium editorial presentation angle.",
        details: ["title hierarchy", "cover imagery", "author/subtitle", "palette", "print finish"],
      },
      vehicle: {
        headline: `${action} vehicle pass`,
        visual: "Show a visibly changed vehicle concept with updated stance, body lines, wheels, lighting, aero, paint, and cockpit direction.",
        keep: "Stay only in vehicle/automotive design mode.",
        camera: "Use a studio turntable or cinematic automotive render angle.",
        details: ["stance", "body/aero", "wheels", "lighting", "paint/interior"],
      },
      industrial: {
        headline: `${action} industrial product pass`,
        visual: "Show a visibly changed industrial product with function, mounting, weatherproofing, optics, materials, installation context, and safety details.",
        keep: "Stay only in industrial/product design mode.",
        camera: "Use a clean engineering/product render angle with practical installation context.",
        details: ["fixture head", "mounting", "materials", "weatherproofing", "light pattern/safety"],
      },
      brand: {
        headline: `${action} brand pass`,
        visual: "Show a visibly improved logo/identity direction with mark, typography, color, mockup usage, and brand system polish.",
        keep: "Stay only in brand/logo identity mode.",
        camera: "Use a premium brand board or clean mockup presentation.",
        details: ["logo mark", "type", "palette", "mockups", "brand variants"],
      },
      product: {
        headline: `${action} product pass`,
        visual: "Show a visibly updated physical product/accessory concept with clearer shape, material, function, finish, usability, and packaging direction.",
        keep: "Stay only in the same product/accessory category.",
        camera: "Use a clean studio product render angle.",
        details: ["shape", "materials", "function", "finish", "packaging/usability"],
      },
      furniture: {
        headline: `${action} furniture pass`,
        visual: "Show a visibly updated furniture concept with changed form, ergonomics, frame, cushions, materials, legs/base, finish, and room context.",
        keep: "Stay only in furniture design mode.",
        camera: "Use a premium room/studio product angle.",
        details: ["frame", "ergonomics", "materials", "comfort", "room context"],
      },
      wearable: {
        headline: `${action} wearable pass`,
        visual: "Show a visibly updated wearable/fashion product with silhouette, fit, materials, hardware, finish, colorway, and branding.",
        keep: "Stay only in wearable/fashion product mode.",
        camera: "Use a clean lookbook/product render presentation.",
        details: ["silhouette", "fit", "materials", "hardware", "branding/colorway"],
      },
      interior: {
        headline: `${action} interior pass`,
        visual: "Show a visibly updated interior design with layout, furniture, walls, flooring, lighting, materials, ceiling details, and mood.",
        keep: "Stay only in interior design mode.",
        camera: "Use a premium interior visualization angle.",
        details: ["layout", "furniture", "materials", "lighting", "wall/floor/ceiling details"],
      },
    };

    const picked = map[cat] || shared;

    if (actionLow.includes("variation")) {
      return {
        ...picked,
        headline: `${action} — multiple directions`,
        visual: picked.visual + " Include distinct alternatives while keeping the same exact object/domain.",
        details: [...picked.details, "3 distinct variations"],
      };
    }

    if (actionLow.includes("realistic") || actionLow.includes("render")) {
      return {
        ...picked,
        headline: `${action} — realistic render`,
        visual: picked.visual + " Make it feel like a premium finished render the user can react to immediately.",
        details: [...picked.details, "realistic lighting", "premium presentation"],
      };
    }

    return picked;
  }

  function designPassSvg(project, actionLabel, sourceText) {
    const title = displayTitle(project || {});
    const cat = String(project?.category || "object").toLowerCase();
    if (["digital", "brand", "product", "industrial", "wearable", "furniture", "interior", "object"].includes(cat)) {
      return mockVisualSvg(project, { actionLabel: actionLabel || "Visible refinement pass", sourceText });
    }
    const brief = domainActionBrief(cat, actionLabel);
    const controls = Array.isArray(project?.controls) ? project.controls.slice(0, 5) : controlsFor(cat).slice(0, 5);
    const details = (brief.details || []).slice(0, 5);
    const action = String(actionLabel || project?.action || "Refine").trim() || "Refine";
    const src = String(sourceText || project?.latestPrompt || project?.prompt || "").slice(0, 150);

    const chips = details.map((d, i) => `
      <g transform="translate(110 ${455 + i * 54})">
        <rect width="500" height="38" rx="19" fill="${i % 2 ? '#122036' : '#162844'}" stroke="#ffffff" stroke-opacity=".14"/>
        <text x="22" y="25" fill="#dce8ff" font-family="Arial" font-size="18" font-weight="800">${esc(d).slice(0, 44)}</text>
      </g>`).join("");

    const controlRows = controls.map((d, i) => `
      <g transform="translate(745 ${455 + i * 54})">
        <rect width="540" height="38" rx="19" fill="${i % 2 ? '#171d31' : '#1b2540'}" stroke="#ffffff" stroke-opacity=".13"/>
        <text x="22" y="25" fill="#eaf1ff" font-family="Arial" font-size="18" font-weight="800">${esc(d).slice(0, 48)}</text>
      </g>`).join("");

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#07111f"/><stop offset=".48" stop-color="#101b32"/><stop offset="1" stop-color="#030712"/></linearGradient>
        <radialGradient id="glow" cx="50%" cy="30%" r="70%"><stop offset="0" stop-color="#6ea8ff" stop-opacity=".30"/><stop offset=".52" stop-color="#b982ff" stop-opacity=".15"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="1400" height="900" fill="url(#bg)"/><rect width="1400" height="900" fill="url(#glow)"/>
      <rect x="70" y="64" width="1260" height="772" rx="48" fill="#0b1425" fill-opacity=".91" stroke="#ffffff" stroke-opacity=".18"/>
      <text x="110" y="128" fill="#9fb4dd" font-family="Arial" font-size="20" font-weight="900" letter-spacing="4">SIMO STRONG DESIGN PASS · ${esc(cat.toUpperCase())}</text>
      <text x="110" y="205" fill="#f6f8ff" font-family="Arial" font-size="48" font-weight="900">${esc(title).slice(0, 62)}</text>
      <rect x="110" y="250" width="1180" height="112" rx="28" fill="#050b14" fill-opacity=".78" stroke="#ffffff" stroke-opacity=".12"/>
      <text x="144" y="294" fill="#ffffff" font-family="Arial" font-size="28" font-weight="900">${esc(action).slice(0, 60)}</text>
      <text x="144" y="331" fill="#c7d3ea" font-family="Arial" font-size="20">${esc(brief.visual).slice(0, 112)}</text>
      <text x="110" y="418" fill="#b9c8e7" font-family="Arial" font-size="19" font-weight="900" letter-spacing="2">VISIBLE REFINEMENTS</text>
      ${chips}
      <text x="745" y="418" fill="#b9c8e7" font-family="Arial" font-size="19" font-weight="900" letter-spacing="2">EDITABLE CONTROLS</text>
      ${controlRows}
      <rect x="110" y="755" width="1180" height="54" rx="27" fill="#10213c" stroke="#6ea8ff" stroke-opacity=".25"/>
      <text x="140" y="789" fill="#dce8ff" font-family="Arial" font-size="18" font-weight="800">${esc(src || brief.keep).slice(0, 125)}</text>
    </svg>`;
    return svgDataUri(svg);
  }


  function controlPrompt(project, actionLabel) {
    const label = String(actionLabel || "Refine").trim();
    const category = String(project?.category || "design").toLowerCase();
    const title = displayTitle(project);
    const source = project?.prompt || project?.latestPrompt || project?.item || title;
    const brief = domainActionBrief(category, label);
    return [
      `Continue this same active visual/design project: ${title}.`,
      `User wants: ${label}.`,
      `${brief.keep}`,
      `${brief.visual}`,
      `${brief.camera}`,
      `Make the next result visibly different from the current card. Do not only describe the change. Change at least three visible design details from this list: ${(brief.details || []).join(", ")}.`,
      `Use a new view, crop, version board, or refined render so the user can instantly tell the button did something.`,
      `Treat this like a ChatGPT/Grok image-first design refinement: show the closest updated visual result first, then keep the controls relevant.`,
      `Preserve project identity from the original prompt: ${source}.`,
      `Do not switch domains. Do not use unrelated fallback subjects. If exact 3D is unavailable, keep the connected rotate/design workspace and show a stronger visual design pass.`,
    ].join(" ");
  }

  function actionButton(label, special, tone = "normal") {
    const border = tone === "gold" ? "rgba(255,215,106,.28)" : tone === "blue" ? "rgba(110,168,255,.28)" : tone === "green" ? "rgba(86,240,169,.26)" : "rgba(255,255,255,.14)";
    const bg = tone === "gold" ? "rgba(255,215,106,.12)" : tone === "blue" ? "rgba(110,168,255,.13)" : tone === "green" ? "rgba(86,240,169,.11)" : "rgba(255,255,255,.06)";
    const color = tone === "gold" ? "#fff6d8" : tone === "green" ? "#eafff4" : "#eef4ff";
    return `<button type="button" data-simo-vc-special="${esc(special)}" style="border:1px solid ${border};background:${bg};color:${color};border-radius:999px;padding:10px 13px;font-size:12px;font-weight:950;cursor:pointer;box-shadow:0 8px 20px rgba(0,0,0,.12);">${esc(label)}</button>`;
  }

  function controlButton(label) {
    return `<button type="button" data-simo-vc-action="${esc(label)}" style="border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.07);color:#eef4ff;border-radius:999px;padding:9px 12px;font-size:12px;font-weight:850;cursor:pointer;">${esc(label)}</button>`;
  }

  function visualProjectHtml(project) {
    const title = displayTitle(project);
    const img = project && (project.imageUrl || fallbackImageFor(project) || boardSvg(project));
    const controls = (project && Array.isArray(project.controls) ? project.controls : []).slice(0, 12);
    const source = String(project && (project.latestPrompt || project.prompt || project.item) || "");
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <style>
    :root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#050b14;color:#eef4ff;}
    body{margin:0;min-height:100vh;background:radial-gradient(circle at top left,rgba(110,168,255,.20),transparent 34%),radial-gradient(circle at bottom right,rgba(185,130,255,.14),transparent 30%),linear-gradient(180deg,#07111f,#050b14);}
    .wrap{max-width:1120px;margin:0 auto;padding:28px;display:grid;gap:18px;}
    .card{border:1px solid rgba(255,255,255,.12);border-radius:28px;overflow:hidden;background:rgba(255,255,255,.045);box-shadow:0 24px 80px rgba(0,0,0,.38);}
    .head{padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.10);display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap;}
    .eyebrow{font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#9fb4dd;font-weight:900;}
    h1{font-size:clamp(28px,4vw,48px);line-height:1.05;margin:8px 0 0;font-weight:950;}
    .muted{color:#c7d3ea;line-height:1.55;}
    img{display:block;width:100%;max-height:760px;object-fit:contain;background:#050b14;}
    .body{padding:18px 20px;display:grid;gap:14px;}
    .chips{display:flex;flex-wrap:wrap;gap:8px;}
    .chip{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);border-radius:999px;padding:8px 11px;font-size:12px;font-weight:800;color:#eaf1ff;}
  </style>
</head>
<body>
  <main class="wrap">
    <section class="card">
      <div class="head">
        <div>
          <div class="eyebrow">Simo saved visual concept</div>
          <h1>${esc(title)}</h1>
          <p class="muted">${esc(source)}</p>
        </div>
      </div>
      <img src="${esc(img)}" alt="${esc(title)}" />
      <div class="body">
        <div class="muted">Saved from the real image-first design flow. Reopen this concept in Simo and continue refining the style, materials, layout, features, or details.</div>
        <div class="chips">${controls.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</div>
      </div>
    </section>
  </main>
</body>
</html>`;
  }

  function getLibrary() {
    const raw = safeJsonParse(localStorage.getItem(LIB_KEY), []);
    return Array.isArray(raw) ? raw.filter(Boolean) : [];
  }

  function setLibrary(items) {
    try { localStorage.setItem(LIB_KEY, JSON.stringify(Array.isArray(items) ? items : [])); } catch {}
    const count = document.getElementById("libraryCountValue");
    if (count) count.textContent = String((Array.isArray(items) ? items : []).length);
  }

  function showSaveNotice(message, success) {
    addAssistant(`
      <div style="border:1px solid ${success ? 'rgba(86,240,169,.25)' : 'rgba(255,215,106,.25)'};border-radius:18px;padding:13px 14px;background:${success ? 'rgba(86,240,169,.10)' : 'rgba(255,215,106,.10)'};color:#eef4ff;display:grid;gap:5px;">
        <div style="font-weight:950;font-size:15px;">${success ? 'Saved to Library' : 'Saved locally'}</div>
        <div style="font-size:13px;color:#dce8ff;line-height:1.45;">${esc(message)}</div>
      </div>
    `);
  }

  async function saveVisualProject(project) {
    if (!project) return false;
    const now = new Date().toISOString();
    const title = displayTitle(project);
    const item = {
      id: `visual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title,
      html: visualProjectHtml(project),
      sourceText: projectSourceText(project),
      notes: "Saved from Simo real image-first visual card. Continue this concept from the same visual prompt and controls.",
      tags: libraryTagsFor(project),
      pinned: false,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };

    const items = [item, ...getLibrary().filter((x) => x && x.id !== item.id)];
    setLibrary(items);
    setLastPreviewForVisual(item.html, title);
    rememberVisualConcept(item, project);

    let cloudSynced = false;
    try {
      await api("/api/library/save", item);
      cloudSynced = true;
    } catch (err) {
      cloudSynced = false;
      console.warn("SimoVisualCore library cloud sync skipped/failed:", err);
    }

    showSaveNotice(
      cloudSynced
        ? `${title} was saved and synced to the Builder Library.`
        : `${title} was saved to this browser's Builder Library. Sign in to sync it to your account.`,
      cloudSynced
    );
    return true;
  }

  function removeNegatedTerms(text) {
    let t = clean(text);
    [
      "sports car", "concept car", "supercar", "hypercar", "race car", "car", "vehicle", "truck", "motorcycle", "boat", "yacht",
      "house", "home", "villa", "mansion", "building", "architecture", "garage", "driveway", "pool", "interior", "room",
      "guitar", "instrument", "dog leash", "leash", "watch", "sneaker", "shoe", "chair", "light fixture", "logo", "app screen"
    ].sort((a, b) => b.length - a.length).forEach((term) => {
      const re = new RegExp(`\\b(no|not|without|exclude|excluding|avoid|remove)\\s+(a\\s+|an\\s+|the\\s+)?${term.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`, "g");
      t = t.replace(re, " ");
    });
    return t.replace(/\s+/g, " ").trim();
  }


function inferItem(prompt, fallback) {
  return smartShortTitle(extractSubjectPhrase(prompt, fallback || "visual concept"), fallback || "visual concept").toLowerCase();
}

function wants3D(prompt) {
  return /\b(3d|three d|3 d|model|viewer|rotate|rotating|turntable|spin)\b/i.test(String(prompt || ""));
}

function classifyPrompt(prompt) {
  const raw = String(prompt || "").trim();
  const t = removeNegatedTerms(raw);
  const has = (re) => re.test(t);
  const item = (fallback) => inferItem(raw, fallback);

  if (has(/\b(book cover|book jacket|dust jacket|paperback cover|hardcover cover)\b/)) {
    return { category: "editorial", item: item("book cover"), title: "Book Cover Concept", kind: "graphic" };
  }
  if (has(/\b(logo|brand identity|branding|brand mark|wordmark|mascot|identity system)\b/)) {
    return { category: "brand", item: item("brand identity"), title: "Brand / Logo Concept", kind: "graphic" };
  }
  if (has(/\b(app screen|dashboard|ui|interface|mobile app|website mockup|software|saas|landing page|web app|webpage|website|portal|figma)\b/)) {
    return { category: "digital", item: item("app screen"), title: "Digital Product Concept", kind: "screen" };
  }
  if (has(/\b(kitchen|bathroom|bedroom|living room|office interior|interior design|interior|moodboard|mood board)\b/)) {
    return { category: "interior", item: item("interior space"), title: "Interior Concept", kind: "space" };
  }
  if (has(/\b(computer keyboard|mechanical keyboard|gaming keyboard|rgb keyboard|keycap|keycaps|keyboard and mouse)\b/)) {
    return { category: "product", item: item("keyboard product"), title: "Keyboard Product Concept", kind: "product" };
  }
  if (has(/\b(guitar|electric guitar|bass guitar|instrument|violin|piano|drum kit|synthesizer|keyboard|microphone|amp|amplifier|pickups?|headstock|fretboard|strings?)\b/)) {
    return { category: "instrument", item: has(/\bguitar\b/) ? item("guitar concept") : item("instrument concept"), title: "Instrument Concept", kind: "product" };
  }
  if (has(/\b(home|house|villa|mansion|estate|architecture|architectural|floor plan|floorplan|blueprint|garage|pool|landscape|exterior)\b/)) {
    return { category: "home", item: item("luxury home"), title: "Architecture / Home Concept", kind: "architecture" };
  }
  if (has(/\b(yacht|boat|marine|speedboat|catamaran)\b/)) {
    return { category: "marine", item: item("marine concept"), title: "Marine Concept", kind: "vehicle" };
  }
  if (has(/\b(rim|rims|wheel|wheels|tire rim|alloy wheel|forged wheel|custom wheel)\b/)) {
    return { category: "product", item: item("tire rim"), title: "Wheel / Rim Product Concept", kind: "product" };
  }
  if (has(/\b(sports car|sportscar|concept car|supercar|hypercar|race car|car|vehicle|automotive|truck|motorcycle|widebody|spoiler|diffuser|carbon fiber|stance)\b/)) {
    return { category: "vehicle", item: item("sports car"), title: "Vehicle Concept", kind: "vehicle" };
  }
  if (has(/\b(light fixture|parking lot light|street light|fixture|industrial light|pole light|floodlight|lamp post|outdoor light|industrial product)\b/)) {
    return { category: "industrial", item: item("industrial product"), title: "Industrial Product Concept", kind: "product" };
  }
  if (has(/\b(chair|gaming chair|desk|table|sofa|couch|bed frame|shelf|cabinet|stool|furniture)\b/)) {
    return { category: "furniture", item: item("furniture piece"), title: "Furniture Concept", kind: "product" };
  }
  if (has(/\b(sneaker|shoe|footwear|watch|bag|handbag|helmet|sunglasses|jacket|shirt|dress|fashion|clothing|wearable)\b/)) {
    return { category: "wearable", item: item("wearable product"), title: "Wearable / Fashion Concept", kind: "product" };
  }
  if (has(/\b(barbecue grill|bbq grill|gas grill|charcoal grill|pellet grill|smoker grill|outdoor grill|barbeque grill|barbecue|bbq|grill|smoker|toaster|soap dispenser|dispenser|fire extinguisher|extinguisher|water bottle|drink bottle|bottle|tumbler|flask|mouse|computer mouse|phone case|toy|tool|device|accessory|product|lamp|appliance|dog leash|leash|collar|pet accessory|package|packaging|box|jar|poster|flyer|brochure|menu)\b/)) {
    const productItem = item("product concept");
    const productTitle = productItem ? `${toTitleCase(productItem)} Design` : "Product / Accessory Concept";
    return { category: "product", item: productItem, title: productTitle, kind: "product" };
  }
  return { category: "object", item: item("design concept"), title: "Object Design Concept", kind: "object" };
}

const SCHEMAS = {

    vehicle: ["Body Style", "Front Fascia", "Rear Design", "Wheels & Tires", "Paint / Finish", "Aero Package", "Interior Cockpit", "Lighting", "Performance Theme", "Materials", "Generate Variations"],
    marine: ["Hull Shape", "Deck Layout", "Cabin Design", "Materials", "Lighting", "Performance", "Waterline Profile", "Luxury Features", "Interior Cabin", "Generate Variations"],
    instrument: ["Body Shape", "Neck & Headstock", "Pickups", "Hardware", "Materials & Finish", "Colors & Graphics", "Strings & Tuning", "Electronics", "Case & Accessories", "Generate Variations"],
    home: ["Exterior Style", "Garage Design", "Pool & Outdoor Living", "Windows & Glass", "Roofline", "Materials", "Landscape", "Lighting", "Interior Plan", "Luxury Features", "Generate Variations"],
    interior: ["Layout", "Furniture Plan", "Material Palette", "Lighting", "Feature Wall", "Flooring", "Ceiling Detail", "Storage", "Styling", "Generate Variations"],
    product: ["Material", "Size / Proportions", "Handle Design", "Hardware", "Comfort", "Color / Pattern", "Functional Details", "Brand Tag", "Packaging", "Generate Variations"],
    industrial: ["Fixture Head", "Pole / Mount", "Light Pattern", "Weatherproofing", "Power Source", "Materials", "Finish", "Installation Layout", "Safety Rating", "Generate Variations"],
    wearable: ["Shape / Silhouette", "Materials", "Colorway", "Texture", "Straps / Fasteners", "Comfort", "Branding", "Premium Details", "Packaging", "Generate Variations"],
    furniture: ["Shape / Frame", "Ergonomics", "Materials", "Cushioning", "Legs / Base", "Color / Finish", "Storage Features", "Lighting / Tech", "Room Context", "Generate Variations"],
    brand: ["Logo Mark", "Typography", "Color Palette", "Icon System", "Pattern / Texture", "Mockups", "Packaging", "Social Avatar", "Brand Variations"],
    digital: ["Layout", "Navigation", "Hero Screen", "Components", "Color Theme", "Typography", "Mobile Version", "Dashboard Widgets", "CTA Flow", "Generate Variations"],
    editorial: ["Title Typography", "Cover Imagery", "Subtitle / Copy", "Author Name", "Spine Design", "Back Cover", "Color Palette", "Finish / Texture", "Target Audience", "Generate Variations"],
    object: ["Shape / Form", "Materials", "Color / Finish", "Functional Details", "Size / Proportions", "Texture", "Accessories", "Use Case", "Generate Variations"],
  };

  function productControlSet(itemOrSubject) {
    const t = clean(itemOrSubject || "");
    if (/\b(barbecue grill|bbq grill|gas grill|charcoal grill|pellet grill|smoker grill|outdoor grill|barbeque grill|barbecue|bbq|grill|smoker)\b/.test(t)) {
      return ["Lid / Hood", "Cooking Grates", "Burners / Firebox", "Front Panel", "Side Shelves", "Handle / Hardware", "Thermometer / Gauge", "Wheels / Cart Base", "Vent / Chimney", "Finish / Color", "Logo / Badge", "Generate Variations", "Generate Realistic Render"];
    }
    if (/\btoaster\b/.test(t)) {
      return ["Controls", "Bread Slots", "Lever", "Feet / Base", "Finish", "Branding", "Functional Details", "Color / Panel", "Generate Variations", "Generate Realistic Render"];
    }
    if (/\b(bottle|drink bottle|tumbler|flask)\b/.test(t)) {
      return ["Material", "Size / Proportions", "Handle Design", "Hardware", "Comfort", "Color / Pattern", "Functional Details", "Brand Tag", "Packaging", "Generate Variations"];
    }
    if (/\b(soap dispenser|dispenser)\b/.test(t)) {
      return ["Pump Head", "Nozzle / Spout", "Bottle Shape", "Material / Finish", "Label / Branding", "Window / Level View", "Base / Grip", "Color / Pattern", "Generate Variations", "Generate Realistic Render"];
    }
    if (/\b(fire extinguisher|extinguisher)\b/.test(t)) {
      return ["Body Finish", "Handle & Grip", "Nozzle / Hose", "Gauge & Safety Pin", "Label / Branding", "Mount / Base", "Size / Proportions", "Color Scheme", "Generate Variations", "Generate Realistic Render"];
    }
    if (/\b(keyboard|mechanical keyboard|gaming keyboard)\b/.test(t)) {
      return ["Keycaps", "Switch Feel", "Case Material", "Layout", "Knob / Controls", "Backlighting", "Legends / Fonts", "Cable / Port", "Generate Variations", "Generate Realistic Render"];
    }
    if (/\b(rim|wheel|alloy wheel|tire rim)\b/.test(t)) {
      return ["Spoke Shape", "Center Cap", "Lip / Depth", "Finish", "Color Accents", "Bolt Pattern", "Performance Theme", "Side Profile", "Generate Variations", "Generate Realistic Render"];
    }
    return SCHEMAS.product;
  }

  function controlsFor(category, itemOrSubject) {
    if (String(category || "").toLowerCase() === "product") return productControlSet(itemOrSubject);
    return SCHEMAS[category] || SCHEMAS.object;
  }


function isDesignPrompt(prompt) {
  const t = clean(prompt);
  if (!t || /^\[simo_/i.test(t)) return false;
  if (isPureWritingPrompt(prompt)) return false;
  const create = /\b(show me|show|make|create|build|design|generate|give me|i want|render|visualize|view|draw|draft|concept|mockup|prototype)\b/.test(t);
  const objecty = /\b(car|vehicle|guitar|instrument|home|house|logo|brand|app|screen|dashboard|website|web app|dog leash|leash|light fixture|watch|sneaker|shoe|chair|desk|product|accessory|toy|tool|device|furniture|parking lot|fixture|kitchen|bedroom|interior|yacht|boat|helmet|bag|bottle|package|packaging|lamp|rim|rims|wheel|wheels|tire rim|alloy wheel|book cover|book jacket|poster|flyer|brochure|menu)\b/.test(t);
  const edity = /\b(add|change|make it|refine|remove|adjust|update|variation|variations|modern|luxury|futuristic|matte|gloss|carbon|gold|black|white|premium|sleek|minimal)\b/.test(t);
  return create || objecty || (edity && !!getActive());
}

function isVagueEdit(prompt) {
  const t = clean(prompt);
  return /\b(make it|change|add|remove|adjust|refine|more|less|bigger|smaller|black|white|gold|blue|red|material|materials|color|colors|finish|lighting|style|variation|variations|futuristic|modern|luxury|premium)\b/.test(t) && !isClearNewObject(prompt);
}

function isClearNewObject(prompt) {
  const t = clean(prompt);
  const active = getActive();
  const typed = inferItem(t, "");
  const create = /\b(show me|show|make|create|build|design|generate|give me|i want|render|visualize|view|draw|draft|prototype|concept|mockup)\b/.test(t);
  const strongObject = /\b(car|vehicle|guitar|instrument|home|house|logo|brand|app|screen|dashboard|website|web app|dog leash|leash|light fixture|watch|sneaker|shoe|chair|desk|product|accessory|toy|tool|device|furniture|parking lot|fixture|kitchen|bedroom|interior|yacht|boat|helmet|bag|bottle|drink bottle|tumbler|flask|toaster|soap dispenser|dispenser|fire extinguisher|extinguisher|keyboard|mouse|package|packaging|lamp|rim|rims|wheel|wheels|tire rim|alloy wheel|book cover|poster|flyer|brochure|menu)\b/.test(t);
  if (!typed) return false;
  if (!active) return !!typed && (create || strongObject || typed.split(/\s+/).length >= 1);
  const activeItem = inferItem(active.item || active.title || active.prompt || "", "");
  if (typed === activeItem) return false;
  return create || strongObject || typed.split(/\s+/).length >= 1;
}

function seededRealImageUrl(project) {

    const category = String(project && project.category || "object").toLowerCase();
    const item = clean(project && (project.item || project.prompt || project.latestPrompt) || "product design concept");
    const baseTerms = {
      vehicle: "futuristic sports car concept,automotive design,studio render",
      marine: "luxury yacht design,boat,marine concept",
      instrument: "custom electric guitar,product design,studio",
      home: "modern luxury house architecture,exterior,pool,garage",
      interior: "luxury interior design,modern room,architecture",
      industrial: "industrial product design,street light fixture,engineering",
      furniture: "modern furniture design,studio,chair",
      wearable: "wearable product design,studio,fashion",
      product: "product design,industrial design,studio render",
      brand: "logo design,brand identity,premium mockup",
      digital: "app dashboard interface,ui design,software",
      object: "product design concept,studio render,industrial design"
    };
    const fallback = baseTerms[category] || baseTerms.object;
    const promptTerms = item.replace(/[^a-z0-9\s-]+/g, " ").replace(/\s+/g, ",").slice(0, 90);
    const query = encodeURIComponent(`${promptTerms || fallback},${fallback}`);
    return `https://source.unsplash.com/1400x900/?${query}`;
  }

  function looksLikeDynamicBoardUrl(url) {
    const raw = String(url || "");
    if (!raw) return false;
    if (!raw.startsWith("data:image/svg+xml")) return false;
    try {
      const decoded = decodeURIComponent(raw.split(",").slice(1).join(",") || "");
      return /SIMO DYNAMIC DESIGN BOARD|Live image generation can replace this board|Prompt-driven controls generated/i.test(decoded);
    } catch {
      return /SIMO%20DYNAMIC%20DESIGN%20BOARD|Live%20image%20generation/i.test(raw);
    }
  }

  function shouldOverrideBoardImage(project, url) {
    const cat = String(project?.category || "").toLowerCase();
    return looksLikeDynamicBoardUrl(url) && ["digital", "product", "brand", "industrial", "wearable", "furniture", "interior", "object"].includes(cat);
  }

  function fallbackImageFor(project) {
    if (project.category === "vehicle") return "/static/demo_visuals/simo_vehicle_sports_car.png";
    if (project.category === "instrument") return "/static/demo_visuals/simo_instrument_wild_guitar.png";
    if (project.category === "home") return "/static/demo_visuals/simo_home_luxury_pool_garage.png";
    if (["digital", "brand", "product", "industrial", "wearable", "furniture", "interior", "object"].includes(String(project.category || "").toLowerCase())) {
      return mockVisualSvg(project, { actionLabel: "Closest visual starting point" });
    }
    return seededRealImageUrl(project);
  }

  function boardSvg(project) {
    const title = displayTitle(project);
    const controls = project.controls.slice(0, 8).join(" • ");
    const note = project.wants3D ? "3D-aware flow detected. Open 3D View can route to a real asset viewer when available." : "Live image generation can replace this board when configured, while the design logic stays dynamic.";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#07111f"/><stop offset=".55" stop-color="#111827"/><stop offset="1" stop-color="#030712"/></linearGradient><radialGradient id="g" cx="50%" cy="34%" r="70%"><stop offset="0" stop-color="#6ea8ff" stop-opacity=".22"/><stop offset=".55" stop-color="#b982ff" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>
      <rect width="1400" height="900" fill="url(#bg)"/><rect width="1400" height="900" fill="url(#g)"/>
      <rect x="95" y="90" width="1210" height="720" rx="46" fill="#111827" fill-opacity=".86" stroke="#ffffff" stroke-opacity=".16"/>
      <text x="150" y="170" fill="#9fb4dd" font-family="Arial" font-size="22" font-weight="900" letter-spacing="4">SIMO DYNAMIC DESIGN BOARD</text>
      <text x="150" y="255" fill="#eef4ff" font-family="Arial" font-size="48" font-weight="900">${esc(title).slice(0, 80)}</text>
      <text x="150" y="320" fill="#c7d3ea" font-family="Arial" font-size="24">Category: ${esc(project.category)} • Prompt-driven controls generated for this exact item</text>
      <rect x="150" y="390" width="1100" height="180" rx="26" fill="#050b14" fill-opacity=".72" stroke="#ffffff" stroke-opacity=".12"/>
      <text x="190" y="455" fill="#eaf1ff" font-family="Arial" font-size="28" font-weight="800">Editable controls:</text>
      <text x="190" y="515" fill="#c7d3ea" font-family="Arial" font-size="22">${esc(controls).slice(0, 120)}</text>
      <text x="150" y="685" fill="#9fb4dd" font-family="Arial" font-size="22">${esc(note).slice(0, 150)}</text>
    </svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function svgDataUri(svg) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function accentFor(category) {
    const cat = String(category || "object").toLowerCase();
    const map = {
      digital: ["#67e8f9", "#60a5fa", "#8b5cf6"],
      brand: ["#f59e0b", "#f97316", "#fb7185"],
      product: ["#34d399", "#2dd4bf", "#60a5fa"],
      industrial: ["#60a5fa", "#38bdf8", "#22d3ee"],
      interior: ["#fbbf24", "#f59e0b", "#fb7185"],
      furniture: ["#a78bfa", "#60a5fa", "#34d399"],
      wearable: ["#fb7185", "#c084fc", "#60a5fa"],
      object: ["#34d399", "#60a5fa", "#8b5cf6"],
    };
    return map[cat] || map.object;
  }

  function mockVisualSvg(project, options = {}) {
    const cat = String(project?.category || "object").toLowerCase();
    const title = displayTitle(project || {});
    const item = esc(project?.item || project?.latestPrompt || project?.prompt || title);
    const actionLabel = esc(options.actionLabel || "Closest visual starting point");
    const controls = (Array.isArray(project?.controls) ? project.controls : controlsFor(cat)).slice(0, 5);
    const [c1, c2, c3] = accentFor(cat);
    const chips = controls.map((d, i) => `<g transform="translate(${100 + (i % 3) * 210} ${760 + Math.floor(i / 3) * 54})"><rect width="184" height="34" rx="17" fill="#0d1729" stroke="#ffffff" stroke-opacity=".14"/><text x="14" y="22" fill="#e8f1ff" font-family="Arial" font-size="15" font-weight="800">${esc(d).slice(0, 20)}</text></g>`).join("");

    if (cat === "digital") {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#07111f"/><stop offset=".55" stop-color="#0e1a31"/><stop offset="1" stop-color="#020617"/></linearGradient>
          <linearGradient id="hero" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}" stop-opacity=".95"/><stop offset=".52" stop-color="${c2}" stop-opacity=".88"/><stop offset="1" stop-color="${c3}" stop-opacity=".82"/></linearGradient>
          <radialGradient id="glow" cx="50%" cy="24%" r="72%"><stop offset="0" stop-color="${c2}" stop-opacity=".22"/><stop offset=".5" stop-color="${c3}" stop-opacity=".14"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
        </defs>
        <rect width="1400" height="900" fill="url(#bg)"/><rect width="1400" height="900" fill="url(#glow)"/>
        <text x="86" y="98" fill="#a8c4ef" font-family="Arial" font-size="20" font-weight="900" letter-spacing="4">SIMO DIGITAL VISUAL</text>
        <text x="86" y="150" fill="#eef4ff" font-family="Arial" font-size="46" font-weight="900">${esc(title).slice(0, 58)}</text>
        <text x="86" y="185" fill="#c8d7ef" font-family="Arial" font-size="20">${actionLabel.slice(0, 60)}</text>
        <rect x="72" y="220" width="1256" height="590" rx="34" fill="#0a1220" stroke="#ffffff" stroke-opacity=".12"/>
        <rect x="104" y="254" width="760" height="522" rx="28" fill="#0e172a" stroke="#ffffff" stroke-opacity=".10"/>
        <rect x="104" y="254" width="760" height="110" rx="28" fill="url(#hero)"/>
        <text x="150" y="320" fill="#ffffff" font-family="Arial" font-size="34" font-weight="900">${esc(title).slice(0, 34)}</text>
        <text x="150" y="352" fill="#eef4ff" font-family="Arial" font-size="18">Responsive UI concept • strong image-first fallback</text>
        <rect x="146" y="404" width="290" height="118" rx="22" fill="#111c31" stroke="#ffffff" stroke-opacity=".10"/>
        <rect x="462" y="404" width="166" height="118" rx="22" fill="#111c31" stroke="#ffffff" stroke-opacity=".10"/>
        <rect x="652" y="404" width="166" height="118" rx="22" fill="#111c31" stroke="#ffffff" stroke-opacity=".10"/>
        <rect x="146" y="548" width="672" height="184" rx="22" fill="#0c1424" stroke="#ffffff" stroke-opacity=".10"/>
        <rect x="180" y="588" width="610" height="16" rx="8" fill="#1a2944"/>
        <rect x="180" y="620" width="560" height="12" rx="6" fill="#15233c"/>
        <rect x="180" y="648" width="520" height="12" rx="6" fill="#15233c"/>
        <rect x="180" y="678" width="460" height="12" rx="6" fill="#15233c"/>
        <rect x="916" y="258" width="368" height="514" rx="34" fill="#0b1526" stroke="#ffffff" stroke-opacity=".12"/>
        <rect x="952" y="292" width="296" height="56" rx="18" fill="url(#hero)"/>
        <rect x="952" y="374" width="296" height="110" rx="22" fill="#121d33" stroke="#ffffff" stroke-opacity=".10"/>
        <rect x="952" y="506" width="296" height="86" rx="22" fill="#121d33" stroke="#ffffff" stroke-opacity=".10"/>
        <rect x="952" y="614" width="138" height="118" rx="22" fill="#121d33" stroke="#ffffff" stroke-opacity=".10"/>
        <rect x="1110" y="614" width="138" height="118" rx="22" fill="#121d33" stroke="#ffffff" stroke-opacity=".10"/>
        <circle cx="240" cy="463" r="34" fill="${c1}" fill-opacity=".9"/>
        <rect x="516" y="432" width="58" height="58" rx="16" fill="${c2}" fill-opacity=".88"/>
        <rect x="704" y="430" width="58" height="58" rx="16" fill="${c3}" fill-opacity=".88"/>
        <text x="952" y="850" fill="#8fa8d5" font-family="Arial" font-size="18">${item.slice(0, 44)}</text>
        ${chips}
      </svg>`;
      return svgDataUri(svg);
    }

    if (cat === "product" || cat === "object" || cat === "industrial" || cat === "wearable" || cat === "furniture") {
      const isBottle = /\bbottle\b/i.test(item);
      const isLamp = /\b(light|lamp|fixture)\b/i.test(item);
      const isChair = /\b(chair|stool|sofa|desk|table)\b/i.test(item);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#06101d"/><stop offset=".5" stop-color="#101b30"/><stop offset="1" stop-color="#020617"/></linearGradient>
          <radialGradient id="spot" cx="50%" cy="40%" r="44%"><stop offset="0" stop-color="${c2}" stop-opacity=".24"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
          <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9f1ff"/><stop offset=".5" stop-color="${c2}"/><stop offset="1" stop-color="#20324f"/></linearGradient>
        </defs>
        <rect width="1400" height="900" fill="url(#bg)"/><rect width="1400" height="900" fill="url(#spot)"/>
        <text x="86" y="98" fill="#a8c4ef" font-family="Arial" font-size="20" font-weight="900" letter-spacing="4">SIMO PRODUCT VISUAL</text>
        <text x="86" y="150" fill="#eef4ff" font-family="Arial" font-size="46" font-weight="900">${esc(title).slice(0, 58)}</text>
        <text x="86" y="186" fill="#c8d7ef" font-family="Arial" font-size="20">${actionLabel.slice(0, 64)}</text>
        <rect x="74" y="224" width="1252" height="600" rx="36" fill="#09111d" stroke="#ffffff" stroke-opacity=".10"/>
        <ellipse cx="614" cy="720" rx="290" ry="58" fill="#02060d" opacity=".72"/>
        ${'<g>' + (isRim ? `
          <circle cx="614" cy="476" r="164" fill="url(#metal)" stroke="#ffffff" stroke-opacity=".18"/>
          <circle cx="614" cy="476" r="112" fill="#08111f" stroke="#ffffff" stroke-opacity=".14"/>
          <circle cx="614" cy="476" r="44" fill="#1d2e49" stroke="#ffffff" stroke-opacity=".18"/>
          <rect x="602" y="328" width="24" height="128" rx="12" fill="#d9f1ff" fill-opacity=".72" transform="rotate(0 614 476)"/>
          <rect x="602" y="328" width="24" height="128" rx="12" fill="#d9f1ff" fill-opacity=".72" transform="rotate(45 614 476)"/>
          <rect x="602" y="328" width="24" height="128" rx="12" fill="#d9f1ff" fill-opacity=".72" transform="rotate(90 614 476)"/>
          <rect x="602" y="328" width="24" height="128" rx="12" fill="#d9f1ff" fill-opacity=".72" transform="rotate(135 614 476)"/>
          <rect x="602" y="328" width="24" height="128" rx="12" fill="#d9f1ff" fill-opacity=".72" transform="rotate(180 614 476)"/>
          <circle cx="686" cy="476" r="12" fill="#050b14"/><circle cx="636" cy="544" r="12" fill="#050b14"/><circle cx="554" cy="518" r="12" fill="#050b14"/><circle cx="554" cy="434" r="12" fill="#050b14"/><circle cx="636" cy="408" r="12" fill="#050b14"/>` : isBottle ? `
          <rect x="522" y="330" width="184" height="334" rx="82" fill="url(#metal)" stroke="#ffffff" stroke-opacity=".16"/>
          <rect x="570" y="250" width="88" height="110" rx="26" fill="url(#metal)"/>
          <rect x="556" y="232" width="116" height="38" rx="16" fill="#0d1729"/>
          <rect x="544" y="418" width="140" height="98" rx="22" fill="#ffffff" fill-opacity=".18" stroke="#ffffff" stroke-opacity=".14"/>` : isLamp ? `
          <rect x="594" y="300" width="40" height="290" rx="18" fill="url(#metal)"/>
          <rect x="520" y="260" width="188" height="80" rx="40" fill="url(#metal)"/>
          <rect x="538" y="584" width="152" height="28" rx="14" fill="#1f304c"/>
          <ellipse cx="614" cy="632" rx="120" ry="34" fill="#0d1729"/>` : isChair ? `
          <rect x="504" y="360" width="220" height="132" rx="42" fill="url(#metal)"/>
          <rect x="534" y="282" width="160" height="118" rx="44" fill="url(#metal)"/>
          <rect x="540" y="492" width="18" height="118" rx="9" fill="#1d2e49"/>
          <rect x="670" y="492" width="18" height="118" rx="9" fill="#1d2e49"/>
          <rect x="570" y="492" width="18" height="144" rx="9" fill="#1d2e49"/>
          <rect x="640" y="492" width="18" height="144" rx="9" fill="#1d2e49"/>
          ` : `
          <rect x="498" y="318" width="232" height="260" rx="52" fill="url(#metal)" stroke="#ffffff" stroke-opacity=".16"/>
          <rect x="540" y="360" width="148" height="42" rx="18" fill="#0d1729"/>
          <rect x="530" y="428" width="168" height="98" rx="24" fill="#ffffff" fill-opacity=".10" stroke="#ffffff" stroke-opacity=".14"/>`) + '</g>'}
        <rect x="850" y="290" width="360" height="206" rx="28" fill="#0d1729" stroke="#ffffff" stroke-opacity=".10"/>
        <rect x="850" y="522" width="360" height="188" rx="28" fill="#0d1729" stroke="#ffffff" stroke-opacity=".10"/>
        <text x="886" y="338" fill="#eef4ff" font-family="Arial" font-size="28" font-weight="900">Product direction</text>
        <text x="886" y="378" fill="#c7d3ea" font-family="Arial" font-size="18">Material-driven concept • studio visual fallback</text>
        <text x="886" y="560" fill="#eef4ff" font-family="Arial" font-size="24" font-weight="900">Focus areas</text>
        ${chips}
      </svg>`;
      return svgDataUri(svg);
    }

    if (cat === "brand") {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900">
        <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#081120"/><stop offset=".55" stop-color="#151a2f"/><stop offset="1" stop-color="#020617"/></linearGradient><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c3}"/></linearGradient></defs>
        <rect width="1400" height="900" fill="url(#bg)"/>
        <text x="86" y="98" fill="#a8c4ef" font-family="Arial" font-size="20" font-weight="900" letter-spacing="4">SIMO BRAND VISUAL</text>
        <text x="86" y="150" fill="#eef4ff" font-family="Arial" font-size="46" font-weight="900">${esc(title).slice(0, 58)}</text>
        <rect x="84" y="210" width="1230" height="610" rx="36" fill="#09111d" stroke="#ffffff" stroke-opacity=".10"/>
        <circle cx="340" cy="430" r="120" fill="url(#g)"/>
        <rect x="540" y="292" width="626" height="136" rx="30" fill="#10192d" stroke="#ffffff" stroke-opacity=".10"/>
        <rect x="540" y="460" width="300" height="220" rx="28" fill="#10192d" stroke="#ffffff" stroke-opacity=".10"/>
        <rect x="866" y="460" width="300" height="220" rx="28" fill="#10192d" stroke="#ffffff" stroke-opacity=".10"/>
        <text x="298" y="450" fill="#ffffff" font-family="Arial" font-size="44" font-weight="900">S</text>
        <text x="580" y="352" fill="#eef4ff" font-family="Arial" font-size="34" font-weight="900">${esc(item).slice(0, 26)}</text>
        <text x="580" y="388" fill="#c7d3ea" font-family="Arial" font-size="18">Premium logo/identity presentation fallback</text>
        ${chips}
      </svg>`;
      return svgDataUri(svg);
    }

    if (cat === "interior") {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#081120"/><stop offset=".55" stop-color="#1c1f2f"/><stop offset="1" stop-color="#020617"/></linearGradient><linearGradient id="wall" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a2740"/><stop offset="1" stop-color="#0f1728"/></linearGradient></defs><rect width="1400" height="900" fill="url(#bg)"/><text x="86" y="98" fill="#a8c4ef" font-family="Arial" font-size="20" font-weight="900" letter-spacing="4">SIMO INTERIOR VISUAL</text><text x="86" y="150" fill="#eef4ff" font-family="Arial" font-size="46" font-weight="900">${esc(title).slice(0, 58)}</text><rect x="98" y="222" width="1204" height="586" rx="34" fill="url(#wall)" stroke="#ffffff" stroke-opacity=".10"/><rect x="170" y="330" width="540" height="260" rx="24" fill="#121d30"/><rect x="232" y="460" width="226" height="106" rx="26" fill="#213351"/><rect x="846" y="404" width="272" height="146" rx="26" fill="#20314d"/><rect x="802" y="574" width="360" height="16" rx="8" fill="#caa267"/><text x="180" y="774" fill="#c7d3ea" font-family="Arial" font-size="18">Interior visualization fallback • keeps the concept visual instead of text-only board</text>${chips}</svg>`;
      return svgDataUri(svg);
    }

    return boardSvg(project);
  }

  function buildProject(prompt, action, overrides) {
    const active = getActive();
    const promptText = String(prompt || "");
    const continuationPrompt = /continue this same active visual\/design project|continue this same visual concept|same exact design object|same project identity/i.test(promptText);
    const useActive = !!(active && ((isVagueEdit(prompt) && !isClearNewObject(prompt)) || (actionIsMeaningful(action) && action !== "base") || continuationPrompt));
    const seed = useActive ? { ...active } : classifyPrompt(prompt);
    const project = {
      id: useActive ? active.id : `vc_${Math.random().toString(36).slice(2, 10)}`,
      prompt: useActive ? active.prompt : String(prompt || "design concept").trim(),
      latestPrompt: String(prompt || "").trim(),
      lockedSubject: useActive ? (active.lockedSubject || active.exactSubject || active.requestedAsset || active.item || active.title || "") : (seed.item || seed.title || ""),
      category: seed.category,
      item: seed.item,
      title: seed.title,
      kind: seed.kind || seed.category,
      controls: controlsFor(seed.category, seed.item || seed.title),
      imageUrl: useActive ? (active.imageUrl || "") : "",
      wants3D: useActive ? !!active.wants3D || wants3D(prompt) : wants3D(prompt),
      last3dAsset: useActive ? (active.last3dAsset || null) : null,
      editHistory: useActive && Array.isArray(active.editHistory) ? active.editHistory : [],
      versionIndex: useActive ? Number(active.versionIndex || 1) : 1,
      updatedAt: new Date().toISOString(),
      phase: PHASE,
      action: action || "base",
      ...(overrides || {}),
    };
    return project;
  }

  function setActive(project) {
    project = simo14fApplyExactLock(project, project && (project.latestPrompt || project.prompt || project.item || project.title));
    try { localStorage.setItem(ACTIVE_KEY, JSON.stringify(project)); } catch {}
    try { localStorage.setItem(LEGACY_ACTIVE_KEY, JSON.stringify({ ...project, domain: project.category, projectType: project.category, sourcePrompt: project.prompt, lockedSubject: project.lockedSubject || project.item })); } catch {}
    try { localStorage.setItem("simo_phase12_active_visual_project_v1", JSON.stringify({ ...project, domain: project.category, exactSubject: project.lockedSubject || project.item, requestedAsset: project.lockedSubject || project.item })); } catch {}
    return project;
  }

  function getActive() {
    try {
      return JSON.parse(localStorage.getItem(ACTIVE_KEY) || localStorage.getItem("simo_phase105c_active_visual_project_v1") || localStorage.getItem(LEGACY_ACTIVE_KEY) || "null");
    } catch {
      return null;
    }
  }

  function safeProjectForCard(project) {
    const p = project && typeof project === "object" ? project : {};
    return {
      id: p.id || `vc_${Math.random().toString(36).slice(2, 10)}`,
      prompt: p.prompt || p.latestPrompt || p.item || "design concept",
      latestPrompt: p.latestPrompt || p.prompt || p.item || "design concept",
      lockedSubject: p.lockedSubject || p.item || p.title || "",
      category: p.category || "object",
      item: p.item || p.latestPrompt || p.prompt || "design concept",
      title: p.title || "Design Concept",
      kind: p.kind || p.category || "design",
      controls: Array.isArray(p.controls) ? p.controls : controlsFor(p.category || "object", p.lockedSubject || p.item || p.title),
      imageUrl: p.imageUrl || "",
      wants3D: !!p.wants3D,
      last3dAsset: p.last3dAsset || null,
      editHistory: Array.isArray(p.editHistory) ? p.editHistory : [],
      versionIndex: Number(p.versionIndex || 1),
      updatedAt: p.updatedAt || new Date().toISOString(),
      phase: PHASE,
      action: p.action || "base",
    };
  }

  function encodeProjectAttr(project) {
    try { return encodeURIComponent(JSON.stringify(safeProjectForCard(project))); } catch { return ""; }
  }

  function projectFromElement(el) {
    try {
      const card = el && el.closest ? el.closest(".simo-vc-card[data-simo-project]") : null;
      if (!card) return null;
      const raw = card.getAttribute("data-simo-project") || "";
      if (!raw) return null;
      const parsed = JSON.parse(decodeURIComponent(raw));
      const p = safeProjectForCard(parsed);
      const img = card.querySelector ? card.querySelector("img") : null;
      if (img && img.src) p.imageUrl = img.src;
      return p;
    } catch (err) {
      console.warn("SimoVisualCore projectFromElement failed:", err);
      return null;
    }
  }

  function activeFromClickTarget(target) {
    const fromCard = projectFromElement(target);
    if (fromCard) {
      setActive(fromCard);
      return fromCard;
    }
    return getActive();
  }

  function isFakeFallbackVisualUrl(url) {
    const raw = String(url || "").trim();
    const low = raw.toLowerCase();
    if (!raw) return true;
    if (low.startsWith("data:image/svg")) return true;
    if (/\.svg(?:$|[?#])/i.test(low)) return true;
    if (low.includes("simo_visual_fallback_")) return true;
    if (low.includes("/static/demo_visuals/")) return true;
    if (low.includes("source.unsplash.com")) return true;
    return false;
  }

  function renderRealImageRequired(project, message) {
    const safeTitle = esc(displayTitle(project || { category: "design", item: "visual concept" }));
    const safeCat = esc(titleCase(project?.category || "design"));
    const safePrompt = esc(project?.latestPrompt || project?.prompt || project?.item || "visual design");
    const safeMessage = esc(message || "Simo blocked the SVG/demo fallback. The next result must come from the real image generation route.");
    return `
      <div class="simo-vc-card simo-real-image-required" data-simo-project="${encodeProjectAttr(project || {})}" style="display:grid;gap:14px;width:100%;">
        <div style="border:1px solid rgba(255,190,90,.28);border-radius:24px;overflow:hidden;background:linear-gradient(180deg,rgba(255,190,90,.10),rgba(255,255,255,.035));box-shadow:0 22px 60px rgba(0,0,0,.30);">
          <div style="padding:18px;border-bottom:1px solid rgba(255,255,255,.08);">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.15em;color:#ffdca8;font-weight:950;">SIMO REAL IMAGE REQUIRED</div>
            <div style="font-size:clamp(22px,3vw,32px);font-weight:1000;color:#f6f8ff;line-height:1.05;margin-top:6px;">${safeTitle}</div>
            <div style="font-size:13px;color:#c7d3ea;margin-top:8px;line-height:1.45;">${safePrompt}</div>
          </div>
          <div style="padding:18px;display:grid;gap:12px;background:#050b14;">
            <div style="border:1px solid rgba(255,190,90,.22);background:rgba(255,190,90,.08);border-radius:18px;padding:14px;color:#ffe4bd;font-size:14px;line-height:1.5;">${safeMessage}</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
              <button type="button" data-simo-vc-special="rerender" style="display:inline-flex;border:1px solid rgba(110,168,255,.28);background:rgba(110,168,255,.14);color:#dce8ff;border-radius:999px;padding:8px 11px;font-size:12px;font-weight:950;cursor:pointer;">Retry real render</button>
              <button type="button" data-simo-vc-special="continue" style="display:inline-flex;border:1px solid rgba(86,240,169,.25);background:rgba(86,240,169,.12);color:#dfffee;border-radius:999px;padding:8px 11px;font-size:12px;font-weight:950;cursor:pointer;">Continue same concept</button>
              <span style="display:inline-flex;border:1px solid rgba(255,190,90,.22);background:rgba(255,190,90,.10);color:#fff1d6;border-radius:999px;padding:8px 11px;font-size:12px;font-weight:900;">No SVG fallback</span>
              <span style="display:inline-flex;border:1px solid rgba(110,168,255,.22);background:rgba(110,168,255,.10);color:#dce8ff;border-radius:999px;padding:8px 11px;font-size:12px;font-weight:900;">${safeCat}</span>
            </div>
          </div>
        </div>
      </div>`;
  }

  function renderProject(project, note) {
    let img = String(project.imageUrl || "").trim();
    if (isFakeFallbackVisualUrl(img)) {
      return renderRealImageRequired(project, "Simo refused to display a fake fallback image. This card needs a real generated PNG/JPG/WebP from /api/generate-visual.");
    }
    project.imageUrl = img;
    const cardProject = safeProjectForCard(project);
    cardProject.imageUrl = img;
    const projectAttr = encodeProjectAttr(cardProject);
    setActive(cardProject);

    const title = displayTitle(cardProject);
    const safeTitle = esc(title);
    const safeCat = esc(titleCase(project.category || "design"));
    const sourcePrompt = String(project.latestPrompt || project.prompt || project.item || title);
    const safePrompt = esc(sourcePrompt);
    const controls = (Array.isArray(project.controls) ? project.controls : controlsFor(project.category))
      .filter(Boolean)
      .filter((label, idx, arr) => arr.findIndex((x) => clean(x) === clean(label)) === idx)
      .filter((label) => !/\bgenerate variations?\b/i.test(String(label)));
    const controlButtons = controls.map(controlButton).join("");

    const utilityButtons = [
      actionButton("Generate Realistic Render", "rerender", "blue"),
      actionButton("Generate Variations", "variation", "normal"),
      actionButton("Continue Editing", "continue", "green"),
      actionButton("Open Workspace", "open-3d", "blue"),
      actionButton("Save to Library", "save-library", "gold"),
      `<a href="${esc(img)}" target="_blank" rel="noopener" style="border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#eef4ff;border-radius:999px;padding:10px 13px;font-size:12px;font-weight:950;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;">Open Image</a>`
    ];

    const lead = note || "Here is the closest real visual starting point. Simo is staying with the user’s exact request, showing the result first, then giving relevant controls and a 3D-aware workspace option to keep designing from here.";
    const chips = [
      `<span style="display:inline-flex;border:1px solid rgba(86,240,169,.25);background:rgba(86,240,169,.10);color:#dfffee;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:950;">Real image-first</span>`,
      `<span style="display:inline-flex;border:1px solid rgba(110,168,255,.22);background:rgba(110,168,255,.10);color:#dce8ff;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:900;">${safeCat}</span>`,
      `<span style="display:inline-flex;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#dce8ff;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:800;">Result first</span>`,
      project.versionIndex && project.versionIndex > 1 ? `<span style="display:inline-flex;border:1px solid rgba(255,215,106,.22);background:rgba(255,215,106,.10);color:#fff6d8;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:900;">Version ${esc(project.versionIndex)}</span>` : ""
    ].filter(Boolean).join("");

    return `
      <div class="simo-vc-card" data-simo-project="${projectAttr}" style="display:grid;gap:14px;width:100%;">
        <div style="border:1px solid rgba(255,255,255,.13);border-radius:26px;overflow:hidden;background:linear-gradient(180deg,rgba(255,255,255,.065),rgba(255,255,255,.032));box-shadow:0 22px 60px rgba(0,0,0,.30);">
          <div style="display:grid;gap:12px;padding:16px 18px 14px;border-bottom:1px solid rgba(255,255,255,.08);background:linear-gradient(90deg,rgba(110,168,255,.10),rgba(185,130,255,.06),rgba(86,240,169,.045));">
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
              <div style="min-width:min(540px,100%);">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:.15em;color:#9fb4dd;font-weight:950;">SIMO VISUAL DESIGN</div>
                <div style="font-size:clamp(22px,3vw,32px);font-weight:1000;color:#f6f8ff;line-height:1.05;margin-top:5px;">${safeTitle}</div>
                <div style="font-size:13px;color:#c7d3ea;margin-top:7px;line-height:1.45;">${safePrompt}</div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;align-items:flex-start;">${chips}</div>
            </div>
            <div style="font-size:13px;color:#dce8ff;line-height:1.45;max-width:100%;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;max-width:980px;">${esc(lead)}</div>
          </div>

          <figure style="margin:0;background:#050b14;">
            <div style="display:flex;align-items:center;justify-content:center;min-height:260px;background:radial-gradient(circle at center,rgba(110,168,255,.08),transparent 46%),#050b14;">
              <img src="${esc(img)}" alt="${safeTitle}" onload="try{ window.__SIMO_SCROLL_AFTER_VISUAL__ && window.__SIMO_SCROLL_AFTER_VISUAL__(); }catch(e){}" onerror="this.style.display='none';this.parentElement.innerHTML='<div style=&quot;padding:18px;color:#ffd8e0;font-size:14px;line-height:1.5;text-align:center;&quot;>The generated image URL could not load. Simo did not swap in a fake SVG fallback.</div>';" style="display:block;width:100%;max-height:700px;object-fit:contain;background:#050b14;" />
            </div>
          </figure>

          <div style="display:grid;gap:13px;padding:15px 18px 18px;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.02));">
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">${utilityButtons.join("")}</div>
            <div style="height:1px;background:rgba(255,255,255,.08);"></div>
            <div style="display:grid;gap:8px;">
              <div style="font-size:12px;font-weight:950;color:#b9c8e7;text-transform:uppercase;letter-spacing:.10em;">Design controls for this exact concept</div>
              <div style="display:flex;flex-wrap:wrap;gap:8px;">${controlButtons}</div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function renderWorking(prompt, modeText) {
    return addAssistant(`<div style="border:1px solid rgba(110,168,255,.22);border-radius:20px;padding:15px;background:linear-gradient(180deg,rgba(110,168,255,.12),rgba(255,255,255,.04));"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.13em;color:#cfe0ff;font-weight:950;">SIMO REAL IMAGE-FIRST</div><div style="font-size:18px;font-weight:950;color:#f6f8ff;margin-top:6px;">${esc(modeText || "Building the visual design result…")}</div><div style="font-size:13px;color:#c7d3ea;margin-top:8px;">${esc(prompt)}</div></div>`);
  }

  function normalize3DAsset(asset) {
    if (!asset || typeof asset !== "object") return null;
    const url = String(asset.url || asset.model_url || asset.modelUrl || asset.fallback_model_url || asset.fallbackModelUrl || "").trim();
    if (!url) return null;
    return { ...asset, url };
  }

  function mark3DUserOpen() {
    window.__SIMO_USER_OPENING_3D__ = Date.now();
    window.__SIMO_ALLOW_3D_AUTO_OPEN__ = true;
    setTimeout(() => {
      try { window.__SIMO_ALLOW_3D_AUTO_OPEN__ = false; } catch {}
    }, 1800);
  }

  function assetLooksWrongForProject(asset, project) {
    const cat = String(project && project.category || "").toLowerCase();
    const text = clean(`${project?.item || ""} ${project?.prompt || ""} ${asset?.title || ""} ${asset?.url || ""} ${asset?.model_url || ""}`);
    const wrongRobot = /\b(robotexpressive|robot|astronaut|neilarmstrong|damagedhelmet|horse)\b/.test(text);
    if (["instrument", "industrial", "product", "vehicle", "marine", "wearable", "furniture"].includes(cat) && wrongRobot) return true;
    if (cat === "instrument" && !/\b(guitar|instrument|bass|violin|piano|drum|music|fret|string|pickup)\b/.test(text)) return true;
    if (cat === "industrial" && !/\b(light|fixture|lamp|pole|industrial|street|flood|product)\b/.test(text)) return true;
    return false;
  }


  function workspaceBlueprintFor(category, project) {
    const cat = String(category || project?.category || "object").toLowerCase();
    const title = displayTitle(project || {});
    const map = {
      instrument: {
        headline: "Instrument design workspace",
        promise: "Shape, hardware, pickups, finish, tuning, and stage-ready details stay connected to the same guitar/instrument concept.",
        stages: ["Visual source", "Body/neck design", "Hardware/electronics", "Materials/finish", "3D-ready notes"],
        refine: ["More aggressive silhouette", "Premium hardware pass", "Alternate finish", "Stage lighting render"],
      },
      home: {
        headline: "Architecture design workspace",
        promise: "Exterior, garage, pool, glass, materials, landscaping, and future 3D walkthrough planning stay tied to the same home concept.",
        stages: ["Visual source", "Exterior massing", "Garage/pool/landscape", "Interior plan notes", "3D walkthrough route"],
        refine: ["Add 3-car garage", "Add pool/outdoor living", "Modernize exterior", "Create interior plan"],
      },
      vehicle: {
        headline: "Vehicle design workspace",
        promise: "Body lines, stance, wheels, lighting, aero, paint, and cockpit direction stay tied to the same vehicle concept.",
        stages: ["Visual source", "Body/aero", "Wheel/stance", "Lighting/interior", "3D turntable notes"],
        refine: ["More aggressive stance", "Luxury interior", "New paint finish", "Front/rear angle"],
      },
      industrial: {
        headline: "Industrial product workspace",
        promise: "Function, mounting, safety, weatherproofing, materials, and install context stay tied to the same product concept.",
        stages: ["Visual source", "Mounting/function", "Materials/safety", "Environment fit", "3D product mockup notes"],
        refine: ["Improve mounting", "Weatherproof version", "Premium materials", "Installation view"],
      },
      digital: {
        headline: "Digital product workspace",
        promise: "Screens, layout, navigation, components, hierarchy, and conversion path stay tied to the same app/site concept.",
        stages: ["Visual source", "Screen layout", "UX flow", "Components", "Prototype notes"],
        refine: ["Improve dashboard", "Mobile version", "Better navigation", "Premium UI pass"],
      },
      editorial: {
        headline: "Book-cover design workspace",
        promise: "Title, imagery, author name, spine, back cover, palette, and print finish stay tied to the same book-cover concept.",
        stages: ["Visual source", "Front-cover hierarchy", "Imagery & mood", "Spine/back details", "Print/mockup notes"],
        refine: ["Stronger typography", "New cover imagery", "Memoir mood pass", "Spine/back-cover version"],
      },
      brand: {
        headline: "Brand design workspace",
        promise: "Logo, typography, color, mockups, identity system, and brand usage stay tied to the same concept.",
        stages: ["Visual source", "Logo mark", "Typography/color", "Mockups", "Brand system notes"],
        refine: ["Alternate logo mark", "Premium colorway", "Packaging mockup", "Social avatar"],
      },
      interior: {
        headline: "Interior design workspace",
        promise: "Layout, furniture, lighting, materials, walls, flooring, and mood stay tied to the same interior concept.",
        stages: ["Visual source", "Room layout", "Furniture/materials", "Lighting/mood", "Walkthrough notes"],
        refine: ["Warmer lighting", "Luxury materials", "New furniture layout", "Night view"],
      },
      furniture: {
        headline: "Furniture design workspace",
        promise: "Form, ergonomics, materials, finish, room fit, and build details stay tied to the same furniture concept.",
        stages: ["Visual source", "Form/ergonomics", "Materials/finish", "Room context", "3D product notes"],
        refine: ["Premium material pass", "Ergonomic revision", "Room mockup", "Alternate color"],
      },
      wearable: {
        headline: "Wearable design workspace",
        promise: "Silhouette, fit, fabric/materials, hardware, finish, and branding stay tied to the same wearable concept.",
        stages: ["Visual source", "Silhouette/fit", "Materials/hardware", "Branding", "Lookbook notes"],
        refine: ["Alternate colorway", "Premium materials", "Lifestyle render", "Detail close-up"],
      },
      product: {
        headline: "Product design workspace",
        promise: "Shape, function, materials, usability, packaging, and presentation stay tied to the same product concept.",
        stages: ["Visual source", "Shape/function", "Materials/usability", "Packaging", "3D product notes"],
        refine: ["Improve usability", "Premium finish", "Packaging mockup", "Exploded detail view"],
      },
      object: {
        headline: "Design workspace",
        promise: "Simo keeps the same object, image, and design direction connected while you refine it step by step.",
        stages: ["Visual source", "Shape", "Materials", "Details", "3D-ready notes"],
        refine: ["More realistic", "Alternate angle", "Premium materials", "Generate variations"],
      },
    };
    const base = map[cat] || map.object;
    return {
      ...base,
      title,
      category: cat,
    };
  }

  function workspaceButton(label, prompt) {
    return `<button type="button" data-simo-workspace-action="${esc(label)}" data-simo-workspace-prompt="${esc(prompt)}" style="min-height:38px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.065);color:#eef4ff;font-size:12px;font-weight:850;cursor:pointer;padding:8px 10px;text-align:left;">${esc(label)}</button>`;
  }

  function openVisualPreviewInNewTab(project) {
    const p = project || getActive();
    if (!p) return false;
    const html = visualProjectHtml(p);
    try {
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return !!win;
    } catch (err) {
      console.warn("SimoVisualCore openVisualPreviewInNewTab failed:", err);
      const img = p.imageUrl || fallbackImageFor(p) || boardSvg(p);
      try { window.open(img, "_blank", "noopener"); return true; } catch {}
      return false;
    }
  }

  function openConnectedWorkspace(project, sourcePrompt, reason) {
    setSimoStatus("Opening rotate/design workspace…", true);
    const old = document.getElementById("simoVcWorkspaceModal");
    try { old && old.remove(); } catch {}

    const title = titleCase(project?.item || sourcePrompt || "Design Concept");
    const cat = String(project?.category || "design").toLowerCase();
    const img = project?.imageUrl || fallbackImageFor(project) || boardSvg(project);
    const controls = controlsFor(cat).slice(0, 10);
    const blueprint = workspaceBlueprintFor(cat, project);
    const stageChips = blueprint.stages.map((s) => `<span style="display:inline-flex;border:1px solid rgba(110,168,255,.18);background:rgba(110,168,255,.09);border-radius:999px;padding:7px 10px;font-size:12px;font-weight:850;color:#dce8ff;">${esc(s)}</span>`).join("");
    const refineButtons = blueprint.refine.map((label) => workspaceButton(label, controlPrompt(project, label))).join("");
    const controlButtons = controls.map((label) => workspaceButton(label, controlPrompt(project, label))).join("");

    const modal = document.createElement("div");
    modal.id = "simoVcWorkspaceModal";
    modal.style.position = "fixed";
    modal.style.inset = "0";
    modal.style.zIndex = "999999";
    modal.style.background = "rgba(2,6,14,.82)";
    modal.style.backdropFilter = "blur(10px)";
    modal.style.display = "flex";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";
    modal.style.padding = "24px";

    modal.innerHTML = `
      <div style="width:min(1180px,96vw);height:min(760px,90vh);border:1px solid rgba(255,255,255,.14);border-radius:26px;background:linear-gradient(180deg,rgba(13,24,42,.98),rgba(6,12,23,.98));box-shadow:0 30px 90px rgba(0,0,0,.55);overflow:hidden;color:#eef4ff;display:grid;grid-template-rows:auto 1fr;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.10);background:linear-gradient(90deg,rgba(110,168,255,.12),rgba(86,240,169,.07));">
          <div>
            <div style="font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#9fb4dd;font-weight:950;">ChatGPT/Grok-style design workspace</div>
            <div style="font-size:22px;font-weight:950;line-height:1.15;margin-top:4px;">${esc(blueprint.headline)}</div>
          </div>
          <button type="button" data-close style="width:40px;height:40px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.07);color:#fff;font-size:22px;cursor:pointer;">×</button>
        </div>
        <div style="display:grid;grid-template-columns:minmax(0,1fr) 300px;min-height:0;">
          <div style="position:relative;overflow:hidden;background:radial-gradient(circle at center,rgba(110,168,255,.14),transparent 48%),#050b14;perspective:1300px;display:flex;align-items:center;justify-content:center;padding:34px;">
            <div id="simoVcWorkspaceObject" style="width:min(720px,90%);max-height:88%;transform-style:preserve-3d;transform:rotateX(0deg) rotateY(-12deg);transition:transform .12s ease;">
              <div style="position:relative;border-radius:28px;overflow:hidden;border:1px solid rgba(255,255,255,.18);box-shadow:0 26px 80px rgba(0,0,0,.46);background:#050b14;transform:translateZ(24px);">
                <img src="${esc(img)}" alt="${esc(title)}" style="display:block;width:100%;height:auto;max-height:560px;object-fit:contain;background:#050b14;" />
              </div>
              <div style="height:34px;margin:0 8%;background:linear-gradient(90deg,rgba(110,168,255,.20),rgba(86,240,169,.16));filter:blur(15px);transform:rotateX(80deg) translateZ(-28px);"></div>
            </div>
            <div style="position:absolute;left:20px;bottom:18px;border:1px solid rgba(255,255,255,.12);background:rgba(5,11,20,.76);border-radius:999px;padding:10px 13px;color:#dce8ff;font-size:12px;">Drag to rotate preview • scroll to zoom • this stays tied to the image/design</div>
          </div>
          <div style="border-left:1px solid rgba(255,255,255,.10);padding:16px;overflow:auto;background:rgba(255,255,255,.035);display:grid;align-content:start;gap:12px;">
            <div style="font-weight:950;font-size:15px;">${esc(blueprint.title)}</div>
            <div style="font-size:13px;line-height:1.55;color:#c7d3ea;">${esc(blueprint.promise)}</div>
            <div style="font-size:12px;line-height:1.5;color:#9fb4dd;">${esc(reason || "This workspace keeps the real visual concept as the source of truth. If an exact 3D model is not available yet, Simo will not show an unrelated fallback.")}</div>
            <div style="display:grid;grid-template-columns:1fr;gap:8px;margin-top:2px;">
              <button type="button" data-save-workspace style="min-height:42px;border-radius:14px;border:1px solid rgba(255,215,106,.32);background:rgba(255,215,106,.13);color:#fff6d8;font-weight:950;cursor:pointer;">Save Workspace to Library</button>
              <button type="button" data-open-workspace-tab style="min-height:42px;border-radius:14px;border:1px solid rgba(110,168,255,.30);background:rgba(110,168,255,.12);color:#eef4ff;font-weight:900;cursor:pointer;">Open Workspace in New Tab</button>
              <a href="${esc(img)}" target="_blank" rel="noopener" style="min-height:38px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;font-weight:850;text-decoration:none;display:flex;align-items:center;justify-content:center;">Open Source Image</a>
            </div>
            <div style="height:1px;background:rgba(255,255,255,.08);"></div>
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#b9c8e7;font-weight:950;">Design path</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">${stageChips}</div>
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#b9c8e7;font-weight:950;margin-top:4px;">Suggested next edits</div>
            <div style="display:grid;gap:8px;">${refineButtons}</div>
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#b9c8e7;font-weight:950;margin-top:4px;">Exact controls</div>
            <div style="display:grid;gap:8px;">${controlButtons}</div>
            <button type="button" data-render style="min-height:42px;border-radius:14px;border:1px solid rgba(110,168,255,.30);background:linear-gradient(135deg,rgba(110,168,255,.22),rgba(185,130,255,.16));color:#fff;font-weight:900;cursor:pointer;">Generate matching render</button>
            <button type="button" data-variation style="min-height:42px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;font-weight:850;cursor:pointer;">Generate variations</button>
            <a href="${esc(img)}" target="_blank" rel="noopener" style="min-height:42px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;font-weight:850;text-decoration:none;display:flex;align-items:center;justify-content:center;">Open visual in new tab</a>
          </div>
        </div>
      </div>`;

    try {
      window.__SIMO_LAST_WORKSPACE_PROJECT__ = JSON.parse(JSON.stringify(project || {}));
      localStorage.setItem("simo_last_workspace_project_v1", JSON.stringify(window.__SIMO_LAST_WORKSPACE_PROJECT__));
    } catch {}

    document.body.appendChild(modal);
    document.body.classList.add("modal-open");
    setSimoStatus("Workspace open — ready to refine.", false);

    const close = () => { try { modal.remove(); } catch {}; document.body.classList.remove("modal-open"); setSimoStatus("Ready.", false); };
    modal.querySelector("[data-close]")?.addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) { e.preventDefault(); e.stopPropagation(); } });

    const obj = modal.querySelector("#simoVcWorkspaceObject");
    let rx = 0, ry = -12, scale = 1, dragging = false, sx = 0, sy = 0;
    const apply = () => { if (obj) obj.style.transform = `scale(${scale}) rotateX(${rx}deg) rotateY(${ry}deg)`; };
    modal.addEventListener("pointerdown", (e) => { if (e.target.closest("button,a")) return; dragging = true; sx = e.clientX; sy = e.clientY; modal.setPointerCapture?.(e.pointerId); });
    modal.addEventListener("pointermove", (e) => { if (!dragging) return; ry += (e.clientX - sx) * 0.25; rx -= (e.clientY - sy) * 0.18; rx = Math.max(-35, Math.min(35, rx)); sx = e.clientX; sy = e.clientY; apply(); });
    modal.addEventListener("pointerup", () => { dragging = false; });
    modal.addEventListener("wheel", (e) => { e.preventDefault(); scale += e.deltaY < 0 ? 0.05 : -0.05; scale = Math.max(0.65, Math.min(1.65, scale)); apply(); }, { passive:false });

    modal.querySelector("[data-save-workspace]")?.addEventListener("click", async () => {
      await saveVisualProject(project);
    });
    modal.querySelector("[data-open-workspace-tab]")?.addEventListener("click", () => {
      openVisualPreviewInNewTab(project);
    });

    modal.querySelectorAll("[data-simo-workspace-prompt]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const prompt = btn.getAttribute("data-simo-workspace-prompt") || "";
        const label = btn.getAttribute("data-simo-workspace-action") || "Workspace refinement";
        const actionSlug = slugify(label) || "workspace-refine";
        setButtonBusy(btn, true, "Refining…");
        setSimoStatus(statusTextForAction(actionSlug, project.category), true);
        close();
        run(prompt || controlPrompt(project, label) || `Continue this same ${title}`, actionSlug);
      });
    });
    modal.querySelector("[data-render]")?.addEventListener("click", () => { close(); run(controlPrompt(project, "Generate matching realistic render"), "render"); });
    modal.querySelector("[data-variation]")?.addEventListener("click", () => { close(); run(controlPrompt(project, "Generate stronger visual variations"), "variation"); });

    project.wants3D = true;
    project.last3dAsset = { title: `${title} connected workspace`, url: "connected-workspace", source_label: "Simo visual workspace", exact: false };
    setActive(project);
    return true;
  }


  function deriveWorkspaceSubject(promptText, activeProject, title) {
    const raw = String(promptText || "").trim();
    const blob = clean([raw, activeProject && activeProject.item, activeProject && activeProject.lockedSubject, title].filter(Boolean).join(" "));
    const low = blob.toLowerCase();
    const known = [
      ["ceiling fan", /\b(ceiling fan|fan blade|fan blades|fan light|fan motor|overhead fan)\b/],
      ["toothbrush", /\b(toothbrush|tooth brush|electric toothbrush|manual toothbrush)\b/],
      ["soda can", /\b(soda can|beverage can|aluminum can|drink can|pop can|12\s*(oz|ounce)\s*can)\b/],
      ["tire rim", /\b(tire\s+rim|wheel\s+rim|alloy\s+wheel|automotive\s+wheel|custom\s+wheel|rim|rims)\b/],
      ["led flashlight", /\b(led flashlight|flashlight|torch)\b/],
      ["barbecue grill", /\b(barbecue grill|bbq grill|gas grill|charcoal grill|pellet grill|smoker grill|outdoor grill|barbeque grill|barbecue|bbq|grill|smoker)\b/],
      ["soap dispenser", /\b(soap dispenser|dispenser)\b/],
      ["fire extinguisher", /\b(fire extinguisher|extinguisher)\b/],
      ["water bottle", /\b(water bottle|bottle|tumbler|flask)\b/],
      ["toaster", /\b(toaster)\b/]
    ];
    for (const pair of known) {
      if (pair[1].test(low)) return pair[0];
    }
    let extracted = extractSubjectPhrase(raw || (activeProject && activeProject.latestPrompt) || title || "", "");
    extracted = clean(extracted)
      .replace(/\b(i can|can design|can customize|to design|to customize|product concept|design concept|workspace)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (extracted && !/^(make|add|remove|change|edit|put|place|keep|preserve)$/i.test(extracted)) return extracted.toLowerCase();
    return clean((activeProject && (activeProject.lockedSubject || activeProject.item)) || title || "current design").toLowerCase();
  }

  async function open3D(project, sourcePrompt) {
    const activeProject = project || getActive() || buildProject(sourcePrompt || "design concept", "workspace");
    const promptText = sourcePrompt || activeProject.latestPrompt || activeProject.prompt || activeProject.item || "this design concept";

    function cleanUrl(value) {
      return String(value || "").trim();
    }

    function absoluteImageUrl(value) {
      const raw = cleanUrl(value);
      if (!raw) return "";
      if (/^(data:image\/|blob:|https?:\/\/)/i.test(raw)) return raw;
      try { return new URL(raw, window.location.origin).href; } catch { return raw; }
    }

    function sourceImageUrl(value) {
      const raw = absoluteImageUrl(value);
      if (!raw) return "";
      if (/^data:image\//i.test(raw)) return raw;
      if (/^blob:/i.test(raw)) return raw;
      try {
        const u = new URL(raw);
        if (u.origin === window.location.origin) return u.pathname + u.search;
      } catch {}
      return raw;
    }

    let title = displayTitle(activeProject);
    const workspaceSubject = deriveWorkspaceSubject(promptText, activeProject, title);
    if (workspaceSubject && !clean(title).toLowerCase().includes(workspaceSubject.toLowerCase())) {
      title = titleCase(workspaceSubject + " Workspace");
    }
    const imageUrl = absoluteImageUrl(
      activeProject.imageUrl ||
      activeProject.generated_visual_url ||
      activeProject.generatedImageUrl ||
      activeProject.previewUrl ||
      activeProject.thumbnail ||
      activeProject.visualUrl ||
      ""
    );

    if (!imageUrl) {
      addAssistant(renderProject(
        activeProject,
        "I found the design card, but I could not find the current image source for the workspace. Generate the image again, then click Open Workspace."
      ));
      return true;
    }

    const payload = {
      id: activeProject.id || ("simo_workspace_" + Date.now().toString(36)),
      phase: PHASE,
      title: title,
      name: title,
      projectTitle: title,
      workspaceSubject: workspaceSubject || activeProject.lockedSubject || activeProject.item || title || "current design",
      subject: workspaceSubject || activeProject.lockedSubject || activeProject.item || title || "current design",
      objectType: workspaceSubject || activeProject.lockedSubject || activeProject.item || title || "current design",
      prompt: promptText,
      originalPrompt: activeProject.prompt || promptText,
      image: imageUrl,
      currentImage: imageUrl,
      displayImageUrl: imageUrl,
      previewUrl: imageUrl,
      thumbnail: imageUrl,
      originalImage: activeProject.originalImage || activeProject.originalImageUrl || imageUrl,
      sourceImage: sourceImageUrl(imageUrl),
      currentSourceImage: sourceImageUrl(imageUrl),
      originalSourceImage: sourceImageUrl(activeProject.originalImage || activeProject.originalImageUrl || imageUrl),
      edits: Array.isArray(activeProject.editHistory) ? activeProject.editHistory.slice() : [],
      category: activeProject.category || "design",
      kind: activeProject.kind || "design",
      source: "simo_main_visual_card_open_workspace",
      createdAt: new Date().toISOString()
    };

    activeProject.wants3D = false;
    activeProject.workspaceOpen = true;
    activeProject.lastWorkspacePayload = payload;
    setActive(activeProject);

    const bridges = [
      window.SimoWorkspaceBridge,
      window.SimoLiveWorkspaceIsolated,
      window.SimoLiveWorkspace
    ].filter(Boolean);

    for (const bridge of bridges) {
      try {
        if (typeof bridge.openTab === "function") {
          bridge.openTab(payload);
          setSimoStatus("Opened clean design workspace.", false);
          return true;
        }
        if (typeof bridge.openWorkspace === "function") {
          bridge.openWorkspace(payload);
          setSimoStatus("Opened clean design workspace.", false);
          return true;
        }
        if (typeof bridge.open === "function") {
          bridge.open(payload);
          setSimoStatus("Opened clean design workspace.", false);
          return true;
        }
        if (typeof bridge.openSavedItem === "function") {
          bridge.openSavedItem(payload);
          setSimoStatus("Opened clean design workspace.", false);
          return true;
        }
      } catch (err) {
        console.warn("Simo clean workspace bridge attempt failed:", err);
      }
    }

    try {
      openConnectedWorkspace(
        activeProject,
        promptText,
        "Clean workspace bridge was unavailable, so Simo opened the older connected preview as a fallback. The card image is still the source of truth."
      );
      return true;
    } catch (err) {
      console.error("Simo workspace open failed:", err);
      addAssistant(renderProject(
        activeProject,
        "Simo caught the Open Workspace click, but no workspace bridge accepted the payload. Check that simo-live-workspace-isolated.js is loaded before this script."
      ));
      return true;
    }
  }

  async function run(prompt, action = "base") {
    const text = String(prompt || "").trim();
    if (!text) return false;
    const effectiveText = enrichPromptWithCreativeContext(text);
    const creative = getCreativeContext();
    const project = buildProject(effectiveText, action);
    const busyText = statusTextForAction(action, project.category);
    setSimoStatus(busyText, true);
    addUser(text);
    clearInput();
    const working = renderWorking(text, busyText);
    try {
      let imageUrl = "";
      let apiData = null;
      try {
        apiData = await api("/api/generate-visual", {
          prompt: effectiveText,
          message: text,
          original_prompt: text,
          active_creative_context: creative && creative.prompt ? creative.prompt : "",
          action,
          domain: project.category,
          strict_domain: project.category,
          wants_3d: project.wants3D,
          active_visual_project: {
            ...project,
            domain: project.category,
            projectType: project.category,
            exactSubject: project.lockedSubject || project.item,
            requestedAsset: project.lockedSubject || project.item,
            object_lock: project.exactObjectLock || null,
          },
          exact_object_lock: project.exactObjectLock || null,
          locked_subject: project.lockedSubject || project.item || project.title,
          visual_core_phase: "14F",
          refinement_strength: actionIsMeaningful(action) ? "strong-visible-multi-detail" : "base-visual-first",
          requested_visible_changes: actionIsMeaningful(action) ? domainActionBrief(project.category, actionTitleFromPrompt(text, action)).details : [],
        });
        imageUrl = apiData.image_url || apiData.generated_visual_url || apiData.generated_visual?.url || (Array.isArray(apiData.visuals) && apiData.visuals[0] && (apiData.visuals[0].url || apiData.visuals[0].image_url)) || "";
      } catch (err) {
        console.warn("SimoVisualCore real image route failed - SVG/demo fallback blocked:", err);
        throw err;
      }

      const previousImageUrl = String(project.imageUrl || "");
      const actionLabel = actionTitleFromPrompt(text, action);
      if (!imageUrl || isFakeFallbackVisualUrl(imageUrl)) {
        throw new Error("/api/generate-visual did not return a real generated PNG/JPG/WebP image. SVG/demo fallback is blocked in Phase 11.1.");
      }
      project.imageUrl = imageUrl;
      const looksLikeStaticSeed =
        imageUrl &&
        previousImageUrl &&
        String(imageUrl) === previousImageUrl &&
        actionIsMeaningful(action);
      if (looksLikeStaticSeed) {
        throw new Error("The edit action returned the same image URL. Simo blocked fake visual evolution; the action must generate a fresh real image from the same locked concept.");
      }
      project.lastActionLabel = actionLabel;
      project.editHistory = Array.isArray(project.editHistory) ? project.editHistory : [];
      if (actionIsMeaningful(action)) {
        project.versionIndex = Number(project.versionIndex || 1) + 1;
        project.editHistory = [
          { label: actionLabel, action, prompt: text, at: new Date().toISOString(), version: project.versionIndex },
          ...project.editHistory,
        ].slice(0, 12);
      }
      setSimoStatus("Ready.", false);
      removeRow(working);
      addAssistant(renderProject(project, actionIsMeaningful(action)
        ? `Updated this same ${project.category || "design"} concept with a visible ${actionLabel} pass. Use Open Workspace to keep refining from this exact design.`
        : undefined));
      return true;
    } catch (err) {
      setSimoStatus("Ready.", false);
      removeRow(working);
      addAssistant(renderRealImageRequired(project, `The visual core stayed in ${project.category} mode, but the live render failed: ${err.message || err}`));
      return true;
    }
  }

  function submitCapture(forceText) {
    const input = getInput();
    const text = String(forceText || (input && input.value) || "").trim();
    if (!isDesignPrompt(text)) return false;
    run(text, "base");
    return true;
  }


  function hardOpenWorkspaceFromClick(e) {
    const target = e && e.target;
    if (!target || !target.closest) return false;

    const special = target.closest("[data-simo-vc-special='open-3d'], [data-simo-vc-special=\"open-3d\"]");
    const btn = target.closest("button, a, [role='button']");
    const label = clean((btn && (btn.textContent || btn.getAttribute("aria-label") || btn.getAttribute("title"))) || "");
    const looksLikeWorkspace = !!special || (label.includes("open") && label.includes("workspace")) || (label.includes("3d") && label.includes("rotate") && label.includes("workspace"));

    if (!looksLikeWorkspace) return false;

    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();

    let active = activeFromClickTarget(target);
    if (!active) active = buildProject("design concept", "workspace");

    // R4: workspace must use the clicked card as source of truth, not the last global project.
    try {
      const card = target.closest(".simo-vc-card, .simo105d-row, .msg-row, .msg-bubble, section, article, div");
      const img = card && card.querySelector ? card.querySelector("img") : null;
      if (img && img.src) active.imageUrl = img.src;
    } catch {}

    active.wants3D = true;
    setActive(active);

    try {
      open3D(
        active,
        active.latestPrompt || active.prompt || active.item || "this exact visual concept"
      );
      return true;
    } catch (err) {
      console.error("Simo hard workspace open failed:", err);
      addAssistant(renderProject(active, "I caught the workspace click, but the modal failed to open. The visual concept is still active, so the next fix can target only the modal renderer."));
      return true;
    }
  }

  function bind() {
    window.__SIMO_PHASE_MARKER__ = PHASE;

    window.addEventListener("click", function (e) {
      if (hardOpenWorkspaceFromClick(e)) return;
      const specialBtn = e.target && e.target.closest ? e.target.closest("[data-simo-vc-special]") : null;
      if (specialBtn) {
        e.preventDefault();
        e.stopPropagation();
        const specialOriginalLabel = specialBtn.textContent || "Working";
        setButtonBusy(specialBtn, true, "Working…");
        setTimeout(() => setButtonBusy(specialBtn, false, specialOriginalLabel), 900);
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        const active = activeFromClickTarget(specialBtn) || buildProject("design concept", "base");
        setActive(active);
        const mode = specialBtn.getAttribute("data-simo-vc-special");
        if (mode === "save-library") {
          saveVisualProject(active);
          return;
        }
        if (mode === "open-3d") {
          open3D(active, active.latestPrompt || active.prompt || active.item);
          return;
        }
        if (mode === "continue") {
          run(controlPrompt(active, "continue editing this same concept with one stronger design pass"), "continue");
          return;
        }
        if (mode === "variation") {
          run(controlPrompt(active, "generate several stronger visual variations while keeping the same object and domain"), "variation");
          return;
        }
        if (mode === "rerender") {
          run(controlPrompt(active, "create the strongest realistic render with premium lighting, materials, and detail"), "render");
          return;
        }
      }

      const actionBtn = e.target && e.target.closest ? e.target.closest("[data-simo-vc-action]") : null;
      if (actionBtn) {
        e.preventDefault();
        e.stopPropagation();
        const actionOriginalLabel = actionBtn.textContent || "Refine";
        setButtonBusy(actionBtn, true, "Refining…");
        setTimeout(() => setButtonBusy(actionBtn, false, actionOriginalLabel), 900);
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        const active = activeFromClickTarget(actionBtn);
        if (active) setActive(active);
        const actionLabel = actionBtn.getAttribute("data-simo-vc-action") || "Refine";
        const actionSlug = slugify(actionLabel) || "refine";
        run(controlPrompt(active, actionLabel), actionSlug);
        return;
      }

      const send = e.target && e.target.closest ? e.target.closest("#sendBtn, .send-btn, [data-role='send'], button[type='submit']") : null;
      if (!send) return;
      const input = getInput();
      const text = String(input && input.value || "").trim();
      if (!isDesignPrompt(text)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      submitCapture(text);
    }, true);

    window.addEventListener("keydown", function (e) {
      const input = getInput();
      if (!input || e.target !== input) return;
      if (e.key !== "Enter" || e.shiftKey) return;
      const text = String(input.value || "").trim();
      if (!isDesignPrompt(text)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      submitCapture(text);
    }, true);
  }

  window.SimoVisualCore = {
    phase: PHASE,
    classifyPrompt,
    controlsFor,
    run,
    getActive,
    displayTitle,
    saveVisualProject,
    open3D,
    forceWorkspace() {
      const active = getActive() || buildProject("design concept", "workspace");
      return openConnectedWorkspace(active, active.latestPrompt || active.prompt || active.item || "this design concept", "Opened from SimoVisualCore.forceWorkspace().");
    },
    reset() {
      try { localStorage.removeItem(ACTIVE_KEY); } catch {}
    },
  };

  bind();
  setTimeout(() => { window.__SIMO_PHASE_MARKER__ = PHASE; }, 0);
  setTimeout(() => { window.__SIMO_PHASE_MARKER__ = PHASE; }, 250);
  console.log("SimoVisualCore loaded:", PHASE);
})();

// PHASE 14M-R10.44 — Old R10.38 workspace direct-save bridge removed.
// Workspace saves now write one clean native Library item from simo-live-workspace-isolated.js.


/* SIMO R10.45G / V1.3.17 — Library duplicate-id/signature guard
   Purpose: when workspace save causes both local and server/event paths to insert the same saved item,
   keep only one card per exact id. This does not remove separate edited versions with different ids. */
(function () {
  "use strict";
  var LIB_KEY = "simo_builder_library_v5_1_builder_first";
  function dedupeLibraryExactIds(reason) {
    try {
      var raw = localStorage.getItem(LIB_KEY) || "[]";
      var list = [];
      try { list = JSON.parse(raw); } catch (e) { list = []; }
      if (!Array.isArray(list)) return;
      var seen = Object.create(null);
      var next = [];
      for (var i = 0; i < list.length; i += 1) {
        var item = list[i];
        if (!item) continue;
        var id = String(item.id || "").trim();
        var sig = String(item.simoWorkspaceSaveSignature || "").trim();
        var saveUid = String(item.simoWorkspaceSaveUid || "").trim();
        var key = saveUid ? ("uid:" + saveUid) : (id ? ("id:" + id) : (sig ? ("sig:" + sig) : ""));
        if (key && seen[key]) continue;
        if (key) seen[key] = true;
        next.push(item);
      }
      if (next.length !== list.length) {
        localStorage.setItem(LIB_KEY, JSON.stringify(next));
        var count = document.getElementById("libraryCountValue");
        if (count) count.textContent = String(next.length);
        try { console.warn("SIMO library duplicate-id guard", reason || "", list.length, "->", next.length); } catch (e2) {}
      }
    } catch (err) {
      try { console.warn("SIMO library duplicate-id guard skipped:", err); } catch (e3) {}
    }
  }
  window.SimoLibraryDedupeExactIds = dedupeLibraryExactIds;
  window.addEventListener("simo:library-updated", function () {
    setTimeout(function () { dedupeLibraryExactIds("window event"); }, 50);
    setTimeout(function () { dedupeLibraryExactIds("window event delayed"); }, 800);
  });
  document.addEventListener("simo:library-updated", function () {
    setTimeout(function () { dedupeLibraryExactIds("document event"); }, 50);
    setTimeout(function () { dedupeLibraryExactIds("document event delayed"); }, 800);
  });
  setTimeout(function () { dedupeLibraryExactIds("startup"); }, 1000);
})();


/* SIMO V1.3.23 — Design Credits UI + Credit Pack Checkout
   Isolated helper. Shows remaining design credits and lets logged-in users buy credit packs. */
(function () {
  "use strict";
  if (window.__SIMO_DESIGN_CREDITS_UI_V1323__) return;
  window.__SIMO_DESIGN_CREDITS_UI_V1323__ = true;

  function el(tag, attrs, html) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      if (k === "style") node.setAttribute("style", attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    if (html != null) node.innerHTML = html;
    return node;
  }

  function css() {
    if (document.getElementById("simoDesignCreditStyles")) return;
    var style = el("style", { id: "simoDesignCreditStyles" }, `
      .simo-credit-pill{position:fixed;right:18px;bottom:18px;z-index:2147483000;border:1px solid rgba(255,255,255,.16);background:rgba(7,14,27,.88);backdrop-filter:blur(16px);color:#eef4ff;border-radius:999px;padding:10px 12px;display:flex;align-items:center;gap:9px;box-shadow:0 18px 55px rgba(0,0,0,.32);font-family:Inter,Arial,sans-serif;font-size:12px;font-weight:900}
      .simo-credit-pill button{border:1px solid rgba(110,168,255,.35);background:rgba(110,168,255,.15);color:#eef4ff;border-radius:999px;padding:8px 10px;font-weight:950;cursor:pointer;font-size:12px}
      .simo-credit-modal-backdrop{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.58);display:flex;align-items:center;justify-content:center;padding:18px;font-family:Inter,Arial,sans-serif}
      .simo-credit-modal{width:min(560px,96vw);border:1px solid rgba(255,255,255,.16);background:#07111f;color:#eef4ff;border-radius:24px;box-shadow:0 30px 100px rgba(0,0,0,.55);padding:20px;display:grid;gap:14px}
      .simo-credit-modal h3{margin:0;font-size:22px}.simo-credit-modal p{margin:0;color:#c7d3ea;line-height:1.45;font-size:13px}
      .simo-pack-list{display:grid;gap:10px}.simo-pack{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.055);border-radius:18px;padding:14px;display:flex;justify-content:space-between;gap:14px;align-items:center}.simo-pack strong{display:block;font-size:15px}.simo-pack span{display:block;color:#c7d3ea;font-size:12px;margin-top:3px}.simo-pack button{border:1px solid rgba(86,240,169,.28);background:rgba(86,240,169,.13);color:#eafff4;border-radius:999px;padding:10px 12px;font-weight:950;cursor:pointer}.simo-credit-close{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#eef4ff;border-radius:999px;padding:10px 12px;font-weight:900;cursor:pointer;justify-self:end}
    `);
    document.head.appendChild(style);
  }

  async function api(path, payload) {
    var res = await fetch(path, { method: payload ? "POST" : "GET", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: payload ? JSON.stringify(payload) : undefined });
    var data = await res.json().catch(function(){ return { ok:false, error:"Bad response" }; });
    if (!res.ok || data.ok === false) throw new Error(data.error || ("Request failed: " + res.status));
    return data;
  }

  function label(status) {
    if (!status || !status.enabled) return "Design credits";
    if (status.unlimited) return "Design credits: Admin";
    var n = status.remaining == null ? 0 : Number(status.remaining || 0);
    return "Design credits: " + n;
  }

  function renderPill(status) {
    css();
    var old = document.getElementById("simoDesignCreditPill");
    if (old) old.remove();
    var pill = el("div", { id:"simoDesignCreditPill", class:"simo-credit-pill" });
    pill.appendChild(el("span", {}, label(status)));
    var btn = el("button", { type:"button" }, "Buy credits");
    btn.addEventListener("click", openModal);
    pill.appendChild(btn);
    document.body.appendChild(pill);
  }

  async function refresh() {
    try {
      var data = await api("/api/design-credits/status");
      renderPill(data.image_credits || {});
    } catch (e) {}
  }

  async function openModal() {
    css();
    var options;
    try { options = await api("/api/design-credits/options"); }
    catch (e) { alert(e.message || "Could not load credit packs."); return; }
    var packs = options.packs || [];
    var backdrop = el("div", { class:"simo-credit-modal-backdrop" });
    var modal = el("div", { class:"simo-credit-modal" });
    modal.appendChild(el("h3", {}, "Buy Simo design credits"));
    modal.appendChild(el("p", {}, "Use credits for image/design generation and workspace edits. Credits are added to your Simo account after Stripe checkout."));
    var list = el("div", { class:"simo-pack-list" });
    if (!packs.length) list.appendChild(el("p", {}, "Credit packs are not configured yet. Add Stripe price IDs in your .env file."));
    packs.forEach(function (pack) {
      var row = el("div", { class:"simo-pack" });
      row.appendChild(el("div", {}, "<strong>" + pack.credits + " design credits</strong><span>" + (pack.description || "Extra Simo design usage") + "</span>"));
      var b = el("button", { type:"button" }, "Buy");
      b.addEventListener("click", async function () {
        b.disabled = true; b.textContent = "Opening…";
        try {
          var data = await api("/api/create-credit-pack-checkout-session", { pack: pack.key });
          if (data.url) window.location.href = data.url;
        } catch (e) { alert(e.message || "Could not start checkout."); b.disabled = false; b.textContent = "Buy"; }
      });
      row.appendChild(b); list.appendChild(row);
    });
    modal.appendChild(list);
    var close = el("button", { type:"button", class:"simo-credit-close" }, "Close");
    close.addEventListener("click", function(){ backdrop.remove(); });
    modal.appendChild(close); backdrop.appendChild(modal); document.body.appendChild(backdrop);
  }

  async function claimReturnCreditPack() {
    try {
      var url = new URL(window.location.href);
      if (url.searchParams.get("credit_pack") !== "success") return;
      var sessionId = url.searchParams.get("session_id") || "";
      if (!sessionId) return;
      var data = await api("/api/credit-packs/claim", { session_id: sessionId });
      var grant = data.grant || {};
      alert((grant.already_granted ? "Credits already added." : "Credits added to your Simo account.") + " Remaining: " + ((data.image_credits || {}).remaining ?? "unlimited"));
      url.searchParams.delete("credit_pack"); url.searchParams.delete("session_id");
      window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : "") + url.hash);
      refresh();
    } catch (e) { console.warn("Simo credit pack claim failed", e); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function(){ refresh(); claimReturnCreditPack(); });
  else { refresh(); claimReturnCreditPack(); }
  window.SimoDesignCreditsUI = { refresh: refresh, open: openModal };
})();
