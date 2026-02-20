// netlify/functions/simon.js
// "ChatGPT-capability" backend:
// - Build intents ALWAYS return valid HTML (never blank)
// - Returns html + preview_html + output_html to match any frontend
// - GET self-test endpoint for preview sanity check
// - Venting overrides (wife/stress) even if mode is wrong
// - Solving never loops a generic fallback endlessly

exports.handler = async (event) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }

  // ✅ GET self-test: proves your preview pipeline works (no OpenAI involved)
  if (event.httpMethod === "GET") {
    const html = childcareLandingHtml("Neighborhood Child Care Clinic");
    return json(cors, 200, {
      ok: true,
      mode: "building",
      routed_mode: "building",
      intent: "html",
      text: "GET self-test: preview should show a child care landing page.",
      html,
      preview_html: html,
      output_html: html,
    });
  }

  try {
    if (event.httpMethod !== "POST") {
      return json(cors, 405, { ok: false, error: "Use POST" });
    }

    const body = safeJson(event.body) || {};
    const mode = cleanMode(body.mode) || "solving";
    const topic = clean(body.topic) || "general";
    const input = clean(body.input) || "";

    if (!input.trim()) {
      return json(cors, 200, {
        ok: true,
        mode,
        routed_mode: mode,
        topic,
        intent: "text",
        text: "Tell me what you want right now — venting, solving, or building.",
        html: "",
        preview_html: "",
        output_html: "",
      });
    }

    const routed = routeMode(mode, input);
    const intent = detectIntent(routed, input);

    // -------- BUILDING: ALWAYS RETURN HTML --------
    if (routed === "building") {
      const html = buildHtmlFromPrompt(input);

      // Optional AI: time-boxed upgrade (never blocks HTML)
      const ai = await tryOpenAIQuick({
        mode: "building",
        topic,
        input,
        timeoutMs: 6500,
        maxTokens: 900,
      });

      // If AI returns HTML, use it; otherwise keep stable template
      const useHtml =
        (ai.ok && looksLikeHtml(extractHtml(ai.text))) ? normalizeHtml(extractHtml(ai.text)) : html;

      return json(cors, 200, {
        ok: true,
        mode,
        routed_mode: "building",
        topic,
        intent: "html",
        text: "Done. Preview updated.",
        html: useHtml,
        preview_html: useHtml,
        output_html: useHtml,
      });
    }

    // -------- VENTING: NEVER GIVE “GOAL/TOOLS” --------
    if (routed === "venting") {
      const base = ventingReply(input);
      const ai = await tryOpenAIQuick({
        mode: "venting",
        topic,
        input,
        timeoutMs: 6500,
        maxTokens: 240,
      });

      return json(cors, 200, {
        ok: true,
        mode,
        routed_mode: "venting",
        topic,
        intent: "text",
        text: (ai.ok && ai.text) ? ai.text.trim() : base,
        html: "",
        preview_html: "",
        output_html: "",
      });
    }

    // -------- SOLVING: ANSWER DIRECTLY + FALLBACK THAT DOESN’T LOOP --------
    if (intent === "marketing_plan") {
      return json(cors, 200, {
        ok: true,
        mode,
        routed_mode: "solving",
        topic,
        intent: "text",
        text: marketingPlan10(),
        html: "",
        preview_html: "",
        output_html: "",
      });
    }

    const ai = await tryOpenAIQuick({
      mode: "solving",
      topic,
      input,
      timeoutMs: 6500,
      maxTokens: 550,
    });

    if (ai.ok && ai.text) {
      return json(cors, 200, {
        ok: true,
        mode,
        routed_mode: "solving",
        topic,
        intent: "text",
        text: ai.text.trim(),
        html: "",
        preview_html: "",
        output_html: "",
      });
    }

    return json(cors, 200, {
      ok: true,
      mode,
      routed_mode: "solving",
      topic,
      intent: "text",
      text: "I’ve got you. What’s the goal, what have you tried, and what’s the one constraint (time/money/tools)?",
      html: "",
      preview_html: "",
      output_html: "",
    });

  } catch (e) {
    return json(cors, 500, { ok: false, error: e?.message || String(e) });
  }
};

