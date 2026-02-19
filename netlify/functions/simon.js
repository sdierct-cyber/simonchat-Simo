// netlify/functions/simon.js
// Simo backend: stable JSON, supports GET/POST/OPTIONS,
// deterministic landing-page preview + simple edit commands,
// optional OpenAI chat for non-preview conversations.
//
// IMPORTANT UI SAFETY:
// - For AI errors, we return ok:true with fallback text (NOT ok:false),
//   so chat.js never "bails" and the UI/buttons keep working.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";

function json(statusCode, obj, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": ALLOW_ORIGIN,
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
      "cache-control": "no-store",
      ...extraHeaders,
    },
    body: JSON.stringify(obj),
  };
}

function safeParseJSON(str) {
  try { return JSON.parse(str); } catch { return null; }
}
function norm(s) { return String(s || "").trim(); }
function lower(s) { return norm(s).toLowerCase(); }

function isPreviewAsk(t) {
  const x = lower(t);
  return (
    x.includes("landing page") ||
    x.includes("marketing page") ||
    x.includes("show me a preview") ||
    x.includes("show a preview") ||
    x.startsWith("preview") ||
    x.startsWith("build a landing page") ||
    x.startsWith("generate the simo marketing page") ||
    x.includes("make a landing page") ||
    x.includes("create a landing page")
  );
}

function isEditCommand(t) {
  const x = lower(t);
  return (
    x.startsWith("headline:") ||
    x.startsWith("cta:") ||
    x.startsWith("title:") ||
    x.startsWith("brand:") ||
    x.startsWith("price:") ||
    x === "add faq" ||
    x === "remove faq" ||
    x === "add pricing" ||
    x === "remove pricing" ||
    x === "add testimonials" ||
    x === "remove testimonials" ||
    x === "add benefits" ||
    x === "remove benefits"
  );
}

// Mode detection: keeps Simo from repeating preview instructions when venting/solving.
function detectMode(text, conversation) {
  const t = lower(text);

  if (t.includes("venting")) return "venting";
  if (t.includes("solving")) return "solving";
  if (t.includes("building")) return "building";
  if (t.includes("switch topics") || t.includes("switch topic")) return "neutral";

  const ventHits = [
    "stressed", "anxious", "depressed", "sad", "tired", "overwhelmed",
    "argument", "fighting", "wife", "husband", "relationship", "ann",
    "mad", "upset", "hurt", "lonely"
  ];
  const solveHits = [
    "error", "bug", "fix", "debug", "issue", "not working", "broken",
    "deploy", "netlify", "function", "500", "403", "cors", "console"
  ];
  const buildHits = [
    "build", "make", "create", "design", "landing page", "website",
    "app", "mockup", "preview", "ui", "layout"
  ];

  const hasAny = (arr) => arr.some((k) => t.includes(k));
  if (hasAny(ventHits)) return "venting";
  if (hasAny(solveHits)) return "solving";
  if (hasAny(buildHits)) return "building";

  // fallback to recent marker in history (if any)
  if (Array.isArray(conversation)) {
    for (let i = conversation.length - 1; i >= 0; i--) {
      const c = lower(conversation[i]?.content || "");
      if (!c) continue;
      if (c.includes("mode: venting")) return "venting";
      if (c.includes("mode: solving")) return "solving";
      if (c.includes("mode: building")) return "building";
    }
  }
  return "neutral";
}

function extractTopic(text) {
  const t = lower(text);
  const m =
    t.match(/landing page for (a|an)\s+(.+?)(\.|$)/i) ||
    t.match(/page for (a|an)\s+(.+?)(\.|$)/i) ||
    t.match(/for (a|an)\s+(.+?)(\.|$)/i);
  if (m && m[2]) return norm(m[2]).replace(/\.$/, "");
  if (norm(text).length <= 40) return norm(text);
  return "your offer";
}

function pickBrand(text, fallback = "Simo") {
  const m = norm(text).match(/^brand:\s*(.+)$/i);
  if (m && m[1]) return norm(m[1]).slice(0, 40);
  return fallback;
}

