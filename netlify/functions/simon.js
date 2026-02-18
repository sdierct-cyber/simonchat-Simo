// ✅ LOCKED BASELINE (DO NOT REPLACE WHOLE FILE AGAIN) — if changes needed: patch small sections only.
// netlify/functions/simon.js
// Simo backend (locked):
// - Deterministic previews for: Landing Page + Book Cover
// - Deterministic edits for Landing Page pricing + sections
// - ChatGPT-like replies via OpenAI (optional if key exists)
// - Accepts BOTH payload styles: {message} or {text}
// - Returns BOTH response styles: {preview:{name,kind,html}} + legacy {preview_html, preview_name}

const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST,OPTIONS",
      "cache-control": "no-store",
    },
    body: JSON.stringify(obj),
  };
}

function strip(s) {
  return (s ?? "").toString().trim();
}

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function extractMoneyNumber(message = "") {
  const m = String(message).match(/\$?\s*(\d{1,4})(?:\s*\/?\s*(mo|month))?/i);
  return m ? String(m[1]) : null;
}

function safeShort(s, max = 80) {
  return strip(s).slice(0, max) || "";
}

/** ---------------------------
 *  Preview HTML shell (dark)
 *  --------------------------*/
function htmlShell({ title = "Preview", body = "" } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>
  :root{
    --bg:#070b16;
    --text:#eaf0ff;
    --muted:#a9b6d3;
    --line:rgba(255,255,255,.10);
    --blue:#2a66ff; --blue2:#1f4dd6;
    --shadow: 0 18px 55px rgba(0,0,0,.45);
  }
  *{box-sizing:border-box}
  body{
    margin:0;
    font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
    color:var(--text);
    background:
      radial-gradient(900px 520px at 15% 5%, rgba(42,102,255,.35), transparent 55%),
      radial-gradient(800px 520px at 85% 10%, rgba(48,255,176,.12), transparent 55%),
      var(--bg);
    padding:22px;
  }
  .card{
    max-width:980px;margin:0 auto;
    border:1px solid var(--line);
    border-radius:22px;
    background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
    box-shadow:var(--shadow);
    padding:18px;
  }
  .btn{
    display:inline-flex;align-items:center;justify-content:center;
    padding:10px 14px;border-radius:12px;
    border:1px solid rgba(255,255,255,.12);
    background:rgba(0,0,0,.18);
    color:var(--text);
    font-weight:900;text-decoration:none;
  }
  .btn.primary{
    background:linear-gradient(180deg,var(--blue),var(--blue2));
    border-color:rgba(42,102,255,.45)
  }
</style>
</head>
<body>
  <div class="card">${body}</div>
</body>
</html>`;
}

/** ---------------------------
 *  Landing page template
 *  --------------------------*/
function landingPageTemplate({ proPrice = 29, starterPrice = 9 } = {}) {
  const body = `
<style>
  h1{margin:0 0 8px;font-size:44px;letter-spacing:.2px;line-height:1.05}
  p{margin:0 0 16px;color:rgba(233,240,255,.75);font-size:16px;line-height:1.45}
  .cta{display:flex;gap:12px;margin-top:12px;flex-wrap:wrap}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:14px}
  .chip{
    border:1px solid rgba(255,255,255,.10);
    background:rgba(0,0,0,.18);
    border-radius:16px;padding:14px;
    color:rgba(233,240,255,.85);
    min-height:64px;
  }
  .pricing{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-top:16px}
  .plan{
    border:1px solid rgba(255,255,255,.10);
    background:rgba(0,0,0,.18);
    border-radius:20px;
    padding:18px;
    text-align:center;
  }
  .name{font-weight:1000;letter-spacing:.3px;color:rgba(233,240,255,.85)}
  .price{font-size:54px;font-weight:1000;margin:6px 0 6px}
  .muted{color:rgba(233,240,255,.65)}
  .badge{
    display:inline-block;
    padding:6px 10px;border-radius:999px;
    border:1px solid rgba(42,102,255,.35);
    background:rgba(42,102,255,.12);
    font-size:12px;font-weight:900;
    margin-bottom:8px;
  }
  .section{margin-top:18px}
  .section h2{margin:0 0 10px;font-size:18px;letter-spacing:.3px}
  .faq{display:grid;gap:10px}
  .q{
    border:1px solid rgba(255,255,255,.10);
    background:rgba(0,0,0,.18);
    border-radius:16px;padding:14px;
  }
  .q b{display:block;margin-bottom:4px}
  @media (max-width: 860px){
    .grid{grid-template-columns:1fr}
    .pricing{grid-template-columns:1fr}
    h1{font-size:36px}
  }