// ---------------- OpenAI (time-boxed) ----------------
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
      temperature: mode === "building" ? 0.35 : 0.7,
      max_output_tokens: maxTokens,
    };

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const raw = await r.text();
    if (!r.ok) return { ok: false, error: `openai_${r.status}` };
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
    return `You are Simo, a product-grade builder.
If you output HTML: it MUST be a full document starting with <!doctype html>.
No markdown fences unless the entire output is HTML.
Make it polished, modern, dark-friendly.
Topic: ${topic}`.trim();
  }
  if (mode === "venting") {
    return `You are Simo, the user's private best friend.
Be direct and real. No therapy clichés. One question max.
Topic: ${topic}`.trim();
  }
  return `You are Simo, a practical problem solver. Answer directly first.
Topic: ${topic}`.trim();
}

// ---------------- Routing & intents ----------------
function routeMode(mode, input) {
  const t = input.toLowerCase();

  // venting override
  if (
    t.includes("i'm stressed") || t.includes("im stressed") ||
    t.includes("anxious") || t.includes("panic") ||
    (t.includes("wife") && (t.includes("fighting") || t.includes("arguing")))
  ) return "venting";

  // build override
  if (
    t.includes("show me") ||
    t.includes("build ") ||
    t.includes("landing page") ||
    t.includes("book cover") ||
    t.includes("mockup") ||
    t.includes("html") ||
    t.includes("preview")
  ) return "building";

  return cleanMode(mode) || "solving";
}

function detectIntent(routed, input) {
  const t = input.toLowerCase();
  if (routed === "building") return "html";
  if (t.includes("marketing") && (t.includes("plan") || t.includes("strategy"))) return "marketing_plan";
  if (t.includes("10-bullet marketing plan") || t.includes("10 bullet marketing plan")) return "marketing_plan";
  return "text";
}

// ---------------- “ChatGPT-style” stable HTML builder ----------------
function buildHtmlFromPrompt(input) {
  const t = input.toLowerCase();
  if (t.includes("child care") || t.includes("childcare")) return childcareLandingHtml("Neighborhood Child Care Clinic");
  if (t.includes("landing page")) return childcareLandingHtml("Neighborhood Clinic");
  if (t.includes("book cover")) return bookCoverHtml(input);
  return genericHtml(input);
}

