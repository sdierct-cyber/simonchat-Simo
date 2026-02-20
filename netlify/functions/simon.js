// netlify/functions/simon.js
// Simo backend (stable, ChatGPT-like routing, last-good preview safe)
// - CommonJS handler (prevents "Unexpected token export" 502)
// - Timeboxed OpenAI call (prevents 504)
// - Always returns usable HTML templates for build requests
// - Returns text (bullets/venting) for non-build, and does not touch preview
// Contract: { ok, mode, routed_mode, topic, intent, text, html }

const OPENAI_URL = "https://api.openai.com/v1/responses";

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
      return json(405, { ok: false, error: "Use POST" }, cors);
    }

    const body = safeJson(event.body);
    const uiMode = cleanMode(body.mode);     // optional: "venting"|"solving"|"building"
    const topic  = clean(body.topic) || "general";
    const input  = clean(body.input);

    // lightweight convo memory (frontend sends last few turns)
    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];

    // state from frontend: last build kind + last build spec (so edits work)
    const state = body.state && typeof body.state === "object" ? body.state : {};
    const lastBuild = state.lastBuild || null; // { kind, spec }

    if (!input) {
      return json(200, {
        ok: true,
        mode: uiMode || "solving",
        routed_mode: uiMode || "solving",
        topic,
        intent: "text",
        text: "Tell me what you want right now — venting, solving, or building.",
        html: ""
      }, cors);
    }

    // Decide routed mode (ChatGPT-like)
    const routed_mode = uiMode || routeMode(input);

    // Decide intent
    const wantsBuild = routed_mode === "building" || isBuildIntent(input);
    const wantsPreview = wantsBuild;

    // BUILD FLOW: always produce HTML (never blank), optionally upgrade with OpenAI quickly
    if (wantsBuild) {
      const kind = detectKind(input, lastBuild?.kind);
      const spec = buildSpecFromInput(input, kind, lastBuild?.spec);

      // Always generate template first (instant, never fails)
      const template = buildTemplate(kind, spec);

      // Quick OpenAI attempt (optional, timeboxed)
      const ai = await tryOpenAIQuick({
        mode: "building",
        topic,
        input,
        history,
        timeoutMs: 6500,
        maxTokens: 900
      });

      if (ai.ok && ai.text) {
        const maybeHtml = extractHtml(ai.text);
        if (looksLikeHtml(maybeHtml)) {
          return json(200, {
            ok: true,
            mode: routed_mode,
            routed_mode,
            topic,
            intent: "build",
            text: "Done. Preview updated.",
            html: normalizeHtml(maybeHtml),
            state: { lastBuild: { kind, spec } }
          }, cors);
        }

        // If AI returned only text, keep template preview but use AI as chat text
        return json(200, {
          ok: true,
          mode: routed_mode,
          routed_mode,
          topic,
          intent: "build",
          text: ai.text.trim(),
          html: template,
          state: { lastBuild: { kind, spec } }
        }, cors);
      }

      // AI slow/down: still deliver template
      return json(200, {
        ok: true,
        mode: routed_mode,
        routed_mode,
        topic,
        intent: "build",
        text: "Done. Preview updated.",
        html: template,
        state: { lastBuild: { kind, spec } }
      }, cors);
    }

    // TEXT FLOW (solving / venting): timebox OpenAI; fallback is dynamic (not repetitive)
    const ai = await tryOpenAIQuick({
      mode: routed_mode,
      topic,
      input,
      history,
      timeoutMs: 6500,
      maxTokens: routed_mode === "solving" ? 550 : 320
    });

    if (ai.ok && ai.text) {
      return json(200, {
        ok: true,
        mode: routed_mode,
        routed_mode,
        topic,
        intent: "text",
        text: ai.text.trim(),
        html: ""
      }, cors);
    }

    // Smart fallback (no loop)
    const fallback = fallbackText(routed_mode, input, history);
    return json(200, {
      ok: true,
      mode: routed_mode,
      routed_mode,
      topic,
      intent: "text",
      text: fallback,
      html: ""
    }, cors);

  } catch (e) {
    return json(500, { ok: false, error: e?.message || String(e) }, cors);
  }
};

