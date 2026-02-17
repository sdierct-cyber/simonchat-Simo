// netlify/functions/simon.js
// CommonJS Netlify Function

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
      "access-control-allow-methods": "GET,POST,OPTIONS",
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

function makeLandingPreview({
  brand = "FlowPro",
  starterPrice = "$9/mo",
  proPrice = "$29/mo",
  enterprisePrice = "$99/mo",
} = {}) {
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
        <div class="price">${escapeHtml(starterPrice)}</div>
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
        <div class="price">${escapeHtml(enterprisePrice)}</div>
        <div class="muted">Dedicated support<br/>Custom integrations<br/>Unlimited users</div>
        <div style="margin-top:16px"><a class="btn primary" href="#">Contact Sales</a></div>
      </div>
    </div>
  `;
  return htmlShell({ title: `${brand} – Landing`, body });
}

function extractMoneyNumber(message = "") {
  const m = message.match(/\$?\s*(\d{1,4})\s*(?:\/?\s*mo|month|monthly)?/i);
  return m ? m[1] : null;
}

function detectIntent(message = "", mode = "building") {
  const txt = message.toLowerCase();

  // pricing edit intent
  if (
    /(change|update|edit).*(pro).*(price|\$)/i.test(message) ||
    /pro.*(price|\$)/i.test(txt)
  ) return "pricing_edit";

  // landing build intent
  if (/(landing page|build a landing|landing preview)/i.test(message)) return "landing_page";

  return mode === "building" ? "builder_general" : "chat_general";
}

async function generateReply({ message, mode, pro }) {
  const system = `
You are Simo — best friend + builder.

Style rules:
- Venting: supportive best-friend tone, no corny therapy clichés unless asked.
- Solving: practical, clear steps.
- Building: concise plan + offer preview actions (save/copy/download).

Behavior:
- If user asks to change pricing (e.g., "change Pro to $19"), acknowledge the exact new price.
- Keep it short; don't lecture.

Return plain text only.
`.trim();

  // NOTE: If you want, you can switch models later.
  const resp = await client.responses.create({
    model: "gpt-5-mini",
    input: [
      { role: "system", content: system },
      { role: "user", content: `Mode: ${mode}\nPro: ${pro}\nUser: ${message}` },
    ],
  });

  return (resp.output_text || "Okay.").trim();
}

exports.handler = async (event) => {
  // health / version
  if (event.httpMethod === "GET") {
    return json(200, {
      version: "simo-backend-2026-02-17b",
      ok: true,
      note: "POST {message, mode, pro} to generate chat + optional preview.",
    });
  }

  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  try {
    const body = JSON.parse(event.body || "{}");
    const message = String(body.message || "");
    const mode = String(body.mode || "building"); // venting | solving | building
    const pro = !!body.pro;

    if (!message.trim()) return json(400, { ok: false, error: "Missing message" });
    if (!process.env.OPENAI_API_KEY) return json(500, { ok: false, error: "Missing OPENAI_API_KEY env var" });

    const intent = detectIntent(message, mode);

    // default build state (frontend may send it back later if you expand this)
    let brand = String(body.brand || "FlowPro");
    let starterPrice = String(body.starterPrice || "$9/mo");
    let proPrice = String(body.proPrice || "$29/mo");
    let enterprisePrice = String(body.enterprisePrice || "$99/mo");

    // If user edits Pro price, update proPrice
    if (intent === "pricing_edit") {
      const num = extractMoneyNumber(message);
      if (num) proPrice = `$${num}/mo`;
    }

    let preview = null;
    if (mode === "building" && pro) {
      if (intent === "landing_page" || intent === "pricing_edit" || intent === "builder_general") {
        preview = {
          name: "landing_page",
          kind: "html",
          html: makeLandingPreview({ brand, starterPrice, proPrice, enterprisePrice }),
          state: { brand, starterPrice, proPrice, enterprisePrice }, // optional, useful later
        };
      }
    }

    const reply = await generateReply({ message, mode, pro });
    return json(200, { ok: true, reply, preview });
  } catch (e) {
    // Give you real debugging info instead of silent "Server error"
    return json(500, {
      ok: false,
      error: "Server error",
      details: String(e && (e.stack || e.message || e)),
    });
  }
};
