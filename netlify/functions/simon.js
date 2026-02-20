// netlify/functions/simon.js
// Simo backend — fast, stable, no 504, CommonJS (NO export default).
// Contract: { ok, mode, routed_mode, topic, intent, text, html, preview_html, output_html }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  const started = Date.now();
  const hardDeadlineMs = 8500; // keep safely under Netlify timeouts

  try {
    if (event.httpMethod !== "POST") {
      return json(405, { ok: false, error: "Use POST" });
    }

    const body = safeJson(event.body);
    const userMode = cleanMode(body.mode) || "building";
    const topic = clean(body.topic) || "general";
    const input = clean(body.input) || "";

    if (!input.trim()) {
      return json(200, {
        ok: true,
        mode: userMode,
        routed_mode: userMode,
        topic,
        intent: "text",
        text: "Tell me what you want right now — venting, solving, or building.",
        html: "",
      });
    }

    // ChatGPT-like routing based on message (don’t get stuck in old mode)
    const routed = routeMode(userMode, input);

    // BUILDING always returns HTML (fast)
    if (routed === "building") {
      const kind = detectKind(input);
      const htmlTemplate = buildTemplate(kind, input);

      // Optional OpenAI upgrade (time-boxed). Never blocks.
      const remaining = hardDeadlineMs - (Date.now() - started);
      const aiTimeout = clamp(remaining - 250, 1200, 6500); // keep some buffer

      const ai = await tryOpenAI({
        mode: "building",
        topic,
        input,
        timeoutMs: aiTimeout,
        maxTokens: 900,
      });

      if (ai.ok && ai.text) {
        const maybeHtml = extractHtml(ai.text);
        if (looksLikeHtml(maybeHtml)) {
          const out = normalizeHtml(maybeHtml);
          return json(200, packBuild("Done. Preview updated.", out, userMode, routed, topic));
        }
        // AI gave text only: use template as preview, AI as chat reply
        return json(200, {
          ok: true,
          mode: userMode,
          routed_mode: routed,
          topic,
          intent: "html",
          text: ai.text.trim(),
          html: htmlTemplate,
          preview_html: htmlTemplate,
          output_html: htmlTemplate,
        });
      }

      // No AI (timeout/down) -> still return template
      return json(200, packBuild("Done. Preview updated.", htmlTemplate, userMode, routed, topic));
    }

    // SOLVING / VENTING (time-boxed) — never hang
    {
      const remaining = hardDeadlineMs - (Date.now() - started);
      const aiTimeout = clamp(remaining - 250, 1200, 6500);

      const ai = await tryOpenAI({
        mode: routed,
        topic,
        input,
        timeoutMs: aiTimeout,
        maxTokens: routed === "solving" ? 650 : 450,
      });

      if (ai.ok && ai.text) {
        return json(200, {
          ok: true,
          mode: userMode,
          routed_mode: routed,
          topic,
          intent: "text",
          text: ai.text.trim(),
          html: "",
        });
      }

      // Fallbacks that feel like Simo (best-friend, no loops)
      const fallback =
        routed === "venting"
          ? "I’m here. What happened — and what part is bothering you the most?"
          : "Tell me the goal, what you’ve tried, and your one constraint (time/money/tools).";
      return json(200, {
        ok: true,
        mode: userMode,
        routed_mode: routed,
        topic,
        intent: "text",
        text: fallback,
        html: "",
      });
    }

  } catch (e) {
    return json(500, { ok: false, error: e?.message || String(e) });
  }
};

// ---------------- OpenAI (time-boxed) ----------------
async function tryOpenAI({ mode, topic, input, timeoutMs, maxTokens }) {
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
      temperature: mode === "building" ? 0.45 : 0.75,
      max_output_tokens: maxTokens,
    };

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const raw = await r.text();
    if (!r.ok) return { ok: false, error: `openai_${r.status}`, raw: raw.slice(0, 200) };

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
You are Simo, a product-grade builder.
When building, you may output HTML.
If you output HTML: it MUST be a full document starting with <!doctype html>.
No markdown fences unless the entire output is HTML.
Style: clean, modern, dark-friendly, polished.
If user asks "add testimonials" or "add pricing", update the existing page accordingly.
Topic: ${topic}
`.trim();
  }
  if (mode === "venting") {
    return `
You are Simo, the user's private best friend.
Be direct and real. No therapy clichés. Ask ONE question max.
If user changes topic, follow it naturally (don’t repeat the same line).
Topic: ${topic}
`.trim();
  }
  return `