// ---------------- OpenAI (timeboxed) ----------------
async function tryOpenAIQuick({ mode, topic, input, history, timeoutMs, maxTokens }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "missing_key" };

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const sys = systemPrompt(mode, topic);

    const historyBlock = history.length
      ? "\n\nRECENT CONTEXT:\n" + history.map(h => `${h.role.toUpperCase()}: ${h.text}`).join("\n")
      : "";

    // Use string input (most robust across Responses API variations)
    const payload = {
      model,
      input: `${sys}${historyBlock}\n\nUSER:\n${input}\n`,
      temperature: mode === "building" ? 0.35 : (mode === "venting" ? 0.75 : 0.55),
      max_output_tokens: maxTokens
    };

    const r = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const raw = await r.text();
    if (!r.ok) return { ok: false, error: `openai_${r.status}`, raw: raw.slice(0, 200) };

    const data = JSON.parse(raw);
    const text = (data.output_text || "").trim();
    if (!text) return { ok: false, error: "empty" };
    return { ok: true, text };

  } catch (e) {
    return { ok: false, error: e?.name === "AbortError" ? "timeout" : "network" };
  } finally {
    clearTimeout(t);
  }
}

function systemPrompt(mode, topic) {
  if (mode === "building") {
    return [
      "You are Simo: a product-grade builder.",
      "When building, you MAY output HTML.",
      "If you output HTML: it MUST be a full document starting with <!doctype html>.",
      "No markdown fences unless the entire output is HTML.",
      "Style: clean, modern, dark-friendly, polished.",
      `Topic: ${topic}`
    ].join("\n");
  }
  if (mode === "venting") {
    return [
      "You are Simo: the user's private best friend.",
      "Be direct and real. No therapy clichés.",
      "Ask at most ONE question at the end.",
      "Do not repeat the same question if it was already asked in RECENT CONTEXT.",
      `Topic: ${topic}`
    ].join("\n");
  }
  return [
    "You are Simo: practical problem-solver.",
    "Give a short, useful answer with numbered steps when appropriate.",
    `Topic: ${topic}`
  ].join("\n");
}

