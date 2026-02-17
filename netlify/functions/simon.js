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
      "access-control-allow-methods": "POST,OPTIONS",
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

function detectIntent(message = "", mode = "building") {
  const m = message.toLowerCase();
  if (/(change|update|edit).*(pro).*\$?\s*\d+/i.test(message) || /pro.*price/i.test(m)) return "pricing_edit";
  if (/(landing page|build a landing|landing preview)/i.test(message)) return "landing_page";
  return mode === "building" ? "builder_general" : "chat_general";
}

function getNumberFromText(message) {
  const m = String(message || "");
  const match = m.match(/\$?\s*(\d{1,4})/);
  return match ? match[1] : null;
}

async function generateReply({ message, mode }) {
  // Keep it lightweight + consistent.
  const system = `
You are Simo: best friend + builder.

Mode rules:
- Venting: supportive best-friend. No therapy clichés. Short, human.
- Solving: practical steps, concise.
- Building: ask 1 clarifying question max; otherwise move forward.

Never say you are an AI model. Avoid long menus.
Return plain text only.
`.trim();

  const model = process.env.OPENAI_MODEL || "gpt-5-mini";

  const resp = await client.responses.create({
    model,
    input: [
      { role: "system", content: system },
      { role: "user", content: `Mode: ${mode}\nUser: ${message}` }
    ],
    max_output_tokens: 220
  });

  return (resp.output_text || "Okay.").trim();
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  try {
    const body = JSON.parse(event.body || "{}");
    const message = String(body.message || "");
    const mode = String(body.mode || "building");
    const pro = !!body.pro;

    if (!message.trim()) return json(400, { ok: false, error: "Missing message" });

    // Preview generation is deterministic (no OpenAI required)
    const intent = detectIntent(message, mode);

    let preview = null;
    if (mode === "building" && pro) {
      if (intent === "landing_page") {
        preview = {
          name: "landing_page",
          kind: "html",
          html: makeLandingPreview({ brand: "FlowPro", proPrice: "$29/mo" }),
        };
      } else if (intent === "pricing_edit") {
        const num = getNumberFromText(message) || "19";
        preview = {
          name: "landing_page",
          kind: "html",
          html: makeLandingPreview({ brand: "FlowPro", proPrice: `$${num}/mo` }),
        };
      }
    }

    // Reply: try OpenAI, but NEVER break the UI if it errors
    let reply = "";
    if (!process.env.OPENAI_API_KEY) {
      reply = "Heads up: OPENAI_API_KEY isn’t set on Netlify, so chat replies are in fallback mode. Previews can still render in Pro.";
    } else {
      try {
        reply = await generateReply({ message, mode });
      } catch (err) {
        reply = "I hit a backend hiccup talking to OpenAI — but your preview tools still work. Try again in a moment.";
      }
    }

    return json(200, { ok: true, reply, preview });
  } catch (e) {
    return json(500, { ok: false, error: "Server error" });
  }
};
