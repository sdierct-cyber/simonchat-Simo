// SIMO PHASE 14M-R10.60Z1 SEND QUOTE TEST-MODE CONFIRMATION — PRESERVES R10.60Z NORTH STAR
// SIMO PHASE 14M-R10.60Z2 QUOTE TEST MODE MODAL POLISH — PRESERVES R10.60Z/Z1 NORTH STAR
// SIMO PHASE 14M-R10.60Z3 BUILDER EDIT/PREVIEW CLARITY — PRESERVES R10.60Z2 QUOTE TEST MODE
// SIMO PHASE 14M-R10.60Z5 BUILDER ADD MEDIA + SOCIAL LINKS — PRESERVES R10.60Z4
// SIMO PHASE 14M-R10.60Z6 BUILDER EASY MEDIA PLACEMENT — PRESERVES R10.60Z5
// SIMO PHASE 14M-R10.60V BUILDER TRUE INLINE EDITOR + LIVE PREVIEW FIX — PRESERVES R10.60S NORTH STAR
// SIMO PHASE 14M-R10.60M NORTH STAR LANE BRAIN + MOTIVATOR PANEL — PRESERVES R10.60I/L
// SIMO PHASE 14M-R10.60P FIRST-WORD + WAKE-NAME + BUILDER PROMPT CLEANUP
// SIMO PHASE 14M-R10.60H INLINE MIC SAFE FIX — PRESERVES R10.60F RECOVERED COMPOSER + NORTH STAR
// SIMO PHASE 14M-R10.60O BRAND NAME + LANGUAGE SETTINGS — PRESERVES R10.60M NORTH STAR LANE BRAIN
// SIMO PHASE 14M-R10.60B SIGNUP RESTORE + HONEST BROWSER VOICE LABEL — PRESERVES R10.59J CORE + R10.59L COMPOSER
// SIMO PHASE 14M-R10.59J VERIFIED CREDIT PILL + SETTINGS + IMAGE ANALYSIS READY
// SIMO PHASE 14M-R10.59B VERIFIED CREDIT PILL SAFE POSITION + SERVER LIBRARY BRIDGE
// PHASE 10.7B — Exact Object + Persistent Workspace
// Runs after the legacy script and stays isolated from its internals.
(function () {
  "use strict";

  const PHASE = "PHASE 14M-R10.59J VERIFIED — Credit Pill + Settings + Library Click Isolation + Server Library Bridge Compatible";
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


function isTextFirstIntent(prompt) {
  const t = clean(prompt);
  if (!t) return false;

  // R10.60J: Simo North Star intent guard.
  // "Show me a business plan..." is a text/business request, not a visual design request.
  // Keep plain chat/business/planning routed to the normal chat brain unless the user
  // explicitly asks for a visual asset, design concept, render, mockup, logo, cover, etc.
  const explicitVisual =
    /\b(i can design|can design|to design|for me to design|editable design|design card|visual card|open workspace|workspace)\b/.test(t) ||
    /\b(render|visualize|image|picture|photo|illustration|drawing|mockup|wireframe|prototype|concept art|product concept|design concept|logo|brand identity|book cover|poster|flyer|brochure|menu design|app screen|dashboard mockup|website mockup|landing page mockup)\b/.test(t);

  const businessText =
    /\b(business plan|business idea|startup idea|start up idea|side hustle|business model|marketing plan|sales plan|revenue plan|profit plan|budget|under\s*\$?\d+|less than\s*\$?\d+|for under\s*\$?\d+|low budget|customer|customers|market|niche|pricing|expenses|costs|steps to start|how to start|can start|i can start)\b/.test(t);

  const adviceText =
    /\b(how do i|how can i|what should i|tell me|explain|write|draft|outline|summarize|give me steps|step by step|plan for|strategy|advice|ideas for|help me figure out)\b/.test(t);

  if ((businessText || adviceText) && !explicitVisual) return true;
  return false;
}

function isDesignPrompt(prompt) {
  const t = clean(prompt);
  if (!t || /^\[simo_/i.test(t)) return false;
  if (isPureWritingPrompt(prompt)) return false;
  if (isTextFirstIntent(prompt)) return false;
  if (isBuilderIntent(prompt)) return false;

  const create = /\b(show me|show|make|create|build|design|generate|give me|i want|render|visualize|view|draw|draft|concept|mockup|prototype)\b/.test(t);
  const explicitDesignAsk =
    /\b(i can design|can design|to design|for me to design|editable design|design this|design a|design an|design me|product concept|design concept|render|visualize|mockup|prototype|logo|book cover|poster|flyer|brochure|menu design|app screen|dashboard mockup|website mockup|landing page mockup)\b/.test(t);

  const objecty = /\b(car|vehicle|guitar|instrument|home|house|logo|brand|app|screen|dashboard|website|web app|dog leash|leash|light fixture|watch|sneaker|shoe|chair|desk|product|accessory|toy|tool|device|furniture|parking lot|fixture|kitchen|bedroom|interior|yacht|boat|helmet|bag|bottle|package|packaging|lamp|rim|rims|wheel|wheels|tire rim|alloy wheel|book cover|book jacket|poster|flyer|brochure|menu|razor|shaver|spoon|fork|utensil|mug|cup|toaster|grill|flashlight|keyboard|mouse|fire extinguisher|soap dispenser)\b/.test(t);
  const edity = /\b(add|change|make it|refine|remove|adjust|update|variation|variations|modern|luxury|futuristic|matte|gloss|carbon|gold|black|white|premium|sleek|minimal)\b/.test(t);

  if (explicitDesignAsk && (create || objecty)) return true;
  if (create && objecty && /\b(design|render|visualize|mockup|prototype|concept|image|picture|logo|cover|poster|flyer|i can design|can design|to design)\b/.test(t)) return true;
  return edity && !!getActive();
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

    const lead = note || "Here is the closest real visual starting point. Simo is staying with the user’s exact request, showing the result first, then giving relevant controls and an editable workspace option to keep designing from here.";
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



  function simoR1060DWorkspaceLabel(value, fallback) {
    let s = String(value || fallback || "").replace(/\s+/g, " ").trim();
    if (!s) return "Current Design Workspace";
    s = s
      .replace(/\bTags:\s*[\s\S]*$/i, "")
      .replace(/\bVisual\s*,?\s*Design\s*,?\s*Workspace\s*,?\s*Prompt[- ]First\b[\s\S]*$/i, "")
      .replace(/\bWorkspace\s+Design\d{4}[\s\S]*$/i, "Workspace")
      .replace(/\bDesign\d{4}-\d{2}-\d{2}[\s\S]*$/i, "Design")
      .replace(/\d{4}-\d{2}-\d{2}[T\s][\s\S]*$/i, "")
      .replace(/\s*[—-]\s*(Product|Object|Design|Visual)?\s*Concept\s*$/i, "")
      .replace(/\s*[—-]\s*Workspace\s*Design\s*$/i, " Workspace")
      .replace(/\s*[—-]\s*Design\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();

    const low = s.toLowerCase();
    const known = [
      ["spoon", /\bspoon\b/],
      ["razor", /\b(razor|shaver|safety razor)\b/],
      ["coffee mug", /\b(coffee mug|tea mug|\bmug\b|\bcup\b)/],
      ["barbecue grill", /\b(barbecue grill|bbq grill|gas grill|charcoal grill|pellet grill|smoker grill|outdoor grill|barbeque grill|barbecue|bbq|grill|smoker)\b/],
      ["fire extinguisher", /\b(fire extinguisher|extinguisher)\b/],
      ["soap dispenser", /\b(soap dispenser|dispenser)\b/],
      ["led flashlight", /\b(led flashlight|flashlight|torch)\b/],
      ["water bottle", /\b(water bottle|bottle|tumbler|flask)\b/],
      ["soda can", /\b(soda can|beverage can|aluminum can|drink can|pop can)\b/],
      ["toaster", /\btoaster\b/],
      ["tire rim", /\b(tire\s+rim|wheel\s+rim|alloy\s+wheel|automotive\s+wheel|custom\s+wheel|\brims?\b|\bwheels?\b)\b/],
      ["guitar", /\bguitar\b/],
      ["book cover", /\bbook cover\b/]
    ];
    for (const pair of known) {
      if (pair[1].test(low)) return titleCase(pair[0] + " Workspace");
    }

    s = s.replace(/\b(i can|can design|can customize|to design|to customize|for me to design|workspace design|product concept|design concept|visual concept)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (/workspace$/i.test(s)) return titleCase(s);
    return titleCase((s || "Current Design") + " Workspace");
  }

  function deriveWorkspaceSubject(promptText, activeProject, title) {
    const raw = String(promptText || "").trim();
    const blob = clean([raw, activeProject && activeProject.item, activeProject && activeProject.lockedSubject, title].filter(Boolean).join(" "));
    const low = blob.toLowerCase();
    const known = [
      ["spoon", /\bspoon\b/],
      ["razor", /\b(razor|shaver|safety razor)\b/],
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
    title = simoR1060DWorkspaceLabel(workspaceSubject || title, title);
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

  /* -------------------------------------------------- */
  /* R10.60L — North Star Builder Lane Restore           */
  /* -------------------------------------------------- */
  function isBuilderIntent(prompt) {
    const t = clean(prompt);
    if (!t) return false;

    // R10.60S: whole-prompt Website/App Builder lane.
    // A word like "home" only means architecture when the full prompt asks for a house/design.
    // "selling computers out of my home" stays a website/business context.
    const digitalAsset = /\b(website|web site|landing page|homepage|home page|webpage|web page|sales page|squeeze page|portfolio site|business site|ecommerce site|e-commerce site|online store|shop page|storefront page|app|web app|mobile app|dashboard|saas|portal|booking page|checkout page|pricing page|contact page|signup page|sign up page|web tool|software page)\b/.test(t);
    const buildVerb = /\b(build|create|make|generate|design|show me|can you show me|can you build|can you create|i need|i want|put together|draft|start|make me|build me)\b/.test(t);
    const editVerb = /\b(edit|change|update|refine|add|remove|improve|publish|go public|download|copy html|launch|make live)\b/.test(t);

    if (digitalAsset && (buildVerb || editVerb)) return true;

    // Existing builder project follow-up: allow section edits to stay in builder when the active card is a builder card.
    try {
      const hasBuilder = !!(window.__SIMO_R1060L_BUILDER_STORE__ && Object.keys(window.__SIMO_R1060L_BUILDER_STORE__).length);
      if (hasBuilder && /\b(hero|cta|button|buttons|services|products|pricing|contact form|testimonials|colors|theme|mobile|seo|domain|publish|download html|copy html)\b/.test(t)) return true;
    } catch {}

    return false;
  }

  function stripAssistantAddressForIntent(prompt){
    let raw = String(prompt || '').replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    const configured = (typeof assistantBrandName === 'function' ? assistantBrandName() : 'Simo');
    const escaped = String(configured || 'Simo').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const brandRe = new RegExp('^(hi|hey|hello|ok|okay|yo)?\\s*' + escaped + '[,.:;!]?\\s+', 'i');
    raw = raw.replace(brandRe, '');
    raw = raw.replace(/^(hi|hey|hello|ok|okay|yo)\s+/i, '');
    return raw.replace(/\s+/g, ' ').trim();
  }

  function capitalizeFirstVisibleLetter(value) {
    const raw = String(value || '');
    return raw.replace(/^([^A-Za-z0-9]*)([a-z])/, function(_, lead, ch){ return lead + ch.toUpperCase(); });
  }

  function builderTitleFromPrompt(prompt) {
    let raw = stripAssistantAddressForIntent(prompt);
    raw = raw.replace(/^(please\s+)?(can you\s+show\s+me\s+|can you\s+build\s+me\s+|can you\s+create\s+me\s+|can you\s+|could you\s+|would you\s+|i want\s+|i need\s+|show me\s+|build me\s+|build\s+|create me\s+|create\s+|make me\s+|make\s+|generate\s+|design\s+)/i, '');
    raw = raw.replace(/^\s*(a|an|the)\s+(?=(landing page|website|web site|homepage|home page|webpage|web page|app|web app|mobile app|dashboard|store|shop|portal|saas|page)\b)/i, '');
    raw = raw.replace(/\b(that|which)?\s*i\s+can\s+(edit|use|launch|customize|sell).*$/i, '');
    raw = raw.replace(/\bfor me\b.*$/i, '');
    raw = raw.replace(/\b(out of my home|from my home|from home|home based|home-based|work from home|working from home)\b/ig, 'home-based');
    raw = raw.replace(/\s+/g, ' ').trim();
    if (!raw) raw = 'Digital Build';
    return capitalizeFirstVisibleLetter(titleCase(raw));
  }

  function builderKind(prompt) {
    const t = clean(prompt);
    if (/\b(dashboard|admin|analytics|portal)\b/.test(t)) return 'dashboard';
    if (/\b(app|mobile app|web app|saas)\b/.test(t)) return 'app';
    if (/\b(store|shop|ecommerce|e-commerce|checkout|product catalog)\b/.test(t)) return 'store';
    return 'landing';
  }

  function builderSubject(prompt) {
    let t = stripAssistantAddressForIntent(prompt);
    t = t.replace(/^(please\s+)?(can you\s+|could you\s+|would you\s+|i want\s+|i need\s+|show me\s+|can you show me\s+|build me\s+|build\s+|create me\s+|create\s+|make me\s+|make\s+|generate\s+|design\s+|put together\s+)/i, '');
    t = t.replace(/\b(a|an|the)\b\s*/i, '');
    t = t.replace(/\b(landing page|website|web site|homepage|home page|webpage|web page|app|web app|mobile app|dashboard|store|shop|portal|saas|page)\b/ig, '');
    t = t.replace(/\b(out of my home|from my home|from home|home based|home-based|work from home|working from home)\b/ig, 'home-based');
    t = t.replace(/\b(for|about|that|which|i can|can)\b/ig, ' ');
    t = t.replace(/\b(edit hero|edit buttons|edit services|edit products|edit pricing|edit contact|testimonials|mobile layout|seo|domain help|publish|download html|copy html)\b/ig, ' ');
    t = t.replace(/[^a-z0-9\s$-]/ig, ' ').replace(/\s+/g, ' ').trim();
    return titleCase(t || 'Your Business');
  }



  // R10.60Z4: professional builder content profile — restores rich testimonials + image-style sections without touching other lanes.
  function builderProfile(prompt) {
    const raw = String(prompt || '');
    const t = clean(raw);
    const subject = builderSubject(raw || 'your business');
    const base = {
      kicker: 'Professional local website',
      heroBody: `A polished, conversion-focused website for ${subject}. Clear services, trust proof, image-style sections, testimonials, and quote-ready actions are included from the first build.`,
      visualLabel: 'Professional service preview',
      services: ['Signature service', 'Premium package', 'Fast booking'],
      gallery: [
        ['Featured work', 'Clean before-and-after style showcase'],
        ['Customer experience', 'What the finished service feels like'],
        ['Professional process', 'Simple steps from request to delivery']
      ],
      testimonials: [
        ['“The page feels trustworthy right away.”', 'Local customer'],
        ['“Easy to understand and easy to contact.”', 'Happy client'],
        ['“Professional, clean, and ready to launch.”', 'Repeat customer']
      ],
      stats: ['Fast setup', 'Clear offer', 'Easy contact'],
      offerTitle: 'Simple offers customers can understand',
      offerBody: 'Use this section for starter packages, premium services, seasonal specials, bundles, or a clear starting price.',
      trust: ['Clear next step', 'Mobile-friendly layout', 'Built-in quote test mode']
    };

    const profiles = [
      {
        re: /\b(mobile detailing|auto detailing|car detailing|detailing|wash|ceramic|paint correction)\b/,
        data: {
          kicker: 'Mobile detailing website',
          heroBody: 'A premium mobile detailing landing page with service packages, polished vehicle-care visuals, trust proof, reviews, and a safe quote request flow.',
          visualLabel: 'Detailing service preview',
          services: ['Exterior detail', 'Interior deep clean', 'Ceramic protection'],
          gallery: [['Mirror-finish exterior', 'Show polished paint, wheels, and shine'], ['Fresh interior reset', 'Show clean seats, mats, vents, and trim'], ['Mobile service setup', 'Show van, tools, water, towels, and convenience']],
          testimonials: [['“My car looked showroom-ready.”', 'SUV owner'], ['“Booking was simple and the results were spotless.”', 'Busy parent'], ['“Professional, on time, and worth every dollar.”', 'Local customer']],
          stats: ['Same-day quotes', 'Mobile service', 'Premium finish'],
          offerTitle: 'Detailing packages made simple',
          offerBody: 'Show starter washes, full details, ceramic upgrades, fleet packages, and add-ons customers can choose quickly.',
          trust: ['Before/after friendly', 'Quote form ready', 'Great for local SEO']
        }
      },
      {
        re: /\b(bakery|cupcake|cake|cakes|pastry|pastries|bread|dessert|cookie|cookies)\b/,
        data: {
          kicker: 'Bakery website',
          heroBody: 'A warm bakery website with fresh product imagery, popular items, custom order calls-to-action, reviews, and a friendly contact flow.',
          visualLabel: 'Fresh bakery preview',
          services: ['Custom cakes', 'Fresh pastries', 'Catering boxes'],
          gallery: [['Signature cakes', 'Show decorated cakes and celebration orders'], ['Fresh daily case', 'Show pastries, bread, cookies, and sweets'], ['Custom events', 'Show weddings, birthdays, and catering trays']],
          testimonials: [['“The cake was beautiful and delicious.”', 'Birthday customer'], ['“Everything looked fresh and professional.”', 'Local regular'], ['“Ordering was easy and the display was stunning.”', 'Event client']],
          stats: ['Fresh daily', 'Custom orders', 'Local favorite'],
          offerTitle: 'Bakery offers customers can act on',
          offerBody: 'Feature daily specials, custom cake deposits, catering boxes, holiday pre-orders, and pickup instructions.',
          trust: ['Custom order CTA', 'Menu-ready sections', 'Review proof included']
        }
      },
      {
        re: /\b(bike|bikes|bicycle|bicycles|cycling|bike shop|repair shop|e-bike|ebike)\b/,
        data: {
          kicker: 'Bike shop website',
          heroBody: 'A sharp bike website with product/service cards, tune-up offers, image-style bike sections, testimonials, and quote or booking actions.',
          visualLabel: 'Bike shop preview',
          services: ['Bike tune-ups', 'New bike sales', 'E-bike service'],
          gallery: [['Performance bikes', 'Show clean bikes, wheels, frames, and gear'], ['Repair bench', 'Show tune-ups, brakes, chains, and expert service'], ['Local rides', 'Show community, trails, accessories, and riders']],
          testimonials: [['“They made my bike ride like new.”', 'Weekend rider'], ['“Fast service and honest recommendations.”', 'Commuter'], ['“The site makes booking a tune-up easy.”', 'Cycling customer']],
          stats: ['Tune-ups', 'Parts & gear', 'Local rides'],
          offerTitle: 'Bike offers and service packages',
          offerBody: 'Use this section for tune-up tiers, seasonal repairs, accessory bundles, e-bike checks, and new bike promotions.',
          trust: ['Service-first CTA', 'Local shop feel', 'Gallery/reviews included']
        }
      },
      {
        re: /\b(computer|computers|pc repair|laptop|laptops|it support|tech support|electronics)\b/,
        data: {
          kicker: 'Computer service website',
          heroBody: 'A clean tech-service website with service cards, trust proof, repair/support visuals, testimonials, and quick contact actions.',
          visualLabel: 'Tech service preview',
          services: ['Computer sales', 'Repair support', 'Setup help'],
          gallery: [['Workstation setup', 'Show clean computers, monitors, and desk setup'], ['Repair/support', 'Show diagnostics, parts, and careful service'], ['Small business help', 'Show reliable tech support and setup']],
          testimonials: [['“Fast help and clear pricing.”', 'Home office customer'], ['“They explained everything simply.”', 'Laptop owner'], ['“Professional setup from start to finish.”', 'Small business client']],
          stats: ['Fast support', 'Clear pricing', 'Local help'],
          offerTitle: 'Tech offers customers can understand',
          offerBody: 'Feature computer packages, diagnostics, setup help, repairs, support plans, and local pickup options.',
          trust: ['Plain-English support', 'Quote-ready form', 'Professional service cards']
        }
      }
    ];

    const found = profiles.find(function(profile){ return profile.re.test(t); });
    return Object.assign({}, base, found ? found.data : {});
  }

  function builderProfessionalSections(profile) {
    const safeStats = (profile.stats || []).slice(0, 3);
    const safeGallery = (profile.gallery || []).slice(0, 3);
    const safeTestimonials = (profile.testimonials || []).slice(0, 3);
    const safeTrust = (profile.trust || []).slice(0, 3);
    return `
    <section id="gallery" class="section pro-section"><div class="section-head"><div><div class="eyebrow">Gallery / Image Direction</div><h2>Professional image sections are already planned</h2><p>These visual cards show what photos or generated images should represent, so the page feels complete instead of empty.</p></div></div><div class="image-grid">${safeGallery.map(function(item, i){ return `<div class="photo-card photo-${i + 1}"><div><strong>${esc(item[0])}</strong><span>${esc(item[1])}</span></div></div>`; }).join('')}</div></section>
    <section id="reviews" class="section pro-section"><div class="section-head"><div><div class="eyebrow">Testimonials</div><h2>Social proof is built in</h2><p>Short, believable review cards help the page feel like a real professional business site from the first draft.</p></div></div><div class="grid testimonials">${safeTestimonials.map(function(item){ return `<div class="card"><p style="font-size:18px;color:#111827;font-weight:850;line-height:1.55;margin-bottom:14px;">${esc(item[0])}</p><p style="font-size:13px;color:#64748b;font-weight:900;margin:0;">${esc(item[1])}</p></div>`; }).join('')}</div></section>
    <section id="trust" class="section pro-section"><div class="card trust-card"><div><div class="eyebrow">Why customers trust it</div><h2>Clear, polished, and action-focused</h2><p>Every generated website should feel useful right away: services, images, reviews, offers, and buttons that make sense.</p></div><div class="trust-list">${safeTrust.map(function(item){ return `<span>${esc(item)}</span>`; }).join('')}</div></div></section>`;
  }


  // R10.60Z7: builder-only easy media placement + exact gallery card picker + clear quote close. No AI image generation, no image analysis, no credits.
  function simoR1060Z5IsImageUrl(url) {
    return /^(data:image\/|blob:|https?:\/\/[^\s]+\.(png|jpe?g|webp|gif|avif)(\?[^\s]*)?$)/i.test(String(url || '').trim());
  }

  function simoR1060Z5VideoEmbed(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    let id = '';
    let vimeo = '';
    try {
      const u = new URL(raw);
      if (/youtube\.com$/i.test(u.hostname.replace(/^www\./,'')) || /youtube\.com/i.test(u.hostname)) id = u.searchParams.get('v') || '';
      if (/youtu\.be$/i.test(u.hostname.replace(/^www\./,''))) id = u.pathname.replace(/^\//,'').split('/')[0] || '';
      if (/vimeo\.com/i.test(u.hostname)) vimeo = u.pathname.replace(/^\//,'').split('/')[0] || '';
    } catch {}
    if (id) return 'https://www.youtube.com/embed/' + encodeURIComponent(id);
    if (vimeo) return 'https://player.vimeo.com/video/' + encodeURIComponent(vimeo);
    return '';
  }

  function simoR1060Z5SocialLabel(url) {
    const t = clean(url);
    if (/instagram/.test(t)) return 'Instagram';
    if (/facebook|fb\.com/.test(t)) return 'Facebook';
    if (/tiktok/.test(t)) return 'TikTok';
    if (/youtube|youtu\.be/.test(t)) return 'YouTube';
    if (/x\.com|twitter/.test(t)) return 'X / Twitter';
    if (/linkedin/.test(t)) return 'LinkedIn';
    if (/pinterest/.test(t)) return 'Pinterest';
    return 'Social link';
  }

  function simoR1060Z5SocialAnchors(value) {
    return String(value || '')
      .split(/[\n,]+/)
      .map(function(x){ return x.trim(); })
      .filter(function(x){ return /^https?:\/\//i.test(x); })
      .slice(0, 8)
      .map(function(url){ return '<a class="btn secondary" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(simoR1060Z5SocialLabel(url)) + '</a>'; })
      .join('');
  }

  function simoR1060Z5FileToDataUrl(file) {
    return new Promise(function(resolve){
      if (!file) return resolve('');
      if (!/^image\//i.test(file.type || '')) return resolve('');
      const reader = new FileReader();
      reader.onload = function(){ resolve(String(reader.result || '')); };
      reader.onerror = function(){ resolve(''); };
      try { reader.readAsDataURL(file); } catch { resolve(''); }
    });
  }


  function simoR1060Z6PlacementLabel(value) {
    const key = clean(value || 'gallery');
    const map = { hero: 'Hero / Top of Page', gallery: 'Gallery / Results', services: 'Services / Products', beforeafter: 'Before & After', testimonials: 'Reviews / Testimonials', about: 'About / Story', contact: 'Contact / Quote Area' };
    return map[key] || map.gallery;
  }

  function simoR1060Z6MediaEditKey(value) {
    return 'media-' + clean(value || 'gallery').replace(/[^a-z0-9]+/g, '-');
  }

  function simoR1060Z6InjectMediaBlock(html, placement, block) {
    const key = clean(placement || 'gallery');
    if (key === 'hero') return html.replace(/<\/section>\s*<section id="features"/i, '</section>' + block + '<section id="features"');
    const patterns = { services: /<section id="features"/i, gallery: /<section id="gallery"/i, beforeafter: /<section id="gallery"/i, testimonials: /<section id="reviews"/i, contact: /<section id="quote"/i, about: /<section id="trust"/i };
    const pattern = patterns[key] || patterns.gallery;
    if (pattern.test(html)) return html.replace(pattern, block + html.match(pattern)[0]);
    return html.replace(/<section id="quote"/i, block + '<section id="quote"');
  }


  function simoR1060Z7CardChoiceLabel(value) {
    const key = clean(value || 'new');
    const map = {
      new: 'Add as new media section',
      'gallery-card-1': 'Replace gallery card 1',
      'gallery-card-2': 'Replace gallery card 2',
      'gallery-card-3': 'Replace gallery card 3'
    };
    return map[key] || map.new;
  }

  function simoR1060Z7MediaCardHtml(url, caption, cardIndex) {
    const safeCaption = esc(caption || 'Customer photo');
    const safeUrl = esc(url || '');
    const n = Math.max(1, Math.min(3, Number(cardIndex || 1)));
    return '<div class="photo-card photo-' + n + '" style="background-image:linear-gradient(180deg,rgba(0,0,0,.10),rgba(0,0,0,.64)),url(&quot;' + safeUrl + '&quot;);background-size:cover;background-position:center;"><div><strong>' + safeCaption + '</strong><span>Uploaded by the business owner</span></div></div>';
  }

  function simoR1060Z7ReplaceGalleryCard(html, cardChoice, url, caption) {
    const match = String(cardChoice || '').match(/gallery-card-(\d+)/i);
    const n = match ? Math.max(1, Math.min(3, Number(match[1] || 1))) : 0;
    if (!n || !url) return html;
    const cardRe = new RegExp('<div class="photo-card photo-' + n + '"[\s\S]*?<\/div>\s*<\/div>', 'i');
    if (!cardRe.test(html)) return html;
    return html.replace(cardRe, simoR1060Z7MediaCardHtml(url, caption, n));
  }

  function builderHtml(prompt) {
    const kind = builderKind(prompt);
    const subject = builderSubject(prompt);
    const title = builderTitleFromPrompt(prompt);
    const isDashboard = kind === 'dashboard';
    const isApp = kind === 'app';
    const isStore = kind === 'store';
    const primary = isDashboard ? 'View Dashboard' : isApp ? 'Launch App' : isStore ? 'Shop Now' : 'Request a Quote';
    const secondary = isStore ? 'View Deals' : 'See Services';
    const profile = builderProfile(prompt);
    const cards = isDashboard
      ? ['Revenue snapshot', 'Customer activity', 'Open tasks']
      : isApp
        ? ['Fast onboarding', 'Clean account flow', 'Smart notifications']
        : isStore
          ? ['Featured products', 'Bundle offers', 'Local pickup']
          : (profile.services || ['Clear offer', 'Trust section', 'Strong call-to-action']);
    const safeTitle = esc(title);
    const safeSubject = esc(subject);
    const proSections = builderProfessionalSections(profile);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <base target="_self" />
  <title>${safeTitle}</title>
  <style>
    :root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#101827;background:#f7f9fc;scroll-behavior:smooth;}
    *{box-sizing:border-box} body{margin:0;background:linear-gradient(180deg,#f8fbff,#eef3f9);color:#101827;}
    .nav{display:flex;justify-content:space-between;align-items:center;padding:22px 6vw;background:rgba(255,255,255,.82);backdrop-filter:blur(12px);border-bottom:1px solid #e6edf5;position:sticky;top:0;z-index:5;}
    .brand{font-weight:900;font-size:20px;letter-spacing:-.02em}.links{display:flex;gap:22px;color:#536170;font-size:14px}.links a{color:inherit;text-decoration:none}.btn{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:999px;padding:13px 20px;background:#111827;color:#fff;font-weight:800;text-decoration:none;cursor:pointer}.btn.secondary{background:#e9eef6;color:#111827}
    .hero{display:grid;grid-template-columns:1.05fr .95fr;gap:42px;align-items:center;padding:74px 6vw 56px}.eyebrow{color:#2563eb;font-weight:900;letter-spacing:.16em;text-transform:uppercase;font-size:12px}.hero h1{font-size:clamp(42px,6vw,78px);line-height:.95;margin:16px 0 18px;letter-spacing:-.06em}.hero p{font-size:19px;line-height:1.7;color:#536170;max-width:650px}.actions{display:flex;gap:14px;flex-wrap:wrap;margin-top:28px}
    .visual{border-radius:32px;background:linear-gradient(135deg,#111827,#1e3a8a);min-height:420px;padding:24px;box-shadow:0 30px 80px rgba(15,23,42,.22);color:#fff;position:relative;overflow:hidden}.visual:before{content:"";position:absolute;inset:-20%;background:radial-gradient(circle at 70% 20%,rgba(255,255,255,.28),transparent 34%),radial-gradient(circle at 20% 80%,rgba(96,165,250,.35),transparent 30%)}.panel{position:relative;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.10);border-radius:24px;padding:20px;margin-top:40px}.metric{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:18px}.metric div{background:rgba(255,255,255,.12);border-radius:18px;padding:16px}.mock{position:relative;height:210px;border-radius:22px;background:#fff;color:#111827;padding:20px;margin-top:18px}.mock .bar{height:12px;background:#dbeafe;border-radius:999px;margin:12px 0}.mock .wide{width:78%}.mock .mid{width:58%}.mock .short{width:38%}
    .section{padding:36px 6vw 72px;scroll-margin-top:96px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.card{background:#fff;border:1px solid #e6edf5;border-radius:24px;padding:26px;box-shadow:0 18px 50px rgba(15,23,42,.07)}.card h3{margin:0 0 10px;font-size:20px}.card p{margin:0;color:#64748b;line-height:1.6}.section-head{display:flex;align-items:end;justify-content:space-between;gap:18px;margin-bottom:18px}.section-head h2{font-size:clamp(28px,4vw,46px);line-height:1;margin:8px 0 8px;letter-spacing:-.04em}.section-head p{color:#64748b;line-height:1.65;max-width:760px}.image-grid{display:grid;grid-template-columns:1.2fr .9fr .9fr;gap:18px}.photo-card{min-height:280px;border-radius:28px;overflow:hidden;position:relative;display:flex;align-items:flex-end;padding:22px;color:#fff;box-shadow:0 22px 60px rgba(15,23,42,.16);background:linear-gradient(135deg,#0f172a,#2563eb)}.photo-card:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 70% 20%,rgba(255,255,255,.35),transparent 28%),linear-gradient(180deg,transparent,rgba(0,0,0,.60));}.photo-card div{position:relative}.photo-card strong{display:block;font-size:24px;margin-bottom:8px}.photo-card span{display:block;color:#eaf2ff;line-height:1.45}.photo-2{background:linear-gradient(135deg,#134e4a,#22c55e)}.photo-3{background:linear-gradient(135deg,#581c87,#f97316)}.testimonials .card{background:linear-gradient(180deg,#ffffff,#f8fbff)}.trust-card{display:grid;grid-template-columns:1fr auto;gap:22px;align-items:center}.trust-list{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}.trust-list span{border:1px solid #dbeafe;background:#eff6ff;color:#1e3a8a;border-radius:999px;padding:10px 13px;font-size:13px;font-weight:900}.footer{padding:30px 6vw;color:#64748b;border-top:1px solid #e6edf5;background:#fff}
    .quote-form{display:grid;gap:10px;margin-top:16px;max-width:620px}.quote-form input,.quote-form textarea{width:100%;padding:13px;border:1px solid #dbe3ef;border-radius:12px;font:inherit}.quote-form textarea{min-height:96px;resize:vertical}.simo-target-flash{outline:3px solid rgba(37,99,235,.25);outline-offset:6px;transition:outline .25s ease}.simo-quote-test-backdrop{display:none;position:fixed;inset:0;z-index:9999;align-items:center;justify-content:center;background:rgba(15,23,42,.62);padding:22px}.simo-quote-test-card{width:min(620px,96vw);max-height:92vh;overflow:auto;background:#fff;color:#101827;border-radius:26px;padding:24px;box-shadow:0 30px 90px rgba(15,23,42,.32);position:relative}.simo-quote-close-main{position:sticky;top:0;float:right;border:0;background:#111827;color:#fff;border-radius:999px;padding:10px 14px;cursor:pointer;font-weight:900;z-index:2}.simo-test-pill{display:inline-flex;border-radius:999px;background:#dbeafe;color:#1d4ed8;padding:8px 11px;font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.simo-preview-note{margin-top:12px;border-radius:14px;background:#ecfdf5;color:#065f46;padding:12px;font-weight:850;line-height:1.45}
    @media(max-width:850px){.hero{grid-template-columns:1fr;padding-top:42px}.grid,.image-grid,.trust-card{grid-template-columns:1fr}.links{display:none}.hero h1{font-size:44px}.photo-card{min-height:220px}.trust-list{justify-content:flex-start}}
  </style>
</head>
<body>
  <nav class="nav"><div class="brand">${safeSubject}</div><div class="links"><a href="#features" data-simo-page-cta data-simo-target="features">Services</a><a href="#gallery" data-simo-page-cta data-simo-target="gallery">Gallery</a><a href="#reviews" data-simo-page-cta data-simo-target="reviews">Reviews</a><a href="#quote" data-simo-page-cta data-simo-target="quote">Contact</a></div><a class="btn" href="#quote" data-simo-page-cta data-simo-target="quote">${esc(primary)}</a></nav>
  <main>
    <section class="hero">
      <div><div class="eyebrow">Simo Builder Preview</div><h1>${safeTitle}</h1><p>${esc(profile.heroBody)}</p><div class="actions"><a class="btn" href="#quote" data-simo-page-cta data-simo-target="quote">${esc(primary)}</a><a class="btn secondary" href="#features" data-simo-page-cta data-simo-target="features">${esc(secondary)}</a></div></div>
      <div class="visual"><div class="panel"><div class="eyebrow" style="color:#bfdbfe">Live page mockup</div><h2 style="font-size:32px;margin:10px 0 4px">${safeSubject}</h2><p style="color:#dbeafe">${esc(profile.visualLabel)} with clear offer, trust proof, image sections, and conversion-focused buttons.</p><div class="mock"><strong>${safeTitle}</strong><div class="bar wide"></div><div class="bar mid"></div><div class="bar short"></div><div class="metric">${(profile.stats || ['Offer','Trust','CTA']).slice(0,3).map(function(x){ return `<div>${esc(x)}</div>`; }).join('')}</div></div></div></div>
    </section>
    <section id="features" class="section"><div class="grid">${cards.map(function(c){ return `<div class="card"><h3>${esc(c)}</h3><p>Professional section content that Simo can keep editing based on the user’s next instruction.</p></div>`; }).join('')}</div></section>
    <section id="deals" class="section"><div class="card"><div class="eyebrow">Offers</div><h2>${esc(profile.offerTitle)}</h2><p>${esc(profile.offerBody)}</p></div></section>
    ${proSections}
    <section id="quote" class="section"><div class="card"><div class="eyebrow">Request a Quote</div><h2>Quote form test mode is ready</h2><p>This preview uses a safe test form. Nothing is sent from the builder preview. When published, connect this form to email, CRM, or Simo’s form handler.</p><div class="actions"><button class="btn" type="button" data-simo-page-cta data-simo-target="quote">Open Quote Form Test</button><a class="btn secondary" href="#deals" data-simo-page-cta data-simo-target="deals">See Packages</a></div></div></section>
  </main>
  <footer id="contact" class="footer">Built by Simo Builder • Buttons stay on this page. Ready for refinement, preview, and library save.</footer>
  <div id="simo-quote-modal" class="simo-quote-test-backdrop" aria-hidden="true">
    <div class="simo-quote-test-card">
      <button type="button" data-simo-close-quote class="simo-quote-close-main">Close Test ×</button>
      <div class="simo-test-pill">Quote Form Test Mode</div>
      <h2 style="margin:12px 0 8px;font-size:30px;letter-spacing:-.03em;">This is a preview. Nothing will be sent.</h2>
      <p style="margin:0 0 14px;color:#536170;line-height:1.55;">Fill this out to test the button behavior. When published, connect it to email, CRM, or Simo’s form handler.</p>
      <form class="quote-form" data-simo-preview-form>
        <input name="name" placeholder="Name" />
        <input name="phone" placeholder="Phone" />
        <input name="email" placeholder="Email" />
        <input name="service" placeholder="Service needed" />
        <textarea name="message" placeholder="Message"></textarea>
        <button class="btn" type="submit">Send Quote Request</button>
      </form>
      <div id="simo-form-preview-note" class="simo-preview-note" role="status" aria-live="polite" style="display:none;"></div>
      <button type="button" data-simo-close-quote class="btn secondary" style="margin-top:14px;width:100%;">Back to website preview</button>
    </div>
  </div>
  <script>
    (function(){
      function clean(v){return String(v||'').toLowerCase().replace(/\s+/g,' ').trim();}
      function targetFromLabel(label){var t=clean(label); if(/deal|offer|special|discount|coupon|promo|package|pricing|price/.test(t)) return 'deals'; if(/service|learn|more|feature|product/.test(t)) return 'features'; if(/quote|estimate|book|schedule|contact|get started|call|message|request/.test(t)) return 'quote'; return null;}
      function openQuote(){var m=document.getElementById('simo-quote-modal'); if(m){m.style.display='flex';m.setAttribute('aria-hidden','false');var first=m.querySelector('input,textarea,button');try{first&&first.focus();}catch(e){} return;} var el=document.getElementById('quote')||document.getElementById('contact'); if(el){el.scrollIntoView({behavior:'smooth',block:'start'});}}
      function closeQuote(){var m=document.getElementById('simo-quote-modal'); if(m){m.style.display='none';m.setAttribute('aria-hidden','true');}}
      document.addEventListener('keydown',function(e){if(e.key==='Escape')closeQuote();},true);
      function go(target){if(target==='quote'){openQuote();return;} var el=document.getElementById(target)||document.getElementById('features')||document.getElementById('quote'); if(!el) return; el.scrollIntoView({behavior:'smooth',block:'start'}); el.classList.add('simo-target-flash'); setTimeout(function(){el.classList.remove('simo-target-flash');},900);}
      document.addEventListener('click',function(e){var modal=document.getElementById('simo-quote-modal'); if(modal&&e.target===modal){e.preventDefault();e.stopPropagation();closeQuote();return;} var hit=e.target&&e.target.closest?e.target.closest('a,button'):null; if(!hit) return; if(hit.hasAttribute('data-simo-close-quote')){e.preventDefault();e.stopPropagation();closeQuote();return;} var target=hit.getAttribute('data-simo-target')||targetFromLabel(hit.textContent||hit.value||hit.getAttribute('aria-label')||''); if(!target) return; e.preventDefault(); e.stopPropagation(); go(target);},true);
      document.addEventListener('submit',function(e){var form=e.target&&e.target.closest?e.target.closest('[data-simo-preview-form]'):null; if(!form) return; e.preventDefault(); var note=document.getElementById('simo-form-preview-note'); var message='Test received — nothing was actually sent. When published, connect this form to email, CRM, or Simo’s form handler.'; if(note){note.textContent=message;note.style.display='block';}else{alert(message);}},true);
    })();
  <\/script>
</body>
</html>`;
  }

  function ensureBuilderStore() {
    window.__SIMO_R1060L_BUILDER_STORE__ = window.__SIMO_R1060L_BUILDER_STORE__ || {};
    return window.__SIMO_R1060L_BUILDER_STORE__;
  }


  function builderWorkspaceSuggestions(project) {
    const kind = builderKind(project && project.prompt || 'landing page');
    const common = [
      ['Hero Section', 'hero'],
      ['CTA Buttons', 'buttons'],
      ['Products / Services', 'products'],
      ['Pricing / Offer', 'pricing'],
      ['Contact Form', 'contact'],
      ['Testimonials', 'testimonials'],
      ['Add Media', 'media'],
      ['Social Links', 'social'],
      ['Colors / Theme', 'colors'],
      ['Mobile Layout', 'mobile'],
      ['SEO Basics', 'seo'],
      ['Domain Help', 'domain']
    ];
    if (kind === 'app' || kind === 'dashboard') {
      return [
        ['Hero / App Intro', 'hero'],
        ['Navigation', 'navigation'],
        ['Dashboard Widgets', 'widgets'],
        ['CTA Buttons', 'buttons'],
        ['Pricing / Plans', 'pricing'],
        ['Contact / Signup', 'contact'],
        ['Add Media', 'media'],
        ['Social Links', 'social'],
        ['Colors / Theme', 'colors'],
        ['Mobile Layout', 'mobile'],
        ['SEO Basics', 'seo'],
        ['Domain Help', 'domain']
      ];
    }
    if (kind === 'store') {
      return [
        ['Hero / Offer', 'hero'],
        ['Shop Buttons', 'buttons'],
        ['Featured Products', 'products'],
        ['Pricing / Deals', 'pricing'],
        ['Checkout Trust', 'trust'],
        ['Contact / Pickup', 'contact'],
        ['Testimonials', 'testimonials'],
        ['Add Media', 'media'],
        ['Social Links', 'social'],
        ['Colors / Theme', 'colors'],
        ['Mobile Layout', 'mobile'],
        ['Domain Help', 'domain']
      ];
    }
    return common;
  }

  function builderEditCopy(project, action) {
    const subject = builderSubject(project && project.prompt || 'your business');
    const title = builderTitleFromPrompt(project && project.prompt || 'website');
    const a = clean(action);
    const map = {
      hero: ['Hero section upgraded', `A stronger opening section for ${subject}: clearer headline, sharper promise, trust message, and one primary action.`],
      buttons: ['CTA buttons upgraded', 'Primary and secondary buttons were clarified so the visitor knows exactly what to click next.'],
      products: ['Products / services section added', `A focused products/services area for ${subject}, with simple cards the user can keep editing.`],
      pricing: ['Pricing / offer section added', 'A clean offer block with starter pricing, value points, and a low-friction call-to-action.'],
      contact: ['Contact form section added', 'A simple contact/request section with name, email, message, and a clear submit action.'],
      testimonials: ['Testimonials section added', 'Trust-building customer quote cards and social proof were added to support conversion.'],
      media: ['Media section added', 'A photo/video area was added so customers can visually see results, examples, before/after work, or a walkthrough.'],
      social: ['Social links section added', 'Social media links were added so visitors can follow the business and verify the brand on other platforms.'],
      colors: ['Theme polish applied', 'A more premium visual theme was applied with stronger contrast, deeper accent color, and cleaner section rhythm.'],
      mobile: ['Mobile layout guidance added', 'Mobile-first notes and responsive section behavior were added so the page is easier to use on phones.'],
      seo: ['SEO basics added', `Title, description, and launch copy guidance were added for ${title}.`],
      domain: ['Domain / launch guidance added', 'Domain name ideas, where to buy a URL, and simple publishing next steps were added.'],
      publish: ['Publish guidance prepared', 'Simo prepared the page for publishing and will try the app publish endpoint if available.'],
      navigation: ['Navigation improved', 'Navigation labels and page flow were clarified for a cleaner app/website experience.'],
      widgets: ['Dashboard widgets improved', 'Useful dashboard cards and app-style components were added for the user to refine.'],
      trust: ['Trust section added', 'Shipping, pickup, warranty, payment, and safety trust points were added to support online purchases.']
    };
    return map[a] || [titleCase(action || 'Website edit'), 'Simo applied a focused website/app builder edit while keeping this in the builder lane.'];
  }

  function injectBeforeClosing(html, marker, insert) {
    const raw = String(html || '');
    const idx = raw.lastIndexOf(marker);
    if (idx < 0) return raw + insert;
    return raw.slice(0, idx) + insert + raw.slice(idx);
  }

  function updateBuilderLiveNote(html, title, body) {
    let raw = String(html || '');
    const note = `
<section class="simo-builder-live-note" style="padding:18px 6vw 0">
  <div style="border:1px solid #bfdbfe;background:#eff6ff;border-radius:18px;padding:16px 18px;color:#1e293b;box-shadow:0 12px 32px rgba(15,23,42,.08)">
    <div style="font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#2563eb;font-weight:900">Latest Simo edit</div>
    <h2 style="margin:8px 0 6px;font-size:24px;letter-spacing:-.03em;">${esc(title || 'Website edit applied')}</h2>
    <p style="margin:0;color:#475569;line-height:1.55">${esc(body || 'The preview was updated. Keep refining sections, buttons, layout, copy, and launch details.')}</p>
  </div>
</section>
`;
    raw = raw.replace(/<section class="simo-builder-live-note"[\s\S]*?<\/section>\s*/i, '');
    if (/<main[^>]*>/i.test(raw)) return raw.replace(/<main[^>]*>/i, function(m){ return m + note; });
    return note + raw;
  }

  function injectAfterFirstSection(html, insert) {
    const raw = String(html || '');
    const match = /<\/section>/i.exec(raw);
    if (!match) return injectBeforeClosing(raw, '</main>', insert);
    const pos = match.index + match[0].length;
    return raw.slice(0, pos) + insert + raw.slice(pos);
  }

  function applyBuilderEdit(project, action) {
    if (!project) return null;
    project.edits = Array.isArray(project.edits) ? project.edits : [];
    const cleanAction = clean(action || 'edit');
    const subject = builderSubject(project.prompt || 'your business');
    const pair = builderEditCopy(project, cleanAction);
    const sectionTitle = pair[0];
    const sectionBody = pair[1];
    let html = String(project.html || builderHtml(project.prompt || 'website'));

    if (cleanAction === 'hero') {
      html = html.replace(/<div class="eyebrow">Simo Builder Preview<\/div><h1>[\s\S]*?<\/h1><p>[\s\S]*?<\/p>/i, `<div class="eyebrow">Simo Builder Preview</div><h1>${esc(project.title || builderTitleFromPrompt(project.prompt))}</h1><p>${esc(sectionBody)}</p>`);
    }
    if (cleanAction === 'buttons') {
      html = html.replace(/>Get Started<\/a>/g, '>Request a Quote</a>').replace(/>See Services<\/a>/g, '>See Packages</a>').replace(/>Shop Now<\/a>/g, '>Shop Deals</a>').replace(/>Launch App<\/a>/g, '>Start Free</a>');
    }
    if (cleanAction === 'mobile') {
      html = injectBeforeClosing(html, '</head>', `<style id="simo-mobile-polish">\n@media(max-width:650px){.hero{padding:34px 5vw}.hero h1{font-size:38px}.actions .btn{width:100%}.visual{min-height:320px}.mock{height:auto}.metric{grid-template-columns:1fr}}\n</style>\n`);
    }

    if (cleanAction === 'colors') {
      html = injectBeforeClosing(html, '</head>', `<style id="simo-theme-polish">\n.hero{background:linear-gradient(135deg,rgba(37,99,235,.08),rgba(14,165,233,.06));}.btn{box-shadow:0 12px 26px rgba(17,24,39,.18)}.card{border-color:#d9e6f5}.eyebrow{color:#1d4ed8}\n</style>\n`);
    }
    if (cleanAction === 'seo') {
      html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(project.title || builderTitleFromPrompt(project.prompt))}</title>\n  <meta name="description" content="${esc(sectionBody).slice(0, 155)}" />`);
    }

    html = updateBuilderLiveNote(html, sectionTitle, sectionBody);

    const block = `\n<section class="section simo-builder-edit-section" data-simo-builder-edit="${esc(cleanAction)}">\n  <div class="card" style="border:2px solid #dbeafe;background:#ffffff;">\n    <div class="eyebrow">Simo Builder Edit</div>\n    <h2 style="margin:10px 0 8px;font-size:30px;letter-spacing:-.03em;">${esc(sectionTitle)}</h2>\n    <p>${esc(sectionBody)}</p>\n    ${cleanAction === 'contact' ? '<div style="display:grid;gap:10px;margin-top:16px;max-width:520px"><input placeholder="Name" style="padding:13px;border:1px solid #dbe3ef;border-radius:12px"><input placeholder="Email" style="padding:13px;border:1px solid #dbe3ef;border-radius:12px"><textarea placeholder="Message" style="padding:13px;border:1px solid #dbe3ef;border-radius:12px;min-height:90px"></textarea><button class="btn" type="button">Send Request</button></div>' : ''}\n    ${cleanAction === 'pricing' ? '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:16px"><div class="card" style="box-shadow:none"><strong>Starter Offer</strong><p>Simple entry offer the user can edit.</p></div><div class="card" style="box-shadow:none"><strong>Premium Offer</strong><p>Higher-value option with support or extras.</p></div></div>' : ''}\n    ${cleanAction === 'domain' ? `<ul style="line-height:1.8;color:#475569"><li>Possible names: ${esc(subject).replace(/\s+/g,'')}.com, Go${esc(subject).replace(/\s+/g,'')}.com, ${esc(subject).replace(/\s+/g,'')}HQ.com</li><li>Buy domains from GoDaddy, Namecheap, Squarespace Domains, Cloudflare Registrar, or similar registrars.</li><li>After publishing, connect the domain to the hosting URL from Simo or your hosting provider.</li></ul>` : ''}\n  </div>\n</section>\n`;

    html = injectAfterFirstSection(html, block);
    project.html = html;
    project.edits.unshift({ action: cleanAction, label: sectionTitle, at: new Date().toISOString() });
    project.edits = project.edits.slice(0, 12);
    return project;
  }

  function downloadBuilderHtml(project) {
    const html = String(project && project.html || '');
    const name = slugify(project && project.title || 'simo-builder-page') || 'simo-builder-page';
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.html`;
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ try { URL.revokeObjectURL(url); a.remove(); } catch {} }, 400);
  }

  function domainIdeasFor(project) {
    const subject = builderSubject(project && project.prompt || 'your business').replace(/[^a-z0-9 ]/ig,'').trim();
    const compact = subject.replace(/\s+/g, '');
    const base = compact || 'YourSite';
    return [`${base}.com`, `Go${base}.com`, `${base}HQ.com`, `${base}Online.com`, `My${base}.com`].slice(0, 5);
  }

  function showBuilderGuidance(project, publishedUrl) {
    const ideas = domainIdeasFor(project);
    const urlLine = publishedUrl ? `<div style="margin-top:8px;color:#d7ffec;font-weight:900;">Published URL: ${esc(publishedUrl)}</div>` : `<div style="margin-top:8px;color:#ffeeb0;">Publish endpoint was not available yet, but Copy HTML and Download HTML are ready.</div>`;
    addAssistant(`
      <div style="border:1px solid rgba(110,168,255,.22);border-radius:18px;padding:14px;background:rgba(110,168,255,.09);display:grid;gap:8px;color:#eef4ff;">
        <div style="font-weight:950;font-size:16px;">Website/App launch guidance</div>
        ${urlLine}
        <div style="font-size:13px;color:#c7d3ea;line-height:1.55;">Next steps: review the page, test buttons/contact form, download a backup, then connect a domain when you are ready.</div>
        <div style="font-size:13px;color:#dce8ff;"><b>Domain ideas:</b> ${ideas.map(esc).join(' • ')}</div>
        <div style="font-size:13px;color:#c7d3ea;">Domain registrars to compare: GoDaddy, Namecheap, Squarespace Domains, Cloudflare Registrar. Choose a short name that is easy to spell and close to the business.</div>
      </div>
    `);
  }

  async function publishBuilderProject(project) {
    let publishedUrl = '';
    try {
      const data = await api('/api/publish', { title: project.title, html: project.html, source: 'simo_builder', prompt: project.prompt });
      publishedUrl = data && (data.url || data.public_url || data.published_url || data.display_url || (data.slug ? `/p/${data.slug}` : '')) || '';
    } catch (err) {
      console.warn('Simo Builder publish endpoint unavailable:', err);
    }
    showBuilderGuidance(project, publishedUrl);
    return publishedUrl;
  }

  // R10.60V: true inline website/app editor — section button -> editable fields -> apply -> visible preview update.
  function simoR1060VEditorStyle(active) {
    return active
      ? 'border:1px solid rgba(110,168,255,.78);background:rgba(110,168,255,.24);color:#ffffff;box-shadow:0 0 0 3px rgba(110,168,255,.14);border-radius:999px;padding:9px 12px;font-size:12px;font-weight:950;cursor:pointer;'
      : 'border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.07);color:#eef4ff;border-radius:999px;padding:9px 12px;font-size:12px;font-weight:850;cursor:pointer;';
  }

  function simoR1060VEditorDefaults(project, action) {
    const a = clean(action || 'hero');
    const subject = builderSubject(project && project.prompt || 'your business');
    const title = builderTitleFromPrompt(project && project.prompt || 'website');
    const map = {
      hero: { headline: title, body: `A clear, trustworthy landing page for ${subject}. Show the offer fast, explain the value, and make it easy for customers to contact you.`, primary: 'Request a Quote', secondary: 'See Packages' },
      buttons: { headline: 'Call-To-Action Buttons', body: 'Make the main buttons direct and useful so visitors know whether to request a quote, see products, call, or contact the business.', primary: 'Request a Quote', secondary: 'See Deals' },
      products: { headline: 'Products / Services', body: `Show the main products or services for ${subject}. Keep it simple, local, and easy to understand.`, primary: 'View Products', secondary: 'Ask Availability' },
      pricing: { headline: 'Pricing / Offer', body: 'Add a starter offer, premium option, financing or bundle details, and a clear reason to contact you.', primary: 'Get Pricing', secondary: 'Compare Options' },
      contact: { headline: 'Contact Form', body: 'Let visitors send their name, email, phone number, and message so the business can reply quickly.', primary: 'Send Request', secondary: 'Call Today' },
      testimonials: { headline: 'Testimonials', body: 'Add short reviews, trust proof, guarantees, delivery/pickup notes, and local credibility.', primary: 'Read Reviews', secondary: 'Become a Customer' },
      media: { headline: 'Results Gallery', body: 'Add a photo, image link, or video link so customers can visually see real results, examples, or proof of work.', primary: 'View Results', secondary: 'Request a Quote' },
      social: { headline: 'Follow Us Online', body: 'Add Instagram, Facebook, TikTok, YouTube, X, LinkedIn, or other social links so visitors can verify and follow the business.', primary: 'Follow Us', secondary: 'Contact Us' },
      colors: { headline: 'Colors / Theme', body: 'Make the page feel more premium with stronger contrast, cleaner spacing, and a professional color direction.', primary: 'Keep This Style', secondary: 'Try Another Theme' },
      mobile: { headline: 'Mobile Layout', body: 'Make the mobile version easier to read with shorter sections, stacked buttons, and a clear contact action.', primary: 'Preview Mobile', secondary: 'Keep Editing' },
      seo: { headline: 'SEO Basics', body: `Improve the title, description, and search-friendly page copy for ${subject}.`, primary: 'Improve SEO', secondary: 'Review Copy' },
      domain: { headline: 'Domain Help', body: 'Suggest simple domain names, explain where to buy one, and guide the user toward publishing the page.', primary: 'Show Domain Ideas', secondary: 'Publish Next' },
      navigation: { headline: 'Navigation', body: 'Make the menu clearer and easier to use for visitors.', primary: 'Start Now', secondary: 'View Features' },
      widgets: { headline: 'Dashboard Widgets', body: 'Add dashboard cards, key metrics, action buttons, and status summaries.', primary: 'Open Dashboard', secondary: 'View Reports' },
      trust: { headline: 'Trust Section', body: 'Add reassurance, safe-buying details, warranty, pickup/delivery notes, and credibility.', primary: 'Build Trust', secondary: 'Learn More' }
    };
    return map[a] || { headline: titleCase(a || 'Website Section'), body: 'Edit this section and apply it to the live preview.', primary: 'Get Started', secondary: 'Learn More' };
  }

  function simoR1060VEditorPanel() {
    return `
      <div data-simo-builder-editor-panel data-simo-builder-active-edit="hero" style="margin:0 16px 16px;border:1px solid rgba(110,168,255,.26);background:rgba(8,15,29,.78);border-radius:18px;padding:14px;display:grid;gap:10px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#9fb4dd;font-weight:950;">Active website/app editor</div>
            <div data-simo-builder-editor-title style="font-size:16px;font-weight:950;color:#f6f8ff;margin-top:5px;">Editing: Hero</div>
            <div data-simo-builder-editor-help style="font-size:12px;color:#c7d3ea;line-height:1.45;margin-top:4px;">Edit here in Simo. Then click Apply to Preview. The mini preview updates below; click Open Latest Preview to test the page like a visitor.</div>
          </div>
          <button type="button" data-simo-builder-action="apply-editor" style="border:1px solid rgba(86,240,169,.32);background:rgba(86,240,169,.13);color:#eafff4;border-radius:999px;padding:10px 14px;font-size:12px;font-weight:950;cursor:pointer;">Apply to Preview</button>
        </div>
        <input data-simo-builder-editor-headline placeholder="Headline / section title" style="width:100%;border:1px solid rgba(255,255,255,.16);background:#08111f;color:#f8fbff;border-radius:12px;padding:12px 13px;font-weight:800;outline:none;" />
        <textarea data-simo-builder-editor-body placeholder="What should this section say?" style="width:100%;min-height:88px;border:1px solid rgba(255,255,255,.16);background:#08111f;color:#f8fbff;border-radius:12px;padding:12px 13px;line-height:1.45;outline:none;resize:vertical;"></textarea>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <input data-simo-builder-editor-primary placeholder="Primary button text" style="min-width:0;border:1px solid rgba(255,255,255,.16);background:#08111f;color:#f8fbff;border-radius:12px;padding:12px 13px;font-weight:800;outline:none;" />
          <input data-simo-builder-editor-secondary placeholder="Secondary button text" style="min-width:0;border:1px solid rgba(255,255,255,.16);background:#08111f;color:#f8fbff;border-radius:12px;padding:12px 13px;font-weight:800;outline:none;" />
        </div>
        <div data-simo-builder-media-tools style="display:none;border:1px solid rgba(110,168,255,.28);background:rgba(110,168,255,.09);border-radius:16px;padding:13px;gap:10px;">
          <div style="font-size:13px;color:#f6f8ff;font-weight:950;line-height:1.45;">Add Photo or Video</div>
          <div style="font-size:12px;color:#dce8ff;font-weight:800;line-height:1.45;">Step 1: choose where customers should see it. Step 2: upload a photo or paste an image/video link. Step 3: click Apply to Preview. This does not use image credits.</div>
          <label style="display:grid;gap:6px;font-size:11px;letter-spacing:.10em;text-transform:uppercase;color:#9fb4dd;font-weight:950;">Where should this go?
            <select data-simo-builder-media-placement style="width:100%;border:1px solid rgba(255,255,255,.18);background:#08111f;color:#f8fbff;border-radius:12px;padding:12px 13px;font-weight:900;outline:none;">
              <option value="gallery">Gallery / Results</option>
              <option value="beforeafter">Before & After</option>
              <option value="hero">Hero / Top of Page</option>
              <option value="services">Services / Products</option>
              <option value="testimonials">Reviews / Testimonials</option>
              <option value="about">About / Story</option>
              <option value="contact">Contact / Quote Area</option>
            </select>
          </label>
          <label style="display:grid;gap:6px;font-size:11px;letter-spacing:.10em;text-transform:uppercase;color:#9fb4dd;font-weight:950;">Exact spot in Gallery / Results
            <select data-simo-builder-media-card style="width:100%;border:1px solid rgba(255,255,255,.18);background:#08111f;color:#f8fbff;border-radius:12px;padding:12px 13px;font-weight:900;outline:none;">
              <option value="new">Add as a new media section</option>
              <option value="gallery-card-1">Replace card 1 / left card</option>
              <option value="gallery-card-2">Replace card 2 / middle card</option>
              <option value="gallery-card-3">Replace card 3 / right card</option>
            </select>
          </label>
          <label style="display:grid;gap:6px;font-size:11px;letter-spacing:.10em;text-transform:uppercase;color:#9fb4dd;font-weight:950;">Upload picture from computer
            <input type="file" accept="image/*" data-simo-builder-media-file style="width:100%;color:#dce8ff;font-size:12px;" />
          </label>
          <input data-simo-builder-media-url placeholder="Or paste image link, YouTube link, Vimeo link, or video link" style="width:100%;border:1px solid rgba(255,255,255,.16);background:#08111f;color:#f8fbff;border-radius:12px;padding:12px 13px;outline:none;" />
          <input data-simo-builder-media-caption placeholder="Caption, example: Before and after ceramic coating" style="width:100%;border:1px solid rgba(255,255,255,.16);background:#08111f;color:#f8fbff;border-radius:12px;padding:12px 13px;outline:none;" />
          <div style="border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.05);border-radius:12px;padding:10px;color:#c7d3ea;font-size:12px;line-height:1.45;">Tip: to replace cards like Signature cakes / Fresh daily case / Custom events, choose <b>Gallery / Results</b>, then choose card 1, 2, or 3 above.</div>
        </div>
        <div data-simo-builder-social-tools style="display:none;border:1px solid rgba(255,215,106,.22);background:rgba(255,215,106,.08);border-radius:14px;padding:12px;gap:9px;">
          <div style="font-size:12px;color:#fff6d8;font-weight:900;line-height:1.45;">Add Social Links — paste one link per line. Example: Instagram, Facebook, TikTok, YouTube, X, LinkedIn.</div>
          <textarea data-simo-builder-social-links placeholder="https://instagram.com/yourbusiness
https://facebook.com/yourbusiness" style="width:100%;min-height:82px;border:1px solid rgba(255,255,255,.16);background:#08111f;color:#f8fbff;border-radius:12px;padding:12px 13px;line-height:1.45;outline:none;resize:vertical;"></textarea>
        </div>
        <div style="font-size:12px;color:#9fb4dd;line-height:1.45;">Simple rule: edit in this Simo panel. Test visitor buttons in Open Latest Preview. If a preview tab is already open, refresh it after applying edits.</div>
      </div>`;
  }

  function simoR1060VFillEditor(card, project, action, btn) {
    const a = clean(action || 'hero');
    const fields = simoR1060VEditorDefaults(project, a);
    const panel = card && card.querySelector('[data-simo-builder-editor-panel]');
    if (!panel) return;
    panel.setAttribute('data-simo-builder-active-edit', a);
    const titleEl = panel.querySelector('[data-simo-builder-editor-title]');
    const helpEl = panel.querySelector('[data-simo-builder-editor-help]');
    const h = panel.querySelector('[data-simo-builder-editor-headline]');
    const b = panel.querySelector('[data-simo-builder-editor-body]');
    const p = panel.querySelector('[data-simo-builder-editor-primary]');
    const s = panel.querySelector('[data-simo-builder-editor-secondary]');
    const mediaTools = panel.querySelector('[data-simo-builder-media-tools]');
    const socialTools = panel.querySelector('[data-simo-builder-social-tools]');
    if (mediaTools) mediaTools.style.display = a === 'media' ? 'grid' : 'none';
    if (socialTools) socialTools.style.display = a === 'social' ? 'grid' : 'none';
    if (titleEl) titleEl.textContent = `Editing: ${titleCase(a)}`;
    if (helpEl) helpEl.textContent = a === 'media'
      ? 'Choose where the photo/video goes, upload or paste a link, then click Apply to Preview. The media will appear in that part of the page.'
      : a === 'social'
        ? 'Paste social media links here in Simo, then click Apply to Preview so the full page can show them.'
        : `Editing ${titleCase(a)}. Change the fields here in Simo, then click Apply to Preview. Use Open Latest Preview to test visitor buttons.`;
    if (h) h.value = fields.headline || '';
    if (b) b.value = fields.body || '';
    if (p) p.value = fields.primary || '';
    if (s) s.value = fields.secondary || '';
    try {
      card.querySelectorAll('[data-simo-builder-action="select-edit"]').forEach(function(x){ x.setAttribute('style', simoR1060VEditorStyle(false)); x.removeAttribute('data-simo-builder-active'); });
      if (btn) { btn.setAttribute('style', simoR1060VEditorStyle(true)); btn.setAttribute('data-simo-builder-active', 'true'); }
    } catch {}
    const status = card.querySelector('[data-simo-builder-status]');
    if (status) status.textContent = `Selected ${titleCase(a)}. Edit here in Simo, apply it, then open or refresh the preview window to test it like a visitor.`;
    try { panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch {}
  }

  function simoR1060VReadFields(card, project, action) {
    const panel = card && card.querySelector('[data-simo-builder-editor-panel]');
    const defaults = simoR1060VEditorDefaults(project, action);
    const val = function(sel, fallback){ const el = panel && panel.querySelector(sel); return capitalizeFirstVisibleLetter(String((el && el.value) || fallback || '').trim()); };
    return {
      headline: val('[data-simo-builder-editor-headline]', defaults.headline),
      body: val('[data-simo-builder-editor-body]', defaults.body),
      primary: val('[data-simo-builder-editor-primary]', defaults.primary),
      secondary: val('[data-simo-builder-editor-secondary]', defaults.secondary)
    };
  }


  async function simoR1060Z5ReadFieldsAsync(card, project, action) {
    const fields = simoR1060VReadFields(card, project, action);
    const panel = card && card.querySelector('[data-simo-builder-editor-panel]');
    const fileInput = panel && panel.querySelector('[data-simo-builder-media-file]');
    const mediaUrlInput = panel && panel.querySelector('[data-simo-builder-media-url]');
    const placementInput = panel && panel.querySelector('[data-simo-builder-media-placement]');
    const mediaCardInput = panel && panel.querySelector('[data-simo-builder-media-card]');
    const captionInput = panel && panel.querySelector('[data-simo-builder-media-caption]');
    const socialInput = panel && panel.querySelector('[data-simo-builder-social-links]');
    const file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
    const fileUrl = await simoR1060Z5FileToDataUrl(file);
    fields.mediaUrl = fileUrl || String((mediaUrlInput && mediaUrlInput.value) || '').trim();
    fields.mediaPlacement = String((placementInput && placementInput.value) || 'gallery').trim();
    fields.mediaCard = String((mediaCardInput && mediaCardInput.value) || 'new').trim();
    fields.mediaCaption = capitalizeFirstVisibleLetter(String((captionInput && captionInput.value) || '').trim());
    fields.socialLinks = String((socialInput && socialInput.value) || '').trim();
    return fields;
  }

  function simoR1060VSectionHtml(project, action, fields) {
    const a = clean(action || 'hero');
    let extra = '';
    if (a === 'contact') extra = '<form class="quote-form" data-simo-preview-form style="display:grid;gap:10px;margin-top:16px;max-width:560px"><input name="name" placeholder="Name" style="padding:13px;border:1px solid #dbe3ef;border-radius:12px"><input name="email" placeholder="Email" style="padding:13px;border:1px solid #dbe3ef;border-radius:12px"><input name="phone" placeholder="Phone" style="padding:13px;border:1px solid #dbe3ef;border-radius:12px"><textarea name="message" placeholder="Message" style="padding:13px;border:1px solid #dbe3ef;border-radius:12px;min-height:90px"></textarea><button class="btn" type="submit">Send Request</button></form>';
    if (a === 'products') { const prof = builderProfile(project && project.prompt || ''); extra = '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:16px">' + (prof.services || []).slice(0,3).map(function(x){ return '<div class="card" style="box-shadow:none"><strong>' + esc(x) + '</strong><p>Professional service card the user can keep editing.</p></div>'; }).join('') + '</div>'; }
    if (a === 'testimonials') { const prof = builderProfile(project && project.prompt || ''); extra = '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:16px">' + (prof.testimonials || []).slice(0,3).map(function(x){ return '<div class="card" style="box-shadow:none"><strong>' + esc(x[0]) + '</strong><p>' + esc(x[1]) + '</p></div>'; }).join('') + '</div>'; }
    if (a === 'media') {
      const url = String(fields.mediaUrl || '').trim();
      const cap = fields.mediaCaption || fields.body || 'Customer results and visual proof';
      const embed = simoR1060Z5VideoEmbed(url);
      const placeLabel = simoR1060Z6PlacementLabel(fields.mediaPlacement || 'gallery');
      if (embed) {
        extra = '<div style="margin-top:16px;border-radius:20px;overflow:hidden;border:1px solid #dbeafe;background:#0f172a"><iframe title="Website video" src="' + esc(embed) + '" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="display:block;width:100%;aspect-ratio:16/9;border:0"></iframe></div><p style="margin-top:10px;color:#64748b;font-weight:800">' + esc(cap) + '</p><p style="margin-top:4px;color:#94a3b8;font-size:13px">Placed in: ' + esc(placeLabel) + '</p>';
      } else if (url) {
        extra = '<figure style="margin:16px 0 0;border-radius:20px;overflow:hidden;border:1px solid #dbeafe;background:#f8fbff"><img src="' + esc(url) + '" alt="' + esc(cap) + '" style="display:block;width:100%;max-height:560px;object-fit:cover"><figcaption style="padding:12px 14px;color:#475569;font-weight:800">' + esc(cap) + '<span style="display:block;color:#94a3b8;font-size:13px;margin-top:4px">Placed in: ' + esc(placeLabel) + '</span></figcaption></figure>';
      } else {
        extra = '<div style="margin-top:16px;border:1px dashed #93c5fd;border-radius:20px;padding:22px;background:#f8fbff;color:#475569;font-weight:850">No media added yet. Choose where it goes, upload a photo or paste an image/video link, then click Apply to Preview.</div>';
      }
    }
    if (a === 'social') {
      const links = simoR1060Z5SocialAnchors(fields.socialLinks);
      extra = links ? '<div class="actions" style="margin-top:16px">' + links + '</div>' : '<div style="margin-top:16px;border:1px dashed #fbbf24;border-radius:20px;padding:18px;background:#fffbeb;color:#92400e;font-weight:850">No social links added yet. Paste one link per line, then Apply to Preview.</div>';
    }
    if (a === 'pricing') extra = '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:16px"><div class="card" style="box-shadow:none"><strong>Starter Offer</strong><p>Simple entry offer the user can edit.</p></div><div class="card" style="box-shadow:none"><strong>Premium Offer</strong><p>Higher-value option with support or extras.</p></div></div>';
    if (a === 'domain') extra = `<ul style="line-height:1.8;color:#475569"><li>Suggested names: ${domainIdeasFor(project).map(esc).join(' • ')}</li><li>Compare GoDaddy, Namecheap, Squarespace Domains, or Cloudflare Registrar.</li><li>Use Publish / Go Public, then connect the domain to the published URL.</li></ul>`;
    if (a === 'mobile') extra = '<div style="margin-top:16px;border:1px solid #dbeafe;border-radius:20px;padding:18px;background:#f8fbff;max-width:360px"><strong>Mobile preview notes</strong><p style="margin-bottom:0;color:#64748b">Keep headline short, stack buttons, and make contact easy to tap.</p></div>';
    const editKey = a === 'media' ? simoR1060Z6MediaEditKey(fields.mediaPlacement || 'gallery') : a;
    const editLabel = a === 'media' ? ('Media · ' + simoR1060Z6PlacementLabel(fields.mediaPlacement || 'gallery')) : titleCase(a);
    return `
<section class="section simo-builder-edit-section" data-simo-builder-edit="${esc(editKey)}">
  <div class="card" style="border:2px solid #bfdbfe;background:#ffffff;">
    <div class="eyebrow">Latest Simo edit · ${esc(editLabel)}</div>
    <h2 style="margin:10px 0 8px;font-size:30px;letter-spacing:-.03em;">${esc(fields.headline)}</h2>
    <p>${esc(fields.body)}</p>
    <div class="actions" style="margin-top:16px"><a class="btn" href="#quote" data-simo-page-cta data-simo-target="quote">${esc(fields.primary)}</a><a class="btn secondary" href="#features" data-simo-page-cta data-simo-target="features">${esc(fields.secondary)}</a></div>
    ${extra}
  </div>
</section>
`;
  }

  function simoR1060VApplyEditor(project, action, fields) {
    const a = clean(action || 'hero');
    let html = String(project && project.html || builderHtml(project && project.prompt || 'website'));
    // Make hero edits show instantly at the top, so the user cannot miss the result.
    html = html.replace(/<section class="hero">\s*<div><div class="eyebrow">Simo Builder Preview<\/div><h1>[\s\S]*?<\/h1><p>[\s\S]*?<\/p><div class="actions">[\s\S]*?<\/div><\/div>/i,
      `<section class="hero">\n      <div><div class="eyebrow">Simo Builder Preview</div><h1>${esc(fields.headline)}</h1><p>${esc(fields.body)}</p><div class="actions"><a class="btn" href="#quote" data-simo-page-cta data-simo-target="quote">${esc(fields.primary)}</a><a class="btn secondary" href="#features" data-simo-page-cta data-simo-target="features">${esc(fields.secondary)}</a></div></div>`);
    html = html.replace(/<nav class="nav"><div class="brand">[\s\S]*?<\/div><div class="links">[\s\S]*?<\/div><a class="btn"[\s\S]*?<\/a><\/nav>/i,
      function(m){ return m.replace(/<a class="btn"[\s\S]*?<\/a>/i, `<a class="btn" href="#quote" data-simo-page-cta data-simo-target="quote">${esc(fields.primary)}</a>`); });
    html = html.replace(/<div class="mock"><strong>[\s\S]*?<\/strong>/i, `<div class="mock"><strong>${esc(fields.headline)}</strong>`);
    if (a === 'colors') {
      html = html.replace('</style>', `\n/* Simo theme edit */\nbody{background:linear-gradient(180deg,#f8fbff,#eaf2ff)}.visual{background:linear-gradient(135deg,#0f172a,#1d4ed8)}.btn{box-shadow:0 14px 30px rgba(29,78,216,.20)}.card{border-color:#dbeafe}\n</style>`);
    }
    if (a === 'seo') {
      html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(fields.headline)}</title>\n  <meta name="description" content="${esc(fields.body).slice(0,155)}" />`);
    }
    // Replace previous edit block for this section, then inject latest version where the user chose.
    const editKey = a === 'media' ? simoR1060Z6MediaEditKey(fields.mediaPlacement || 'gallery') : a;
    const re = new RegExp('<section class=\"section simo-builder-edit-section\" data-simo-builder-edit=\"' + editKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\">[\\s\\S]*?<\\/section>\\s*', 'i');
    html = html.replace(re, '');
    const block = simoR1060VSectionHtml(project, a, fields);
    if (a === 'media') {
      const cardChoice = String(fields.mediaCard || 'new');
      const mediaUrl = String(fields.mediaUrl || '').trim();
      if (clean(fields.mediaPlacement || 'gallery') === 'gallery' && /^gallery-card-/i.test(cardChoice) && simoR1060Z5IsImageUrl(mediaUrl)) {
        html = simoR1060Z7ReplaceGalleryCard(html, cardChoice, mediaUrl, fields.mediaCaption || fields.headline || 'Customer photo');
      } else {
        html = simoR1060Z6InjectMediaBlock(html, fields.mediaPlacement || 'gallery', block);
      }
    }
    else html = html.replace(/<\/section>\s*<section id="features"/i, '</section>' + block + '<section id="features"');
    project.html = html;
    project.edits = Array.isArray(project.edits) ? project.edits : [];
    project.edits.unshift({ action: a, headline: fields.headline, body: fields.body, primary: fields.primary, secondary: fields.secondary, at: new Date().toISOString() });
    project.edits = project.edits.slice(0, 20);
    return project;
  }

  function renderBuilderCard(project) {
    const id = project.id;
    const suggestions = builderWorkspaceSuggestions(project);
    const editButtons = suggestions.map(function(pair){
      const active = pair[1] === 'hero';
      return `<button type="button" data-simo-builder-action="select-edit" data-simo-builder-edit="${esc(pair[1])}" style="${simoR1060VEditorStyle(active)}"${active ? ' data-simo-builder-active="true"' : ''}>${esc(pair[0])}</button>`;
    }).join('');
    // Seed the visible editor with Hero defaults immediately.
    const defaults = simoR1060VEditorDefaults(project, 'hero');
    setTimeout(function(){
      try {
        const card = document.querySelector('[data-simo-builder-id="' + String(id).replace(/"/g, '\\"') + '"]');
        if (!card) return;
        const h = card.querySelector('[data-simo-builder-editor-headline]');
        const b = card.querySelector('[data-simo-builder-editor-body]');
        const p = card.querySelector('[data-simo-builder-editor-primary]');
        const s = card.querySelector('[data-simo-builder-editor-secondary]');
        if (h && !h.value) h.value = defaults.headline;
        if (b && !b.value) b.value = defaults.body;
        if (p && !p.value) p.value = defaults.primary;
        if (s && !s.value) s.value = defaults.secondary;
      } catch {}
    }, 0);
    return `
      <div class="simo-builder-card" data-simo-builder-id="${esc(id)}" style="border:1px solid rgba(255,255,255,.12);border-radius:22px;overflow:hidden;background:rgba(255,255,255,.045);box-shadow:0 18px 50px rgba(0,0,0,.18);">
        <div style="padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.10);background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.035));">
          <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#9fb4dd;font-weight:950;">Simo Website/App Builder Workspace</div>
          <div style="font-size:23px;font-weight:950;margin-top:8px;color:#f6f8ff;">${esc(project.title)}</div>
          <div style="font-size:13px;color:#c7d3ea;margin-top:8px;line-height:1.5;">Simple flow: edit inside Simo, apply to the mini preview, then use Open Latest Preview to test buttons like a real visitor.</div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08);">
          <button type="button" data-simo-builder-action="open" style="border:1px solid rgba(110,168,255,.30);background:rgba(110,168,255,.12);color:#eef4ff;border-radius:999px;padding:10px 13px;font-size:12px;font-weight:900;cursor:pointer;">Open Latest Preview</button>
          <button type="button" data-simo-builder-action="save" style="border:1px solid rgba(255,215,106,.30);background:rgba(255,215,106,.12);color:#fff6d8;border-radius:999px;padding:10px 13px;font-size:12px;font-weight:900;cursor:pointer;">Save to Library</button>
          <button type="button" data-simo-builder-action="copy" style="border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.07);color:#eef4ff;border-radius:999px;padding:10px 13px;font-size:12px;font-weight:900;cursor:pointer;">Copy HTML</button>
          <button type="button" data-simo-builder-action="download" style="border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.07);color:#eef4ff;border-radius:999px;padding:10px 13px;font-size:12px;font-weight:900;cursor:pointer;">Download HTML</button>
          <button type="button" data-simo-builder-action="publish" style="border:1px solid rgba(86,240,169,.28);background:rgba(86,240,169,.11);color:#eafff4;border-radius:999px;padding:10px 13px;font-size:12px;font-weight:900;cursor:pointer;">Publish / Go Public</button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;padding:14px 16px 12px;border-bottom:1px solid rgba(255,255,255,.06);">
          <div style="width:100%;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#9fb4dd;font-weight:950;">Choose what to edit</div>
          <div data-simo-builder-status style="width:100%;font-size:12px;color:#c7d3ea;line-height:1.45;margin-bottom:2px;">Hero is selected. Edit here in Simo, click Apply to Preview, then Open Latest Preview to test visitor buttons.</div>
          ${editButtons}
        </div>
        ${simoR1060VEditorPanel()}
        <div style="background:#050b14;padding:14px;">
          <iframe data-simo-builder-preview title="${esc(project.title)}" srcdoc="${esc(project.html)}" style="width:100%;height:560px;border:1px solid rgba(255,255,255,.10);border-radius:16px;background:white;"></iframe>
        </div>
      </div>`;
  }

  function saveBuilderProject(project) {
    const now = new Date().toISOString();
    const item = {
      id: project.id || (`builder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
      title: project.title,
      html: project.html,
      sourceText: `[SIMO_BUILDER_PROJECT]\n${JSON.stringify({ title: project.title, prompt: project.prompt, phase: 'R10.60Z7', type: 'builder_html_workspace', edits: project.edits || [] }, null, 2)}`,
      notes: 'Saved from Simo Website/App Builder Workspace. Reopen as an editable website/app build.',
      tags: ['builder', 'website', 'app', 'landing-page', 'html', 'publish-ready'],
      pinned: false,
      archived: false,
      createdAt: now,
      updatedAt: now
    };
    const items = [item, ...getLibrary().filter((x) => x && x.id !== item.id)];
    setLibrary(items);
    try { localStorage.setItem(LAST_PREVIEW_KEY, JSON.stringify({ html: project.html, title: project.title, savedAt: now })); } catch {}
    try { api('/api/library/save', item).catch(function(){}); } catch {}
    return item;
  }

  function runBuilder(prompt) {
    const text = String(prompt || '').trim();
    if (!text) return false;
    const id = `builder_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const project = { id, prompt: text, title: builderTitleFromPrompt(text), html: builderHtml(text) };
    ensureBuilderStore()[id] = project;
    setSimoStatus('Building editable page preview…', true);
    addUser(text);
    clearInput();
    addAssistant(renderBuilderCard(project));
    setSimoStatus('Ready.', false);
    return true;
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

    // R10.59/R10.57: Do not let the main chat visual-core workspace catcher steal clicks
    // from the recovered Builder Library modal. The Library owner must open the
    // exact clicked saved card. Without this guard, the global active project can
    // win and every Library card may reopen the last active design, such as a
    // flashlight.
    if (target.closest(
      "#simoLiveLibraryFixModal, [data-simo-live-library-id], [data-simo-live-open], [data-simo-live-preview], [data-simo-live-delete], [data-simo-live-tags], [data-simo-live-rename]"
    )) {
      return false;
    }

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
      const builderBtn = e.target && e.target.closest ? e.target.closest("[data-simo-builder-action]") : null;
      if (builderBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        const card = builderBtn.closest("[data-simo-builder-id]");
        const id = card && card.getAttribute("data-simo-builder-id");
        const project = id && ensureBuilderStore()[id];
        if (!project) return;
        const action = builderBtn.getAttribute("data-simo-builder-action");
        if (action === "select-edit") {
          simoR1060VFillEditor(card, project, builderBtn.getAttribute("data-simo-builder-edit") || "hero", builderBtn);
          return;
        }
        if (action === "apply-editor") {
          const panel = card && card.querySelector ? card.querySelector("[data-simo-builder-editor-panel]") : null;
          const active = (panel && panel.getAttribute("data-simo-builder-active-edit")) || "hero";
          builderBtn.textContent = active === 'media' ? "Adding media…" : active === 'social' ? "Adding links…" : "Applying…";
          simoR1060Z5ReadFieldsAsync(card, project, active).then(function(fields){
            simoR1060VApplyEditor(project, active, fields);
            try {
              const iframe = card.querySelector("[data-simo-builder-preview], iframe");
              if (iframe) {
                iframe.onload = function(){ try { iframe.contentWindow.scrollTo(0, 0); } catch {} };
                iframe.srcdoc = project.html;
              }
              const status = card.querySelector("[data-simo-builder-status]");
              if (status) status.textContent = active === 'media'
                ? "Media added to " + simoR1060Z6PlacementLabel(fields.mediaPlacement || "gallery") + " — " + simoR1060Z7CardChoiceLabel(fields.mediaCard || "new") + ". The mini preview updated below. Click Open Latest Preview — or refresh your already-open preview tab — to see the photo/video on the full page."
                : active === 'social'
                  ? "Social links added. The mini preview updated below. Click Open Latest Preview — or refresh your already-open preview tab — to test the full page."
                  : `Applied ${titleCase(active)}. The mini preview updated below. Click Open Latest Preview — or refresh your already-open preview tab — to see and test the latest full page.`;
            } catch {}
            try { saveBuilderProject(project); } catch {}
            builderBtn.textContent = "Applied";
            setTimeout(function(){ try { builderBtn.textContent = "Apply to Preview"; } catch {} }, 1000);
          }).catch(function(err){
            console.warn('Simo builder apply failed:', err);
            builderBtn.textContent = "Try Again";
          });
          return;
        }
        if (action === "open") {
          const blob = new Blob([project.html], { type: "text/html" });
          window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
          return;
        }
        if (action === "save") {
          saveBuilderProject(project);
          builderBtn.textContent = "Saved";
          return;
        }
        if (action === "copy") {
          try { navigator.clipboard && navigator.clipboard.writeText(project.html); builderBtn.textContent = "Copied"; } catch(e) { builderBtn.textContent = "Copy failed"; }
          return;
        }
        if (action === "download") {
          downloadBuilderHtml(project);
          builderBtn.textContent = "Downloaded";
          return;
        }
        if (action === "publish") {
          builderBtn.textContent = "Publishing…";
          publishBuilderProject(project).then(function(){ builderBtn.textContent = "Publish / Go Public"; });
          return;
        }
        if (action === "edit") {
          const edit = builderBtn.getAttribute("data-simo-builder-edit") || builderBtn.textContent || "edit";
          const beforeText = builderBtn.textContent || "Edit";
          applyBuilderEdit(project, edit);
          try {
            const iframe = card && card.querySelector ? card.querySelector("iframe") : null;
            if (iframe) {
              iframe.onload = function(){ try { iframe.contentWindow.scrollTo(0, 0); } catch {} };
              iframe.srcdoc = project.html;
            }
            const status = card && card.querySelector ? card.querySelector("[data-simo-builder-status]") : null;
            if (status) status.textContent = `Updated: ${titleCase(edit)}. The preview refreshed. Open Latest Preview shows the full page; refresh any already-open preview tab to test the latest buttons.`;
          } catch {}
          saveBuilderProject(project);
          builderBtn.textContent = "Updated";
          setTimeout(function(){ try { builderBtn.textContent = beforeText; } catch {} }, 900);
          return;
        }
      }
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
      if (isBuilderIntent(text)) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        runBuilder(text);
        return;
      }
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
      if (isBuilderIntent(text)) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        runBuilder(text);
        return;
      }
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
    runBuilder,
    isBuilderIntent,
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
      .simo-credit-pill{position:static;min-height:38px;height:38px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.075);color:#eef4ff;border-radius:999px;padding:0 14px;display:inline-flex;align-items:center;justify-content:center;gap:8px;box-shadow:none;font:inherit;font-size:13px;font-weight:850;white-space:nowrap;cursor:pointer;line-height:1;vertical-align:middle}
      .simo-credit-pill:hover{border-color:rgba(255,255,255,.26);background:rgba(255,255,255,.11)}
      .simo-credit-pill .simo-credit-label{opacity:.98}
      .simo-credit-pill .simo-credit-buy{display:inline-flex;align-items:center;border-left:1px solid rgba(255,255,255,.18);padding-left:8px;color:#eef4ff;font-weight:900;font-size:12px;line-height:1}
      .simo-credit-pill.simo-credit-low{border-color:rgba(255,199,89,.62);background:rgba(255,199,89,.16);box-shadow:0 0 0 1px rgba(255,199,89,.10) inset}
      .simo-credit-pill.simo-credit-empty{border-color:rgba(255,120,120,.72);background:rgba(255,95,95,.18);box-shadow:0 0 0 1px rgba(255,120,120,.12) inset}
      .simo-credit-pill.simo-credit-fallback-fixed{position:fixed;right:24px;top:96px;z-index:2147481200;box-shadow:0 18px 55px rgba(0,0,0,.32)}
      @media (max-width: 920px){.simo-credit-pill{height:36px;min-height:36px;font-size:12px;padding:0 11px}.simo-credit-pill .simo-credit-buy{font-size:11px;padding-left:7px}}
      @media (max-width: 720px){.simo-credit-pill.simo-credit-fallback-fixed{top:86px;right:12px;transform:scale(.94);transform-origin:top right}}
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
    if (!status || !status.enabled) return "Credits";
    if (status.unlimited) return "Credits: Admin";
    var n = status.remaining == null ? 0 : Number(status.remaining || 0);
    return "Credits: " + n;
  }

  function renderPill(status) {
    css();
    var old = document.getElementById("simoDesignCreditPill");
    if (old) old.remove();

    var pill = el("button", {
      id: "simoDesignCreditPill",
      class: "simo-credit-pill",
      type: "button",
      title: "Buy Simo design credits"
    });
    pill.innerHTML = '<span class="simo-credit-label">' + label(status) + '</span><span class="simo-credit-buy">Buy</span>';
    if (status && status.enabled && !status.unlimited) {
      var remaining = Number(status.remaining || 0);
      if (remaining <= 0) pill.classList.add("simo-credit-empty");
      else if (remaining <= 3) pill.classList.add("simo-credit-low");
    }
    pill.addEventListener("click", openModal);

    var clearBtn = document.getElementById("clearHistoryBtn");
    var actions = clearBtn && clearBtn.parentElement;
    if (actions && actions.classList && actions.classList.contains("topbar-actions")) {
      actions.insertBefore(pill, clearBtn);
    } else {
      pill.classList.add("simo-credit-fallback-fixed");
      document.body.appendChild(pill);
    }
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


// SIMO PHASE 14M-R10.60B SAFE MIC + AUDIO RESPONSE SETTINGS UI
// Preserves PHASE 14M-R10.59J core routing and R10.59L composer behavior.
// Settings only: no auto-recording, no Send/Enter routing changes, no Library/Workspace/credit changes.
(function () {
  "use strict";
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__SIMO_R1060B_SETTINGS_MODAL__) return;
  window.__SIMO_R1060B_SETTINGS_MODAL__ = true;

  const SETTINGS_KEY = "simo_settings_v1";
  const VOICE_SETTINGS_KEY = "simo_voice_settings_v1";
  const THEMES = ["dark", "midnight", "warm", "light"];
  const VOICES = ["Best Friend", "Focused", "Creative", "Direct"];
  const AUDIO_VOICES = ["Browser Default", "Best available", "Friendly", "Calm", "Clear", "Fast"];
  const SPEECH_LANGUAGES = [
    "English (US)|en-US",
    "English (Canada)|en-CA",
    "English (UK)|en-GB",
    "Spanish (US)|es-US",
    "Spanish|es-ES",
    "French|fr-FR",
    "Arabic|ar",
    "Albanian|sq",
    "Italian|it-IT",
    "German|de-DE"
  ];

  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>\"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m])); }
  function readJson(key) { try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; } }
  function writeJson(key, next) { try { localStorage.setItem(key, JSON.stringify(next || {})); } catch {} }
  function readSettings() { return readJson(SETTINGS_KEY); }
  function writeSettings(next) { writeJson(SETTINGS_KEY, next); }
  function readVoiceSettings() { return readJson(VOICE_SETTINGS_KEY); }
  function writeVoiceSettings(next) { writeJson(VOICE_SETTINGS_KEY, next); }
  function checked(value) { return value ? " checked" : ""; }

  function applySettings(settings, voiceSettings) {
    settings = settings || readSettings();
    voiceSettings = voiceSettings || readVoiceSettings();
    const theme = settings.theme || "dark";
    const accent = settings.accent || "#6ea8ff";
    const voice = settings.voice || "Best Friend";
    const safeVoice = {
      micEnabled: !!voiceSettings.micEnabled,
      audioResponsesEnabled: !!voiceSettings.audioResponsesEnabled,
      audioAutoplay: !!voiceSettings.audioAutoplay,
      audioVoice: voiceSettings.audioVoice || "Browser Default",
      audioRate: Number(voiceSettings.audioRate || 1),
      audioPitch: Number(voiceSettings.audioPitch || 1),
      speechLanguage: voiceSettings.speechLanguage || "en-US",
      assistantName: String(voiceSettings.assistantName || "Simo").trim() || "Simo",
      updatedAt: voiceSettings.updatedAt || ""
    };
    document.documentElement.dataset.simoTheme = theme;
    document.documentElement.style.setProperty("--simo-user-accent", accent);
    window.SIMO_USER_SETTINGS = { theme, accent, voice, voiceSettings: safeVoice };
    window.SIMO_VOICE_SETTINGS = safeVoice;
    try { window.dispatchEvent(new CustomEvent("simo:settings-updated", { detail: window.SIMO_USER_SETTINGS })); } catch {}
    try { window.dispatchEvent(new CustomEvent("simo:voice-settings-updated", { detail: safeVoice })); } catch {}
  }

  function optionHtml(values, selected) {
    return values.map(v => '<option value="' + esc(v) + '"' + (v === selected ? ' selected' : '') + '>' + esc(v) + '</option>').join('');
  }
  function languageOptionHtml(values, selected) {
    return values.map(function (entry) {
      var parts = String(entry || '').split('|');
      var label = parts[0] || entry;
      var value = parts[1] || label;
      return '<option value="' + esc(value) + '"' + (value === selected ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
  }

  function ensureStyles() {
    if ($("simoR1060ASettingsStyles")) return;
    const style = document.createElement("style");
    style.id = "simoR1060ASettingsStyles";
    style.textContent = `
      .simo-settings-backdrop{position:fixed;inset:0;z-index:2147483002;background:rgba(0,0,0,.58);display:flex;align-items:center;justify-content:center;padding:18px;font-family:Inter,Arial,sans-serif}
      .simo-settings-modal{width:min(640px,96vw);max-height:min(88vh,900px);overflow:auto;border:1px solid rgba(255,255,255,.16);background:#07111f;color:#eef4ff;border-radius:24px;box-shadow:0 30px 100px rgba(0,0,0,.55);padding:20px;display:grid;gap:14px}
      .simo-settings-modal h3{margin:0;font-size:22px}.simo-settings-modal p{margin:0;color:#c7d3ea;line-height:1.45;font-size:13px}
      .simo-settings-section{border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.035);border-radius:18px;padding:14px;display:grid;gap:12px}
      .simo-settings-section-title{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;font-weight:950;color:#f4f7ff;letter-spacing:.02em}
      .simo-settings-grid{display:grid;gap:12px}.simo-settings-row{display:grid;gap:6px}.simo-settings-row label{font-size:12px;color:#aebce4;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
      .simo-settings-row select,.simo-settings-row input{border:1px solid rgba(255,255,255,.14);background:#111b2b;color:#eef4ff;border-radius:14px;padding:11px 12px;font-weight:800;outline:none;color-scheme:dark}.simo-settings-row select option{background:#111b2b;color:#eef4ff}.simo-settings-row select:focus,.simo-settings-row input:focus{border-color:rgba(110,168,255,.55);box-shadow:0 0 0 3px rgba(110,168,255,.15)}
      .simo-settings-toggle{display:flex;align-items:center;justify-content:space-between;gap:14px;border:1px solid rgba(255,255,255,.09);background:rgba(0,0,0,.14);border-radius:16px;padding:12px}.simo-settings-toggle strong{display:block;font-size:13px;color:#f2f6ff}.simo-settings-toggle small{display:block;margin-top:3px;color:#93a4c9;font-size:11px;line-height:1.35}.simo-settings-toggle input{width:20px;height:20px;accent-color:#6ea8ff;flex:0 0 auto}
      .simo-settings-range{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}.simo-settings-range input{width:100%}.simo-settings-value{font-size:12px;color:#c7d3ea;font-weight:900;min-width:34px;text-align:right}
      .simo-settings-inline-actions{display:flex;gap:8px;flex-wrap:wrap}.simo-settings-inline-actions button,.simo-settings-actions button{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.07);color:#eef4ff;border-radius:999px;padding:10px 13px;font-weight:900;cursor:pointer}.simo-settings-inline-actions button:hover,.simo-settings-actions button:hover{background:rgba(255,255,255,.10);border-color:rgba(255,255,255,.22)}
      .simo-settings-status{min-height:18px;font-size:12px;color:#b8c7e6;line-height:1.4}.simo-settings-status.good{color:#87f5bd}.simo-settings-status.warn{color:#ffd76a}.simo-settings-status.bad{color:#ff9bab}
      .simo-settings-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}.simo-settings-actions .primary{background:rgba(110,168,255,.22);border-color:rgba(110,168,255,.45)}
      html[data-simo-theme="light"] body{background:#f6f8ff;color:#0d1628} html[data-simo-theme="warm"] body{background:#140f0a} html[data-simo-theme="midnight"] body{background:#030712}
    `;
    document.head.appendChild(style);
  }

  function setStatus(backdrop, message, tone) {
    const box = backdrop && backdrop.querySelector("#simoVoiceTestStatus");
    if (!box) return;
    box.textContent = String(message || "");
    box.className = "simo-settings-status" + (tone ? " " + tone : "");
  }

  async function testMicrophone(backdrop) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus(backdrop, "Microphone test is not supported in this browser.", "bad");
      return;
    }
    setStatus(backdrop, "Requesting microphone permission…", "warn");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      try { stream.getTracks().forEach(track => track.stop()); } catch {}
      setStatus(backdrop, "Microphone permission works. No audio was saved or sent.", "good");
    } catch (err) {
      setStatus(backdrop, "Microphone permission was blocked or unavailable.", "bad");
    }
  }

  function pickSpeechVoice(preference) {
    if (!window.speechSynthesis || !window.speechSynthesis.getVoices) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;
    const pref = String(preference || "").toLowerCase();
    if (pref.includes("friendly") || pref.includes("calm")) {
      return voices.find(v => /female|zira|samantha|aria|jenny|natural/i.test(v.name)) || voices[0];
    }
    if (pref.includes("clear") || pref.includes("fast")) {
      return voices.find(v => /david|mark|guy|daniel|natural/i.test(v.name)) || voices[0];
    }
    if (pref.includes("best")) return voices.find(v => /natural|premium|enhanced/i.test(v.name)) || voices[0];
    return voices[0];
  }

  function playTestVoice(backdrop) {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      setStatus(backdrop, "Audio test is not supported in this browser.", "bad");
      return;
    }
    try { window.speechSynthesis.cancel(); } catch {}
    const audioVoice = (backdrop.querySelector("#simoAudioVoice") || {}).value || "Browser Default";
    const rate = Number((backdrop.querySelector("#simoAudioRate") || {}).value || 1);
    const pitch = Number((backdrop.querySelector("#simoAudioPitch") || {}).value || 1);
    const utterance = new SpeechSynthesisUtterance("Hi Simon. This is the temporary browser voice test. Natural Simo voice will need the later server voice layer, and chat routing stays protected.");
    utterance.rate = Math.max(.6, Math.min(1.35, rate));
    utterance.pitch = Math.max(.7, Math.min(1.3, pitch));
    const voice = pickSpeechVoice(audioVoice);
    if (voice) utterance.voice = voice;
    utterance.onend = () => setStatus(backdrop, "Audio test finished.", "good");
    utterance.onerror = () => setStatus(backdrop, "Audio test could not play in this browser.", "bad");
    setStatus(backdrop, "Playing temporary browser voice test…", "warn");
    window.speechSynthesis.speak(utterance);
  }

  function wireRangeLabel(backdrop, inputId, valueId) {
    const input = backdrop.querySelector("#" + inputId);
    const value = backdrop.querySelector("#" + valueId);
    if (!input || !value) return;
    const update = () => { value.textContent = Number(input.value || 1).toFixed(1) + "x"; };
    input.addEventListener("input", update);
    update();
  }

  function openSettings(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); }
    ensureStyles();
    const current = readSettings();
    const voiceCurrent = readVoiceSettings();
    const theme = current.theme || "dark";
    const accent = current.accent || "#6ea8ff";
    const voice = current.voice || "Best Friend";
    const micEnabled = !!voiceCurrent.micEnabled;
    const audioResponsesEnabled = !!voiceCurrent.audioResponsesEnabled;
    const audioAutoplay = !!voiceCurrent.audioAutoplay;
    const audioVoice = voiceCurrent.audioVoice || "Browser Default";
    const audioRate = Number(voiceCurrent.audioRate || 1);
    const audioPitch = Number(voiceCurrent.audioPitch || 1);
    const speechLanguage = voiceCurrent.speechLanguage || "en-US";
    const assistantName = String(voiceCurrent.assistantName || "Simo").trim() || "Simo";
    const backdrop = document.createElement("div");
    backdrop.className = "simo-settings-backdrop";
    backdrop.innerHTML = `
      <section class="simo-settings-modal" role="dialog" aria-modal="true" aria-label="Simo Settings">
        <h3>Settings & Voice</h3>
        <p>These settings are saved in this browser and applied immediately. This R10.60O pass keeps Simo north star safe: mic dictation can correct the Simo brand name, language can be selected for speech recognition, browser voice is temporary, and there is no auto-recording, no Send/Enter routing change, and no Library, Workspace, credit, Stripe, login, Render, or DNS changes.</p>

        <div class="simo-settings-section">
          <div class="simo-settings-section-title"><span>Look & written tone</span><span>R10.59J preserved</span></div>
          <div class="simo-settings-grid">
            <div class="simo-settings-row"><label>Theme</label><select id="simoSettingsTheme">${optionHtml(THEMES, theme)}</select></div>
            <div class="simo-settings-row"><label>Accent color</label><input id="simoSettingsAccent" type="color" value="${esc(accent)}" /></div>
            <div class="simo-settings-row"><label>Voice style (text tone)</label><select id="simoSettingsVoice">${optionHtml(VOICES, voice)}</select><small style="color:#93a4c9;font-size:11px;line-height:1.35;">This controls Simo’s written tone setting.</small></div>
          </div>
        </div>

        <div class="simo-settings-section">
          <div class="simo-settings-section-title"><span>Microphone input</span><span>Brand + language aware</span></div>
          <label class="simo-settings-toggle">
            <span><strong>Mic input setting</strong><small>Stores your preference. It does not auto-record, and spoken text still waits for you to press Send.</small></span>
            <input id="simoMicEnabled" type="checkbox"${checked(micEnabled)} />
          </label>
          <div class="simo-settings-row"><label>Speech recognition language</label><select id="simoSpeechLanguage">${languageOptionHtml(SPEECH_LANGUAGES, speechLanguage)}</select><small style="color:#93a4c9;font-size:11px;line-height:1.35;">Used by the browser mic listener when available.</small></div>
          <div class="simo-settings-row"><label>Assistant / brand name</label><input id="simoAssistantName" type="text" value="${esc(assistantName)}" maxlength="32" /><small style="color:#93a4c9;font-size:11px;line-height:1.35;">Default is Simo. Mic dictation corrects common misheard versions like SEMO, CMO, see mo, or s e m o to this name.</small></div>
          <div class="simo-settings-inline-actions"><button type="button" data-simo-test-mic>Test microphone permission</button></div>
        </div>

        <div class="simo-settings-section">
          <div class="simo-settings-section-title"><span>Temporary browser audio</span><span>Natural voice later</span></div>
          <label class="simo-settings-toggle">
            <span><strong>Browser audio response setting</strong><small>Stores whether Simo may speak answers later. This browser test can sound robotic; real natural Simo voice will require the later server voice layer.</small></span>
            <input id="simoAudioResponsesEnabled" type="checkbox"${checked(audioResponsesEnabled)} />
          </label>
          <label class="simo-settings-toggle">
            <span><strong>Read responses aloud with temporary browser voice</strong><small>Saved for a later behavior pass. It stays inactive until response playback is safely wired.</small></span>
            <input id="simoAudioAutoplay" type="checkbox"${checked(audioAutoplay)} />
          </label>
          <div class="simo-settings-row"><label>Temporary browser voice style</label><select id="simoAudioVoice">${optionHtml(AUDIO_VOICES, audioVoice)}</select><small style="color:#93a4c9;font-size:11px;line-height:1.35;">This uses Chrome/Windows voices only. It is not the final natural Simo voice.</small></div>
          <div class="simo-settings-row"><label>Speaking speed</label><div class="simo-settings-range"><input id="simoAudioRate" type="range" min="0.7" max="1.3" step="0.1" value="${esc(audioRate)}" /><span id="simoAudioRateValue" class="simo-settings-value"></span></div></div>
          <div class="simo-settings-row"><label>Voice pitch</label><div class="simo-settings-range"><input id="simoAudioPitch" type="range" min="0.8" max="1.2" step="0.1" value="${esc(audioPitch)}" /><span id="simoAudioPitchValue" class="simo-settings-value"></span></div></div>
          <div class="simo-settings-inline-actions"><button type="button" data-simo-test-audio>Play temporary browser voice test</button><button type="button" data-simo-stop-audio>Stop browser voice</button></div>
          <div class="simo-settings-safe-note" style="margin-top:10px;border:1px solid rgba(110,168,255,.18);background:rgba(110,168,255,.08);border-radius:14px;padding:10px 11px;color:#dce8ff;font-size:12px;line-height:1.45;">Natural, real Simo voice is intentionally not wired in this UI-only pass. Next voice layer should be server-generated audio, played after the normal text answer, with routing untouched.</div>
          <div id="simoVoiceTestStatus" class="simo-settings-status">Ready. Temporary test uses browser voice only.</div>
        </div>

        <div class="simo-settings-actions"><button type="button" data-simo-settings-close>Cancel</button><button type="button" class="primary" data-simo-settings-save>Save settings</button></div>
      </section>`;
    document.body.appendChild(backdrop);
    wireRangeLabel(backdrop, "simoAudioRate", "simoAudioRateValue");
    wireRangeLabel(backdrop, "simoAudioPitch", "simoAudioPitchValue");
    backdrop.addEventListener("click", function (ev) { if (ev.target === backdrop) backdrop.remove(); });
    const close = backdrop.querySelector("[data-simo-settings-close]");
    const save = backdrop.querySelector("[data-simo-settings-save]");
    const testMic = backdrop.querySelector("[data-simo-test-mic]");
    const testAudio = backdrop.querySelector("[data-simo-test-audio]");
    const stopAudio = backdrop.querySelector("[data-simo-stop-audio]");
    if (close) close.addEventListener("click", () => { try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch {} backdrop.remove(); });
    if (testMic) testMic.addEventListener("click", () => testMicrophone(backdrop));
    if (testAudio) testAudio.addEventListener("click", () => playTestVoice(backdrop));
    if (stopAudio) stopAudio.addEventListener("click", () => { try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch {} setStatus(backdrop, "Audio stopped.", "warn"); });
    if (save) save.addEventListener("click", function () {
      const next = {
        theme: (backdrop.querySelector("#simoSettingsTheme") || {}).value || "dark",
        accent: (backdrop.querySelector("#simoSettingsAccent") || {}).value || "#6ea8ff",
        voice: (backdrop.querySelector("#simoSettingsVoice") || {}).value || "Best Friend",
        updatedAt: new Date().toISOString()
      };
      const nextVoice = {
        micEnabled: !!((backdrop.querySelector("#simoMicEnabled") || {}).checked),
        audioResponsesEnabled: !!((backdrop.querySelector("#simoAudioResponsesEnabled") || {}).checked),
        audioAutoplay: !!((backdrop.querySelector("#simoAudioAutoplay") || {}).checked),
        audioVoice: (backdrop.querySelector("#simoAudioVoice") || {}).value || "Browser Default",
        audioRate: Number((backdrop.querySelector("#simoAudioRate") || {}).value || 1),
        audioPitch: Number((backdrop.querySelector("#simoAudioPitch") || {}).value || 1),
        speechLanguage: (backdrop.querySelector("#simoSpeechLanguage") || {}).value || "en-US",
        assistantName: String((backdrop.querySelector("#simoAssistantName") || {}).value || "Simo").trim() || "Simo",
        updatedAt: new Date().toISOString()
      };
      writeSettings(next);
      writeVoiceSettings(nextVoice);
      applySettings(next, nextVoice);
      try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch {}
      backdrop.remove();
    });
    return false;
  }

  function boot() {
    applySettings(readSettings(), readVoiceSettings());
    document.addEventListener("click", function (e) {
      const hit = e.target && e.target.closest && e.target.closest("#settingsBtn, [data-simo-settings], button, a, [role='button']");
      if (!hit) return;
      const txt = String(hit.textContent || hit.value || hit.getAttribute("aria-label") || hit.title || "").toLowerCase().replace(/\s+/g," ").trim();
      if (hit.id === "settingsBtn" || txt === "settings & voice" || txt.indexOf("settings") >= 0 && txt.indexOf("voice") >= 0) {
        return openSettings(e);
      }
    }, true);
    window.SimoSettings = { open: openSettings, apply: applySettings, read: readSettings, readVoice: readVoiceSettings, phase: "R10.60C" };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();



// SIMO PHASE 14M-R10.60B SIGNUP RESTORE SAFE ADDON
// Scope: restore Easy Signup modal only. No Send/Enter routing, Library, Workspace,
// image analysis, credit, Stripe, login backend, Render, DNS, or simo-ui-recovery.js changes.
(function () {
  "use strict";
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__SIMO_R1060B_SIGNUP_RESTORE__) return;
  window.__SIMO_R1060B_SIGNUP_RESTORE__ = true;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (m) {
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m];
    });
  }

  function api(path, payload) {
    return fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    }).then(async function (res) {
      var ct = res.headers.get("content-type") || "";
      var data = ct.indexOf("application/json") >= 0 ? await res.json() : await res.text();
      if (!res.ok) {
        var msg = data && (data.error || data.message) ? (data.error || data.message) : ("Request failed: " + res.status);
        throw new Error(msg);
      }
      return data;
    });
  }

  function toast(message, good) {
    try {
      var wrap = document.getElementById("toastWrap");
      if (!wrap) {
        wrap = document.createElement("div");
        wrap.id = "toastWrap";
        wrap.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:99999;display:grid;gap:8px;max-width:min(420px,calc(100vw - 36px));";
        document.body.appendChild(wrap);
      }
      var box = document.createElement("div");
      box.className = "simo-toast";
      box.style.cssText = "border:1px solid " + (good ? "rgba(86,240,169,.28)" : "rgba(255,215,106,.28)") + ";background:rgba(10,16,28,.96);color:#eef4ff;border-radius:16px;padding:12px 14px;box-shadow:0 16px 40px rgba(0,0,0,.35);font-weight:800;font-size:13px;";
      box.textContent = message;
      wrap.appendChild(box);
      setTimeout(function () { try { box.remove(); } catch {} }, 3600);
    } catch {
      try { console.log(message); } catch {}
    }
  }

  function setStatus(modal, message, kind) {
    var el = modal && modal.querySelector("[data-simo-signup-status]");
    if (!el) return;
    el.textContent = message || "";
    el.style.color = kind === "good" ? "#8ff6c1" : kind === "bad" ? "#ff9cad" : "#dce8ff";
  }

  function ensureSignupStyles() {
    if (document.getElementById("simo-r1060b-signup-style")) return;
    var style = document.createElement("style");
    style.id = "simo-r1060b-signup-style";
    style.textContent = `
      .simo-signup-backdrop{position:fixed;inset:0;z-index:99980;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(4,8,14,.72);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);}
      .simo-signup-modal{width:min(560px,100%);max-height:min(90vh,760px);overflow:auto;border-radius:26px;border:1px solid rgba(255,255,255,.13);background:linear-gradient(180deg,rgba(16,24,39,.98),rgba(9,15,27,.96));box-shadow:0 24px 90px rgba(0,0,0,.45);color:#eef4ff;padding:18px;}
      .simo-signup-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px;}
      .simo-signup-modal h3{margin:0;font-size:22px;line-height:1.15;}
      .simo-signup-modal p{margin:7px 0 0;color:#c7d3ea;line-height:1.5;font-size:13px;}
      .simo-signup-x{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#eef4ff;border-radius:12px;width:38px;height:38px;cursor:pointer;font-weight:900;}
      .simo-signup-grid{display:grid;gap:10px;margin-top:14px;}
      .simo-signup-field{display:grid;gap:6px;}
      .simo-signup-field label{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#aebbd7;font-weight:900;}
      .simo-signup-field input{width:100%;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.055);color:#fff;border-radius:14px;padding:12px 13px;outline:none;box-sizing:border-box;}
      .simo-signup-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;}
      .simo-signup-primary,.simo-signup-secondary{border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:10px 14px;cursor:pointer;font-weight:900;color:#eef4ff;}
      .simo-signup-primary{background:linear-gradient(180deg,rgba(105,120,255,.35),rgba(80,88,180,.35));border-color:rgba(140,160,255,.28);}
      .simo-signup-secondary{background:rgba(255,255,255,.055);}
      .simo-signup-safe{margin-top:13px;border:1px solid rgba(110,168,255,.18);background:rgba(110,168,255,.08);border-radius:16px;padding:11px 12px;color:#dce8ff;font-size:12px;line-height:1.45;}
      .simo-signup-status{margin-top:12px;min-height:18px;font-size:12px;font-weight:800;color:#dce8ff;}
    `;
    document.head.appendChild(style);
  }

  async function refreshMe() {
    try {
      var res = await fetch("/api/me", { credentials: "same-origin" });
      if (!res.ok) return null;
      var data = await res.json();
      try { window.dispatchEvent(new CustomEvent("simo:account-refresh", { detail: data })); } catch {}
      return data;
    } catch {
      return null;
    }
  }

  function openSignup(ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    }
    ensureSignupStyles();
    document.querySelectorAll(".simo-signup-backdrop").forEach(function (x) { try { x.remove(); } catch {} });
    var boot = window.SIMO_BOOT || {};
    var maybeEmail = boot.email || boot.user_email || "";
    var backdrop = document.createElement("div");
    backdrop.className = "simo-signup-backdrop";
    backdrop.innerHTML = `
      <section class="simo-signup-modal" role="dialog" aria-modal="true" aria-label="Easy Signup">
        <div class="simo-signup-head">
          <div>
            <h3>Easy Signup</h3>
            <p>Create or update your local Simo account profile. This safe pass restores the button without changing chat routing, Library, Workspace, credits, Stripe, Render, DNS, or login backend behavior.</p>
          </div>
          <button class="simo-signup-x" type="button" data-simo-signup-close aria-label="Close">×</button>
        </div>

        <div class="simo-signup-grid">
          <div class="simo-signup-field">
            <label for="simoSignupName">Name</label>
            <input id="simoSignupName" type="text" autocomplete="name" placeholder="Simon" value="${esc(boot.name || boot.user_name || "")}" />
          </div>
          <div class="simo-signup-field">
            <label for="simoSignupEmail">Email</label>
            <input id="simoSignupEmail" type="email" autocomplete="email" placeholder="you@example.com" value="${esc(maybeEmail)}" />
          </div>
        </div>

        <div class="simo-signup-safe">
          This does not force a paid plan and does not touch Stripe. If Google sign-in is configured, use the normal Sign in button for full account login. This modal is a safe local/signup helper.
        </div>

        <div class="simo-signup-actions">
          <button class="simo-signup-primary" type="button" data-simo-signup-save>Save signup info</button>
          <button class="simo-signup-secondary" type="button" data-simo-signup-google>Use normal Sign in</button>
          <button class="simo-signup-secondary" type="button" data-simo-signup-close>Close</button>
        </div>
        <div class="simo-signup-status" data-simo-signup-status>Ready.</div>
      </section>
    `;
    document.body.appendChild(backdrop);

    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop || e.target.closest("[data-simo-signup-close]")) {
        backdrop.remove();
      }
    });

    backdrop.querySelector("[data-simo-signup-google]").addEventListener("click", function () {
      var login = document.getElementById("loginBtn");
      backdrop.remove();
      if (login) login.click();
      else window.location.href = "/login";
    });

    backdrop.querySelector("[data-simo-signup-save]").addEventListener("click", async function () {
      var name = (backdrop.querySelector("#simoSignupName") || {}).value || "";
      var email = (backdrop.querySelector("#simoSignupEmail") || {}).value || "";
      name = name.trim();
      email = email.trim();
      if (!email || email.indexOf("@") < 1) {
        setStatus(backdrop, "Please enter a valid email.", "bad");
        return;
      }
      var payload = { name: name, email: email, source: "r1060b_easy_signup_restore" };
      try { localStorage.setItem("simo_easy_signup_v1", JSON.stringify({ name: name, email: email, updatedAt: new Date().toISOString() })); } catch {}
      setStatus(backdrop, "Saving signup info…", "warn");

      var savedServer = false;
      try {
        await api("/api/easy-signup", payload);
        savedServer = true;
      } catch (err1) {
        try {
          await api("/api/signup", payload);
          savedServer = true;
        } catch (err2) {
          savedServer = false;
        }
      }

      await refreshMe();
      setStatus(backdrop, savedServer ? "Saved. Account status refreshed." : "Saved locally. Server signup endpoint was not available.", savedServer ? "good" : "warn");
      toast(savedServer ? "Easy Signup saved." : "Easy Signup saved locally.", true);
    });

    setTimeout(function () {
      try { (backdrop.querySelector("#simoSignupName") || backdrop.querySelector("#simoSignupEmail")).focus(); } catch {}
    }, 30);
    return false;
  }

  function bootSignupRestore() {
    document.addEventListener("click", function (e) {
      var hit = e.target && e.target.closest && e.target.closest("#signupBtn, [data-simo-signup], button, a, [role='button']");
      if (!hit) return;
      var txt = String(hit.textContent || hit.value || hit.getAttribute("aria-label") || hit.title || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (hit.id === "signupBtn" || txt === "easy signup" || txt.indexOf("signup") >= 0 || txt.indexOf("sign up") >= 0) {
        return openSignup(e);
      }
    }, true);
    window.SimoSignup = { open: openSignup, phase: "R10.60B" };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootSignupRestore, { once: true });
  } else {
    bootSignupRestore();
  }
})();


/* --------------------------------------------------
   PHASE 14M-R10.60C — 3D UI quarantine / North Star guard
   Hides only the public 3D/Design Studio entry points that were still visible
   in the main sidebar/home chips. It does NOT touch saved Library cards,
   Open Workspace, workspace save-back, image analysis, credits, Stripe,
   login, Render, DNS, or Send/Enter routing.
-------------------------------------------------- */
(function simoR1060CQuarantine3DUi() {
  "use strict";
  const PHASE = "R10.60C_3D_UI_QUARANTINE";
  function textOf(el) { return String((el && el.textContent) || "").replace(/\s+/g, " ").trim().toLowerCase(); }
  function hide(el) {
    if (!el || el.dataset.simoR1060cHidden === "true") return;
    el.dataset.simoR1060cHidden = "true";
    el.dataset.simoHiddenReason = PHASE;
    el.style.display = "none";
    el.setAttribute("aria-hidden", "true");
  }
  function run() {
    try {
      document.querySelectorAll(".side-card").forEach(function (card) {
        const t = textOf(card);
        if (t.includes("3d rendering") || t.includes("3d rotate") || t.includes("3d viewer")) hide(card);
      });
      document.querySelectorAll(".chip").forEach(function (chip) {
        const t = textOf(chip);
        if (t.includes("3d viewer ready") || t.includes("3d viewer")) hide(chip);
      });
      const sidebar = document.querySelector(".sidebar");
      if (sidebar) {
        sidebar.querySelectorAll("button, a, [role='button']").forEach(function (btn) {
          const t = textOf(btn);
          if (t === "design studio" || t === "3d rendering & rotate" || t === "3d viewer") hide(btn);
        });
      }
      window.__SIMO_R1060C_3D_UI_QUARANTINE__ = true;
    } catch (err) {
      console.warn("Simo R10.60C 3D UI quarantine skipped:", err);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
  else run();
  setTimeout(run, 350);
  setTimeout(run, 1200);
  setTimeout(run, 2500);
})();



/* SIMO PHASE 14M-R10.60I — Mic placement polish
   Keeps proven R10.60H mic behavior. Only placement/CSS support changed. */
(function simoR1060IMicPlacementPolish(){
  if (window.__SIMO_R1060I_MIC_PLACEMENT_POLISH__) return;
  window.__SIMO_R1060I_MIC_PLACEMENT_POLISH__ = true;

  var VOICE_SETTINGS_KEY = "simo_voice_settings_v1";
  var recognition = null;
  var listening = false;
  var hadResult = false;
  var stopTimer = null;

  function byId(id){ return document.getElementById(id); }
  function settings(){
    try { return JSON.parse(localStorage.getItem(VOICE_SETTINGS_KEY) || "{}") || {}; }
    catch(e){ return {}; }
  }
  function micEnabled(){ return !!settings().micEnabled; }
  function input(){ return byId("chatInput") || document.querySelector("textarea, input[type='text']"); }
  function statusEl(){ return byId("loadingHint") || document.querySelector("[data-simo-status], .status, .loading-hint"); }
  function setStatus(msg, busy){
    var el = statusEl();
    if (!el) return;
    el.textContent = String(msg || "Ready.");
    try { el.dataset.simoBusy = busy ? "true" : "false"; } catch(e) {}
  }
  function SpeechCtor(){ return window.SpeechRecognition || window.webkitSpeechRecognition || null; }
  function btn(){ return byId("simoMicBtn"); }
  function updateBtn(){
    var b = btn();
    if (!b) return;
    var enabled = micEnabled();
    b.classList.toggle("hidden", !enabled);
    b.setAttribute("aria-hidden", enabled ? "false" : "true");
    b.classList.toggle("simo-mic-listening", !!listening);
    b.textContent = listening ? "■" : "🎙️";
    b.title = listening ? "Stop listening" : "Use microphone";
    b.setAttribute("aria-label", listening ? "Stop listening" : "Use microphone");
  }
  function assistantBrandName(){
    var raw = String(settings().assistantName || "Simo").replace(/\s+/g, " ").trim();
    return raw || "Simo";
  }
  function capitalizeFirstWordForDictation(value){
    var text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    return text.replace(/^([\"'“”‘’([{<]*)([a-z])/, function(_, prefix, ch){ return prefix + ch.toUpperCase(); });
  }

  function normalizeMicTranscript(text){
    var value = String(text || "").replace(/\s+/g, " ").trim();
    if (!value) return "";
    var brand = assistantBrandName();

    // R10.60P: brand-aware speech cleanup. Browsers may hear "Simo" as
    // SEMO, CMO, Seymour, see mo, or s e m o. Correct only mic transcript
    // text, not manually typed text, and keep user-custom brand spelling.
    value = value
      .replace(/\bs\s*e\s*m\s*o\b/gi, brand)
      .replace(/\bsemo\b/gi, brand)
      .replace(/\bseymour\b/gi, brand)
      .replace(/\bsay\s+more\b/gi, brand)
      .replace(/\bsee\s+mo\b/gi, brand)
      .replace(/\bcee\s+mo\b/gi, brand)
      .replace(/\bsea\s+mo\b/gi, brand)
      .replace(/\bseamoe\b/gi, brand)
      .replace(/\bsimmo\b/gi, brand)
      .replace(/\bsimo\b/gi, brand);

    // Be careful with CMO because it can be a real business role. Only treat
    // it as the assistant name when it appears like an address/wake word.
    value = value
      .replace(/(^|[.!?]\s+)(hi|hey|hello|ok|okay|yo)\s+c\s*m\s*o\b/gi, function(_, p, g){ return p + g + " " + brand; })
      .replace(/(^|[.!?]\s+)c\s*m\s*o\s+(can|could|please|will|would|show|build|create|make|give|help|tell|type|remember)\b/gi, function(_, p, w){ return p + brand + " " + w; })
      .replace(/\b(let'?s keep|keep)\s+c\s*m\s*o\s+north star\b/gi, function(_, lead){ return lead + " " + brand + " north star"; });

    value = value
      .replace(/\s+([,.!?;:])/g, "$1")
      .replace(/([,.!?;:])([^\s])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim();

    // Dictation polish only: capitalize the first word of mic-captured text.
    return capitalizeFirstWordForDictation(value);
  }

  function writeText(text){
    var target = input();
    var spoken = normalizeMicTranscript(text);
    if (!target || !spoken) return;
    var current = String(target.value || "").trim();
    target.value = current ? current + " " + spoken : spoken;
    try { target.dispatchEvent(new Event("input", { bubbles:true })); } catch(e) {}
    try { target.dispatchEvent(new Event("change", { bubbles:true })); } catch(e) {}
    try { target.focus(); } catch(e) {}
  }
  function clearTimer(){ if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; } }
  function stop(silent){
    clearTimer();
    if (recognition) { try { recognition.stop(); } catch(e) {} }
    listening = false;
    updateBtn();
    if (!silent) setStatus("Mic stopped. Press Send when ready.", false);
  }
  function requestMicPermission(){
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.resolve();
    return navigator.mediaDevices.getUserMedia({ audio:true }).then(function(stream){
      try { stream.getTracks().forEach(function(t){ t.stop(); }); } catch(e) {}
    });
  }
  function beginRecognition(){
    var Ctor = SpeechCtor();
    if (!Ctor) {
      setStatus("Speech input is not supported in this browser. Use Chrome desktop for mic dictation.", false);
      updateBtn();
      return;
    }
    var target = input();
    if (!target) { setStatus("Composer is not ready yet.", false); return; }
    hadResult = false;
    recognition = new Ctor();
    recognition.lang = settings().speechLanguage || "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = function(){
      listening = true;
      updateBtn();
      setStatus("Listening now… speak clearly. Nothing auto-sends.", true);
      clearTimer();
      stopTimer = setTimeout(function(){ if (listening && !hadResult) stop(false); }, 9000);
    };
    recognition.onresult = function(event){
      var interim = "";
      var finalText = "";
      for (var i = event.resultIndex; i < event.results.length; i += 1) {
        var t = event.results[i] && event.results[i][0] ? event.results[i][0].transcript : "";
        if (event.results[i].isFinal) finalText += t;
        else interim += t;
      }
      if (finalText) {
        hadResult = true;
        writeText(finalText);
        setStatus("Mic captured text. Press Send when ready.", false);
      } else if (interim) {
        setStatus("Listening… " + String(interim).replace(/\s+/g," ").trim(), true);
      }
    };
    recognition.onerror = function(event){
      clearTimer();
      listening = false;
      updateBtn();
      var err = event && event.error ? String(event.error) : "unknown";
      if (err === "not-allowed" || err === "service-not-allowed") setStatus("Mic permission is blocked. Click the lock icon in Chrome and allow microphone.", false);
      else if (err === "no-speech") setStatus("No speech detected. Click the mic again and speak after it says Listening.", false);
      else if (err === "audio-capture") setStatus("No microphone was found by the browser.", false);
      else setStatus("Mic input stopped: " + err + ".", false);
    };
    recognition.onend = function(){
      clearTimer();
      listening = false;
      updateBtn();
      if (hadResult) setStatus("Mic captured text. Press Send when ready.", false);
      else setStatus("Mic ready.", false);
    };
    try { recognition.start(); }
    catch(e){ listening = false; updateBtn(); setStatus("Mic could not start. Try clicking again.", false); }
  }
  function start(){
    if (!micEnabled()) { setStatus("Turn Mic input ON in Settings & Voice first.", false); updateBtn(); return; }
    if (listening) { stop(false); return; }
    setStatus("Checking microphone permission…", true);
    requestMicPermission().then(beginRecognition).catch(function(){
      listening = false;
      updateBtn();
      setStatus("Mic permission was denied. Click the lock icon in Chrome and allow microphone.", false);
    });
  }
  function boot(){
    updateBtn();
    document.addEventListener("click", function(e){
      var b = e.target && e.target.closest ? e.target.closest("#simoMicBtn") : null;
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      start();
      return false;
    }, true);
    window.addEventListener("simo:voice-settings-updated", function(){
      if (!micEnabled() && listening) stop(true);
      updateBtn();
    });
    window.SimoMicInput = { phase:"R10.60O", start:start, stop:stop, refresh:updateBtn, supported:function(){ return !!SpeechCtor(); }, normalize:normalizeMicTranscript };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once:true });
  else boot();
})();


/* --------------------------------------------------
   SIMO PHASE 14M-R10.60K — North Star Text Intent Firewall
   Purpose:
   - Text/business/advice prompts must behave like ChatGPT/Grok chat, not visual cards.
   - Design/product prompts still go to the visual design flow.
   - Also removes remaining public "3D / Rotate Workspace" wording from cards.
   Safe scope: script-only. No composer, mic, Library, Workspace, Stripe, login,
   Render, DNS, image-analysis, or simo-ui-recovery changes.
-------------------------------------------------- */
(function simoR1060KNorthStarTextIntentFirewall(){
  if (window.__SIMO_R1060K_NORTH_STAR_TEXT_FIREWALL__) return;
  window.__SIMO_R1060K_NORTH_STAR_TEXT_FIREWALL__ = true;

  var PHASE = "R10.60K_NORTH_STAR_TEXT_INTENT_FIREWALL";
  var sending = false;

  function clean(v){ return String(v || "").toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ").trim(); }
  function esc(v){ return String(v == null ? "" : v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;"); }
  function input(){ return document.getElementById("chatInput") || document.querySelector("textarea, input[type='text']"); }
  function chat(){ return document.getElementById("chatMessages") || document.getElementById("chat") || document.querySelector(".chat-wrap") || document.body; }
  function statusEl(){ return document.getElementById("loadingHint") || document.querySelector("[data-simo-status], .status, .loading-hint"); }
  function setStatus(text, busy){
    var el = statusEl();
    if (!el) return;
    el.textContent = String(text || "Ready.");
    try { el.dataset.simoBusy = busy ? "true" : "false"; } catch(e) {}
  }
  function scrollDown(){
    try {
      var wrap = document.querySelector(".chat-wrap") || chat();
      wrap.scrollTop = wrap.scrollHeight;
    } catch(e) {}
  }
  function addRow(role, html){
    var c = chat();
    var row = document.createElement("div");
    row.className = "msg-row msg-" + role + " simo-r1060k-chat-row";
    row.innerHTML = html;
    c.appendChild(row);
    scrollDown();
    return row;
  }
  function addUser(text){ return addRow("user", '<div class="msg-bubble msg-bubble-user">' + esc(text) + '</div>'); }
  function addAssistant(text){ return addRow("assistant", '<div class="msg-bubble msg-bubble-assistant">' + esc(text) + '</div>'); }
  function removeRow(row){ try { row && row.remove(); } catch(e) {} }

  function explicitVisualIntent(t){
    return /\b(i can design|can design|to design|for me to design|editable design|design card|visual card|open workspace|workspace|save to library)\b/.test(t) ||
      /\b(render|visualize|image|picture|photo|illustration|drawing|mockup|wireframe|prototype|concept art|product concept|design concept|logo|brand identity|book cover|poster|flyer|brochure|menu design|app screen|dashboard mockup|website mockup|landing page mockup)\b/.test(t) ||
      /\b(show me|create|make|design|generate)\s+(a|an|the)?\s*(razor|shaver|spoon|fork|utensil|mug|cup|toaster|grill|flashlight|keyboard|mouse|fire extinguisher|soap dispenser|bottle|rim|wheel|guitar|chair|watch|lamp|product)\b.*\b(design|customize|edit|visual|render|concept)\b/.test(t);
  }

  function textFirstIntent(raw){
    var t = clean(raw);
    if (!t) return false;
    if (explicitVisualIntent(t)) return false;

    var business = /\b(business plan|business idea|startup idea|start up idea|side hustle|business model|marketing plan|sales plan|revenue plan|profit plan|budget|under\s*\$?\d+|less than\s*\$?\d+|for under\s*\$?\d+|low budget|customer|customers|market|niche|pricing|expenses|costs|steps to start|how to start|can start|i can start|start with under|start for under)\b/.test(t);
    var advice = /\b(how do i|how can i|what should i|tell me|explain|write|draft|outline|summarize|give me steps|step by step|plan for|strategy|advice|ideas for|help me figure out|what is|why is|can you help|help me)\b/.test(t);
    var writing = /\b(email|letter|proposal|caption|post|script|bio|resume|cover letter|summary|outline|chapter|story|autobiography|memoir)\b/.test(t);

    // "show me a business plan" means explain/show the plan in chat, not make a product card.
    if (business || advice || writing) return true;
    return false;
  }

  function replyFrom(data){
    if (data == null) return "I’m here. What would you like to do next?";
    if (typeof data === "string") return data;
    return String(data.reply || data.response || data.answer || data.message || data.text || data.content || data.output || "I’m here. What would you like to do next?");
  }

  async function sendChat(text){
    if (sending) return;
    sending = true;
    var target = input();
    if (target) {
      target.value = "";
      try { target.dispatchEvent(new Event("input", { bubbles:true })); } catch(e) {}
    }
    addUser(text);
    var working = addRow("assistant", '<div class="msg-bubble msg-bubble-assistant">Thinking…</div>');
    setStatus("Thinking…", true);
    try {
      var res = await fetch("/api/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, prompt: text, text: text, north_star_intent: "text_chat" })
      });
      var ct = res.headers.get("content-type") || "";
      var data = ct.indexOf("application/json") >= 0 ? await res.json() : await res.text();
      if (!res.ok) throw new Error((data && (data.error || data.message)) || ("Chat failed: " + res.status));
      removeRow(working);
      addAssistant(replyFrom(data));
      setStatus("Ready.", false);
    } catch(err) {
      removeRow(working);
      addAssistant("I understood this as a chat/business-planning question, not a design request. The chat endpoint did not answer cleanly yet: " + (err && err.message ? err.message : err));
      setStatus("Ready.", false);
    } finally {
      sending = false;
    }
  }

  function shouldHandleSendFromEvent(e){
    if (!e || sending) return false;
    var target = e.target;
    var targetInput = input();
    if (e.type === "keydown") {
      if (!targetInput || target !== targetInput) return false;
      if (e.key !== "Enter" || e.shiftKey) return false;
      return textFirstIntent(targetInput.value || "");
    }
    var btn = target && target.closest ? target.closest("#sendBtn, .send-btn, [data-role='send'], button[type='submit']") : null;
    if (!btn || !targetInput) return false;
    return textFirstIntent(targetInput.value || "");
  }

  function capture(e){
    if (!shouldHandleSendFromEvent(e)) return;
    var targetInput = input();
    var text = String(targetInput && targetInput.value || "").trim();
    if (!text) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    sendChat(text);
    return false;
  }

  // Register at document + window capture so this fires before later visual-core listeners.
  document.addEventListener("click", capture, true);
  window.addEventListener("click", capture, true);
  document.addEventListener("keydown", capture, true);
  window.addEventListener("keydown", capture, true);

  function scrub3DWording(){
    try {
      document.querySelectorAll("button, a, [role='button']").forEach(function(el){
        var txt = String(el.textContent || "").replace(/\s+/g," ").trim();
        if (/^3d\s*\/\s*rotate\s*workspace$/i.test(txt) || /^3d\s*rotate\s*workspace$/i.test(txt)) {
          el.textContent = "Open Workspace";
          el.setAttribute("aria-label", "Open Workspace");
          el.title = "Open Workspace";
        }
      });
      document.querySelectorAll(".msg-bubble, .simo-vc-card, section, article, div").forEach(function(el){
        if (!el || !el.childNodes || !el.textContent || el.childNodes.length > 25) return;
        el.childNodes.forEach(function(node){
          if (node.nodeType === 3 && /3D-aware workspace option/i.test(node.nodeValue || "")) {
            node.nodeValue = node.nodeValue.replace(/3D-aware workspace option/gi, "editable workspace option");
          }
        });
      });
    } catch(e) {}
  }
  scrub3DWording();
  setTimeout(scrub3DWording, 250);
  setTimeout(scrub3DWording, 1000);
  new MutationObserver(scrub3DWording).observe(document.documentElement || document.body, { childList:true, subtree:true });

  window.SimoNorthStarIntentFirewall = {
    phase: PHASE,
    textFirstIntent: textFirstIntent,
    explicitVisualIntent: explicitVisualIntent,
    sendChat: sendChat
  };
})();


/* --------------------------------------------------
   SIMO PHASE 14M-R10.60M — North Star Lane Brain + Motivator Panel
   Purpose:
   - Choose the right lane before older visual handlers can grab the prompt.
   - Chat/advice/business/stock prompts -> normal /api/chat.
   - Website/app/dashboard/landing-page build prompts -> Builder lane.
   - Visual/design/mockup/product prompts -> existing Visual/Workspace lane.
   - Refresh the left panel wording so users understand what Simo can do.
   Safe scope: script + sidebar copy only. No simo-ui-recovery, no Library/Workspace
   bridge changes, no Stripe, credits, Render, DNS, login, or image-analysis changes.
-------------------------------------------------- */
(function simoR1060MNorthStarLaneBrain(){
  if (window.__SIMO_R1060M_NORTH_STAR_LANE_BRAIN__) return;
  window.__SIMO_R1060M_NORTH_STAR_LANE_BRAIN__ = true;

  var PHASE = 'R10.60S_FULL_NORTH_STAR_BUILDER_WORKSPACE';
  var sending = false;
  var routeStoreKey = 'simo_north_star_intent_memory_v1';

  function clean(v){ return String(v || '').toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim(); }
  function esc(v){ return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
  function input(){ return document.getElementById('chatInput') || document.querySelector('textarea, input[type="text"]'); }
  function chat(){ return document.getElementById('chatMessages') || document.getElementById('chat') || document.querySelector('.chat-wrap') || document.body; }
  function statusEl(){ return document.getElementById('loadingHint') || document.querySelector('[data-simo-status], .status, .loading-hint'); }
  function setStatus(text, busy){ var el=statusEl(); if(el){ el.textContent=String(text||'Ready.'); try{el.dataset.simoBusy=busy?'true':'false';}catch(e){} } }
  function scrollDown(){ try{ var wrap=document.querySelector('.chat-wrap') || chat(); wrap.scrollTop=wrap.scrollHeight; }catch(e){} }
  function addRow(role, html){ var c=chat(); var row=document.createElement('div'); row.className='msg-row msg-'+role+' simo-r1060m-row'; row.innerHTML=html; c.appendChild(row); scrollDown(); return row; }
  function addUser(text){ return addRow('user','<div class="msg-bubble msg-bubble-user">'+esc(text)+'</div>'); }
  function addAssistant(text){ return addRow('assistant','<div class="msg-bubble msg-bubble-assistant">'+esc(text)+'</div>'); }
  function removeRow(row){ try{ row && row.remove(); }catch(e){} }

  function rememberRoute(prompt, lane){
    try{
      var list = JSON.parse(localStorage.getItem(routeStoreKey) || '[]');
      if (!Array.isArray(list)) list = [];
      list.unshift({ prompt:String(prompt||'').slice(0,300), lane:lane, at:new Date().toISOString(), phase:PHASE });
      localStorage.setItem(routeStoreKey, JSON.stringify(list.slice(0,30)));
    }catch(e){}
  }

  function explicitVisualIntent(t){
    return /\b(i can design|can design|to design|for me to design|editable design|design card|visual card|open workspace|workspace|save to library)\b/.test(t) ||
      /\b(render|visualize|image|picture|photo|illustration|drawing|mockup|wireframe|prototype|concept art|product concept|design concept|logo|brand identity|book cover|poster|flyer|brochure|menu design|app screen|dashboard mockup|website mockup|landing page mockup|ui mockup|visual concept)\b/.test(t) ||
      /\b(show me|create|make|design|generate)\s+(a|an|the)?\s*(razor|shaver|spoon|fork|utensil|mug|cup|toaster|grill|flashlight|keyboard|mouse|fire extinguisher|soap dispenser|bottle|rim|wheel|guitar|chair|watch|lamp|product)\b.*\b(design|customize|edit|visual|render|concept)\b/.test(t);
  }

  function isTextLane(raw){
    var t = clean(raw);
    if (!t) return false;
    if (explicitVisualIntent(t)) return false;

    var business = /\b(business plan|business idea|startup idea|start up idea|side hustle|business model|marketing plan|sales plan|revenue plan|profit plan|budget|under\s*\$?\d+|less than\s*\$?\d+|for under\s*\$?\d+|low budget|customer|customers|market|niche|pricing|expenses|costs|steps to start|how to start|can start|i can start|start with under|start for under)\b/.test(t);
    var stocks = /\b(stock market|stocks?|portfolio|portfolios|watchlist|dividend|etf|index fund|retirement|investing|investment|risk tolerance|asset allocation|brokerage|shares?|crypto|cryptocurrency|bitcoin|ethereum|coinbase|binance|wallet|blockchain)\b/.test(t);
    var advice = /\b(how do i|how can i|what should i|tell me|explain|write|draft|outline|summarize|give me steps|step by step|plan for|strategy|advice|ideas for|help me figure out|what is|why is|can you help|help me)\b/.test(t);
    var writing = /\b(email|letter|proposal|caption|post|script|bio|resume|cover letter|summary|outline|chapter|story|autobiography|memoir)\b/.test(t);

    return !!(business || stocks || advice || writing);
  }

  function isBuilderLane(raw){
    var t = clean(raw);
    if (!t) return false;

    // R10.60S: whole-prompt Website/App Builder lane.
    // Digital creation wins even when the prompt contains business-context words like "home".
    var digitalAsset = /\b(website|web site|landing page|homepage|home page|webpage|web page|sales page|squeeze page|portfolio site|business site|ecommerce site|e-commerce site|online store|shop page|app|web app|mobile app|dashboard|saas|portal|booking page|checkout page|pricing page|contact page|web tool|software page)\b/.test(t);
    var buildVerb = /\b(build|create|make|generate|design|show me|can you show me|can you build|can you create|i need|i want|put together|draft|start|make me|build me)\b/.test(t);
    var builderEdit = /\b(hero|cta|button|buttons|services|products|pricing|contact form|testimonials|gallery|media|photo|picture|image|video|social|social media|instagram|facebook|tiktok|youtube|colors|theme|mobile|seo|domain|publish|go public|download html|copy html|launch)\b/.test(t);
    try {
      if (builderEdit && window.__SIMO_R1060L_BUILDER_STORE__ && Object.keys(window.__SIMO_R1060L_BUILDER_STORE__).length) return true;
    } catch(e) {}

    if (/\b(business plan|startup plan|side hustle plan|marketing plan|sales plan|budget plan)\b/.test(t) && !digitalAsset) return false;
    return !!(digitalAsset && (buildVerb || builderEdit));
  }

  function laneFor(raw){
    if (isBuilderLane(raw)) return 'builder';
    if (isTextLane(raw)) return 'chat';
    return 'pass';
  }

  function replyFrom(data){
    if (data == null) return 'I’m here. What would you like to do next?';
    if (typeof data === 'string') return data;
    return String(data.reply || data.response || data.answer || data.message || data.text || data.content || data.output || 'I’m here. What would you like to do next?');
  }

  async function sendChat(text){
    if (sending) return;
    sending = true;
    var target = input();
    if (target) { target.value=''; try{ target.dispatchEvent(new Event('input',{bubbles:true})); }catch(e){} }
    addUser(text);
    var working = addRow('assistant','<div class="msg-bubble msg-bubble-assistant">Thinking…</div>');
    setStatus('Thinking…', true);
    rememberRoute(text, 'chat');
    try{
      var res = await fetch('/api/chat', {
        method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ message:text, prompt:text, text:text, north_star_intent:'chat_text_business_stock' })
      });
      var ct = res.headers.get('content-type') || '';
      var data = ct.indexOf('application/json') >= 0 ? await res.json() : await res.text();
      if (!res.ok) throw new Error((data && (data.error || data.message)) || ('Chat failed: '+res.status));
      removeRow(working); addAssistant(replyFrom(data)); setStatus('Ready.', false);
    }catch(err){
      removeRow(working);
      addAssistant('I understood this as a chat/business/stock question, not a design request. The chat endpoint did not answer cleanly yet: ' + (err && err.message ? err.message : err));
      setStatus('Ready.', false);
    }finally{ sending = false; }
  }

  function runBuilder(text){
    if (window.SimoVisualCore && typeof window.SimoVisualCore.runBuilder === 'function') {
      rememberRoute(text, 'builder');
      window.SimoVisualCore.runBuilder(text);
      return true;
    }
    return false;
  }

  function getSendButtonFromEvent(e){
    var target = e && e.target;
    if (!target || !target.closest) return null;
    return target.closest('#sendBtn, .send-btn, [data-role="send"], button[type="submit"]');
  }

  function handleRoute(e){
    if (!e || sending) return;
    var targetInput = input();
    var isEnter = e.type === 'keydown' && targetInput && e.target === targetInput && e.key === 'Enter' && !e.shiftKey;
    var isSend = e.type === 'click' && !!getSendButtonFromEvent(e);
    if (!isEnter && !isSend) return;

    var text = String(targetInput && targetInput.value || '').trim();
    if (!text) return;
    var lane = laneFor(text);
    if (lane === 'pass') return;

    e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    if (lane === 'builder') { if (targetInput) { targetInput.value=''; try{targetInput.dispatchEvent(new Event('input',{bubbles:true}));}catch(err){} } runBuilder(text); return; }
    if (lane === 'chat') { sendChat(text); return; }
  }

  function updateSidePanelCopy(){
    try{
      var cards = Array.prototype.slice.call(document.querySelectorAll('.side-card'));
      function setCard(match, title, body){
        var card = cards.find(function(c){ return clean(c.textContent).indexOf(clean(match)) >= 0; });
        if (!card) return;
        var bold = card.querySelector('div[style*="font-weight"]') || card.querySelector('div');
        var muted = card.querySelector('.muted');
        if (bold) bold.textContent = title;
        if (muted) muted.textContent = body;
      }
      setCard('Image Upload', 'Image Upload & Analysis', 'Upload a photo — Simo can describe it, explain it, and help you use it.');
      setCard('Business Plans', 'Business Plans & Startups', 'Ask for ideas, steps, budgets, pricing, and launch plans.');
      setCard('Stock Market', 'Money & Markets — Ask Simo', 'Stocks, crypto, portfolios, risks, and market explanations only when the user asks.');
      setCard('AI Website Builder', 'Website & App Builder', 'Build, edit, save, download, publish, and get domain guidance for sites and apps.');
      setCard('Builder Library', 'Builder Library', 'Save, reopen, and continue exact designs, pages, and workspace builds.');
    }catch(e){ console.warn('Simo '+PHASE+' side panel update skipped:', e); }
  }

  window.addEventListener('click', handleRoute, true);
  window.addEventListener('keydown', handleRoute, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', updateSidePanelCopy, {once:true});
  else updateSidePanelCopy();

  window.SimoNorthStarLaneBrain = { phase:PHASE, laneFor:laneFor, isBuilderLane:isBuilderLane, isTextLane:isTextLane, refreshPanel:updateSidePanelCopy };
  console.log('SIMO '+PHASE+' loaded.');
})();

/* --------------------------------------------------
   SIMO PHASE 14M-R10.60Z — NORTH STAR BUILDER CTA SIMPLE PASS

   Goal:
   - Keep website/app prompts in Website & App Builder.
   - Hide old public Design Studio/3D entry points.
   - Keep mic visible.
   - Make CTA behavior obvious:
     Request a Quote opens a quote modal/form immediately.
     See Packages/Services scrolls to the right section.
   - Keep users out of SIMO dashboard when clicking generated website buttons.

   Scope: static/script.js only.
-------------------------------------------------- */
(function simoR1060ZNorthStarBuilderCtaSimplePass(){
  "use strict";
  if (window.__SIMO_R1060Z_NORTH_STAR_BUILDER_CTA_SIMPLE__) return;
  window.__SIMO_R1060Z_NORTH_STAR_BUILDER_CTA_SIMPLE__ = true;

  var PHASE = "R10.60Z2_QUOTE_TEST_MODE_MODAL_POLISH";

  function clean(v){ return String(v || "").toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ").trim(); }
  function esc(v){
    return String(v == null ? "" : v)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  }
  function input(){ return document.getElementById("chatInput") || document.querySelector("textarea, input[type='text']"); }

  function isBuilderPrompt(raw){
    var t = clean(raw);
    if (!t) return false;

    var digitalAsset =
      /\b(website|web site|landing page|homepage|home page|webpage|web page|sales page|squeeze page|portfolio site|business site|ecommerce site|e commerce site|online store|shop page|storefront page|web app|mobile app|dashboard|saas|portal|booking page|checkout page|pricing page|contact page|web tool|software page)\b/.test(t);

    var appWord = /\b(app|application)\b/.test(t) && /\b(build|create|make|generate|design|show me|i need|i want|dashboard|screen|web|mobile|software|tool|portal)\b/.test(t);
    var buildVerb = /\b(build|create|make|generate|design|show me|can you show me|can you build|can you create|i need|i want|put together|draft|start|make me|build me)\b/.test(t);
    var builderEdit = /\b(hero|cta|button|buttons|quote form|booking form|contact form|services|packages|products|pricing|testimonials|gallery|media|photo|picture|image|video|social|social media|instagram|facebook|tiktok|youtube|colors|theme|mobile|seo|domain|publish|download html|copy html|launch|request a quote|see deals|see packages)\b/.test(t);

    try {
      if (builderEdit && window.__SIMO_R1060L_BUILDER_STORE__ && Object.keys(window.__SIMO_R1060L_BUILDER_STORE__).length) return true;
    } catch(e) {}

    if (/\b(business plan|startup plan|side hustle plan|marketing plan|sales plan|budget plan)\b/.test(t) && !(digitalAsset || appWord)) return false;
    return !!((digitalAsset || appWord) && (buildVerb || builderEdit));
  }

  function hideOldDesignStudio(){
    try {
      document.querySelectorAll("button, a, [role='button'], .side-card, .chip").forEach(function(el){
        var t = clean(el.textContent || el.value || el.getAttribute("aria-label") || el.title || "");
        if (
          t === "design studio" ||
          t === "3d rendering & rotate" ||
          t === "3d viewer" ||
          t.indexOf("3d rendering") >= 0 ||
          t.indexOf("3d rotate") >= 0 ||
          t.indexOf("3d viewer") >= 0
        ) {
          el.dataset.simoR1060zHidden = "true";
          el.style.display = "none";
          el.setAttribute("aria-hidden", "true");
        }
      });
    } catch(e) {}
  }

  function ensureMicButton(){
    try {
      var target = input();
      if (!target) return;

      var btn = document.getElementById("simoMicBtn") || document.querySelector("[data-simo-mic-button]");
      if (!btn) btn = document.createElement("button");

      if (!btn.parentElement) {
        btn.id = "simoMicBtn";
        btn.type = "button";
        btn.textContent = "🎙";
        btn.title = "Talk to Simo";
        btn.setAttribute("aria-label", "Talk to Simo");
        btn.setAttribute("data-simo-mic-button", "true");
        (target.parentElement || document.body).appendChild(btn);
      }

      btn.classList.remove("hidden");
      btn.style.display = "inline-flex";
      btn.style.alignItems = "center";
      btn.style.justifyContent = "center";
      btn.style.width = "34px";
      btn.style.height = "34px";
      btn.style.minWidth = "34px";
      btn.style.borderRadius = "999px";
      btn.style.border = "1px solid rgba(255,255,255,.18)";
      btn.style.background = "rgba(255,255,255,.08)";
      btn.style.color = "#eef4ff";
      btn.style.cursor = "pointer";
      btn.style.marginLeft = "8px";
      btn.removeAttribute("aria-hidden");

      if (btn.dataset.simoR1060zMicBound === "true") return;
      btn.dataset.simoR1060zMicBound = "true";

      btn.addEventListener("click", function(e){
        e.preventDefault();
        e.stopPropagation();

        var SpeechCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechCtor) {
          alert("Mic dictation is not available in this browser. You can still type to Simo.");
          return false;
        }

        var rec = new SpeechCtor();
        rec.lang = "en-US";
        rec.interimResults = false;
        rec.maxAlternatives = 1;

        btn.textContent = "●";
        btn.style.background = "rgba(86,240,169,.18)";

        rec.onresult = function(ev){
          var said = ev && ev.results && ev.results[0] && ev.results[0][0] ? ev.results[0][0].transcript : "";
          var box = input();
          if (box && said) {
            box.value = said;
            try { box.dispatchEvent(new Event("input", { bubbles:true })); } catch(err) {}
            try { box.focus(); } catch(err2) {}
          }
        };
        rec.onerror = function(){ btn.textContent = "🎙"; btn.style.background = "rgba(255,255,255,.08)"; };
        rec.onend = function(){ btn.textContent = "🎙"; btn.style.background = "rgba(255,255,255,.08)"; };

        try { rec.start(); } catch(err) {
          btn.textContent = "🎙";
          btn.style.background = "rgba(255,255,255,.08)";
        }
        return false;
      }, true);
    } catch(e) {}
  }

  function getBuilderStore(){
    window.__SIMO_R1060L_BUILDER_STORE__ = window.__SIMO_R1060L_BUILDER_STORE__ || {};
    return window.__SIMO_R1060L_BUILDER_STORE__;
  }

  function targetFromLabel(label){
    var t = clean(label);
    if (/deal|offer|special|discount|promo|package|pricing|price/.test(t)) return "deals";
    if (/service|learn|more|feature|product/.test(t)) return "features";
    if (/quote|estimate|book|booking|schedule|get started|contact|call|message|request/.test(t)) return "quote";
    return "quote";
  }

  function simoPreviewScript(){
    return '<script id="simo-builder-cta-script">\
(function(){\
  function clean(v){return String(v||"").toLowerCase().replace(/[_-]+/g," ").replace(/\\s+/g," ").trim();}\
  function byId(id){return document.getElementById(id);}\
  function targetFromLabel(label){var t=clean(label);if(/deal|offer|special|discount|promo|package|pricing|price/.test(t))return"deals";if(/service|learn|more|feature|product/.test(t))return"features";if(/quote|estimate|book|booking|schedule|get started|contact|call|message|request/.test(t))return"quote";return"quote";}\
  function openQuote(){var m=byId("simo-quote-modal");if(m){m.style.display="flex";m.setAttribute("aria-hidden","false");var first=m.querySelector("input,textarea,button");try{first&&first.focus();}catch(e){}return;}var q=byId("quote")||byId("contact");if(q){q.scrollIntoView({behavior:"smooth",block:"start"});q.classList.add("simo-target-flash");setTimeout(function(){q.classList.remove("simo-target-flash");},900);}}\
  function go(target){if(target==="quote"){openQuote();return;}var el=byId(target)||byId("features")||byId("quote");if(el){el.scrollIntoView({behavior:"smooth",block:"start"});el.classList.add("simo-target-flash");setTimeout(function(){el.classList.remove("simo-target-flash");},900);}}\
  document.addEventListener("keydown",function(e){if(e.key==="Escape"){var m=byId("simo-quote-modal");if(m){m.style.display="none";m.setAttribute("aria-hidden","true");}}},true);document.addEventListener("click",function(e){var modal=byId("simo-quote-modal");if(modal&&e.target===modal){e.preventDefault();modal.style.display="none";modal.setAttribute("aria-hidden","true");return;}var hit=e.target&&e.target.closest?e.target.closest("a,button,[role=button]"):null;if(!hit)return;if(hit.hasAttribute("data-simo-close-quote")){e.preventDefault();var m=byId("simo-quote-modal");if(m){m.style.display="none";m.setAttribute("aria-hidden","true");}return;}var target=hit.getAttribute("data-simo-target")||targetFromLabel(hit.textContent||hit.value||hit.getAttribute("aria-label")||"");if(!target)return;e.preventDefault();e.stopPropagation();go(target);},true);\
  document.addEventListener("submit",function(e){var form=e.target&&e.target.closest?e.target.closest("[data-simo-preview-form]"):null;if(!form)return;e.preventDefault();var note=byId("simo-form-preview-note");var message="Test received — nothing was actually sent. When published, connect this form to email, CRM, or Simo’s form handler.";if(note){note.textContent=message;note.style.display="block";note.setAttribute("role","status");note.setAttribute("aria-live","polite");}else{alert(message);}},true);\
})();\
<\/script>';
  }

  function quoteModalHtml(){
    return '<div id="simo-quote-modal" aria-hidden="true" style="display:none;position:fixed;inset:0;z-index:9999;align-items:center;justify-content:center;background:rgba(15,23,42,.58);padding:22px;">\
  <div style="width:min(560px,96vw);background:#fff;color:#101827;border-radius:26px;padding:24px;box-shadow:0 30px 90px rgba(15,23,42,.32);position:relative;">\
    <button type="button" data-simo-close-quote style="position:sticky;top:0;float:right;border:0;background:#111827;color:#fff;border-radius:999px;padding:10px 14px;cursor:pointer;font-weight:900;z-index:2;">Close Test ×</button>\
    <div style="display:inline-flex;border-radius:999px;background:#dbeafe;color:#1d4ed8;padding:8px 11px;font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;">Quote Form Test Mode</div>\
    <h2 style="margin:12px 0 8px;font-size:30px;letter-spacing:-.03em;">This is a preview. Nothing will be sent.</h2>\
    <p style="margin:0 0 14px;color:#536170;line-height:1.55;">Fill this out to test the button behavior. When published, connect it to email, CRM, or Simo’s form handler.</p>\
    <form class="quote-form" data-simo-preview-form>\
      <input name="name" placeholder="Name" />\
      <input name="phone" placeholder="Phone" />\
      <input name="email" placeholder="Email" />\
      <input name="vehicle" placeholder="Vehicle type" />\
      <textarea name="message" placeholder="What service do you need?"></textarea>\
      <button class="btn" type="submit">Send Quote Request</button>\
    </form>\
    <div id="simo-form-preview-note" role="status" aria-live="polite" style="display:none;margin-top:12px;border-radius:14px;background:#ecfdf5;color:#065f46;padding:12px;font-weight:800;line-height:1.45;"></div>\
    <button type="button" data-simo-close-quote class="btn secondary" style="margin-top:14px;width:100%;">Back to website preview</button>\
  </div>\
</div>';
  }

  function helperHtml(){
    return '<section id="simo-button-helper" class="section" style="padding-top:8px;padding-bottom:22px;">\
  <div class="card" style="border:2px solid #bfdbfe;background:#ffffff;">\
    <div class="eyebrow">Button setup is already connected</div>\
    <h2 style="margin:10px 0 8px;font-size:28px;letter-spacing:-.03em;">Open a safe quote form test.</h2>\
    <p>Click <strong>Open Quote Form Test</strong>. A clear test-mode panel opens, and nothing is actually sent.</p>\
    <div class="actions" style="margin-top:16px"><a class="btn" href="#quote" data-simo-page-cta data-simo-target="quote">Open Quote Form Test</a><a class="btn secondary" href="#deals" data-simo-page-cta data-simo-target="deals">See Packages</a></div>\
  </div>\
</section>';
  }

  function hardenHtml(html){
    var out = String(html || "");
    if (!out) return out;

    out = out
      .replace(/See Computer Deals/g, "See Packages")
      .replace(/Computer Deals/g, "Packages")
      .replace(/>Get Started<\/a>/g, ">Request a Quote</a>")
      .replace(/>See Services<\/a>/g, ">See Packages</a>")
      .replace(/href=["']\/["']/gi, 'href="#quote" data-simo-page-cta data-simo-target="quote"')
      .replace(/href=["']#["']/gi, 'href="#quote" data-simo-page-cta data-simo-target="quote"');

    out = out.replace(/<a\b([^>]*?)href=["'][^"']*["']([^>]*?)>([\s\S]*?)<\/a>/gi, function(full, before, after, label){
      var plain = clean(String(label).replace(/<[^>]+>/g," "));
      if (!/(request|quote|estimate|book|booking|schedule|get started|contact|call|message|deal|deals|offer|packages|services|learn more|see services|see packages|pricing|price)/.test(plain)) return full;
      var target = targetFromLabel(plain);
      var text = label;
      if (/computer deal/.test(plain)) text = "See Packages";
      if (/get started/.test(plain)) text = "Request a Quote";
      return '<a' + before + 'href="#' + target + '" data-simo-page-cta data-simo-target="' + target + '"' + after + '>' + text + '</a>';
    });

    if (out.indexOf('id="simo-button-helper"') < 0) {
      out = out.replace(/<\/section>\s*<section id="features"/i, '</section>' + helperHtml() + '<section id="features"');
    }

    if (out.indexOf('id="simo-quote-modal"') < 0) {
      out = out.replace(/<\/body>/i, quoteModalHtml() + '\n</body>');
    }

    if (out.indexOf('id="simo-builder-cta-script"') < 0) {
      out = out.replace(/<\/body>/i, simoPreviewScript() + '\n</body>');
    }

    if (out.indexOf('.simo-target-flash') < 0) {
      out = out.replace(/<\/style>/i, '.simo-target-flash{outline:3px solid rgba(37,99,235,.25);outline-offset:6px;transition:outline .25s ease}\n</style>');
    }

    return out;
  }

  function hardenProject(card){
    try {
      if (!card) return;
      var id = card.getAttribute && card.getAttribute("data-simo-builder-id");
      var project = id ? getBuilderStore()[id] : null;
      if (project && project.html) project.html = hardenHtml(project.html);
      var iframe = card.querySelector && card.querySelector('[data-simo-builder-preview], iframe');
      if (iframe && iframe.srcdoc) iframe.srcdoc = hardenHtml(iframe.srcdoc);

      var status = card.querySelector && card.querySelector("[data-simo-builder-status]");
      if (status && !status.dataset.simoR1060zStatus) {
        status.dataset.simoR1060zStatus = "true";
        status.textContent = "Button behavior is connected: Request a Quote opens a clear test-mode quote panel. Send Quote Request confirms that nothing was sent.";
      }
    } catch(e) {}
  }

  function hardenAllBuilderCards(){
    try { document.querySelectorAll(".simo-builder-card, [data-simo-builder-id]").forEach(hardenProject); } catch(e) {}
  }

  function patchVisualCore(){
    try {
      if (!window.SimoVisualCore || window.SimoVisualCore.__R1060Z_BUILDER_PATCHED__) return;
      var core = window.SimoVisualCore;
      var originalRun = typeof core.run === "function" ? core.run.bind(core) : null;

      core.run = function(text, action){
        if (isBuilderPrompt(text) && typeof core.runBuilder === "function") {
          var result = core.runBuilder(text);
          setTimeout(hardenAllBuilderCards, 0);
          setTimeout(hardenAllBuilderCards, 150);
          setTimeout(hardenAllBuilderCards, 700);
          return result;
        }
        return originalRun ? originalRun(text, action) : undefined;
      };

      core.__R1060Z_BUILDER_PATCHED__ = true;
    } catch(e) {}
  }

  document.addEventListener("click", function(e){
    var hit = e.target && e.target.closest ? e.target.closest("button, a, [role='button']") : null;
    if (!hit) return;

    var card = hit.closest && hit.closest(".simo-builder-card, [data-simo-builder-id]");
    if (!card) return;

    hardenProject(card);

    if (hit.hasAttribute("data-simo-builder-action") || hit.closest("[data-simo-builder-editor-panel]")) return;

    var txt = String(hit.textContent || hit.value || hit.getAttribute("aria-label") || hit.title || "");
    if (!/\b(request|quote|estimate|book|booking|schedule|deal|deals|offer|package|packages|contact|call|pricing|price|learn more|see services|see packages|get started)\b/i.test(txt)) return;

    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();

    var target = targetFromLabel(txt);
    try {
      var iframe = card.querySelector('[data-simo-builder-preview], iframe');
      var doc = iframe && iframe.contentDocument;
      if (!doc) return false;

      if (target === "quote") {
        var modal = doc.getElementById("simo-quote-modal");
        if (modal) {
          modal.style.display = "flex";
          modal.setAttribute("aria-hidden", "false");
          var first = modal.querySelector("input,textarea,button");
          try { first && first.focus(); } catch(e1) {}
          return false;
        }
      }

      var el = doc.getElementById(target) || doc.getElementById("quote") || doc.getElementById("contact");
      if (el) {
        el.scrollIntoView({ behavior:"smooth", block:"start" });
        try {
          el.classList.add("simo-target-flash");
          setTimeout(function(){ try { el.classList.remove("simo-target-flash"); } catch(e2) {} }, 900);
        } catch(e3) {}
      }
    } catch(err) {}
    return false;
  }, true);

  function runAll(){
    hideOldDesignStudio();
    ensureMicButton();
    patchVisualCore();
    hardenAllBuilderCards();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runAll, { once:true });
  } else {
    runAll();
  }

  setTimeout(runAll, 100);
  setTimeout(runAll, 400);
  setTimeout(runAll, 1000);
  setTimeout(runAll, 2500);

  try {
    new MutationObserver(runAll).observe(document.documentElement || document.body, { childList:true, subtree:true });
  } catch(e) {}

  window.SimoR1060ZNorthStarBuilderCta = { phase: PHASE, testModeConfirmation: true, isBuilderPrompt:isBuilderPrompt, hardenHtml:hardenHtml, run:runAll };
  console.log("SIMO " + PHASE + " loaded.");
})();

