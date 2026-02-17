// netlify/functions/simon.js
// Simo backend: best-friend + builder with preview HTML output.
// POST { message, mode, pro } -> { ok, reply, preview?: { name, html, kind } }

import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const json = (statusCode, obj) => ({
  statusCode,
  headers: {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST,OPTIONS",
  },
  body: JSON.stringify(obj),
});

const htmlShell = ({ title = "Preview", body = "" } = {}) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>
  :root{
    --bg:#0b1020; --text:#eaf0ff; --muted:#a9b6d3;
    --line:rgba(255,255,255,.10);
    --card:rgba(255,255,255,.05);
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
  h1{margin:0 0 10px;font-size:34px;letter-spacing:.2px}
  p{margin:0 0 16px;color:rgba(234,240,255,.78);line-height:1.4}
  .row{display:flex;gap:12px;flex-wrap:wrap}
  .btn{
    display:inline-flex;align-items:center;justify-content:center;
    padding:10px 14px;border-radius:12px;
    border:1px solid var(--line);
    background:rgba(0,0,0,.18);
    color:var(--text);
    font-weight:700;text-decoration:none;
  }
  .btn.primary{background:linear-gradient(180deg,var(--btn),var(--btn2));border-color:rgba(42,102,255,.45)}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:18px}
  .plan{
    border:1px solid var(--line);border-radius:16px;padding:14px;
    background:rgba(0,0,0,.14);
    min-height:190px;
  }
  .plan h3{margin:0 0 6px}
  .price{font-size:34px;font-weight:900;margin:6px 0 10px}
  .muted{color:rgba(234,240,255,.65)}
  ul{margin:10px 0 0 18px;color:rgba(234,240,255,.78)}
  @media (max-width:860px){ .grid{grid-template-columns:1fr} }
</style>
</head>
<body>
  <div class="card">
    ${body}
  </div>
</body>
</html>`;

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Very simple intent detector (kept stable)
function detectIntent(message = "", mode = "building") {
  const m = message.toLowerCase();

  // If user asks to edit a price / update pricing -> pricing edit intent
  if (/(change|update|edit).*(pro).*\$?\d+/i.test(message) || /price.*pro/i.test(m)) return "pricing_edit";

  // Ask to build landing / landing page preview
  if (/(landing page|build a landing|landing preview)/i.test(message)) return "landing_page";

  // default: general
  return mode === "building" ? "builder_general" : "chat_general";
}

function makeLandingPreview({ brand = "FlowPro", proPrice = "$29/mo" } = {}) {
  const body = `
    <p class="muted">Landing Page</p>
    <h1>${escapeHtml(brand)} helps you automate your workflow.</h1>
    <p>Save time. Reduce manual work. Scale smarter.</p>
    <div class="row">
      <a class="btn primary" href="#">Get Started</a>
      <a class="btn" href="#">See Demo</a>
    </div>

    <div class="grid" style="grid-template-columns:repeat(3,1fr);margin-top:18px">
      <div class="plan">
        <h3>Starter</h3>
        <div class="price">$9/mo</div>
        <div class="muted">Basic support<br/>Core features<br/>1 user</div>
        <div style="margin-top:14px"><a class="btn primary" href="#">Choose Plan</a></div>
      </div>
      <div class="plan">
        <h3>Pro</h3>
        <div class="price">${escapeHtml(proPrice)}</div>
        <div class="muted">Priority support<br/>All features<br/>5 users</div>
        <div style="margin-top:14px"><a class="btn primary" href="#">Choose Plan</a></div>
      </div>
      <div class="plan">
        <h3>Enterprise</h3>
        <div class="price">$99/mo</div>
        <div class="muted">Dedicated support<br/>Custom integrations<br/>Unlimited users</div>
        <div style="margin-top:14px"><a class="btn primary" href="#">Contact Sales</a></div>
      </div>
    </div>
  `;
  return htmlShell({ title: `${brand} – Landing`, body });
}

async function generateReply({ message, mode, pro }) {
  const system = `
You are Simo: best friend + builder.
- If mode=venting: respond like a supportive best friend. No therapy clichés.
- If mode=solving: practical, step-by-step.
- If mode=building: help build things. If user asks for a preview, output a preview HTML.
- Keep responses short and natural.
`;

  const resp = await client.responses.create({
    model: "gpt-5-mini",
    input: [
      { role: "system", content: system.trim() },
      { role: "user", content: `Mode: ${mode}\nPro: ${pro}\n\nUser: ${message}` }
    ]
  });

  // responses API: output_text is in resp.output_text in many SDKs;
  // fallback to manual extraction
  const text =
    resp.output_text ||
    (resp.output?.map(o => o.content?.map(c => c.text).join("")).join("\n")) ||
    "Okay.";

  return text.trim();
}

export default async (req) => {
  if (req.httpMethod === "OPTIONS") return json(200, { ok: true });

  try {
    const body = JSON.parse(req.body || "{}");
    const message = (body.message || "").toString();
    const mode = (body.mode || "building").toString();
    const pro = !!body.pro;

    if (!message.trim()) return json(400, { ok: false, error: "Missing message" });

    const intent = detectIntent(message, mode);

    // We keep a tiny “memory” only via client instructions; real persistence is in the browser library.
    // Preview behavior:
    // - In building mode with pro: auto preview for landing pages and pricing edits.
    // - For pricing edits: if user says "change Pro price to $19" we return a new preview with Pro updated.
    let preview = null;

    if (mode === "building" && pro) {
      if (intent === "landing_page") {
        preview = {
          name: "landing_page",
          kind: "html",
          html: makeLandingPreview({ brand: "FlowPro", proPrice: "$29/mo" }),
        };
      }

      if (intent === "pricing_edit") {
        // Extract the target pro price like $19 or 19/mo etc
        const match = message.match(/\$?\s*(\d{1,4})\s*(?:\/\s*(mo|month))?/i);
        const num = match ? match[1] : null;
        const proPrice = num ? `$${num}/mo` : "$19/mo";
        preview = {
          name: "landing_page",
          kind: "html",
          html: makeLandingPreview({ brand: "FlowPro", proPrice }),
        };
      }
    }

    const reply = await generateReply({ message, mode, pro });

    return json(200, { ok: true, reply, preview });
  } catch (e) {
    return json(500, { ok: false, error: "Server error" });
  }
};
