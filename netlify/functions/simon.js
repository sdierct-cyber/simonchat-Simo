// netlify/functions/simon.js
// Simo backend — ChatGPT-like routing + always-respond fallback (no loops)
// Contract: { ok, mode, routed_mode, topic, intent, text, html }

exports.handler = async (event) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }

  try {
    if (event.httpMethod !== "POST") {
      return j(405, cors, { ok: false, error: "Use POST" });
    }

    const body = safeJson(event.body) || {};
    const mode = cleanMode(body.mode) || "solving"; // default to solving
    const topic = clean(body.topic) || "general";
    const input = clean(body.input) || "";

    if (!input.trim()) {
      return j(200, cors, {
        ok: true,
        mode,
        routed_mode: mode,
        topic,
        intent: "text",
        text: "Tell me what you want right now — venting, solving, or building.",
        html: "",
      });
    }

    // ---------- ROUTING (do NOT get stuck) ----------
    const routed = routeMode(mode, input);
    const intent = detectIntent(routed, input);

    // ---------- INSTANT LOCAL ANSWERS (prevents loops when OpenAI is slow) ----------
    // 1) Marketing plan (always answer, no fallback loop)
    if (intent === "marketing_plan") {
      const plan = marketingPlan10(input);
      return j(200, cors, {
        ok: true,
        mode,
        routed_mode: "solving",
        topic,
        intent: "text",
        text: plan,
        html: "",
      });
    }

    // 2) Venting always gives a real response (not “goal/constraint”)
    if (routed === "venting") {
      const msg = ventingReply(input);
      // Optional OpenAI enhancement (time-boxed) but never required
      const ai = await tryOpenAIQuick({
        mode: "venting",
        topic,
        input,
        timeoutMs: 6500,
        maxTokens: 220,
      });
      return j(200, cors, {
        ok: true,
        mode,
        routed_mode: "venting",
        topic,
        intent: "text",
        text: (ai.ok && ai.text) ? ai.text.trim() : msg,
        html: "",
      });
    }

    // 3) Building always returns HTML (instant), AI optional
    if (routed === "building") {
      const kind = detectKind(input);
      const template = buildTemplate(kind, input);

      const ai = await tryOpenAIQuick({
        mode: "building",
        topic,
        input,
        timeoutMs: 6500,
        maxTokens: 900,
      });

      if (ai.ok && ai.text) {
        const maybeHtml = extractHtml(ai.text);
        if (looksLikeHtml(maybeHtml)) {
          return j(200, cors, {
            ok: true,
            mode,
            routed_mode: "building",
            topic,
            intent: "html",
            text: "Done. Preview updated.",
            html: normalizeHtml(maybeHtml),
          });
        }
      }

      return j(200, cors, {
        ok: true,
        mode,
        routed_mode: "building",
        topic,
        intent: "html",
        text: "Done. Preview updated.",
        html: template,
      });
    }

    // 4) Solving: try OpenAI; if slow, give a useful local answer (NOT a loop line)
    const ai = await tryOpenAIQuick({
      mode: "solving",
      topic,
      input,
      timeoutMs: 6500,
      maxTokens: 550,
    });

    if (ai.ok && ai.text) {
      return j(200, cors, {
        ok: true,
        mode,
        routed_mode: "solving",
        topic,
        intent: "text",
        text: ai.text.trim(),
        html: "",
      });
    }

    // Local solving fallback (still helpful, never repeats endlessly)
    return j(200, cors, {
      ok: true,
      mode,
      routed_mode: "solving",
      topic,
      intent: "text",
      text: localSolvingFallback(input),
      html: "",
    });

  } catch (e) {
    return j(500, cors, { ok: false, error: e?.message || String(e) });
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

// ---------------- Prompts ----------------
function systemPrompt(mode, topic) {
  if (mode === "building") {
    return `
You are Simo, a product-grade builder.
If you output HTML: it MUST be a full document starting with <!doctype html>.
No markdown fences unless the entire output is HTML.
Make it polished, modern, dark-friendly.
Topic: ${topic}
`.trim();
  }
  if (mode === "venting") {
    return `
You are Simo, the user's private best friend.
Be direct and real. No therapy clichés. One question max.
Topic: ${topic}
`.trim();
  }
  return `
You are Simo, a practical problem solver.
Answer the user directly first, then give a short numbered plan if useful.
Topic: ${topic}
`.trim();
}

// ---------------- Routing ----------------
function routeMode(mode, input) {
  const t = input.toLowerCase();

  // Hard venting triggers override everything
  if (
    t.includes("i'm stressed") || t.includes("im stressed") ||
    t.includes("anxious") || t.includes("panic") ||
    t.includes("wife") && (t.includes("fighting") || t.includes("arguing")) ||
    t.includes("i feel") || t.includes("hurt") || t.includes("depressed")
  ) return "venting";

  // Build triggers
  if (
    t.includes("show me a") ||
    t.includes("build ") ||
    t.includes("landing page") ||
    t.includes("book cover") ||
    t.includes("mockup") ||
    t.includes("html") ||
    t.includes("preview")
  ) return "building";

  // Otherwise keep chosen mode (usually solving)
  return cleanMode(mode) || "solving";
}

function detectIntent(routedMode, input) {
  const t = input.toLowerCase();

  if (routedMode === "building") {
    if (t.includes("book cover")) return "build_book_cover";
    if (t.includes("landing page")) return "build_landing";
    return "build_generic";
  }

  // marketing plan intent
  if (
    (t.includes("marketing") && (t.includes("plan") || t.includes("strategy"))) ||
    t.includes("10-bullet marketing plan") ||
    t.includes("10 bullet marketing plan")
  ) return "marketing_plan";

  return "text";
}

// ---------------- Local answers to prevent “loop” ----------------
function marketingPlan10(input) {
  // Keep it “ChatGPT-like” and specific even without extra context.
  return [
    "Here’s a clean 10-bullet marketing plan for your neighborhood child care clinic:",
    "1) Clear offer: same-day scheduling, transparent pricing, what you treat + ages.",
    "2) Google Business Profile: photos, services, hours, weekly posts, Q&A filled out.",
    "3) Local SEO page: “Child Care Clinic in [Neighborhood/City]” + each service page.",
    "4) Conversion first: book/call buttons above the fold + short intake form.",
    "5) Reviews system: 1-tap Google review link sent after each visit.",
    "6) Partnerships: daycares, schools, pediatric dentists, family photographers.",
    "7) Local visibility: flyers + QR at libraries, coffee shops, gyms, community boards.",
    "8) Social content: 3 posts/week (tips, what-to-expect, staff trust signals).",
    "9) Ads (small budget): Meta + Nextdoor targeting nearby zip codes + parents interests.",
    "10) Follow-up: missed-call SMS + email nurture for new leads and seasonal reminders.",
    "",
    "If you tell me the clinic name + city + top 3 services, I’ll tailor this into a 2-week launch plan with exact copy.",
  ].join("\n");
}

function ventingReply(input) {
  const t = input.toLowerCase();
  if (t.includes("wife") && (t.includes("fighting") || t.includes("arguing"))) {
    return "Damn. What was the trigger this time — and what do you *wish* she understood right now?";
  }
  if (t.includes("stressed") || t.includes("anxious")) {
    return "I’m here. What’s the part that’s hitting you the hardest right now?";
  }
  return "I’m here. What happened — and what’s the part that’s bothering you most?";
}

function localSolvingFallback(input) {
  return `I’ve got you. Tell me 3 things:
1) What’s the goal?
2) What have you tried already?
3) What’s the one constraint (time / money / tools)?

Then I’ll give you a tight plan.`;
}

// ---------------- Templates (instant HTML) ----------------
function detectKind(input) {
  const t = input.toLowerCase();
  if (t.includes("book cover")) return "book_cover";
  if (t.includes("landing page")) return "landing";
  return "generic";
}

function buildTemplate(kind, input) {
  if (kind === "book_cover") return bookCoverHtml(input);
  if (kind === "landing") return landingHtml(input);
  return genericHtml(input);
}

function bookCoverHtml(prompt) {
  // Simple but solid default (you already have richer; this one is stable)
  const title = "Beyond the Stars";
  const subtitle = "A journey through the silence of space";
  return `<!doctype html>
<html lang="en"><head>
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
    <h1>${esc(title)}</h1><h2>${esc(subtitle)}</h2>
  </div>
  <div class="badge">
    <div class="k">Book cover concept</div>
    <div style="margin-top:8px;opacity:.85">${esc(prompt)}</div>
  </div>
</div>
</body></html>`;
}

function landingHtml(prompt) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Neighborhood Child Care Clinic</title>
<style>
  body{margin:0;font-family:system-ui;background:#0b1020;color:#eaf0ff}
  .wrap{max-width:980px;margin:0 auto;padding:28px}
  .hero{border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.06);padding:22px}
  .pill{display:inline-block;padding:6px 10px;border-radius:999px;background:rgba(57,255,122,.15);border:1px solid rgba(57,255,122,.35);font-size:12px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
  .card{border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.06);padding:18px}
  .btns{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
  .btn{padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:#2a66ff;color:#fff;font-weight:700;text-decoration:none}
  .btn.alt{background:transparent}
  p{color:rgba(234,240,255,.75);line-height:1.5;margin:10px 0 0}
  @media(max-width:900px){.grid{grid-template-columns:1fr}}
</style>
</head><body>
<div class="wrap">
  <div class="hero">
    <span class="pill">Now booking • local</span>
    <h1 style="margin:10px 0 0;font-size:44px;line-height:1.05">Safe, warm care — right here in your neighborhood</h1>
    <p>Same-day availability • trusted staff • simple scheduling</p>
    <div class="btns">
      <a class="btn" href="#">Book an appointment</a>
      <a class="btn alt" href="#">Call the clinic</a>
    </div>
    <p style="opacity:.8;margin-top:12px"><b>Prompt:</b> ${esc(prompt)}</p>
  </div>

  <div class="grid">
    <div class="card"><h2 style="margin:0">Services</h2><p>Well visits • urgent concerns • developmental guidance • parent Q&A</p></div>
    <div class="card"><h2 style="margin:0">Hours</h2><p>Mon–Fri: 8am–6pm • Sat: 9am–1pm</p></div>
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

// ---------------- Utils ----------------
function j(statusCode, headers, obj) {
  return { statusCode, headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(obj) };
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
