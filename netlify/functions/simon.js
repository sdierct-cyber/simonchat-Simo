// netlify/functions/simon.js
// CommonJS export for Netlify Functions

const OpenAI = require("openai");

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST,OPTIONS",
    },
    body: JSON.stringify(obj),
  };
}

function safeParseJSON(s, fallback = {}) {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return fallback;
  }
}

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function htmlShell({ title = "Preview", body = "" } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>
  :root{
    --bg:#0b1020; --text:#eaf0ff; --muted:#a9b6d3;
    --line:rgba(255,255,255,.10);
    --shadow: 0 18px 55px rgba(0,0,0,.45);
    --btn:#2a66ff; --btn2:#1f4dd6;
  }
  *{box-sizing:border-box}
  body{
    margin:0; font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
    background:radial-gradient(1200px 700px at 20% 0%, #162a66 0%, var(--bg) 55%);
    color:var(--text);
    padding:24px;
  }
  .card{
    max-width:980px;margin:0 auto;
    border:1px solid var(--line);
    border-radius:18px;
    background:linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.02));
    box-shadow:var(--shadow);
    padding:18px 18px 22px;
  }
  h1{margin:0 0 10px;font-size:44px;letter-spacing:.2px}
  p{margin:0 0 16px;color:rgba(234,240,255,.78);line-height:1.4;font-size:18px}
  .row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px}
  .btn{
    display:inline-flex;align-items:center;justify-content:center;
    padding:10px 14px;border-radius:12px;
    border:1px solid var(--line);
    background:rgba(0,0,0,.18);
    color:var(--text);
    font-weight:800;text-decoration:none;
  }
  .btn.primary{background:linear-gradient(180deg,var(--btn),var(--btn2));border-color:rgba(42,102,255,.45)}
  .features{display:grid;gap:12px;margin:18px 0 18px}
  .feat{
    border:1px solid var(--line);border-radius:14px;padding:16px;
    background:rgba(0,0,0,.14);font-size:18px;
  }
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:16px}
  .plan{
    border:1px solid var(--line);border-radius:16px;padding:16px 16px 18px;
    background:rgba(0,0,0,.14);
    min-height:240px;
    text-align:center;
  }
  .plan h3{margin:0 0 6px;font-size:22px}
  .price{font-size:42px;font-weight:900;margin:10px 0 12px}
  .muted{color:rgba(234,240,255,.70);font-size:16px;line-height:1.6}
  .badge{
    display:inline-block;
    padding:6px 10px;border-radius:999px;
    border:1px solid rgba(42,102,255,.45);
    background:rgba(42,102,255,.18);
    font-weight:900;font-size:12px;margin-bottom:10px;
  }
  @media (max-width:860px){ .grid{grid-template-columns:1fr} h1{font-size:34px} }
</style>
</head>
<body>
  <div class="card">
    ${body}
  </div>
</body>
</html>`;
}

function makeLandingPreview({ brand = "FlowPro", headline, subhead, proPrice = "$29/mo" } = {}) {
  const body = `
    <h1>${escapeHtml(headline || `${brand} helps you automate your workflow.`)}</h1>
    <p>${escapeHtml(subhead || "Save time. Reduce manual work. Scale smarter.")}</p>
    <div class="row">
      <a class="btn primary" href="#">Get Started</a>
      <a class="btn" href="#">See Demo</a>
    </div>

    <div class="features">
      <div class="feat">Automated task pipelines</div>
      <div class="feat">Smart scheduling</div>
      <div class="feat">Real-time analytics dashboard</div>
    </div>

    <div class="grid">
      <div class="plan">
        <h3>Starter</h3>
        <div class="price">$9/mo</div>
        <div class="muted">Basic support<br/>Core features<br/>1 user</div>
        <div style="margin-top:16px"><a class="btn primary" href="#">Choose Plan</a></div>
      </div>

      <div class="plan">
        <div class="badge">Most Popular</div>
        <h3>Pro</h3>
        <div class="price">${escapeHtml(proPrice)}</div>
        <div class="muted">Priority support<br/>All features<br/>5 users</div>
        <div style="margin-top:16px"><a class="btn primary" href="#">Choose Plan</a></div>
      </div>

      <div class="plan">
        <h3>Enterprise</h3>
        <div class="price">$99/mo</div>
        <div class="muted">Dedicated support<br/>Custom integrations<br/>Unlimited users</div>
        <div style="margin-top:16px"><a class="btn primary" href="#">Contact Sales</a></div>
      </div>
    </div>
  `;
  return htmlShell({ title: `${brand} – Landing`, body });
}

function pickMode(modeRaw) {
  const m = String(modeRaw || "").toLowerCase();
  if (m === "venting" || m === "solving" || m === "building") return m;
  return "building";
}

function detectIntent(message = "", mode = "building") {
  const raw = String(message || "");
  const m = raw.toLowerCase();

  // price edit intent
  if (/(change|update|edit).*(pro).*(price|\$)/i.test(raw) || /pro.*price/i.test(m)) return "pricing_edit";
  if (/(change|update|edit).*(starter|enterprise).*(price|\$)/i.test(raw)) return "pricing_edit";

  // landing build
  if (/(landing page|build a landing|landing preview|landing page preview)/i.test(raw)) return "landing_page";

  // generic builder
  return mode === "building" ? "builder_general" : "chat_general";
}

function extractPriceDollars(message = "") {
  const s = String(message || "");
  // grab first integer that looks like price
  const match = s.match(/\$?\s*(\d{1,4})(?:\s*\/\s*mo|\s*per\s*mo|\s*monthly|\s*month)?/i);
  return match ? match[1] : null;
}

async function tryOpenAIReply({ message, mode, pro }) {
  if (!process.env.OPENAI_API_KEY) return null;

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini"; // change in Netlify env if you want
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const system = `
You are Simo: best friend + builder.

