// netlify/functions/simon.js
// Netlify Functions expects CommonJS: exports.handler

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

/** ---------------------------
 *  Preview templates (stable)
 *  --------------------------*/
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

/** ---------------------------
 *  Intent + value extraction
 *  --------------------------*/
function detectIntent(message = "", mode = "building") {
  const m = message.toLowerCase();
  if (/pro\s*price|change\s+pro\s+price|update\s+pro\s+price|edit\s+pro\s+price/i.test(message)) return "pricing_edit";
  if (/(landing page|build a landing|landing preview)/i.test(message)) return "landing_page";
  return mode === "building" ? "builder_general" : "chat_general";
}

function extractMoneyNumber(message = "") {
  const m = message.match(/\$?\s*(\d{1,4})(?:\s*\/?\s*(mo|month))?/i);
  return m ? String(m[1]) : null;
}

/** ---------------------------
 *  ChatGPT-like reply
 *  --------------------------*/
async function generateReply({ message, mode }) {
  // IMPORTANT: this is prompt style. Preview generation is NOT dependent on the model.
  const system = `
You are Simo: "best friend + builder" with ChatGPT-like capability.

Tone rules:
- Venting: best-friend energy. No therapy clichés. Be real, supportive, direct.
- Solving: practical steps, ask one clarifying question max if needed.
- Building: concise + action-oriented. If user requests a build/edit, confirm what changed in one line.

Output:
- Return plain text only. No markdown fences.
`.trim();

  const model = process.env.SIMO_MODEL || "gpt-4.1-mini";

  const resp = await client.responses.create({
    model,
    input: [
      { role: "system", content: system },
      { role: "user", content: `Mode: ${mode}\nUser: ${message}` },
    ],
  });

  return (resp.output_text || "").trim();
}

/** ---------------------------
 *  Handler
 *  --------------------------*/
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  try {
    const body = JSON.parse(event.body || "{}");
    const message = String(body.message || "");
    const mode = String(body.mode || "building");
    const pro = !!body.pro;

    if (!message.trim()) return json(400, { ok: false, error: "Missing message" });

    // If key missing, DON'T hard-crash. Return a usable response.
    const hasKey = !!process.env.OPENAI_API_KEY;

    const intent = detectIntent(message, mode);

    // Preview is deterministic; never depends on OpenAI.
    let preview = null;
    if (mode === "building" && pro) {
      if (intent === "landing_page") {
        preview = {
          name: "landing_page",
          kind: "html",
          html: makeLandingPreview({ brand: "FlowPro", proPrice: "$29/mo" }),
        };
      } else if (intent === "pricing_edit") {
        const num = extractMoneyNumber(message) || "19";
        preview = {
          name: "landing_page",
          kind: "html",
          html: makeLandingPreview({ brand: "FlowPro", proPrice: `$${num}/mo` }),
        };
      }
    }

    // Reply: try OpenAI; if it fails or missing key, fallback.
    let reply = "";
    if (!hasKey) {
      reply =
        mode === "building"
          ? "I’m in Building mode, but the server key isn’t set. I can still generate previews, though — tell me what you want changed."
          : "I’m here — talk to me. (Server key isn’t set yet, but I can still help.)";
    } else {
      try {
        reply = await generateReply({ message, mode });
      } catch (err) {
        console.error("OpenAI reply error:", err?.message || err);
        reply =
          mode === "building"
            ? "Got you. I can still build the preview — tell me exactly what you want changed next."
            : "I’m here. Tell me what’s going on.";
      }
    }

    // Always respond 200 if we can.
    return json(200, {
      ok: true,
      version: "simo-backend-2026-02-17-stable",
      reply: reply || "Okay.",
      preview,
    });
  } catch (e) {
    console.error("Handler error:", e?.message || e);
    return json(500, {
      ok: false,
      error: "Server error",
      details: String(e?.message || e),
    });
  }
};