You are Simo, practical problem-solver.
Give a short answer, then a numbered plan (max 8 steps).
Topic: ${topic}
`.trim();
}

// ---------------- Routing ----------------
function routeMode(currentMode, input) {
  const t = input.toLowerCase();

  // Explicit overrides
  if (/\b(vent|venting)\b/.test(t)) return "venting";
  if (/\b(solve|solving|steps|plan)\b/.test(t)) return "solving";
  if (/\b(build|builder|landing page|book cover|mockup|html|preview)\b/.test(t)) return "building";

  // Heuristic: emotional language -> venting
  if (/\b(stressed|anxious|sad|angry|fight|argu(e|ment)|overwhelmed|depressed)\b/.test(t)) return "venting";

  // Requests that look like instructions/strategy -> solving
  if (/\b(marketing plan|bullet|strategy|how do i|what should i do)\b/.test(t)) return "solving";

  // Otherwise keep current
  return currentMode;
}

// ---------------- Templates (instant = never fails) ----------------
function detectKind(input) {
  const t = input.toLowerCase();
  if (t.includes("book cover")) return "book_cover";
  if (t.includes("landing page")) return "landing";
  if (t.includes("dashboard")) return "dashboard";
  if (t.includes("app")) return "app";
  return "generic";
}

function buildTemplate(kind, input) {
  if (kind === "book_cover") return bookCoverHtml(input);
  if (kind === "landing") return landingHtml(input);
  return genericHtml(input);
}

function landingHtml(prompt) {
  const t = String(prompt || "").toLowerCase();
  const isChildCare = t.includes("child") || t.includes("care") || t.includes("clinic") || t.includes("daycare");
  const addPricing = t.includes("pricing") || t.includes("price");
  const addTestimonials = t.includes("testimonial") || t.includes("reviews");

  const title = isChildCare ? "Neighborhood Child Care Clinic" : "Neighborhood Clinic";
  const headline = isChildCare ? "Safe, warm care — right here in your neighborhood" : "Quality care — right in your neighborhood";
  const sub = isChildCare ? "Same-day availability • trusted staff • simple scheduling" : "Friendly staff • clear next steps • easy scheduling";

  const testimonials = addTestimonials ? `
    <div class="card">
      <h2>Testimonials</h2>
      <div class="rows">
        <div class="quote">“Quick, kind, and super clear. Booking was easy.” <span>— Local Parent</span></div>
        <div class="quote">“They treated my kid with patience and care. 10/10.” <span>— Neighbor</span></div>
        <div class="quote">“Great staff. Great follow-up. Felt supported.” <span>— Family</span></div>
      </div>
    </div>` : "";

  const pricing = addPricing ? `
    <div class="card">
      <h2>Simple pricing</h2>
      <div class="pricing">
        <div class="tier">
          <h3>Quick Visit</h3>
          <div class="price">$49</div>
          <ul><li>15–20 min consult</li><li>Care plan summary</li><li>Follow-up text</li></ul>
          <a class="btn" href="#">Book</a>
        </div>
        <div class="tier popular">
          <div class="tag">Most popular</div>
          <h3>Full Visit</h3>
          <div class="price">$99</div>
          <ul><li>30–40 min visit</li><li>Detailed plan</li><li>Priority scheduling</li></ul>
          <a class="btn" href="#">Book</a>
        </div>
        <div class="tier">
          <h3>Family Plan</h3>
          <div class="price">$149</div>
          <ul><li>2 kids included</li><li>Extended Q&amp;A</li><li>1 week follow-up</li></ul>
          <a class="btn" href="#">Book</a>
        </div>
      </div>
    </div>` : "";

  const hint = (!addTestimonials && !addPricing)
    ? `<p class="hint">Tip: say “add testimonials and pricing” to expand this page.</p>`
    : `<p class="hint">Tip: say “make it more playful” or “add an FAQ” to keep going.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)}</title>
