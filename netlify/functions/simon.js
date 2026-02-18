// netlify/functions/simon.js
// SIMO backend — "locked v4" style behavior:
// - mode routing (venting/solving/building) without breaking flow
// - deterministic landing page + deterministic book cover
// - preview edits (basic) work
// - OPTIONAL OpenAI Responses call if OPENAI_API_KEY exists (fallback safe if not)

// Node 18+ (Netlify) supports fetch
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};

function j(statusCode, obj) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(obj) };
}

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function clampArr(a, n) {
  if (!Array.isArray(a)) return [];
  return a.slice(Math.max(0, a.length - n));
}

/* -------------------------
   Deterministic generators
-------------------------- */

function makeLandingPage({ title, subtitle, cta, theme }) {
  const T = escapeHtml(title || "Simo Landing");
  const S = escapeHtml(subtitle || "A clean, fast landing page you can ship today.");
  const C = escapeHtml(cta || "Get Started");
  const accent = theme === "pro" ? "#39ff7a" : "#2a66ff";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${T}</title>
<style>
  :root{--bg:#0b1020;--text:#eaf0ff;--muted:#a9b6d3;--line:rgba(255,255,255,.12);--accent:${accent};}
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
    background:radial-gradient(1200px 700px at 18% 0%, #162a66 0%, var(--bg) 55%);
    color:var(--text);}
  .wrap{max-width:980px;margin:0 auto;padding:28px}
  .hero{padding:34px;border:1px solid var(--line);border-radius:22px;
    background:linear-gradient(180deg, rgba(255,255,255,.08), rgba(0,0,0,.16));}
  .tag{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;
    border:1px solid var(--line);background:rgba(0,0,0,.20);font-weight:800;color:var(--muted);font-size:12px}
  .dot{width:10px;height:10px;border-radius:99px;background:var(--accent);box-shadow:0 0 18px rgba(57,255,122,.45)}
  h1{margin:16px 0 10px;font-size:44px;line-height:1.05;letter-spacing:-.6px}
  p{margin:0 0 18px;color:var(--muted);font-weight:650;font-size:16px;line-height:1.5}
  .row{display:flex;gap:10px;flex-wrap:wrap}
  .btn{border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.22);color:var(--text);
    font-weight:900;border-radius:14px;padding:12px 14px;cursor:pointer}
  .btn.primary{border-color:rgba(57,255,122,.35);background:rgba(57,255,122,.15)}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:22px}
  @media (max-width:860px){.grid{grid-template-columns:1fr}}
  .card{border:1px solid var(--line);border-radius:18px;padding:14px;background:rgba(0,0,0,.18)}
  .card b{display:block;margin-bottom:6px}