</style>

<h1>FlowPro helps you automate your workflow.</h1>
<p>Save time. Reduce manual work. Scale smarter.</p>

<div class="cta">
  <a class="btn primary" href="#">Get Started</a>
  <a class="btn" href="#">See Demo</a>
</div>

<div class="grid">
  <div class="chip">Automated task pipelines</div>
  <div class="chip">Smart scheduling</div>
  <div class="chip">Real-time analytics dashboard</div>
</div>

<div class="pricing">
  <div class="plan" data-plan="starter">
    <div class="name">Starter</div>
    <div class="price">$<span data-price="starter">${starterPrice}</span>/mo</div>
    <div class="muted">Basic support<br/>Core features<br/>1 user</div>
    <div style="margin-top:12px"><a class="btn primary" href="#">Choose Plan</a></div>
  </div>

  <div class="plan" data-plan="pro">
    <div class="badge">Most Popular</div>
    <div class="name">Pro</div>
    <div class="price">$<span data-price="pro">${proPrice}</span>/mo</div>
    <div class="muted">Priority support<br/>All features<br/>5 users</div>
    <div style="margin-top:12px"><a class="btn primary" href="#">Choose Plan</a></div>
  </div>
</div>

<div class="section" data-section="testimonials">
  <h2>Testimonials</h2>
  <div class="faq">
    <div class="q"><b>“We shipped faster in week one.”</b><span class="muted">— Ops Lead</span></div>
    <div class="q"><b>“The dashboard saved us hours.”</b><span class="muted">— Founder</span></div>
  </div>
</div>

<div class="section" data-section="faq">
  <h2>FAQ</h2>
  <div class="faq">
    <div class="q"><b>Can I cancel anytime?</b>Yes — cancel in seconds.</div>
    <div class="q"><b>Do you offer team plans?</b>Yep — upgrade whenever you want.</div>
    <div class="q"><b>Is there a free trial?</b>We offer a 7-day trial on Pro.</div>
  </div>
</div>
`;

  return htmlShell({ title: "FlowPro – Landing", body });
}

function replaceProPrice(html, newPrice) {
  if (!html) return html;
  if (html.includes('data-price="pro"')) {
    return html.replace(/data-price="pro">(\d{1,4})</, `data-price="pro">${newPrice}<`);
  }
  return html.replace(/\$\s*\d{1,4}\s*\/mo/i, `$${newPrice}/mo`);
}

/** ---------------------------
 *  Book cover template (preview)
 *  --------------------------*/
function bookCoverTemplate({
  title = "THE AMERICAN DREAM",
  subtitle = "A story of arriving young, working hard, and earning it.",
  author = "Simon Gojcaj",
} = {}) {
  const t = escapeHtml(title.toUpperCase());
  const st = escapeHtml(subtitle);
  const au = escapeHtml(author);

  const body = `