// ---------------- Routing ----------------
function routeMode(input) {
  const t = input.toLowerCase();

  // obvious build triggers
  if (isBuildIntent(t)) return "building";

  // venting triggers
  if (/(i'?m\s+stressed|anxious|depressed|i feel|my wife|my husband|argument|fight|hurts|overwhelmed)/i.test(input)) {
    return "venting";
  }

  return "solving";
}

function isBuildIntent(input) {
  const t = String(input || "").toLowerCase();
  return (
    t.includes("show me") ||
    t.includes("build") ||
    t.includes("landing page") ||
    t.includes("book cover") ||
    t.includes("mockup") ||
    t.includes("preview") ||
    t.includes("html")
  );
}

function detectKind(input, fallbackKind) {
  const t = String(input || "").toLowerCase();
  if (t.includes("book cover")) return "book_cover";
  if (t.includes("landing page")) return "landing";
  if (t.includes("dashboard")) return "dashboard";
  if (t.includes("app")) return "app";
  // edit intent: if user says "add testimonials" and last was landing, keep landing
  if (/(add|remove|change|edit|update)\b/.test(t) && fallbackKind) return fallbackKind;
  return "generic";
}

// ---------------- Build specs + templates ----------------
function buildSpecFromInput(input, kind, lastSpec) {
  const t = String(input || "").toLowerCase();

  // lightweight edits based on follow-ups
  const wantsTestimonials = t.includes("testimonial") || (lastSpec?.wantsTestimonials && !t.includes("remove testimonials"));
  const wantsPricing = t.includes("pricing") || (lastSpec?.wantsPricing && !t.includes("remove pricing"));
  const wantsFAQ = t.includes("faq") || (lastSpec?.wantsFAQ && !t.includes("remove faq"));

  const title = pick(input, /title\s*:\s*["“]?([^"\n”]+)["”]?/i) || lastSpec?.title || "";
  const subtitle = pick(input, /subtitle\s*:\s*["“]?([^"\n”]+)["”]?/i) || lastSpec?.subtitle || "";
  const author = pick(input, /author\s*:\s*["“]?([^"\n”]+)["”]?/i) || lastSpec?.author || "";

  // For landing pages, guess a name from the prompt
  const nameGuess = kind === "landing" ? guessBusinessName(input) : "";

  return {
    raw: input,
    wantsTestimonials,
    wantsPricing,
    wantsFAQ,
    title,
    subtitle,
    author,
    nameGuess
  };
}

function buildTemplate(kind, spec) {
  if (kind === "book_cover") return bookCoverHtml(spec);
  if (kind === "landing") return landingHtml(spec);
  return genericHtml(spec.raw);
}

function bookCoverHtml(spec) {
  const p = String(spec.raw || "");
  const t = p.toLowerCase();

  const isFitness =
    /fitness|workout|coach|gym|training|nutrition|health|strength|fat loss/.test(t);

  const isImmigrant =
    /immigrant|factory|migration|new country|american dream/.test(t);

  const isSpace =
    /space|outer space|galaxy|cosmic|astronaut|stars|planet|universe|nebula|sci-fi|scifi|rocket|orbit|moon|mars/.test(t);

  let title = spec.title || "";
  let subtitle = spec.subtitle || "";
  let author = spec.author || "Simo Studio";
  let kicker = "Book cover concept";
  let blurb = "Tell me the vibe (minimal, gritty, cinematic) and I’ll tune this cover to match.";
  let meta = "Concept • Modern • Clean";

  if (isFitness) {
    title = title || "The Coach’s Playbook";
    subtitle = subtitle || "A practical manual for health & fitness";
    kicker = "Fitness manual";
    blurb = "Training templates, habit rules, nutrition basics, and progress checkpoints — built for real life.";
    meta = "Manual • Strength • Health";
  } else if (isImmigrant) {
    title = title || "New Roots";
    subtitle = subtitle || "A factory worker’s American journey";
    kicker = "A modern immigrant story";
    blurb = "Early mornings. Factory floors. Quiet pride. One shift at a time — building a life with gratitude.";
    meta = "Memoir • Contemporary • Hope";
  } else if (isSpace) {
    title = title || "Beyond the Stars";
    subtitle = subtitle || "A journey through the silence of space";
    kicker = "Space / Sci-Fi";
    blurb = "Dark matter. Distant worlds. One signal that rewrites what humanity believes.";
    meta = "Sci-Fi • Space • Adventure";
  } else {
    title = title || "A New Chapter";
    subtitle = subtitle || "A story shaped by grit and growth";
  }

  const bgTop = isSpace ? "#1a2b7a" : "#1b2a5a";
  const bgBottom = isSpace ? "#070a16" : "#0d1224";
  const stripes = isSpace
    ? "repeating-linear-gradient(90deg, rgba(255,255,255,.035) 0 2px, transparent 2px 14px)"
    : "repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0 2px, transparent 2px 10px)";

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
    margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
    background:radial-gradient(1100px 650px at 18% 0%, #162a66 0%, var(--bg) 55%);
    color:#eaf0ff; display:grid; place-items:center; min-height:100vh; padding:28px;
  }
  .cover{
    width:min(420px, 92vw); aspect-ratio: 2/3; border-radius:18px; overflow:hidden;
    box-shadow:0 30px 80px rgba(0,0,0,.55);
    position:relative; border:1px solid rgba(255,255,255,.14);
    background:
      radial-gradient(900px 700px at 30% 0%, rgba(255,255,255,.12), transparent 60%),
      linear-gradient(160deg, rgba(255,255,255,.06), rgba(0,0,0,.32)),
      ${stripes},
      linear-gradient(180deg, ${bgTop}, ${bgBottom});
  }
  .stripe{
    position:absolute; left:22px; right:22px; top:22px;
    padding:16px 14px; border-radius:14px;
    background:rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.18);
    backdrop-filter: blur(10px);
  }
  h1{margin:0; font-size:34px; letter-spacing:.4px; line-height:1.05}
  h2{margin:10px 0 0; font-size:14px; color:rgba(234,240,255,.82); font-weight:600}
  .badge{
    position:absolute; left:22px; right:22px; bottom:64px;
    border-radius:18px;
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
      <div class="meta">${esc(meta)}</div>
    </div>
  </div>
</body>
</html>`;
}

function landingHtml(spec) {
  const name = spec.nameGuess || "Neighborhood Clinic";
  const wantsPricing = !!spec.wantsPricing;
  const wantsTestimonials = !!spec.wantsTestimonials;
  const wantsFAQ = !!spec.wantsFAQ;

  const pricingBlock = wantsPricing ? `
    <section class="card">
      <h2>Simple pricing</h2>
      <div class="grid3">
        <div class="price">
          <h3>Quick Visit</h3>
          <div class="money">$49</div>
          <ul><li>Same-day slots</li><li>Clear next steps</li><li>Care plan summary</li></ul>
          <button class="btn">Book</button>
        </div>
        <div class="price pop">
          <h3>Family Plan</h3>
          <div class="money">$99</div>
          <ul><li>Priority scheduling</li><li>Text follow-up</li><li>Monthly check-ins</li></ul>
          <button class="btn">Get started</button>
        </div>
        <div class="price">
          <h3>Tele-Care</h3>
          <div class="money">$29</div>
          <ul><li>Video consult</li><li>Rx guidance</li><li>Referrals</li></ul>
          <button class="btn">Schedule</button>
        </div>
      </div>
    </section>` : "";

  const testimonialBlock = wantsTestimonials ? `
    <section class="card">
      <h2>Parents trust us</h2>
      <div class="grid3">
        <div class="quote">“Fast, calm, and thorough. We felt taken care of.”<div class="who">— Local parent</div></div>
        <div class="quote">“Super clean office and the staff was incredibly kind.”<div class="who">— Neighbor</div></div>
        <div class="quote">“Clear steps and follow-up — no confusion.”<div class="who">— Family</div></div>
      </div>
    </section>` : "";

  const faqBlock = wantsFAQ ? `
    <section class="card">
      <h2>FAQ</h2>
      <details><summary>Do you accept walk-ins?</summary><p>We keep same-day slots available. Booking is best.</p></details>
      <details><summary>What ages do you see?</summary><p>Infants through teens — plus parent guidance.</p></details>
      <details><summary>What should I bring?</summary><p>ID, insurance card (if applicable), and any meds list.</p></details>
    </section>` : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(name)} — Landing</title>
<style>
  :root{--bg:#0b1020;--panel:rgba(255,255,255,.06);--line:rgba(255,255,255,.12);--text:#eaf0ff;--muted:rgba(234,240,255,.72);--btn:#2a66ff}
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;background:radial-gradient(1200px 700px at 20% 0%, #162a66 0%, var(--bg) 55%);color:var(--text)}
  .wrap{max-width:980px;margin:0 auto;padding:26px}
  .top{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:14px 16px;border:1px solid var(--line);border-radius:16px;background:rgba(0,0,0,.22)}
  .brand{display:flex;align-items:center;gap:10px}
  .dot{width:10px;height:10px;border-radius:50%;background:#39ff7a;box-shadow:0 0 18px rgba(57,255,122,.45)}
  nav{display:flex;gap:14px;color:var(--muted);font-size:14px}
  .hero{margin-top:16px;border:1px solid var(--line);border-radius:18px;background:var(--panel);padding:20px}
  .hero h1{margin:0;font-size:42px;line-height:1.05}
  .hero p{margin:12px 0 0;color:var(--muted);font-size:16px;max-width:60ch}
  .cta{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
  .btn{border:0;border-radius:12px;padding:12px 14px;background:var(--btn);color:white;font-weight:700;cursor:pointer}
  .btn2{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:rgba(0,0,0,.25);color:var(--text);font-weight:700;cursor:pointer}
  .grid2{display:grid;grid-template-columns:1.2fr .8fr;gap:14px;margin-top:14px}
  .card{border:1px solid var(--line);border-radius:18px;background:var(--panel);padding:18px}
  .card h2{margin:0 0 10px}
  .muted{color:var(--muted);line-height:1.5}
  .list{margin:10px 0 0;padding-left:18px;color:var(--muted)}
  .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
  .price{border:1px solid var(--line);border-radius:16px;padding:14px;background:rgba(0,0,0,.22)}
  .price.pop{outline:2px solid rgba(42,102,255,.35)}
  .money{font-size:32px;font-weight:800;margin:6px 0 10px}
  .quote{border:1px solid var(--line);border-radius:16px;padding:14px;background:rgba(0,0,0,.22);color:var(--muted)}
  .who{margin-top:10px;color:rgba(234,240,255,.55);font-size:13px}
  details{border:1px solid var(--line);border-radius:14px;padding:10px 12px;background:rgba(0,0,0,.18);margin-top:10px}
  summary{cursor:pointer;font-weight:700}
  footer{margin:18px 0 0;color:rgba(234,240,255,.55);font-size:13px;text-align:center}
  @media (max-width: 900px){.grid2{grid-template-columns:1fr}.grid3{grid-template-columns:1fr}}
</style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div class="brand"><span class="dot"></span><strong>${esc(name)}</strong></div>
      <nav><span>Services</span><span>Hours</span><span>Contact</span></nav>
    </div>

    <div class="hero">
      <h1>Safe, warm care — right here in your neighborhood</h1>
      <p>Same-day availability • trusted staff • simple scheduling. Pediatric-friendly support for busy families.</p>
      <div class="cta">
        <button class="btn">Book an appointment</button>
        <button class="btn2">Call the clinic</button>
      </div>
      <p class="muted" style="margin-top:12px;font-size:13px">Tip: say “add testimonials and pricing” to expand this page.</p>
    </div>

    <div class="grid2">
      <section class="card">
        <h2>What we help with</h2>
        <p class="muted">Quick visits, clear explanations, and a plan you can actually follow.</p>
        <ul class="list">
          <li>Child wellness checks</li>
          <li>Cold/flu + urgent pediatric visits</li>
          <li>Parent guidance + next steps</li>
        </ul>
      </section>
      <aside class="card">
        <h2>Hours</h2>
        <p class="muted">Mon–Fri: 8am–6pm<br/>Sat: 9am–1pm<br/>Same-day slots available</p>
        <div style="height:10px"></div>
        <h2>Location</h2>
        <p class="muted">Near you — add your address + city to personalize.</p>
      </aside>
    </div>

    ${testimonialBlock}
    ${pricingBlock}
    ${faqBlock}

    <footer>© ${new Date().getFullYear()} ${esc(name)} • Built as a preview mockup</footer>
  </div>
</body>
</html>`;
}

function genericHtml(prompt) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Simo Build</title>
<style>
  :root{--bg:#0b1020;--panel:rgba(255,255,255,.06);--line:rgba(255,255,255,.12);--text:#eaf0ff}
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui;background:radial-gradient(1200px 700px at 20% 0%, #162a66 0%, var(--bg) 55%);color:var(--text);min-height:100vh;display:grid;place-items:center;padding:24px}
  .card{max-width:980px;width:92%;border:1px solid var(--line);border-radius:18px;background:var(--panel);padding:18px}
  .muted{color:rgba(234,240,255,.75);line-height:1.5}
</style>
</head>
<body>
  <div class="card">
    <h1>Simo Build</h1>
    <p class="muted">${esc(prompt)}</p>
  </div>
</body>
</html>`;
}

// ---------------- Fallback text (non-looping) ----------------
function fallbackText(mode, input, history) {
  const lastAssistant = [...history].reverse().find(h => h.role === "assistant")?.text || "";
  const alreadyAsked = (q) => lastAssistant.toLowerCase().includes(q.toLowerCase());

  if (mode === "venting") {
    // vary the follow-up so it doesn’t loop
    const q1 = "What happened — and what part is bothering you the most?";
    const q2 = "Alright. What’s the exact moment where it went sideways?";
    const q3 = "Say the one sentence you wish they understood.";

    if (!alreadyAsked(q1)) return `I’m here. ${q1}`;
    if (!alreadyAsked(q2)) return `Got you. ${q2}`;
    return `I’m with you. ${q3}`;
  }

  if (mode === "solving") {
    return `Got it. What’s the goal, what have you tried, and what’s the one constraint (time/money/tools)?`;
  }

  return `Tell me what you want to build (landing page, book cover, app mockup) and I’ll generate a preview.`;
}

// ---------------- Helpers ----------------
function safeJson(s) {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}
function json(statusCode, obj, headers) {
  return { statusCode, headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(obj) };
}
function clean(s) { return (typeof s === "string") ? s.replace(/\u0000/g, "").trim() : ""; }
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
  return String(s || "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
}
function pick(s, re) {
  const m = String(s || "").match(re);
  return m ? m[1].trim() : "";
}
function guessBusinessName(input) {
  const t = String(input || "");
  if (/child\s*care/i.test(t)) return "Neighborhood Child Care Clinic";
  if (/clinic/i.test(t)) return "Neighborhood Clinic";
  return "Neighborhood Service";
}
