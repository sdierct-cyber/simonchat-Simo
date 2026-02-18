// netlify/functions/simon.js
// Simo backend v3: rebuild previews on edits (no fragile regex patches).
// Stable preview contract + deterministic edits + optional OpenAI chat.
// Returns preview in BOTH formats:
//  - preview_html + preview_name
//  - preview: { name, kind, html }

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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

function nowIso() {
  return new Date().toISOString();
}

// ---- read current preview state safely (so edits preserve what exists) ----
function readStarterPrice(html, fallback = 9) {
  try {
    // common patterns:
    // $9/mo
    // <div class="price">$9/mo</div>
    // data-price="starter">9<
    let m =
      html.match(/data-plan="starter"[\s\S]{0,1200}?\$ ?(\d{1,4})\/mo/i) ||
      html.match(/data-price="starter"[^>]*>(\d{1,4})</i) ||
      html.match(/\bStarter\b[\s\S]{0,1200}?\$ ?(\d{1,4})\/mo/i);

    return m ? clampPrice(m[1], fallback) : fallback;
  } catch {
    return fallback;
  }
}

function readBrand(html, fallback = "FlowPro") {
  try {
    const m = html.match(/<title>\s*([^<]{1,60})\s*[–-]/i);
    if (m) return strip(m[1]) || fallback;
    return fallback;
  } catch {
    return fallback;
  }
}

function hasSection(html, sectionKey) {
  return html.includes(`data-section="${sectionKey}"`) || html.toLowerCase().includes(`<h2>${sectionKey}</h2>`);
}

