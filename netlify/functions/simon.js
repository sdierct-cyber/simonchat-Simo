// netlify/functions/simon.js
// Simo backend: deterministic previews + optional AI chat.
// Returns preview in BOTH formats: preview_html AND preview: { html }.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ---------- helpers ----------
function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      "cache-control": "no-store",
    },
    body: JSON.stringify(obj),
  };
}

function strip(s) {
  return (s || "").toString().trim();
}

function safeName(name) {
  const n = strip(name) || "landing_page";
  return n.slice(0, 80);
}

function extractMoney(text) {
  const m = String(text || "").match(/\$?\s*(\d{1,4})(?:\.\d{1,2})?/);
  if (!m) return null;
  return Number(m[1]);
}

function clampPrice(n, fallback = 29) {
  const num = Number(n);
  if (!Number.isFinite(num)) return fallback;
  if (num < 0) return fallback;
  if (num > 9999) return 9999;
  return Math.round(num);
}

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ---------- preview template ----------
function landingPageTemplate({ brand = "FlowPro", starterPrice = 9, proPrice = 29 } = {}) {
  const starter = clampPrice(starterPrice, 9);
  const pro = clampPrice(proPrice, 29);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(brand)} – Landing</title>
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
        <div class="price">$${starter}/mo</div>
        <div class="muted">Basic support<br/>Core features<br/>1 user</div>
        <div style="margin-top:16px"><a class="btn primary" href="#">Choose Plan</a></div>
      </div>

      <div class="plan">
        <div class="badge">Most Popular</div>
        <h3>Pro</h3>
        <div class="price">$${pro}/mo</div>
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
  </div>
</body>
</html>`;
}

function replaceProPrice(html, newPrice) {
  const p = clampPrice(newPrice, 29);
  // replace $29/mo style safely:
  return html.replace(/\$(\d{1,4})\/mo<\/div>\s*<div class="muted">Priority support/i, `$${p}/mo</div>\n        <div class="muted">Priority support`);
}

function isBuildRequest(text) {
  const t = (text || "").toLowerCase();
  return t.includes("build") && t.includes("landing");
}

function isPriceEdit(text) {
  const t = (text || "").toLowerCase();
  return (
    t.includes("price") ||
    t.includes("pricing") ||
    /\$\s*\d{1,4}/.test(t) ||
    /\b\d{1,4}\s*\/\s*mo\b/.test(t) ||
    /\b\d{1,4}\s*mo\b/.test(t)
  );
}

// optional AI (chat-only)
async function callOpenAIChat(prompt) {
  if (!OPENAI_API_KEY) return null;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content:
            "You are Simo: a best-friend + builder. Be concise, natural, and helpful. Avoid therapy-speak unless asked.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error("OpenAI error: " + txt.slice(0, 220));
  }

  const data = await resp.json();
  const msg = data?.choices?.[0]?.message?.content;
  return typeof msg === "string" ? msg.trim() : null;
}

function previewPayload({ reply, previewName, html }) {
  const name = safeName(previewName || "landing_page");
  return {
    ok: true,
    reply: reply || "Okay.",
    // old format
    preview_name: name,
    preview_html: html,
    // new format
    preview: { name, kind: "html", html },
  };
}

// ---------- handler ----------
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  try {
    const body = JSON.parse(event.body || "{}");

    const message = strip(body.message || body.text);
    const mode = strip(body.mode) || "building";
    const pro = !!body.pro;

    const currentHtml = strip(body.current_preview_html || body.preview_html || body?.preview?.html);
    const currentName = strip(body.current_preview_name || body.preview_name || body?.preview?.name);

    if (!message) return json(400, { ok: false, error: "Missing message" });

    if (mode === "building") {
      // build new preview
      if (isBuildRequest(message) || !currentHtml) {
        const html = landingPageTemplate({ brand: "FlowPro", starterPrice: 9, proPrice: 29 });
        return json(
          200,
          previewPayload({
            reply: pro
              ? "Preview loaded. Tell me what to change (e.g., “change price to $19”)."
              : "Preview loaded. (Turn on Pro Mode for more previews.)",
            previewName: "landing_page",
            html,
          })
        );
      }

      // edit price
      if (isPriceEdit(message)) {
        const money = extractMoney(message);
        if (money !== null) {
          const updated = replaceProPrice(currentHtml, money);
          return json(
            200,
            previewPayload({
              reply: `Done. Pro price is now $${clampPrice(money)}/mo.`,
              previewName: currentName || "landing_page",
              html: updated,
            })
          );
        }
      }

      // no deterministic match
      return json(200, {
        ok: true,
        reply: pro
          ? "Say exactly what to change (example: “change price to 19”, “build landing page”)."
          : "Tell me what you want to change. (Enable Pro for previews.)",
      });
    }

    if (mode === "venting") {
      const reply = await callOpenAIChat(`User is venting. Respond like a private best friend. User said: ${message}`).catch(
        () => null
      );
      return json(200, { ok: true, reply: reply || "I’m here. Talk to me — what’s going on?" });
    }

    if (mode === "solving") {
      const reply = await callOpenAIChat(
        `User wants help solving a problem. Be practical, structured, and concise. User said: ${message}`
      ).catch(() => null);
      return json(200, { ok: true, reply: reply || "Alright — what’s the goal and what’s blocking you?" });
    }

    return json(200, { ok: true, reply: "I’m here. Pick a mode — or just talk." });
  } catch (e) {
    return json(500, { ok: false, error: "Server error", details: String(e?.message || e) });
  }
};