<style>
  :root{--bg:#0b1020;--txt:#eaf0ff;--mut:rgba(234,240,255,.75);--line:rgba(255,255,255,.12);--card:rgba(255,255,255,.06);--btn:#2a66ff}
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui;background:radial-gradient(1100px 650px at 18% 0%, #162a66 0%, var(--bg) 55%);color:var(--txt)}
  .wrap{max-width:980px;margin:0 auto;padding:28px}
  .nav{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border:1px solid var(--line);border-radius:16px;background:var(--card)}
  .brand{display:flex;gap:10px;align-items:center;font-weight:800}
  .dot{width:10px;height:10px;border-radius:50%;background:#39ff7a;box-shadow:0 0 16px rgba(57,255,122,.5)}
  .links{display:flex;gap:14px;opacity:.85}
  .hero{margin-top:14px;border:1px solid var(--line);border-radius:18px;background:var(--card);padding:22px}
  h1{margin:0;font-size:44px;line-height:1.05}
  p{margin:10px 0 0;color:var(--mut);line-height:1.5}
  .btns{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
  .btn{background:var(--btn);color:#fff;font-weight:800;text-decoration:none;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.12);display:inline-block}
  .btn.alt{background:transparent}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
  .card{border:1px solid var(--line);border-radius:18px;background:var(--card);padding:18px}
  .card h2{margin:0 0 8px}
  .hint{opacity:.8;margin-top:12px}
  .rows{display:grid;gap:10px}
  .quote{border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:12px 14px;background:rgba(0,0,0,.18)}
  .quote span{opacity:.75;margin-left:6px}
  .pricing{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
  .tier{border:1px solid rgba(255,255,255,.10);border-radius:16px;padding:14px;background:rgba(0,0,0,.18);position:relative}
  .tier.popular{outline:2px solid rgba(42,102,255,.55)}
  .tag{position:absolute;top:10px;right:10px;font-size:12px;opacity:.9;background:rgba(42,102,255,.25);padding:4px 8px;border-radius:999px}
  .price{font-size:28px;font-weight:900;margin:8px 0 10px}
  ul{margin:0 0 12px 18px;color:var(--mut)}
  @media(max-width:900px){.grid{grid-template-columns:1fr}.pricing{grid-template-columns:1fr}}
</style>
</head>
<body>
  <div class="wrap">
    <div class="nav">
      <div class="brand"><span class="dot"></span>${esc(title)}</div>
      <div class="links"><span>Services</span><span>Hours</span><span>Contact</span></div>
    </div>

    <div class="hero">
      <h1>${esc(headline)}</h1>
      <p>${esc(sub)}</p>
      <div class="btns">
        <a class="btn" href="#">Book an appointment</a>
        <a class="btn alt" href="#">Call the clinic</a>
      </div>
      ${hint}
    </div>

    <div class="grid">
      <div class="card">
        <h2>Services</h2>
        <p>Well visits • urgent concerns • developmental guidance • parent Q&amp;A</p>
      </div>
      <div class="card">
        <h2>Hours</h2>
        <p>Mon–Fri: 8am–6pm • Sat: 9am–1pm</p>
      </div>
    </div>

    ${testimonials}
    ${pricing}
  </div>
</body>
</html>`;
}

function bookCoverHtml(prompt) {
  // Simple, reliable, prompt-aware book cover mock (fast + always relevant)
  const p = String(prompt || "");
  const t = p.toLowerCase();

  const isFitness = /(fitness|workout|coach|gym|training|nutrition|health)/.test(t);
  const isSpace = /(space|outer space|galaxy|astronaut|stars|planet|universe|nebula|sci)/.test(t);
  const isImmigrant = /(immigrant|factory|american dream|new roots|migration)/.test(t);

  const titleFrom = pick(p, /title\s*:\s*["“]?([^"\n”]+)["”]?/i);
  const subFrom = pick(p, /subtitle\s*:\s*["“]?([^"\n”]+)["”]?/i);
  const authorFrom = pick(p, /author\s*:\s*["“]?([^"\n”]+)["”]?/i);

  let title = titleFrom || (isFitness ? "The Coach’s Playbook" : isSpace ? "Beyond the Stars" : isImmigrant ? "New Roots" : "A New Chapter");
  let subtitle = subFrom || (isFitness ? "A practical manual for health & fitness" : isSpace ? "A journey through the silence of space" : isImmigrant ? "A factory worker’s American journey" : "A story shaped by grit and growth");
  let author = authorFrom || (isImmigrant ? "Simon Gojcaj" : "Simo Studio");
  let kicker = isFitness ? "Fitness manual" : isSpace ? "Space / Sci-Fi" : isImmigrant ? "A modern immigrant story" : "Book cover concept";
  let blurb = isFitness
    ? "A no-fluff system: training templates, habit rules, nutrition basics, and progress checkpoints."
    : isSpace
    ? "Dark matter. Distant worlds. A mission that changes everything — where one signal can rewrite what humanity believes."
    : isImmigrant
    ? "Early mornings. Factory floors. Quiet pride. A modest life built one shift at a time — and gratitude for what America offers."
    : "Give me the vibe (minimal, gritty, cinematic) and I’ll tune the design + copy to match your book.";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Book Cover Mockup</title>
<style>
  :root{--bg:#0b1020;--ink:#0e1220;--cream:#f2efe8;--muted:#b9c3dd}
  *{box-sizing:border-box}
  body{
    margin:0;font-family:system-ui;
    background:radial-gradient(1100px 650px at 18% 0%, #162a66 0%, var(--bg) 55%);
    color:#eaf0ff; display:grid; place-items:center; min-height:100vh; padding:28px;
  }
  .cover{
    width:min(460px, 92vw); aspect-ratio:2/3; border-radius:18px; overflow:hidden;
    box-shadow:0 30px 80px rgba(0,0,0,.55);
    position:relative; border:1px solid rgba(255,255,255,.14);
    background:
      radial-gradient(900px 700px at 30% 0%, rgba(255,255,255,.12), transparent 60%),
      linear-gradient(160deg, rgba(255,255,255,.06), rgba(0,0,0,.32)),
      repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0 2px, transparent 2px 10px),
      linear-gradient(180deg, #1b2a5a, #0d1224);
  }
  .stripe{
    position:absolute; inset:22px 22px auto 22px;
    padding:16px 14px; border-radius:14px;
    background:rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.18);
    backdrop-filter: blur(10px);
  }
  h1{margin:0; font-size:34px; letter-spacing:.4px; line-height:1.05}
  h2{margin:10px 0 0; font-size:14px; color:rgba(234,240,255,.82); font-weight:600}
  .badge{
    position:absolute; left:50%; top:55%; transform:translate(-50%,-50%);
    width:76%; border-radius:18px;
    background:rgba(242,239,232,.92);
    color:var(--ink);
    padding:18px;
    box-shadow:0 12px 30px rgba(0,0,0,.25);
  }
  .badge .k{font-size:12px; letter-spacing:.2em; text-transform:uppercase; color:#3a4460}
  .badge .line{height:1px; background:rgba(0,0,0,.12); margin:10px 0}
  .badge p{margin:0; color:#26304a; line-height:1.45}
  .author{
    position:absolute; left:22px; right:22px; bottom:22px;
    display:flex; justify-content:space-between; align-items:center;
    padding:12px 14px; border-radius:14px;
    background:rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.18);
    color:rgba(234,240,255,.9);
  }
  .author strong{letter-spacing:.12em; text-transform:uppercase; font-size:12px}
  .meta{color:rgba(234,240,255,.65); font-size:12px}
</style>
</head>
<body>
  <div class="cover">
    <div class="stripe">
      <h1>${esc(title)}</h1>
      <h2>${esc(subtitle)}</h2>
    </div>

    <div class="badge">
      <div class="k">${esc(kicker)}</div>
      <div class="line"></div>
      <p>${esc(blurb)}</p>
    </div>

    <div class="author">
      <strong>${esc(author)}</strong>
      <div class="meta">Concept • Clean • Modern</div>
    </div>
  </div>
</body>
</html>`;
}

function genericHtml(prompt) {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Simo Build</title><style>
body{margin:0;font-family:system-ui;background:#0b1020;color:#eaf0ff;display:grid;place-items:center;min-height:100vh}
.card{max-width:900px;width:92%;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.06);padding:18px}
p{color:rgba(234,240,255,.75);line-height:1.5}
</style></head><body><div class="card"><h1>Simo Build</h1><p>${esc(prompt)}</p></div></body></html>`;
}

// ---------------- helpers ----------------
function packBuild(text, html, mode, routed_mode, topic) {
  return {
    ok: true,
    mode,
    routed_mode,
    topic,
    intent: "html",
    text,
    html,
    preview_html: html,
    output_html: html,
  };
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...corsHeaders },
    body: JSON.stringify(obj),
  };
}

function safeJson(s) {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}
function clean(s) { return typeof s === "string" ? s.replace(/\u0000/g, "").trim() : ""; }
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
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[m]));
}
function pick(s, re) {
  const m = String(s || "").match(re);
  return m ? m[1].trim() : "";
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