// ---------- Landing page template (clean, no duplicates) ----------
function landingPageTemplate({
  brand = "FlowPro",
  starterPrice = 9,
  proPrice = 29,
  includeFaq = true,
  includeTestimonials = true,
} = {}) {
  const starter = clampPrice(starterPrice, 9);
  const pro = clampPrice(proPrice, 29);

  const testimonials = includeTestimonials
    ? `
      <div class="section" data-section="testimonials">
        <h2>Testimonials</h2>
        <div class="cards">
          <div class="q"><b>“We shipped faster in week one.”</b><span class="muted">— Ops Lead</span></div>
          <div class="q"><b>“The dashboard saved us hours.”</b><span class="muted">— Founder</span></div>
        </div>
      </div>`
    : "";

  const faq = includeFaq
    ? `
      <div class="section" data-section="faq">
        <h2>FAQ</h2>
        <div class="cards">
          <div class="q"><b>Can I cancel anytime?</b>Yes — cancel in seconds.</div>
          <div class="q"><b>Do you offer team plans?</b>Yep — upgrade whenever you want.</div>
          <div class="q"><b>Is there a free trial?</b>We offer a 7-day trial on Pro.</div>
        </div>
      </div>`
    : "";

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
    --shadow:0 18px 55px rgba(0,0,0,.45);
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
  .section{margin-top:22px}
  .section h2{margin:0 0 10px;font-size:18px;letter-spacing:.2px}
  .cards{display:grid;gap:10px}
  .q{
    border:1px solid var(--line);border-radius:14px;padding:14px;
    background:rgba(0,0,0,.14);
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
      <div class="plan" data-plan="starter">
        <h3>Starter</h3>
        <div class="price">$${starter}/mo</div>
        <div class="muted">Basic support<br/>Core features<br/>1 user</div>
        <div style="margin-top:16px"><a class="btn primary" href="#">Choose Plan</a></div>
      </div>

      <div class="plan" data-plan="pro">
        <div class="badge">Most Popular</div>
        <h3>Pro</h3>
        <div class="price">$${pro}/mo</div>
        <div class="muted">Priority support<br/>All features<br/>5 users</div>
        <div style="margin-top:16px"><a class="btn primary" href="#">Choose Plan</a></div>
      </div>

      <div class="plan" data-plan="enterprise">
        <h3>Enterprise</h3>
        <div class="price">$99/mo</div>
        <div class="muted">Dedicated support<br/>Custom integrations<br/>Unlimited users</div>
        <div style="margin-top:16px"><a class="btn primary" href="#">Contact Sales</a></div>
      </div>
    </div>

    ${testimonials}
    ${faq}
  </div>
</body>
</html>`;
}

// ---------- optional OpenAI chat ----------
async function callOpenAIChat(system, user) {
  if (!OPENAI_API_KEY) return null;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.65,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error("OpenAI error: " + txt.slice(0, 240));
  }

  const data = await resp.json();
  const msg = data?.choices?.[0]?.message?.content;
  return typeof msg === "string" ? msg.trim() : null;
}

function previewPayload({ reply, previewName, html, meta }) {
  const name = safeName(previewName || "landing_page");
  return {
    ok: true,
    version: "simo-backend-v3-rebuild",
    ts: nowIso(),
    reply: reply || "Okay.",
    meta: meta || {},
    preview_name: name,
    preview_html: html,
    preview: { name, kind: "html", html },
  };
}

function detectIntent(message) {
  const t = (message || "").toLowerCase();
  if (t.includes("build") && t.includes("landing")) return "build_landing";
  if (t.includes("add faq") || t.includes("include faq")) return "add_faq";
  if (t.includes("add testimonials") || t.includes("include testimonials")) return "add_testimonials";
  if (t.includes("price") || t.includes("pricing") || /\$?\s*\d{1,4}/.test(t)) return "edit_price";
  return "chat";
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

    const currentHtml = strip(
      body.current_preview_html ||
      body.preview_html ||
      body?.preview?.html
    );

    const currentName = strip(
      body.current_preview_name ||
      body.preview_name ||
      body?.preview?.name
    );

    if (!message) return json(400, { ok: false, error: "Missing message" });

    if (message.toLowerCase() === "version check") {
      return json(200, { ok: true, version: "simo-backend-v3-rebuild", ts: nowIso() });
    }

    // BUILDING mode: deterministic preview/edit
    if (mode === "building") {
      const intent = detectIntent(message);

      // Build landing (fresh)
      if (intent === "build_landing" || !currentHtml) {
        const html = landingPageTemplate({
          brand: "FlowPro",
          starterPrice: 9,
          proPrice: 29,
          includeFaq: true,
          includeTestimonials: true,
        });

        return json(200, previewPayload({
          reply: pro
            ? "Preview loaded. Tell me what to change (price / add FAQ / add testimonials / headline)."
            : "Preview loaded. (Turn Pro ON to enable saving + downloads.)",
          previewName: "landing_page",
          html,
          meta: { intent: "build_landing" },
        }));
      }

      // Edits: REBUILD based on current preview state (no patching)
      const brand = readBrand(currentHtml, "FlowPro");
      const starterPrice = readStarterPrice(currentHtml, 9);
      const includeFaq = hasSection(currentHtml, "faq");
      const includeTestimonials = hasSection(currentHtml, "testimonials");

      if (intent === "edit_price") {
        const money = extractMoney(message);
        if (money !== null) {
          const html = landingPageTemplate({
            brand,
            starterPrice,
            proPrice: clampPrice(money, 29),
            includeFaq,
            includeTestimonials,
          });

          return json(200, previewPayload({
            reply: `Done. Pro price is now $${clampPrice(money)}/mo.`,
            previewName: currentName || "landing_page",
            html,
            meta: { intent: "edit_price", rebuilt: true },
          }));
        }
      }

      if (intent === "add_faq") {
        const html = landingPageTemplate({
          brand,
          starterPrice,
          proPrice: 29, // keep default unless user changes it next
          includeFaq: true,
          includeTestimonials,
        });

        return json(200, previewPayload({
          reply: "Done. FAQ added.",
          previewName: currentName || "landing_page",
          html,
          meta: { intent: "add_faq", rebuilt: true },
        }));
      }

      if (intent === "add_testimonials") {
        const html = landingPageTemplate({
          brand,
          starterPrice,
          proPrice: 29,
          includeFaq,
          includeTestimonials: true,
        });

        return json(200, previewPayload({
          reply: "Done. Testimonials added.",
          previewName: currentName || "landing_page",
          html,
          meta: { intent: "add_testimonials", rebuilt: true },
        }));
      }

      // no deterministic match
      return json(200, {
        ok: true,
        version: "simo-backend-v3-rebuild",
        ts: nowIso(),
        reply: pro
          ? "Tell me exactly what to change (example: “change price to 19”, “add FAQ”, “add testimonials”, “change headline to …”)."
          : "Tell me what to change. (Turn Pro ON for saving + downloads.)",
      });
    }

    // SOLVING / VENTING: OpenAI optional
    if (mode === "venting") {
      const reply = await callOpenAIChat(
        "You are Simo: private best friend. Be real, supportive, direct. Avoid therapy clichés unless asked.",
        `User: ${message}`
      ).catch(() => null);

      return json(200, {
        ok: true,
        version: "simo-backend-v3-rebuild",
        ts: nowIso(),
        reply: reply || "I’m here. Talk to me — what’s going on?",
      });
    }

    if (mode === "solving") {
      const reply = await callOpenAIChat(
        "You are Simo: practical problem-solver. Give steps. Ask at most one clarifying question.",
        `User: ${message}`
      ).catch(() => null);

      return json(200, {
        ok: true,
        version: "simo-backend-v3-rebuild",
        ts: nowIso(),
        reply: reply || "Alright — what’s the goal and what’s blocking you?",
      });
    }

    return json(200, {
      ok: true,
      version: "simo-backend-v3-rebuild",
      ts: nowIso(),
      reply: "I’m here. Pick a mode — or just talk.",
    });

  } catch (e) {
    return json(500, { ok: false, error: "Server error", details: String(e?.message || e) });
  }
};