</style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <div class="tag"><span class="dot"></span> Deterministic landing page</div>
      <h1>${T}</h1>
      <p>${S}</p>
      <div class="row">
        <button class="btn primary">${C}</button>
        <button class="btn">Learn More</button>
      </div>

      <div class="grid">
        <div class="card"><b>Fast</b><span>Clean structure + simple styling.</span></div>
        <div class="card"><b>Clear</b><span>Headline → value → call-to-action.</span></div>
        <div class="card"><b>Polished</b><span>Modern dark UI with accent.</span></div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function makeBookCover({ title, author }) {
  const T = escapeHtml(title || "I Am Angel");
  const A = escapeHtml(author || "Simon Gojcaj");

  // SVG cover inside HTML so iframe renders it instantly
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${T} — Cover</title>
<style>
  html,body{height:100%;margin:0;background:transparent}
  .wrap{height:100%;display:flex;align-items:center;justify-content:center;padding:16px}
  .frame{width:min(520px,100%);aspect-ratio:2/3;border-radius:18px;overflow:hidden;
    border:1px solid rgba(255,255,255,.12);box-shadow:0 18px 40px rgba(0,0,0,.45)}
</style>
</head>
<body>
  <div class="wrap">
    <div class="frame">
      <svg viewBox="0 0 600 900" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="g" cx="20%" cy="0%" r="80%">
            <stop offset="0%" stop-color="#1e4ad6"/>
            <stop offset="55%" stop-color="#0b1020"/>
            <stop offset="100%" stop-color="#070b14"/>
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="6" result="b"/>
            <feMerge>
              <feMergeNode in="b"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <rect width="600" height="900" fill="url(#g)"/>
        <circle cx="140" cy="170" r="90" fill="#39ff7a" opacity="0.18" filter="url(#glow)"/>
        <circle cx="470" cy="290" r="130" fill="#2a66ff" opacity="0.12" filter="url(#glow)"/>
        <path d="M300 250 C260 330, 210 410, 170 500 C250 470, 320 430, 390 370 C350 330, 330 290, 300 250 Z"
              fill="#eaf0ff" opacity="0.10"/>
        <path d="M290 280 C250 350, 220 430, 205 510 C265 480, 320 440, 365 385 C335 350, 315 315, 290 280 Z"
              fill="#39ff7a" opacity="0.14"/>

        <text x="300" y="150" text-anchor="middle" fill="#eaf0ff" font-size="48" font-family="system-ui" font-weight="900">${T}</text>
        <text x="300" y="200" text-anchor="middle" fill="#a9b6d3" font-size="18" font-family="system-ui" font-weight="800">A novel</text>

        <rect x="90" y="610" width="420" height="1" fill="rgba(255,255,255,.18)"/>
        <text x="300" y="690" text-anchor="middle" fill="#eaf0ff" font-size="22" font-family="system-ui" font-weight="900">${A}</text>

        <text x="300" y="835" text-anchor="middle" fill="#a9b6d3" font-size="12" font-family="system-ui" font-weight="800">deterministic cover preview</text>
      </svg>
    </div>
  </div>
</body>
</html>`;
}

function applySimpleHtmlEdit(html, instruction) {
  // Lightweight edit rules: title, headline, button text, add FAQ section, etc.
  // (deterministic so it won’t “brainfart”)
  const t = (instruction || "").toLowerCase();

  let out = html;

  // Update title tag
  const titleMatch = instruction.match(/title\s*:\s*(.+)/i);
  if (titleMatch) {
    const newTitle = escapeHtml(titleMatch[1].trim());
    out = out.replace(/<title>.*?<\/title>/i, `<title>${newTitle}</title>`);
  }

  // Update first <h1>
  const h1Match = instruction.match(/headline\s*:\s*(.+)/i);
  if (h1Match) {
    const newH1 = escapeHtml(h1Match[1].trim());
    out = out.replace(/<h1>.*?<\/h1>/i, `<h1>${newH1}</h1>`);
  }

  // Add FAQ if requested
  if (t.includes("add faq") && !t.includes("remove faq")) {
    if (!out.includes("id=\"faq\"")) {
      out = out.replace(
        /<\/body>/i,
        `
<section id="faq" style="max-width:980px;margin:18px auto 34px;padding:0 28px">
  <div style="border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:14px;background:rgba(0,0,0,.18)">
    <div style="font-weight:900;margin-bottom:8px;color:#eaf0ff">FAQ</div>
    <div style="color:#a9b6d3;font-weight:650;line-height:1.5">
      <b style="color:#eaf0ff">Q:</b> How fast can I launch?<br/>
      <b style="color:#eaf0ff">A:</b> This template is ready now—swap copy and ship.<br/><br/>
      <b style="color:#eaf0ff">Q:</b> Can I customize it?<br/>
      <b style="color:#eaf0ff">A:</b> Yes—ask Simo to edit headline, CTA, sections, etc.
    </div>
  </div>
</section>
</body>`
      );
    }
  }

  // Remove FAQ if requested
  if (t.includes("remove faq")) {
    out = out.replace(/<section id="faq"[\s\S]*?<\/section>\s*/i, "");
  }

  // CTA text change
  const ctaMatch = instruction.match(/cta\s*:\s*(.+)/i);
  if (ctaMatch) {
    const newCta = escapeHtml(ctaMatch[1].trim());
    out = out.replace(/<button class="btn primary">.*?<\/button>/i, `<button class="btn primary">${newCta}</button>`);
  }

  return out;
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* -------------------------
   Mode routing (simple + stable)
-------------------------- */

function detectMode(userText) {
  const t = (userText || "").toLowerCase();

  if (t.includes("i'm stressed") || t.includes("im stressed") || t.includes("vent") || t.includes("argument") || t.includes("wife") || t.includes("upset") || t.includes("anx")) {
    return "venting";
  }
  if (t.includes("fix") || t.includes("debug") || t.includes("error") || t.includes("why") || t.includes("how do i") || t.includes("issue")) {
    return "solving";
  }
  if (t.includes("build") || t.includes("landing page") || t.includes("book cover") || t.includes("preview") || t.includes("app") || t.includes("website") || t.includes("design")) {
    return "building";
  }
  return "building"; // default
}

function wantsCover(userText) {
  const t = (userText || "").toLowerCase();
  return t.includes("book cover") || t.includes("cover");
}

function wantsLanding(userText) {
  const t = (userText || "").toLowerCase();
  return t.includes("landing page") || t.includes("website") || t.includes("homepage");
}

function wantsPreview(userText) {
  const t = (userText || "").toLowerCase();
  return t.includes("show me a preview") || t.includes("show preview") || t.includes("preview");
}

function wantsEdit(userText) {
  const t = (userText || "").toLowerCase();
  return t.startsWith("edit") || t.includes("edit the preview") || t.includes("update the preview") || t.includes("change the preview") || t.includes("add faq") || t.includes("remove faq") || t.includes("headline:") || t.includes("cta:");
}

/* -------------------------
   Optional OpenAI Responses (safe)
-------------------------- */

async function tryOpenAI({ userText, conversation }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  // Keep it conservative so it won't break if model changes:
  const input = buildResponsesInput(userText, conversation);

  const body = {
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    input,
    // Keep responses strictly text
    text: { format: { type: "text" } },
    temperature: 0.6,
  };

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const errTxt = await r.text().catch(() => "");
    return { error: `OpenAI error (${r.status})`, details: errTxt.slice(0, 1200) };
  }

  const data = await r.json();
  const text = extractResponsesText(data);
  return { text: text || "" };
}

function buildResponsesInput(userText, conversation) {
  // Build a single message with lightweight context (stable)
  const ctx = Array.isArray(conversation) ? conversation.slice(-10) : [];
  const history = ctx.map(m => `${m.role === "user" ? "User" : "Simo"}: ${m.content}`).join("\n");

  const prompt =
`You are Simo: a direct, helpful best-friend assistant.
- If the user vents: be supportive and real, not therapy-speak.
- If the user builds: give actionable steps and concise deliverables.
- If the user solves: give tight troubleshooting steps.
Keep it short, confident, and avoid asking lots of questions.

Conversation so far:
${history}

User: ${userText}
Simo:`;

  return [
    {
      role: "user",
      content: [{ type: "input_text", text: prompt }],
    }
  ];
}

function extractResponsesText(data) {
  // responses API shape: data.output[] items with content[] having type 'output_text'
  const out = data && Array.isArray(data.output) ? data.output : [];
  let acc = "";
  for (const item of out) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const c of content) {
      if (c && c.type === "output_text" && typeof c.text === "string") {
        acc += c.text;
      }
    }
  }
  return acc.trim();
}

/* -------------------------
   Handler
-------------------------- */

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return j(200, { ok: true });

  if (event.httpMethod !== "POST") {
    return j(405, { ok: false, error: "Method not allowed" });
  }

  const body = safeJsonParse(event.body || "{}") || {};
  const userText = (body.text || "").toString().trim();
  const tier = (body.tier === "pro") ? "pro" : "free";
  const conversation = clampArr(body.conversation, 16);
  const lastPreview = body.lastPreview && typeof body.lastPreview.html === "string" ? body.lastPreview : null;

  if (!userText) return j(400, { ok: false, error: "Missing message" });

  const mode = detectMode(userText);

  // --- Deterministic preview logic ---
  let preview = null;
  let reply = "";

  // Preview edits
  if (wantsEdit(userText) && lastPreview?.html) {
    const newHtml = applySimpleHtmlEdit(lastPreview.html, userText);
    preview = { kind: lastPreview.kind || "html", html: newHtml, title: "Preview updated", meta: "Edited deterministically" };
    reply = `Done. I updated the preview. If you want a specific change, use:\n- headline: ...\n- cta: ...\n- add faq\n- remove faq\n- title: ...`;
    return j(200, { ok: true, text: reply, preview, meta: { mode, tier } });
  }

  // Deterministic cover
  if (wantsCover(userText) && wantsPreview(userText)) {
    const html = makeBookCover({ title: "I Am Angel", author: "Simon Gojcaj" });
    preview = { kind: "cover", html, title: "Book cover", meta: "Deterministic cover preview" };
    reply = `Here’s a clean book cover preview. If you want edits, say:\n- headline: YOUR TITLE\n- title: YOUR TITLE\n(Or tell me mood/colors and I’ll re-style it.)`;
    return j(200, { ok: true, text: reply, preview, meta: { mode, tier } });
  }

  // Deterministic landing page
  if (wantsLanding(userText) && wantsPreview(userText)) {
    const html = makeLandingPage({
      title: (tier === "pro") ? "Simo Pro" : "Simo",
      subtitle: "A clean landing page preview — ask me to edit headline/CTA/sections.",
      cta: (tier === "pro") ? "Upgrade to Pro" : "Start Free",
      theme: tier,
    });
    preview = { kind: "html", html, title: "Landing page", meta: `Deterministic • theme: ${tier}` };
    reply = `Preview is on the right. Want a change? Try:\n- headline: ...\n- cta: ...\n- add faq`;
    return j(200, { ok: true, text: reply, preview, meta: { mode, tier } });
  }

  // If user asks for preview but didn’t specify what:
  if (wantsPreview(userText) && !wantsLanding(userText) && !wantsCover(userText) && !wantsEdit(userText)) {
    reply = `Preview’s ready when you tell me what to preview.\nExamples:\n- “show me a preview of a landing page for a bakery”\n- “show me a preview of a space renting app”\n- “show me a preview book cover”`;
    return j(200, { ok: true, text: reply, preview: { kind: "none" }, meta: { mode, tier } });
  }

  // --- Text replies (optional OpenAI, fallback deterministic) ---
  // Try OpenAI if available:
  const ai = await tryOpenAI({ userText, conversation });
  if (ai && ai.error) {
    // fall back (do NOT break)
    reply = fallbackReply(mode, userText);
    return j(200, { ok: true, text: reply, meta: { mode, tier, openai: "error", details: ai.details?.slice(0, 400) || "" } });
  }
  if (ai && typeof ai.text === "string" && ai.text.trim()) {
    return j(200, { ok: true, text: ai.text.trim(), meta: { mode, tier, openai: "used" } });
  }

  // Deterministic fallback
  reply = fallbackReply(mode, userText);
  return j(200, { ok: true, text: reply, meta: { mode, tier, openai: "off" } });
};

function fallbackReply(mode, userText) {
  const t = (userText || "").trim();

  if (mode === "venting") {
    return `I’m with you. Say it straight — what part is hitting you the hardest right now?\nIf you want me to help fix it too, tell me what outcome you want (quiet peace, respect, time, etc.).`;
  }
  if (mode === "solving") {
    return `Alright. Paste the exact error text and tell me what you clicked right before it.\nThen I’ll give you one clean fix path (no detours).`;
  }
  // building
  return `Got you. Tell me what you’re building in one line.\nIf you want the preview on the right, literally say: “show me a preview of ___”.`;
}
