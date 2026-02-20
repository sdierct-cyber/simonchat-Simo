// netlify/functions/simon.js
// Simo V1.3.2 — Netlify Functions (CommonJS) + ChatGPT-first routing + 504-proof fallbacks
// Output contract: { ok, mode, routed_mode, topic, intent, text, html }

exports.handler = async (event) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }

  try {
    if (event.httpMethod !== "POST") {
      return json(405, cors, { ok: false, error: "Use POST" });
    }

    const body = safeJson(event.body);
    const requestedMode = cleanMode(body.mode) || "building"; // UI label only
    const topic = clean(body.topic) || "general";
    const input = clean(body.input) || "";

    if (!input.trim()) {
      return json(200, cors, {
        ok: true,
        mode: requestedMode,
        routed_mode: "solving",
        topic,
        intent: "idle",
        text: "Tell me what you want right now — venting, solving, or building.",
        html: "",
      });
    }

    // Intent-first routing (ChatGPT-like)
    const intent = detectIntent(input);
    const routedMode = intent.mode;     // venting | solving | building
    const wantsHtml = intent.wantsHtml; // true only when user clearly wants a preview/HTML

    // =========================
    // BUILD PATH (HTML preview)
    // =========================
    if (wantsHtml) {
      const kind = detectBuildKind(input);
      const template = buildTemplate(kind, input);

      // Optional OpenAI upgrade (time-boxed). Never blocks preview.
      const ai = await tryOpenAIQuick({
        mode: "building",
        topic,
        input,
        timeoutMs: 6500,
        maxTokens: 1100,
      });

      if (ai.ok && ai.text) {
        const maybeHtml = extractHtml(ai.text);
        if (looksLikeHtml(maybeHtml)) {
          return json(200, cors, {
            ok: true,
            mode: requestedMode,
            routed_mode: "building",
            topic,
            intent: "build",
            text: "Done. Preview updated.",
            html: normalizeHtml(maybeHtml),
          });
        }

        // AI returned text only — keep template for preview, use AI text for chat
        return json(200, cors, {
          ok: true,
          mode: requestedMode,
          routed_mode: "building",
          topic,
          intent: "build",
          text: ai.text.trim(),
          html: template,
        });
      }

      // OpenAI slow/down — still return a real template
      return json(200, cors, {
        ok: true,
        mode: requestedMode,
        routed_mode: "building",
        topic,
        intent: "build",
        text: "Done. Preview updated.",
        html: template,
      });
    }

    // =========================
    // TEXT PATH (ChatGPT-like)
    // =========================
    const ai = await tryOpenAIQuick({
      mode: routedMode,
      topic,
      input,
      timeoutMs: 6500,
      maxTokens: routedMode === "venting" ? 420 : 850,
    });

    if (ai.ok && ai.text) {
      return json(200, cors, {
        ok: true,
        mode: requestedMode,
        routed_mode: routedMode,
        topic,
        intent: routedMode === "venting" ? "vent" : "text",
        text: ai.text.trim(),
        html: "",
      });
    }

    // OpenAI slow/down — smart local fallbacks (prevents "memoir loop")
    return json(200, cors, {
      ok: true,
      mode: requestedMode,
      routed_mode: routedMode,
      topic,
      intent: routedMode === "venting" ? "vent" : "text",
      text: fallbackForTextIntent(routedMode, input),
      html: "",
    });
  } catch (e) {
    return json(500, cors, { ok: false, error: e?.message || String(e) });
  }
};

// -----------------------------
// OpenAI (time-boxed)
// -----------------------------
async function tryOpenAIQuick({ mode, topic, input, timeoutMs, maxTokens }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "missing_key" };

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const sys = systemPrompt(mode, topic);
    const payload = {
      model,
      input: `${sys}\n\nUSER:\n${input}\n`,
      temperature: mode === "building" ? 0.35 : mode === "venting" ? 0.8 : 0.65,
      max_output_tokens: maxTokens,
    };

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const raw = await r.text();
    if (!r.ok) return { ok: false, error: `openai_${r.status}`, raw };

    const data = JSON.parse(raw);
    return { ok: true, text: (data.output_text || "").trim() };
  } catch (e) {
    return { ok: false, error: e?.name === "AbortError" ? "timeout" : "network" };
  } finally {
    clearTimeout(t);
  }
}

