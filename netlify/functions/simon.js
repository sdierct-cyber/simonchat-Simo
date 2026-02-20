// netlify/functions/simon.js  (CommonJS - stable on Netlify)
// Contract: { ok, mode, routed_mode, intent, topic, text, html }
// - intent: "html" when html should render, otherwise "text"
// - Always returns quickly (timeouts) to avoid 504/502.
// - OpenAI optional; if slow/down, still works with templates.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true }, cors);

  // Quick GET self-test so you can verify preview rendering instantly
  if (event.httpMethod === "GET") {
    const html = landingTemplate("Neighborhood Child Care Clinic", "Safe, warm care — right here in your neighborhood");
    return json(200, {
      ok: true,
      mode: "building",
      routed_mode: "building",
      intent: "html",
      topic: "general",
      text: "GET self-test: preview should show a child care landing page.",
      html,
    }, cors);
  }

  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Use POST" }, cors);

  try {
    const body = safeJson(event.body);
    const mode = cleanMode(body.mode) || "building";
    const topic = clean(body.topic) || "general";
    const input = clean(body.input) || "";

    if (!input.trim()) {
      return json(200, {
        ok: true,
        mode,
        routed_mode: mode,
        intent: "text",
        topic,
        text: "Tell me what you want right now — venting, solving, or building.",
        html: "",
      }, cors);
    }

    // Route like ChatGPT: decide what user is actually asking for
    const routed = routeMode(mode, input);
    const intent = routeIntent(input, routed);

    // BUILD (HTML)
    if (intent === "html") {
      const kind = detectBuildKind(input);
      const fallbackHtml = buildTemplate(kind, input);

      // Try OpenAI fast. If it returns good HTML, use it. If not, keep template.
      const ai = await tryOpenAIQuick({
        mode: "building",
        topic,
        input: buildSystemPrompt(topic) + "\n\nUSER:\n" + input,
        timeoutMs: 6500,
        maxTokens: 900,
      });

      if (ai.ok && ai.text) {
        const maybe = extractHtml(ai.text);
        if (looksLikeHtml(maybe)) {
          return json(200, {
            ok: true,
            mode,
            routed_mode: "building",
            intent: "html",
            topic,
            text: "Done. Preview updated.",
            html: normalizeHtml(maybe),
          }, cors);
        }
        // AI gave text only — still return template preview + AI chat
        return json(200, {
          ok: true,
          mode,
          routed_mode: "building",
          intent: "html",
          topic,
          text: ai.text.trim(),
          html: fallbackHtml,
        }, cors);
      }

      return json(200, {
        ok: true,
        mode,
        routed_mode: "building",
        intent: "html",
        topic,
        text: "Done. Preview updated.",
        html: fallbackHtml,
      }, cors);
    }

    // TEXT (venting/solving/general)
    const ai = await tryOpenAIQuick({
      mode: routed,
      topic,
      input: textSystemPrompt(routed, topic) + "\n\nUSER:\n" + input,
      timeoutMs: 6500,
      maxTokens: routed === "solving" ? 650 : 450,
    });

    if (ai.ok && ai.text) {
      return json(200, {
        ok: true,
        mode,
        routed_mode: routed,
        intent: "text",
        topic,
        text: ai.text.trim(),
        html: "",
      }, cors);
    }

    // Fallback (no OpenAI or timeout)
    const fallback =
      routed === "venting"
        ? "I’m here. What happened — and what part is hitting you the hardest?"
        : routed === "solving"
          ? "Tell me the goal, what you tried, and the one constraint (time/money/tools)."
          : "Got you. What do you want to do next — vent, solve, or build?";
    return json(200, {
      ok: true,
      mode,
      routed_mode: routed,
      intent: "text",
      topic,
      text: fallback,
      html: "",
    }, cors);

  } catch (e) {
    return json(500, { ok: false, error: e?.message || String(e) }, cors);
  }
};