Behavior:
- Venting: supportive best-friend. No corny therapy clichés. Short, human, specific.
- Solving: practical steps and options.
- Building: ask 1 tight clarifying question only if needed, otherwise generate.

Always keep responses concise.
Never say "Preview is on the right" unless a preview is actually returned.
`.trim();

  const input = [
    { role: "system", content: system },
    { role: "user", content: `Mode: ${mode}\nPro: ${pro}\nUser message: ${message}` },
  ];

  const resp = await client.responses.create({ model, input });
  const text = (resp && resp.output_text) ? String(resp.output_text).trim() : "";
  return text || null;
}

function fallbackReply({ mode, intent, message, pro }) {
  const m = String(message || "").trim();

  if (mode === "venting") {
    return `I got you. Tell me the part that’s bugging you the most — what happened, and what do you want to happen next?`;
  }

  if (mode === "solving") {
    return `Alright. Paste the exact goal in one line (what you want), and what’s currently breaking. I’ll give you the shortest fix steps.`;
  }

  // building
  if (!pro) {
    return `You’re in Building mode. Turn **Pro Mode** on to auto-render previews, or say “give me HTML” and I’ll output the code.`;
  }

  if (intent === "landing_page") {
    return `Done — rendered a clean landing page preview. Want me to add pricing + testimonials, or keep it minimal?`;
  }

  if (intent === "pricing_edit") {
    return `Done — I updated the Pro price in the preview. Want Starter/Enterprise changed too or keep those?`;
  }

  if (!m) return `Tell me what we’re building in one sentence.`;
  return `Got it. Want a rendered mockup preview, HTML code, or both?`;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  const started = Date.now();

  try {
    const body = safeParseJSON(event.body, {});
    const message = String(body.message || "");
    const mode = pickMode(body.mode);
    const pro = !!body.pro;

    // "state" lets the UI send last preview settings so edits are consistent
    const state = body.state && typeof body.state === "object" ? body.state : {};
    const last = state.lastPreview && typeof state.lastPreview === "object" ? state.lastPreview : null;

    if (!message.trim()) return json(400, { ok: false, error: "Missing message" });

    const intent = detectIntent(message, mode);

    // build preview first (so preview can still work even if OpenAI fails)
    let preview = null;
    let nextState = { ...state };

    if (mode === "building" && pro) {
      if (intent === "landing_page") {
        const params = {
          brand: state.brand || "FlowPro",
          headline: state.headline || "FlowPro helps you automate your workflow.",
          subhead: state.subhead || "Save time. Reduce manual work. Scale smarter.",
          proPrice: state.proPrice || "$29/mo",
        };

        preview = {
          name: "landing_page",
          kind: "html",
          html: makeLandingPreview(params),
        };

        nextState = { ...nextState, ...params, lastPreview: { name: "landing_page" } };
      }

      if (intent === "pricing_edit") {
        const dollars = extractPriceDollars(message) || "19";

        // If last preview was a landing page, keep its brand/headline/subhead
        const params = {
          brand: state.brand || (last && last.name === "landing_page" ? "FlowPro" : "FlowPro"),
          headline: state.headline || "FlowPro helps you automate your workflow.",
          subhead: state.subhead || "Save time. Reduce manual work. Scale smarter.",
          proPrice: `$${dollars}/mo`,
        };

        preview = {
          name: "landing_page",
          kind: "html",
          html: makeLandingPreview(params),
        };

        nextState = { ...nextState, ...params, lastPreview: { name: "landing_page" } };
      }
    }

    // Try OpenAI (optional). If it fails or is slow, fallback.
    let reply = null;
    let usedOpenAI = false;

    try {
      const ai = await tryOpenAIReply({ message, mode, pro });
      if (ai) {
        reply = ai;
        usedOpenAI = true;
      }
    } catch (e) {
      // swallow OpenAI errors; we still respond successfully
      usedOpenAI = false;
    }

    if (!reply) reply = fallbackReply({ mode, intent, message, pro });

    return json(200, {
      ok: true,
      reply,
      preview,
      state: nextState,
      debug: {
        intent,
        mode,
        pro,
        usedOpenAI,
        ms: Date.now() - started,
        version: "simo-backend-2026-02-17b",
      },
    });
  } catch (e) {
    // IMPORTANT: return the actual error to the UI so you can see what happened
    return json(500, {
      ok: false,
      error: "Server error",
      details: String(e && e.message ? e.message : e),
      version: "simo-backend-2026-02-17b",
    });
  }
};
