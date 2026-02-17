// netlify/functions/simon.js
// CommonJS for Netlify Functions

const OpenAI = require("openai");
const { getStore } = require("@netlify/blobs");

const VERSION = "simo-backend-2026-02-17b";

// --- OpenAI client (only used for non-preview chat to reduce errors/latency)
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Choose a safer default model; you can override with SIMO_MODEL in Netlify env vars.
const DEFAULT_MODEL = process.env.SIMO_MODEL || "gpt-4o-mini";

// Netlify Blobs store for per-device state (preview persists across refresh)
const store = getStore("simo");

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST,OPTIONS,GET",
    },
    body: JSON.stringify(obj),
  };
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

function makeLandingPreview({ brand = "FlowPro", proPrice = "$29/mo" } = {}) {
  const body = `
    <h1>${escapeHtml(brand)} helps you automate your workflow.</h1>
    <p>Save time. Reduce manual work. Scale smarter.</p>
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

function normalizeMode(mode) {
  const m = String(mode || "building").toLowerCase();
  if (m.startsWith("vent")) return "venting";
  if (m.startsWith("solv")) return "solving";
  return "building";
}

function parsePrice(message = "") {
  const m = String(message);
  const match = m.match(/\$?\s*(\d{1,4})\s*(?:\/?\s*(mo|month|monthly))?/i);
  if (!match) return null;
  return `$${match[1]}/mo`;
}

// Intent detection: keep it simple + reliable
function detectIntent(message = "", mode = "building") {
  const s = message.toLowerCase();

  if (mode === "building") {
    if (/(build|make|create).*(landing page|landing|landing preview)/i.test(message)) return "landing_build";
    if (/(change|update|edit).*(pro).*(price|pricing)/i.test(message) || /pro.*\$\s*\d+/i.test(message)) return "pricing_edit";
    if (/change\s+pro\s+price\s+to\s+\$?\s*\d+/i.test(message)) return "pricing_edit";
  }

  return "chat";
}

async function loadState(clientId) {
  if (!clientId) return { preview: null };
  try {
    const raw = await store.get(`state:${clientId}`, { type: "json" });
    return raw || { preview: null };
  } catch {
    return { preview: null };
  }
}

async function saveState(clientId, state) {
  if (!clientId) return;
  try {
    await store.set(`state:${clientId}`, state, { type: "json" });
  } catch {
    // ignore
  }
}

function localReply(mode, message) {
  if (mode === "building") {
    // Keep it short in building mode; preview speaks for itself.
    if (/landing/i.test(message)) return "Done — preview is on the right.";
    if (/price/i.test(message) && /pro/i.test(message)) return "Updated — Pro price changed in the preview.";
    return "Got it. Tell me what you want to build, and I’ll show a preview if I can.";
  }
  if (mode === "venting") {
    return "I’m here. Talk to me — what happened?";
  }
  // solving
  return "Okay — what’s the goal, and what’s blocking you right now?";
}

async function openaiReply({ mode, message, history }) {
  // Hard timeout so we don’t hang and cause “Server error”.
  const TIMEOUT_MS = 8500;

  const system = `
You are Simo: a private best friend + builder.

Mode rules:
- venting: supportive, human, no generic therapy clichés unless asked.
- solving: practical steps, checklists, choices.
- building: helpful, concise, can propose a plan; previews handled separately.

Keep it short and natural. No lecturing.
`.trim();

  const input = [
    { role: "system", content: system },
    ...(Array.isArray(history) ? history.slice(-10).map(x => ({
      role: x.role === "assistant" ? "assistant" : "user",
      content: String(x.content || "")
    })) : []),
    { role: "user", content: `Mode: ${mode}\nUser: ${message}` },
  ];

  const p = client.responses.create({
    model: DEFAULT_MODEL,
    input
  });

  const resp = await Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS)),
  ]);

  return (resp.output_text || "").trim();
}

exports.handler = async (event) => {
  // Version / health
  if (event.httpMethod === "GET") {
    return json(200, { version: VERSION, ok: true, note: "POST {message, mode, pro, clientId} to generate previews." });
  }
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  try {
    const body = JSON.parse(event.body || "{}");
    const message = String(body.message || "").trim();
    const mode = normalizeMode(body.mode);
    const pro = !!body.pro;
    const clientId = String(body.clientId || "").trim();
    const history = body.history;

    if (!message) return json(400, { ok: false, error: "Missing message" });

    // If you want “chat only” without OpenAI key for now, you can still build previews.
    const hasKey = !!process.env.OPENAI_API_KEY;

    // Load persisted state (preview survives refresh)
    const state = await loadState(clientId);
    let preview = state.preview || null;

    const intent = detectIntent(message, mode);

    // --- FAST PATH: build/edit preview locally (no OpenAI call)
    if (mode === "building" && pro) {
      if (intent === "landing_build") {
        preview = {
          name: "landing_page",
          kind: "html",
          html: makeLandingPreview({ brand: "FlowPro", proPrice: "$29/mo" }),
        };
        state.preview = preview;
        await saveState(clientId, state);

        return json(200, {
          ok: true,
          reply: localReply(mode, message),
          preview
        });
      }

      if (intent === "pricing_edit") {
        const newPrice = parsePrice(message) || "$19/mo";

        // If no preview yet, create one so the edit always works.
        if (!preview || preview.name !== "landing_page") {
          preview = {
            name: "landing_page",
            kind: "html",
            html: makeLandingPreview({ brand: "FlowPro", proPrice: newPrice }),
          };
        } else {
          // Regenerate the same preview with updated pro price
          preview = {
            name: "landing_page",
            kind: "html",
            html: makeLandingPreview({ brand: "FlowPro", proPrice: newPrice }),
          };
        }

        state.preview = preview;
        await saveState(clientId, state);

        return json(200, {
          ok: true,
          reply: localReply(mode, message),
          preview
        });
      }
    }

    // --- CHAT PATH: use OpenAI only when needed
    // If no key, fall back to local replies (so you never get “Server error” just for chatting).
    let reply = "";
    if (!hasKey) {
      reply = localReply(mode, message);
      return json(200, { ok: true, reply, preview: null });
    }

    try {
      reply = await openaiReply({ mode, message, history });
      if (!reply) reply = localReply(mode, message);
    } catch (e) {
      // Don’t fail the whole request — return a safe fallback
      reply = localReply(mode, message);
    }

    return json(200, { ok: true, reply, preview: null });
  } catch (e) {
    return json(500, { ok: false, error: "Server error" });
  }
};