// ---------- OpenAI (fast + optional) ----------
async function tryOpenAIQuick({ mode, topic, input, timeoutMs, maxTokens }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "missing_key" };

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Responses API: send input as a string, read output_text
    const payload = {
      model,
      input: String(input || ""),
      temperature: mode === "building" ? 0.4 : 0.7,
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
    if (!r.ok) return { ok: false, error: `openai_${r.status}`, raw };

    const data = JSON.parse(raw);
    const out = (data.output_text || "").trim();
    if (!out) return { ok: false, error: "no_output" };
    return { ok: true, text: out };

  } catch (e) {
    return { ok: false, error: e?.name === "AbortError" ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Routing ----------
function routeMode(currentMode, input) {
  const t = input.toLowerCase();

  // Hard venting signals
  if (/(i'?m\s+stressed|anxious|depressed|overwhelmed|panic|i\s+can'?t|my\s+wife|argu|fight|relationship)/i.test(t)) {
    return "venting";
  }
  // Hard solving signals
  if (/(plan|steps|checklist|bullet|strategy|how do i|how to|fix|debug|error|marketing plan|write a \d+-bullet)/i.test(t)) {
    return "solving";
  }
  // Hard building signals
  if (/(show me|build|make|create).*(landing page|website|mockup|dashboard|book cover|preview|html)/i.test(t)) {
    return "building";
  }

  return currentMode || "solving";
}

function routeIntent(input, routedMode) {
  const t = input.toLowerCase();

  // If user is asking for a preview/build/html, we return HTML
  if (/(landing page|website|mockup|dashboard|book cover|preview|html)/i.test(t) && /(show me|build|make|create|generate)/i.test(t)) {
    return "html";
  }

  // If they're in building mode and ask to "add pricing/testimonials" etc, also HTML
  if (routedMode === "building" && /(add|remove|update|change).*(pricing|testimonials|faq|cta|headline|hero|section)/i.test(t)) {
    return "html";
  }

  return "text";
}

// ---------- Prompts ----------
function buildSystemPrompt(topic) {
  return `
You are Simo, a product-grade builder.
If you output HTML, it MUST be a full document starting with <!doctype html>.
No markdown fences.
Style: clean, modern, dark-friendly.
`.trim();
}

function textSystemPrompt(mode, topic) {
  if (mode === "venting") {
    return `
You are Simo, the user's private best friend.
Be real, direct, supportive. Avoid therapy clichés.
Ask at most ONE question.
`.trim();
  }
  if (mode === "solving") {
    return `
You are Simo, a practical problem solver.
Give an answer that is actionable. Use bullets or steps.
If you need info, ask only what’s necessary.
`.trim();
  }
  return `
You are Simo. Keep it helpful and concise.
`.trim();
}

// ---------- Templates ----------
function detectBuildKind(input) {
  const t = input.toLowerCase();
  if (t.includes("book cover")) return "book_cover";
  if (t.includes("landing page") || t.includes("website")) return "landing";
  if (t.includes("dashboard")) return "dashboard";
  return "generic";
}

function buildTemplate(kind, input) {
  if (kind === "book_cover") return bookCoverTemplate(input);
  if (kind === "landing") return landingFromPrompt(input);
  return genericTemplate(input);
}

function landingFromPrompt(input) {
  const t = input.toLowerCase();
  if (/(child care|childcare|pediatric|kids|clinic)/i.test(t)) {
    return landingTemplate("Neighborhood Child Care Clinic", "Safe, warm care — right here in your neighborhood", true);
  }
  if (/(fitness|coach|trainer|gym)/i.test(t)) {
    return landingTemplate("Neighborhood Fitness Coach", "Get fit without guesswork — a simple plan that sticks", true);
  }
  return landingTemplate("New Local Business", "A clean landing page you can customize in seconds", true);
}

function landingTemplate(brand, headline, includeTip = false) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(brand)}</title>
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
      <div class="brand"><span class="dot"></span>${esc(brand)}</div>
      <div class="links"><span>Services</span><span>Hours</span><span>Contact</span></div>
    </div>

    <div class="hero">
      <h1>${esc(headline)}</h1>
      <p>Same-day availability • trusted staff • simple scheduling</p>
      <div class="btns">
        <a class="btn" href="#">Book an appointment</a>
        <a class="btn alt" href="#">Call</a>
      </div>
      ${includeTip ? `<p style="opacity:.85;margin-top:12px">Tip: say “add testimonials and pricing” to expand this page.</p>` : ``}
    </div>

    <div class="grid">
      <div class="card">
        <h2>Services</h2>
        <p>Well visits • urgent concerns • guidance • parent Q&A</p>
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

function bookCoverTemplate(input) {
  const t = String(input || "").toLowerCase();

  const isFitness = /(fitness|workout|coach|gym|training|nutrition|health)/i.test(t);
  const isSpace = /(space|outer space|galaxy|astronaut|stars|planet|nebula|sci-fi|scifi|rocket|orbit|moon|mars)/i.test(t);
  const isImmigrant = /(immigrant|factory|migration|new country|american dream)/i.test(t);

  let title = "A New Chapter";
  let subtitle = "A story shaped by grit and growth";
  let kicker = "Book cover concept";
  let blurb = "Tell me the vibe (minimal, gritty, cinematic) and I’ll tune the design + copy.";

  if (isFitness) {
    title = "The Coach’s Playbook";
    subtitle = "A practical manual for health & fitness";
    kicker = "Fitness manual";
    blurb = "Training templates, habit rules, nutrition basics, and progress checkpoints — all in one place.";
  } else if (isSpace) {
    title = "Beyond the Stars";
    subtitle = "A journey through the silence of space";
    kicker = "Space / Sci-Fi";
    blurb = "Dark matter. Distant worlds. One signal that can rewrite what humanity believes.";
  } else if (isImmigrant) {
    title = "New Roots";
    subtitle = "A factory worker’s American journey";
    kicker = "A modern immigrant story";
    blurb = "Early mornings. Factory floors. Quiet pride — a life built one shift at a time.";
  }

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
    width:min(420px, 92vw); aspect-ratio:2/3;
    border-radius:18px; overflow:hidden;
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
  .art{position:absolute; inset:0; display:grid; place-items:center; padding-top:105px;}
  .badge{
    width:76%; border-radius:18px;
    background:rgba(242,239,232,.92);
    color:var(--ink);
    padding:18px;
    box-shadow:0 12px 30px rgba(0,0,0,.25);
  }
  .badge .k{font-size:12px; letter-spacing:.2em; text-transform:uppercase; color:#3a4460}
  .badge .line{height:1px; background:rgba(0,0,0,.12); margin:10px 0}
  .badge p{margin:0; color:#26304a; line-height:1.45}
</style>
</head>
<body>
  <div class="cover">
    <div class="stripe">
      <h1>${esc(title)}</h1>
      <h2>${esc(subtitle)}</h2>
    </div>
    <div class="art">
      <div class="badge">
        <div class="k">${esc(kicker)}</div>
        <div class="line"></div>
        <p>${esc(blurb)}</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function genericTemplate(input) {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Simo Build</title><style>
body{margin:0;font-family:system-ui;background:#0b1020;color:#eaf0ff;display:grid;place-items:center;min-height:100vh}
.card{max-width:900px;width:92%;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.06);padding:18px}
p{color:rgba(234,240,255,.75);line-height:1.5}
</style></head><body><div class="card"><h1>Simo Build</h1><p>${esc(input)}</p></div></body></html>`;
}

// ---------- Utils ----------
function json(status, obj, headers) {
  return { statusCode: status, headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(obj) };
}
function safeJson(s) {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}
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
  return String(s || "").replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
}