function pickHeadline(topic, brand) {
  if (!topic || topic.toLowerCase() === "your offer") return `${brand} — made simple`;
  return `${topic} — made simple`;
}

function sanitizeText(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function moneyFromText(text, fallback = "$19") {
  const m = norm(text).match(/^price:\s*(.+)$/i);
  if (!m) return fallback;
  let v = norm(m[1]);
  if (!v) return fallback;
  if (/^\d+(\.\d+)?$/.test(v)) v = `$${v}`;
  return v;
}

function toggleSection(html, id, wantOn) {
  if (typeof html !== "string") return html;
  const start = `<!--section:${id}:start-->`;
  const end = `<!--section:${id}:end-->`;
  const si = html.indexOf(start);
  const ei = html.indexOf(end);
  if (si === -1 || ei === -1 || ei <= si) return html;

  const block = html.slice(si, ei + end.length);
  const isHidden = block.includes(`data-hidden="true"`);

  if (wantOn && isHidden) return html.replace(block, block.replace(`data-hidden="true"`, `data-hidden="false"`));
  if (!wantOn && !isHidden) return html.replace(block, block.replace(`data-hidden="false"`, `data-hidden="true"`));
  return html;
}

function setTextInHtml(html, markerId, newText) {
  const safe = sanitizeText(newText);
  const re = new RegExp(`(data-field="${markerId}"[^>]*>)([\\s\\S]*?)(</)`, "i");
  return html.replace(re, `$1${safe}$3`);
}

function setCtaInHtml(html, which, newText) {
  const safe = sanitizeText(newText);
  const re = new RegExp(`(data-cta="${which}"[^>]*>)([\\s\\S]*?)(</)`, "i");
  return html.replace(re, `$1${safe}$3`);
}

function setPriceInHtml(html, newPrice) {
  const safe = sanitizeText(newPrice);
  const re = new RegExp(`(data-field="price"[^>]*>)([\\s\\S]*?)(</)`, "i");
  return html.replace(re, `$1${safe}$3`);
}

function baseLandingTemplate({ brand, topic, headline, cta1, cta2, price }) {
  const B = sanitizeText(brand);
  const T = sanitizeText(topic);
  const H = sanitizeText(headline);
  const C1 = sanitizeText(cta1);
  const C2 = sanitizeText(cta2);
  const P = sanitizeText(price);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="dark" />
<title>${B} — Landing Page</title>
<style>
  :root{
    --bg:#0b1020; --text:#eaf0ff; --muted:#a9b6d3;
    --line:rgba(255,255,255,.12);
    --blue:#2a66ff; --blue2:#1f4dd6;
    --pro:#39ff7a;
    --shadow: 0 12px 28px rgba(0,0,0,.35);
  }
  *{box-sizing:border-box}
  html,body{height:100%}
  body{
    margin:0;
    font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
    background: radial-gradient(1200px 700px at 20% 0%, #162a66 0%, var(--bg) 55%);
    color:var(--text);
  }
  .wrap{max-width:980px;margin:0 auto;padding:22px}
  .top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:6px 0 18px}
  .brand{display:flex;align-items:center;gap:10px;font-weight:900}
  .dot{width:10px;height:10px;border-radius:99px;background:var(--pro);box-shadow:0 0 18px rgba(57,255,122,.6)}
  .tag{font-size:12px;color:var(--muted);font-weight:800}
  .hero{
    border:1px solid var(--line);
    border-radius:22px;
    background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(0,0,0,.18));
    box-shadow:var(--shadow);
    padding:22px;
  }
  h1{margin:8px 0 10px;font-size:54px;line-height:1.02;letter-spacing:-.02em}
  p{color:var(--muted);font-weight:700;line-height:1.5;font-size:16px}
  .ctaRow{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
  .btn{
    display:inline-flex;align-items:center;justify-content:center;
    padding:12px 14px;border-radius:14px;font-weight:950;
    border:1px solid rgba(255,255,255,.16);
    background:rgba(255,255,255,.06);
    color:var(--text);text-decoration:none;
  }
  .btn.primary{
    border-color:rgba(57,255,122,.25);
    background:rgba(57,255,122,.14);
    box-shadow:0 10px 20px rgba(0,0,0,.25);
  }
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
  @media (max-width:860px){h1{font-size:44px}.grid{grid-template-columns:1fr}}
  .card{
    border:1px solid var(--line);
    border-radius:18px;
    background:rgba(0,0,0,.18);
    padding:16px;
  }
  .card h3{margin:0 0 6px;font-size:18px}
  .card p{margin:0}
  [data-hidden="true"]{display:none !important;}
  .sectionTitle{font-size:18px;font-weight:950;margin:22px 0 10px}
  .list{display:grid;gap:10px}
  .pill{
    border:1px solid var(--line); border-radius:14px;
    padding:12px;background:rgba(255,255,255,.04);
    font-weight:800;color:var(--text);
  }
  .priceBox{
    display:flex;align-items:flex-end;justify-content:space-between;gap:10px;
    padding:16px;border-radius:18px;border:1px solid rgba(57,255,122,.25);
    background:rgba(57,255,122,.10);
  }
  .price{font-size:34px;font-weight:1000;letter-spacing:-.02em;}
  .small{font-size:12px;color:var(--muted);font-weight:850}
</style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div class="brand"><span class="dot"></span> <span data-field="brand">${B}</span></div>
      <div class="tag">Deterministic landing page • topic: <span data-field="topic">${T}</span></div>
    </div>

    <div class="hero">
      <div class="tag">Simo Preview</div>
      <h1 data-field="headline">${H}</h1>
      <p data-field="subhead">A clean landing page you can export as HTML. Ask me to change sections, CTA, or copy.</p>

      <div class="ctaRow">
        <a class="btn primary" href="#" data-cta="primary">${C1}</a>
        <a class="btn" href="#" data-cta="secondary">${C2}</a>
      </div>

      <div class="grid" style="margin-top:18px">
        <div class="card"><h3>Fast</h3><p>Clean structure that converts.</p></div>
        <div class="card"><h3>Clear</h3><p>Headline → value → call-to-action.</p></div>
      </div>
    </div>

    <!--section:benefits:start--><div data-section="benefits" data-hidden="false">
      <div class="sectionTitle">Benefits</div>
      <div class="list">
        <div class="pill">Get a simple plan for <strong>${T}</strong> that people understand fast.</div>
        <div class="pill">Show what you do, who it’s for, and how to start.</div>
        <div class="pill">Turn visitors into leads with a clear CTA.</div>
      </div>
    </div><!--section:benefits:end-->

    <!--section:testimonials:start--><div data-section="testimonials" data-hidden="false">
      <div class="sectionTitle">Testimonials</div>
      <div class="list">
        <div class="pill">“This was exactly what I needed — clean and professional.”</div>
        <div class="pill">“The layout made it easy to explain my offer.”</div>
      </div>
    </div><!--section:testimonials:end-->

    <!--section:pricing:start--><div data-section="pricing" data-hidden="false">
      <div class="sectionTitle">Pricing</div>
      <div class="priceBox">
        <div>
          <div class="small">Starter package</div>
          <div class="price" data-field="price">${P}</div>
        </div>
        <a class="btn primary" href="#" data-cta="pricing">Get Started</a>
      </div>
    </div><!--section:pricing:end-->

    <!--section:faq:start--><div data-section="faq" data-hidden="false">
      <div class="sectionTitle">FAQ</div>
      <div class="list">
        <div class="pill"><strong>How do I start?</strong><br><span class="small">Click Get Started and send your details.</span></div>
        <div class="pill"><strong>Can I customize this?</strong><br><span class="small">Yes — tell me “headline:” “cta:” or “add/remove sections”.</span></div>
      </div>
    </div><!--section:faq:end-->

    <div style="height:28px"></div>
  </div>
</body>
</html>`;
}

function applyEditsToHtml(text, lastHtml) {
  let html = String(lastHtml || "");
  const t = norm(text);
  const x = lower(t);

  if (x.startsWith("headline:")) {
    const v = norm(t.split(":").slice(1).join(":"));
    if (v) html = setTextInHtml(html, "headline", v);
    return { html, note: "Updated headline." };
  }

  if (x.startsWith("title:")) {
    const v = norm(t.split(":").slice(1).join(":"));
    if (v) html = setTextInHtml(html, "headline", v);
    return { html, note: "Updated title/headline." };
  }

  if (x.startsWith("brand:")) {
    const v = norm(t.split(":").slice(1).join(":"));
    if (v) html = setTextInHtml(html, "brand", v);
    return { html, note: "Updated brand." };
  }

  if (x.startsWith("cta:")) {
    const v = norm(t.split(":").slice(1).join(":"));
    if (v) html = setCtaInHtml(html, "primary", v);
    return { html, note: "Updated CTA." };
  }

  if (x.startsWith("price:")) {
    const v = moneyFromText(t, "$19");
    html = setPriceInHtml(html, v);
    return { html, note: "Updated price." };
  }

  if (x === "add faq") return { html: toggleSection(html, "faq", true), note: "Added FAQ." };
  if (x === "remove faq") return { html: toggleSection(html, "faq", false), note: "Removed FAQ." };
  if (x === "add pricing") return { html: toggleSection(html, "pricing", true), note: "Added pricing." };
  if (x === "remove pricing") return { html: toggleSection(html, "pricing", false), note: "Removed pricing." };
  if (x === "add testimonials") return { html: toggleSection(html, "testimonials", true), note: "Added testimonials." };
  if (x === "remove testimonials") return { html: toggleSection(html, "testimonials", false), note: "Removed testimonials." };
  if (x === "add benefits") return { html: toggleSection(html, "benefits", true), note: "Added benefits." };
  if (x === "remove benefits") return { html: toggleSection(html, "benefits", false), note: "Removed benefits." };

  return { html, note: "No edit applied." };
}

async function openAIChat({ text, tier, conversation }) {
  // Offline fallback: still ok:true so UI stays stable
  if (!OPENAI_API_KEY) {
    return {
      ok: true,
      text:
        "I’m in offline mode right now (no OpenAI key on the server). " +
        "If you want a landing page preview, say: “build a landing page for a fitness coach”. " +
        "Or edit: “headline: …”, “cta: …”, “add faq”, “price: 29”.",
    };
  }

  const mode = detectMode(text, conversation);

  const sys =
    "You are Simo. You must stay aligned to the user's CURRENT MODE: " + mode + ".\n\n" +
    "MODE RULES:\n" +
    "- venting: respond like a private best friend. Validate briefly, ask at most 1 clarifying question, no therapy-speak. Do NOT push previews/building unless asked.\n" +
    "- solving: be crisp and technical. Give step-by-step checks. Ask for only the missing detail if needed.\n" +
    "- building: be a builder. Offer a plan + next action. If user asks for preview/mockup, say it will appear on the right.\n" +
    "- neutral: match what the user is doing; if unclear, ask one short question.\n\n" +
    "CONTEXT HANDLING:\n" +
    "- If user switches topics, immediately follow the new topic. Do NOT repeat old instructions.\n" +
    "- Keep answers concise, actionable, and friendly.\n" +
    "- Avoid code fences unless asked.\n\n" +
    "INTERNAL NOTE (do not mention to user): Start your response with a hidden marker like '[mode: " + mode + "]'.";

  const msgs = [{ role: "system", content: sys }];

  if (Array.isArray(conversation)) {
    const tail = conversation.slice(-12);
    for (const m of tail) {
      if (!m || !m.role) continue;
      const c = typeof m.content === "string" ? m.content : "";
      if (!c) continue;
      if (m.role === "user" || m.role === "assistant") msgs.push({ role: m.role, content: c });
    }
  }

  // Ensure latest user text included
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") {
    msgs.push({ role: "user", content: text });
  }

  const body = {
    model: OPENAI_MODEL,
    messages: msgs,
    temperature: tier === "pro" ? 0.7 : 0.5,
  };

  try {
    const r = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const j = await r.json().catch(() => null);

    if (!r.ok) {
      const msg = j?.error?.message || `OpenAI error (${r.status})`;
      // UI-safe fallback
      return {
        ok: true,
        text:
          "I hit an API hiccup on my side. Try again in a second. " +
          "If you’re building, say: “build a landing page for …”. " +
          "If you’re venting, tell me what’s happening — I’m here.",
        error: msg,
        details: j || null,
      };
    }

    let out = j?.choices?.[0]?.message?.content || "";
    out = out.replace(/^\[mode:\s*(venting|solving|building|neutral)\]\s*/i, "");
    return { ok: true, text: out };
  } catch (err) {
    // UI-safe fallback
    return {
      ok: true,
      text:
        "Network glitch talking to the AI service. Try again in a moment. " +
        "If you want a preview, say: “build a landing page for …”.",
      error: String(err?.message || err),
    };
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return json(204, { ok: true });
    }

    if (event.httpMethod === "GET") {
      return json(200, {
        ok: true,
        service: "simo",
        status: "alive",
        expects: "POST JSON { text, tier, conversation, lastPreview }",
      });
    }

    if (event.httpMethod !== "POST") {
      return json(405, { ok: true, text: "Method not allowed." });
    }

    const body = safeParseJSON(event.body || "{}") || {};
    const text = norm(body.text || body.message || "");
    const tier = body.tier === "pro" ? "pro" : "free";
    const conversation = Array.isArray(body.conversation) ? body.conversation : [];
    const lastPreview = body.lastPreview && typeof body.lastPreview === "object" ? body.lastPreview : null;

    if (!text) {
      return json(400, { ok: true, text: "Missing message." });
    }

    // 1) EDIT COMMANDS
    if (isEditCommand(text) && lastPreview?.html) {
      const edited = applyEditsToHtml(text, lastPreview.html);
      return json(200, {
        ok: true,
        text: `Done. ${edited.note} If you want more changes, try:\n- headline: …\n- cta: …\n- add/remove faq\n- add/remove pricing\n- price: 29`,
        preview: {
          kind: "html",
          title: "Landing page",
          meta: "Edited deterministically",
          html: edited.html,
        },
      });
    }

    // 2) PREVIEW REQUESTS (deterministic)
    if (isPreviewAsk(text)) {
      const brand = pickBrand(text, "Simo");
      const topic = extractTopic(text);
      const headline = pickHeadline(topic, brand);
      const cta1 = "Get Started";
      const cta2 = "Learn More";
      const price = "$19";

      const html = baseLandingTemplate({ brand, topic, headline, cta1, cta2, price });

      return json(200, {
        ok: true,
        text:
          "Done. I updated the preview on the right.\n\n" +
          "If you want a specific change, use:\n" +
          "- headline: …\n" +
          "- cta: …\n" +
          "- price: 29\n" +
          "- add faq / remove faq\n" +
          "- add pricing / remove pricing\n" +
          "- add testimonials / remove testimonials",
        preview: {
          kind: "html",
          title: "Landing page",
          meta: "Updated",
          html,
        },
      });
    }

    // 3) NORMAL CHAT
    const ai = await openAIChat({ text, tier, conversation });

    // Always return ok:true so the UI never freezes due to an unexpected shape
    return json(200, {
      ok: true,
      text: ai.text || "I’m here. What do you want right now — venting, solving, or building?",
      ...(ai.error ? { error: ai.error } : {}),
      ...(ai.details ? { details: ai.details } : {}),
    });

  } catch (err) {
    return json(500, {
      ok: true,
      text: "Server error on my side. Try again in a moment.",
      error: String(err?.message || err),
    });
  }
};