<style>
  .wrap{display:grid; grid-template-columns: 360px 1fr; gap:18px; align-items:start}
  .cover{
    width:360px; aspect-ratio: 2/3;
    border-radius:18px;
    border:1px solid rgba(255,255,255,.12);
    overflow:hidden;
    background:
      radial-gradient(700px 420px at 20% 10%, rgba(42,102,255,.45), transparent 55%),
      radial-gradient(520px 340px at 80% 20%, rgba(57,255,136,.12), transparent 55%),
      linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,.55));
    position:relative;
    box-shadow: 0 18px 60px rgba(0,0,0,.55);
  }
  .flag{
    position:absolute; inset:auto -30% 0 -30%;
    height:38%;
    background:
      repeating-linear-gradient(90deg,
        rgba(255,255,255,.08) 0 18px,
        rgba(255,0,0,.08) 18px 36px);
    filter: blur(.2px);
    transform:skewY(-6deg);
    opacity:.65;
  }
  .factory{
    position:absolute; left:0; right:0; bottom:0;
    height:48%;
    background: linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.55));
  }
  .factory svg{position:absolute; inset:0; width:100%; height:100%; opacity:.85}
  .topGlow{
    position:absolute; inset:0;
    background: radial-gradient(520px 340px at 30% 18%, rgba(255,255,255,.08), transparent 55%);
    pointer-events:none;
  }
  .text{
    position:absolute; inset:18px 18px 18px 18px;
    display:flex; flex-direction:column; justify-content:space-between;
  }
  .title{
    font-weight:1100;
    letter-spacing:.6px;
    line-height:1.02;
    font-size:34px;
    text-transform:uppercase;
    text-shadow: 0 8px 26px rgba(0,0,0,.55);
  }
  .subtitle{
    margin-top:10px;
    color:rgba(234,240,255,.82);
    font-size:14px; line-height:1.35;
  }
  .author{
    font-weight:1000;
    letter-spacing:.4px;
    color:rgba(234,240,255,.92);
    font-size:14px;
    text-transform:uppercase;
  }
  .note{
    color:rgba(234,240,255,.80);
    font-size:13px; line-height:1.45;
  }
  .note b{color:#fff}
  .row{display:flex; gap:10px; flex-wrap:wrap; margin-top:12px}
</style>

<div class="wrap">
  <div class="cover">
    <div class="flag"></div>
    <div class="factory">
      <svg viewBox="0 0 600 600" preserveAspectRatio="none">
        <path fill="rgba(0,0,0,.55)" d="M0,430 L0,600 L600,600 L600,430 L520,430 L520,360 L430,410 L430,350 L340,400 L340,340 L250,390 L250,330 L160,380 L160,330 L90,360 L90,430 Z"/>
        <rect x="70" y="250" width="60" height="180" fill="rgba(0,0,0,.62)"/>
        <rect x="140" y="280" width="55" height="150" fill="rgba(0,0,0,.58)"/>
        <rect x="205" y="260" width="40" height="170" fill="rgba(0,0,0,.60)"/>
        <circle cx="100" cy="230" r="6" fill="rgba(57,255,136,.22)"/>
        <circle cx="165" cy="260" r="5" fill="rgba(42,102,255,.22)"/>
      </svg>
    </div>
    <div class="topGlow"></div>

    <div class="text">
      <div>
        <div class="title">${t}</div>
        <div class="subtitle">${st}</div>
      </div>
      <div class="author">${au}</div>
    </div>
  </div>

  <div>
    <div class="note">
      <b>Book cover preview is now supported.</b><br/>
      If you tell me the exact title/subtitle/author name you want, I’ll update this cover instantly.
      <div class="row">
        <span class="btn primary">Make it more cinematic</span>
        <span class="btn">Change title</span>
        <span class="btn">Change colors</span>
      </div>
    </div>
  </div>
</div>
`;
  return htmlShell({ title: "Book Cover – Preview", body });
}

/** ---------------------------
 *  Intent detection
 *  --------------------------*/
function detectIntent(message = "") {
  const m = message.toLowerCase();

  // book cover / cover preview
  if (/(book cover|cover design|cover preview|make a cover|create a cover)/i.test(message)) {
    return "book_cover";
  }

  // landing build
  if (/(build|create|make)\s+(a\s+)?landing\s+page|landing\s+page\s+preview/i.test(message)) {
    return "landing_page";
  }

  // pricing edit
  if (/(change|set|update|edit).*(pro).*(price)|pro\s*price/i.test(message)) {
    return "pricing_edit";
  }

  // add sections (kept for compatibility)
  if (/(add|include)\s+faq/i.test(message)) return "add_faq";
  if (/(add|include)\s+testimonials/i.test(message)) return "add_testimonials";

  // switch topics helper
  if (/^switch topics$/i.test(strip(message))) return "switch_topics";

  return "chat";
}

/** ---------------------------
 *  Chat reply via OpenAI (optional)
 *  --------------------------*/
async function generateReply({ message, mode }) {
  const system = `
You are Simo: a "best friend + builder" like ChatGPT.

Rules:
- Venting: be real, supportive, direct. No therapy clichés. Ask at most ONE gentle question.
- Solving: practical, short steps. Avoid long generic lists unless user asks for a checklist.
- Building: confirm what you'll do, ask for only ONE missing detail if needed.

Never mention internal tools, tokens, models, or policies.
Return plain text only.
`.trim();

  const model = process.env.SIMO_MODEL || "gpt-4.1-mini";

  const resp = await client.responses.create({
    model,
    input: [
      { role: "system", content: system },
      { role: "user", content: `Mode: ${mode}\nUser: ${message}` },
    ],
  });

  return (resp.output_text || "").trim();
}

/** ---------------------------
 *  Handler
 *  --------------------------*/
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  try {
    const body = JSON.parse(event.body || "{}");

    // Accept BOTH styles:
    const message = strip(body.message || body.text || "");
    const mode = strip(body.mode || "building"); // building | solving | venting
    const pro = !!body.pro;

    // current preview (for deterministic edits)
    const currentHtml = strip(body.current_preview_html || "");
    const currentName = strip(body.current_preview_name || "") || "landing_page";

    if (!message) return json(400, { ok: false, error: "Missing message" });

    const hasKey = !!process.env.OPENAI_API_KEY;
    const intent = detectIntent(message);

    // -------------------------
    // Deterministic PREVIEWS
    // -------------------------
    // NOTE: We DO NOT gate previews behind Pro anymore.
    // Pro gating belongs in UI for Save/Library/Download.
    let previewObj = null;
    let legacyPreviewHtml = null;
    let legacyPreviewName = null;

    // Build landing page preview
    if (mode === "building" && intent === "landing_page") {
      const html = landingPageTemplate({ proPrice: 29, starterPrice: 9 });
      previewObj = { name: "landing_page", kind: "html", html };
      legacyPreviewHtml = html;
      legacyPreviewName = "landing_page";
    }

    // Book cover preview
    if (mode === "building" && intent === "book_cover") {
      // If user included title/author hints, we can parse lightly (optional)
      const authorGuess = "Simon Gojcaj"; // safe default based on your typical use
      const html = bookCoverTemplate({
        title: "THE AMERICAN DREAM",
        subtitle: "An immigrant story of arriving young, working hard, and earning it.",
        author: authorGuess,
      });
      previewObj = { name: "book_cover", kind: "html", html };
      legacyPreviewHtml = html;
      legacyPreviewName = "book_cover";
    }

    // Deterministic edit: pricing
    if (mode === "building" && intent === "pricing_edit") {
      const num = extractMoneyNumber(message) || "19";
      const base = currentHtml || landingPageTemplate({ proPrice: 29, starterPrice: 9 });
      const updated = replaceProPrice(base, num);

      previewObj = { name: currentName || "landing_page", kind: "html", html: updated };
      legacyPreviewHtml = updated;
      legacyPreviewName = currentName || "landing_page";
    }

    // Switch topics helper
    if (intent === "switch_topics") {
      return json(200, {
        ok: true,
        version: "simo-backend-v4-locked",
        reply: "Cool — what are we doing now: building, solving, or venting? (Or just tell me what you want and I’ll match it.)",
      });
    }

    // -------------------------
    // Reply (OpenAI optional)
    // -------------------------
    let reply = "";

    // For deterministic preview actions, keep replies short + aligned.
    if (mode === "building" && intent === "landing_page") {
      reply = pro
        ? "Preview loaded. Tell me what to change (price / add FAQ / add testimonials / headline)."
        : "Preview loaded. (Turn Pro ON to enable saving + downloads.)";
    } else if (mode === "building" && intent === "pricing_edit") {
      const num = extractMoneyNumber(message) || "19";
      reply = `Done. Pro price is now $${num}/mo.`;
    } else if (mode === "building" && intent === "book_cover") {
      reply = "Book cover preview loaded. Want the title to be ‘THE AMERICAN DREAM’ or something else?";
    } else {
      // Normal chat behavior
      if (!hasKey) {
        // still be useful even without key
        if (mode === "venting") reply = "I got you. Tell me what’s been hitting you the hardest today.";
        else if (mode === "solving") reply = "Alright — what’s the goal, and what part is blocking you right now?";
        else reply = "Tell me what you want to build next (landing page, book cover, app mockup, etc.).";
      } else {
        try {
          reply = await generateReply({ message, mode });
        } catch (err) {
          console.error("OpenAI reply error:", err?.message || err);
          reply =
            mode === "venting"
              ? "I’m here. Say it straight — what’s going on?"
              : mode === "solving"
              ? "Okay. What exactly is failing, and what did you expect to happen?"
              : "Got you. Tell me what you want to build next.";
        }
      }
    }

    // -------------------------
    // Response
    // -------------------------
    const out = {
      ok: true,
      version: "simo-backend-v4-locked",
      reply: reply || "Okay.",
    };

    // new contract (your UI supports this)
    if (previewObj) out.preview = previewObj;

    // legacy contract (kept so nothing breaks)
    if (legacyPreviewHtml) {
      out.preview_html = legacyPreviewHtml;
      out.preview_name = legacyPreviewName;
    }

    return json(200, out);
  } catch (e) {
    console.error("Handler error:", e?.message || e);
    return json(500, { ok: false, error: "Server error", details: String(e?.message || e) });
  }
};