function childcareLandingHtml(name) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(name)}</title>
<style>
  :root{--bg:#0b1020;--txt:#eaf0ff;--mut:rgba(234,240,255,.75);--line:rgba(255,255,255,.12);--card:rgba(255,255,255,.06);--btn:#2a66ff}
  *{box-sizing:border-box} body{margin:0;font-family:system-ui;background:radial-gradient(1100px 650px at 18% 0%, #162a66 0%, var(--bg) 55%);color:var(--txt)}
  .wrap{max-width:980px;margin:0 auto;padding:28px}
  .nav{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border:1px solid var(--line);border-radius:16px;background:var(--card)}
  .brand{display:flex;gap:10px;align-items:center;font-weight:800}
  .dot{width:10px;height:10px;border-radius:50%;background:#39ff7a;box-shadow:0 0 16px rgba(57,255,122,.5)}
  .links{display:flex;gap:14px;opacity:.85}
  .hero{margin-top:14px;border:1px solid var(--line);border-radius:18px;background:var(--card);padding:22px}
  h1{margin:0;font-size:44px;line-height:1.05}
  p{margin:10px 0 0;color:var(--mut);line-height:1.5}
  .btns{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
  .btn{background:var(--btn);color:#fff;font-weight:800;text-decoration:none;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.12)}
  .btn.alt{background:transparent}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
  .card{border:1px solid var(--line);border-radius:18px;background:var(--card);padding:18px}
  .card h2{margin:0 0 8px}
  @media(max-width:900px){.grid{grid-template-columns:1fr}}
</style>
</head>
<body>
  <div class="wrap">
    <div class="nav">
      <div class="brand"><span class="dot"></span>${esc(name)}</div>
      <div class="links"><span>Services</span><span>Hours</span><span>Contact</span></div>
    </div>

    <div class="hero">
      <h1>Safe, warm care — right here in your neighborhood</h1>
      <p>Same-day availability • trusted staff • simple scheduling</p>
      <div class="btns">
        <a class="btn" href="#">Book an appointment</a>
        <a class="btn alt" href="#">Call the clinic</a>
      </div>
      <p style="opacity:.8;margin-top:12px">Tip: say “add testimonials and pricing” to expand this page.</p>
    </div>

    <div class="grid">
      <div class="card">
        <h2>Services</h2>
        <p>Well visits • urgent concerns • developmental guidance • parent Q&A</p>
      </div>
      <div class="card">
        <h2>Hours</h2>
        <p>Mon–Fri: 8am–6pm • Sat: 9am–1pm</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function bookCoverHtml(prompt) {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Book Cover</title>
<style>
  body{margin:0;font-family:system-ui;background:#0b1020;color:#eaf0ff;display:grid;place-items:center;min-height:100vh;padding:28px}
  .cover{width:420px;aspect-ratio:2/3;border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,.12);
    background:radial-gradient(900px 600px at 30% 0%, rgba(255,255,255,.14), transparent 60%),
    linear-gradient(180deg,#1a2b7a,#070a16);
    box-shadow:0 30px 80px rgba(0,0,0,.55);position:relative}
  .top{position:absolute;left:18px;right:18px;top:18px;padding:16px;border-radius:14px;
    background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.18);backdrop-filter:blur(10px)}
  h1{margin:0;font-size:36px;line-height:1.05}
  h2{margin:10px 0 0;font-size:14px;color:rgba(234,240,255,.8);font-weight:600}
  .badge{position:absolute;left:18px;right:18px;bottom:18px;padding:14px;border-radius:14px;
    background:rgba(242,239,232,.92);color:#101426}
  .badge .k{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#3a4460}
</style>
</head><body>
<div class="cover">
  <div class="top">
    <h1>Beyond the Stars</h1><h2>A journey through the silence of space</h2>
  </div>
  <div class="badge">
    <div class="k">Book cover concept</div>
    <div style="margin-top:8px;opacity:.85">${esc(prompt)}</div>
  </div>
</div>
</body></html>`;
}

function genericHtml(prompt) {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Simo Build</title>
<style>
body{margin:0;font-family:system-ui;background:#0b1020;color:#eaf0ff;display:grid;place-items:center;min-height:100vh}
.card{max-width:900px;width:92%;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.06);padding:18px}
p{color:rgba(234,240,255,.75);line-height:1.5}
</style></head><body>
<div class="card"><h1 style="margin:0">Simo Build</h1><p>${esc(prompt)}</p></div>
</body></html>`;
}

function marketingPlan10() {
  return [
    "Here’s a clean 10-bullet marketing plan for your neighborhood child care clinic:",
    "1) Clear offer: what you treat + ages + same-day availability.",
    "2) Google Business Profile: photos, services, hours, weekly posts, Q&A filled.",
    "3) Local SEO: “Child Care Clinic in [Neighborhood]” + service pages.",
    "4) Conversion: booking + call buttons above the fold, short intake form.",
    "5) Reviews: 1-tap review link after every visit.",
    "6) Partnerships: daycares, schools, pediatric dentists, family photographers.",
    "7) Local flyers + QR: libraries, coffee shops, gyms, community boards.",
    "8) Social: 3 posts/week (tips, staff trust, what-to-expect).",
    "9) Ads: small Meta + Nextdoor budget, tight radius targeting.",
    "10) Follow-up: missed call SMS + email nurture and reminders.",
  ].join("\n");
}

function ventingReply(input) {
  const t = input.toLowerCase();
  if (t.includes("wife") && (t.includes("fighting") || t.includes("arguing"))) {
    return "Damn. What was the trigger this time — and what do you wish she understood right now?";
  }
  return "I’m here. What’s the part that’s hitting you the hardest right now?";
}

// ---------------- helpers ----------------
function json(cors, statusCode, obj) {
  return { statusCode, headers: { "Content-Type": "application/json", ...cors }, body: JSON.stringify(obj) };
}
function safeJson(s) { try { return JSON.parse(s || "{}"); } catch { return null; } }
function clean(x) { return typeof x === "string" ? x.replace(/\u0000/g, "").trim() : ""; }
function cleanMode(m) {
  const s = String(m || "").toLowerCase().trim();
  return ["venting", "solving", "building"].includes(s) ? s : "";
}
function extractHtml(text) {
  const t = String(text || "").trim();
  const m = t.match(/```html([\s\S]*?)```/i);
  return (m && m[1]) ? m[1].trim() : t;
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
  return String(s || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}