function systemPrompt(mode, topic) {
  if (mode === "building") {
    return `
You are Simo, a product-grade builder who outputs usable results.
Only output HTML if the user clearly asked for a preview/site/mockup.
If you output HTML: it MUST be a full document starting with <!doctype html>.
No markdown fences unless the entire output is HTML.
Make it clean, modern, and realistic.
Topic: ${topic}
`.trim();
  }

  if (mode === "venting") {
    return `
You are Simo, the user's private best friend.
Be real and grounded. Avoid therapy clichés. No lectures.
Validate briefly, reflect the core emotion, then ask ONE good question.
Topic: ${topic}
`.trim();
  }

  return `
You are Simo, practical problem-solver.
Give clear, step-by-step help when needed.
If asked for a plan (marketing, business, etc.), deliver the plan directly.
Topic: ${topic}
`.trim();
}

// -----------------------------
// Intent detection (ChatGPT-like)
// -----------------------------
function detectIntent(input) {
  const t = String(input || "").toLowerCase();

  const explicitBuild =
    /\b(show me|build|create|design|generate|make|mockup|wireframe|preview)\b/.test(t) ||
    /\b(landing page|website|web page|homepage|book cover|cover mockup|ui)\b/.test(t);

  const marketingPlan =
    /\b(marketing plan|10-bullet|ten-bullet|growth plan|launch plan|positioning|offer|ads|seo)\b/.test(t);

  const longformWriting =
    /\b(write|draft|outline|chapter)\b/.test(t) &&
    /\b(book|memoir|novel|story|script|essay)\b/.test(t) &&
    !/\b(book cover|cover)\b/.test(t);

  const ventSignals =
    (/\b(i'm|im|i am)\b/.test(t) &&
      /\b(stressed|overwhelmed|tired|anxious|sad|angry|mad|upset|burnt out|frustrated)\b/.test(t)) ||
    /\b(fighting|argument|loop|relationship|wife|husband)\b/.test(t);

  const solveSignals =
    /\b(how do i|how to|help me|steps|plan|fix|debug|why is|what should i do)\b/.test(t);

  if (ventSignals) return { wantsHtml: false, mode: "venting" };
  if (explicitBuild) return { wantsHtml: true, mode: "building" };
  if (marketingPlan) return { wantsHtml: false, mode: "solving" };
  if (longformWriting) return { wantsHtml: false, mode: "solving" };
  if (solveSignals) return { wantsHtml: false, mode: "solving" };
  return { wantsHtml: false, mode: "solving" };
}

// -----------------------------
// Build templates (instant, never fails)
// -----------------------------
function detectBuildKind(input) {
  const t = input.toLowerCase();
  if (t.includes("landing page") || t.includes("website") || t.includes("homepage")) return "landing";
  if (t.includes("book cover")) return "book_cover";
  return "generic";
}

function buildTemplate(kind, input) {
  if (kind === "landing") return landingHtml(input);
  if (kind === "book_cover") return bookCoverHtml(input);
  return genericHtml(input);
}

function landingHtml(prompt) {
  const p = String(prompt || "");
  const t = p.toLowerCase();

  const isChildCare =
    t.includes("child care") || t.includes("childcare") || t.includes("pediatric") || t.includes("kids");

  const wantsTestimonials = t.includes("testimonial") || t.includes("testimonials");
  const wantsPricing = t.includes("pricing") || t.includes("prices") || t.includes("plans");

  const brand = isChildCare ? "Neighborhood Child Care Clinic" : "Neighborhood Clinic";
  const headline = isChildCare ? "Safe, warm care — right here in your neighborhood" : "Modern care, close to home";
  const sub = isChildCare
    ? "Same-day availability • trusted staff • simple scheduling"
    : "Fast appointments • transparent pricing • friendly team";

  const services = isChildCare
    ? [
        ["Well-child visits", "Checkups, milestones, and ongoing care."],
        ["Sick visits", "Quick evaluation + treatment plans."],
        ["Vaccinations", "Up-to-date immunizations and records."],
        ["School forms", "Physicals, notes, and documentation."],
      ]
    : [
        ["Primary care", "Preventative visits and routine care."],
        ["Urgent visits", "Same-day appointments when needed."],
        ["Labs & screening", "Simple, fast test coordination."],
        ["Referrals", "Specialists when the situation calls for it."],
      ];

  const pricingBlocks = `
<section class="section">
  <h2>Simple pricing</h2>
  <div class="grid3">
    <div class="card">
      <h3>Starter</h3>
      <div class="price">$49</div>
      <ul><li>Basic visit</li><li>Follow-up message</li><li>Care notes</li></ul>
      <button>Book Starter</button>
    </div>
    <div class="card highlight">
      <h3>Care+</h3>
      <div class="price">$99</div>
      <ul><li>Extended visit</li><li>Priority scheduling</li><li>Care plan PDF</li></ul>
      <button>Book Care+</button>
    </div>
    <div class="card">
      <h3>Family</h3>
      <div class="price">$149</div>
      <ul><li>2 children</li><li>Shared plan</li><li>Priority follow-ups</li></ul>
      <button>Book Family</button>
    </div>
  </div>
  <p class="fine">*Example pricing — customize to match real rates and policies.</p>
</section>`;

  const testimonialBlocks = `
<section class="section">
  <h2>What neighbors say</h2>
  <div class="grid3">
    <div class="quote"><p>“Fast, kind, and actually listens. We finally found our go-to clinic.”</p><span>— Local parent</span></div>
    <div class="quote"><p>“Scheduling was simple and the staff made my child feel comfortable.”</p><span>— Neighborhood family</span></div>
    <div class="quote"><p>“Clear plan, no confusion. They explained everything in plain English.”</p><span>— Community member</span></div>
  </div>
</section>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(brand)}</title>
<style>
  :root{
    --bg:#0b1020; --panel:rgba(255,255,255,.06); --line:rgba(255,255,255,.12);
    --text:#eaf0ff; --muted:#a9b6d3; --btn:#2a66ff; --btn2:#1f4dd6;
    --ok:#39ff7a; --shadow:0 18px 44px rgba(0,0,0,.35);
  }
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
    background:radial-gradient(1200px 700px at 20% 0%, #162a66 0%, var(--bg) 55%);
    color:var(--text)}
  .wrap{max-width:1100px;margin:0 auto;padding:28px}
  .nav{display:flex;justify-content:space-between;align-items:center;border:1px solid var(--line);
    background:var(--panel);border-radius:18px;padding:14px 16px;box-shadow:var(--shadow)}
  .brand{display:flex;gap:10px;align-items:center}
  .dot{width:12px;height:12px;border-radius:99px;background:var(--ok);box-shadow:0 0 18px rgba(57,255,122,.35)}
  .nav a{color:var(--muted);text-decoration:none;margin-left:14px;font-size:14px}
  .hero{margin-top:18px;border:1px solid var(--line);background:linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.04));
    border-radius:24px;padding:26px;box-shadow:var(--shadow);display:grid;grid-template-columns:1.2fr .8fr;gap:18px}
  h1{margin:0 0 8px;font-size:44px;line-height:1.05}
  .sub{color:var(--muted);font-size:16px;line-height:1.45}
  .ctaRow{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}
  button{appearance:none;border:0;border-radius:14px;padding:12px 14px;background:linear-gradient(180deg,var(--btn),var(--btn2));
    color:white;font-weight:700;cursor:pointer}
  .ghost{background:transparent;border:1px solid var(--line);color:var(--text)}
  .card{border:1px solid var(--line);background:var(--panel);border-radius:18px;padding:16px;
    box-shadow:0 12px 30px rgba(0,0,0,.25)}
  .section{margin-top:18px;border:1px solid var(--line);background:var(--panel);border-radius:22px;padding:18px;box-shadow:var(--shadow)}
  h2{margin:0 0 12px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
  .svc h3{margin:0 0 6px}
  .svc p{margin:0;color:var(--muted);line-height:1.45}
  .fine{color:rgba(234,240,255,.6);font-size:12px;margin:10px 0 0}
  .price{font-size:30px;font-weight:800;margin:6px 0}
  ul{margin:10px 0 0;padding-left:18px;color:var(--muted)}
  li{margin:6px 0}
  .highlight{outline:2px solid rgba(42,102,255,.45)}
  .quote p{margin:0;color:rgba(234,240,255,.92);line-height:1.5}
  .quote span{display:block;margin-top:10px;color:var(--muted);font-size:13px}
  footer{margin:18px 0 0;color:rgba(234,240,255,.55);font-size:12px;text-align:center}
  @media (max-width: 980px){
    .hero{grid-template-columns:1fr}
    .grid3{grid-template-columns:1fr}
    .grid2{grid-template-columns:1fr}
    h1{font-size:36px}
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="nav">
      <div class="brand"><span class="dot"></span><b>${esc(brand)}</b></div>
      <div><a href="#services">Services</a><a href="#hours">Hours</a><a href="#contact">Contact</a></div>
    </div>

    <div class="hero">
      <div>
        <h1>${esc(headline)}</h1>
        <div class="sub">${esc(sub)}</div>
        <div class="ctaRow">
          <button>Book an appointment</button>
          <button class="ghost">Call the clinic</button>
        </div>
        <p class="fine">Tip: say “add testimonials and pricing” to expand this page.</p>
      </div>

      <div class="card" id="hours">
        <h2>Hours</h2>
        <div class="sub">Mon–Fri: 8am–6pm<br/>Sat: 9am–1pm<br/>Same-day slots available</div>
      </div>
    </div>

    <section class="section" id="services">
      <h2>Services</h2>
      <div class="grid2">
        ${services
          .map(
            ([h, d]) => `<div class="card svc"><h3>${esc(h)}</h3><p>${esc(d)}</p></div>`
          )
          .join("")}
      </div>
    </section>

    ${wantsTestimonials ? testimonialBlocks : ""}
    ${wantsPricing ? pricingBlocks : ""}

    <section class="section" id="contact">
      <h2>Contact</h2>
      <div class="grid2">
        <div class="card"><h3>Location</h3><p class="sub">123 Main St, Your Neighborhood</p><p class="fine">Replace with their real address.</p></div>
        <div class="card"><h3>Get started</h3><p class="sub">Tell me clinic name + city + top 3 services and I’ll personalize this.</p><button style="margin-top:10px">Request a callback</button></div>
      </div>
    </section>

    <footer>© ${new Date().getFullYear()} ${esc(brand)} • Built with Simo</footer>
  </div>
</body>
</html>`;
}

function bookCoverHtml(prompt) {
  // Safe fallback book-cover mockup (works offline; OpenAI can upgrade it)
  const p = String(prompt || "");
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Book Cover</title><style>
body{margin:0;font-family:system-ui;background:#0b1020;color:#eaf0ff;display:grid;place-items:center;min-height:100vh;padding:28px}
.cover{width:420px;aspect-ratio:2/3;border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,.14);
box-shadow:0 30px 80px rgba(0,0,0,.55);background:linear-gradient(180deg,#1b2a5a,#0d1224);
position:relative}
.top{position:absolute;left:22px;right:22px;top:22px;padding:14px;border-radius:14px;
background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.18);backdrop-filter:blur(10px)}
h1{margin:0;font-size:34px;line-height:1.05}
p{margin:10px 0 0;color:rgba(234,240,255,.8);font-weight:600}
.badge{position:absolute;left:22px;right:22px;bottom:22px;padding:14px;border-radius:14px;
background:rgba(242,239,232,.92);color:#0e1220}
.small{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#3a4460}
</style></head><body>
<div class="cover">
  <div class="top"><h1>New Cover</h1><p>${esc(p)}</p></div>
  <div class="badge"><div class="small">Book cover concept</div><div style="margin-top:10px;opacity:.8">
  Say: <b>title:</b> … <b>subtitle:</b> … <b>author:</b> … to customize.</div></div>
</div></body></html>`;
}

function genericHtml(prompt) {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Simo Build</title><style>
body{margin:0;font-family:system-ui;background:#0b1020;color:#eaf0ff;display:grid;place-items:center;min-height:100vh}
.card{max-width:900px;width:92%;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.06);padding:18px}
p{color:rgba(234,240,255,.75);line-height:1.5}
</style></head><body><div class="card"><h1>Simo Build</h1><p>${esc(prompt)}</p></div></body></html>`;
}

// -----------------------------
// Text fallbacks (prevents loops)
// -----------------------------
function fallbackForTextIntent(mode, input) {
  const t = String(input || "").trim();

  if (/\b(marketing plan|10-bullet|ten-bullet)\b/i.test(t)) {
    return [
      "Here’s a clean 10-bullet marketing plan for your neighborhood child care clinic:",
      "1) Offer & hook: same-day child care visits, friendly staff, clear next steps.",
      "2) Google Business Profile: photos, services, FAQs, hours, weekly posts.",
      "3) Local SEO: one page for “Child Care Clinic in [Neighborhood]” + pages per service.",
      "4) Flyers + QR: libraries, coffee shops, gyms, daycare boards, schools.",
      "5) Partnerships: daycares, schools, pediatric dentists, family photographers.",
      "6) Intro promo: new-patient offer + limited weekly consultation slots.",
      "7) Reviews: after each visit → 1-tap Google review link.",
      "8) Social: 3 posts/week (tips, staff, what-to-expect).",
      "9) Ads: small Meta + Nextdoor budget targeted to nearby zip codes.",
      "10) Conversion: booking + call buttons above the fold, SMS follow-up for missed calls.",
      "",
      "Give me the clinic name + city + top 3 services and I’ll tailor this plan."
    ].join("\n");
  }

  if (mode === "venting") return "I’m here. What happened — and what’s the part that’s bothering you the most?";
  return "Got you. What’s the outcome you want, and what’s the main constraint?";
}

// -----------------------------
// Helpers
// -----------------------------
function json(statusCode, headers, obj) {
  return { statusCode, headers, body: JSON.stringify(obj) };
}

function safeJson(str) {
  try {
    return str ? JSON.parse(str) : {};
  } catch {
    return {};
  }
}

function clean(x) {
  return typeof x === "string" ? x.replace(/\u0000/g, "").trim() : "";
}

function cleanMode(m) {
  const s = String(m || "").toLowerCase().trim();
  return ["venting", "solving", "building"].includes(s) ? s : "";
}

function extractHtml(text) {
  const t = String(text || "").trim();
  const m = t.match(/```html([\s\S]*?)```/i);
  return m && m[1] ? m[1].trim() : t;
}

function looksLikeHtml(s) {
  const t = String(s || "").trim();
  return /^<!doctype html/i.test(t) || /<html[\s>]/i.test(t) || /<body[\s>]/i.test(t);
}

function normalizeHtml(s) {
  const t = String(s || "").trim();
  return /^<!doctype html/i.test(t) ? t : "<!doctype html>\n" + t;
}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m])
  );
}
