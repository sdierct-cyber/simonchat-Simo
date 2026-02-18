// netlify/functions/simon.js
// Simo backend (LOCKED):
// - Deterministic previews: Landing Page + Book Cover + Generic App Mock
// - Deterministic edits (pricing + sections + book cover text)
// - Won’t “admin panel” you for price edits
// - Won’t get stuck on book cover: supports “show landing page” / “show book cover”
// - Supports BOTH request/response contracts:
//   Request: {message|text, mode, pro, current_preview_name, current_preview_html}
//   Response: {reply, preview{...}} + legacy {preview_name, preview_html}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const MODEL = process.env.SIMO_MODEL || "gpt-4o-mini";

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

const strip = (s) => (s ?? "").toString().trim();
const lower = (s) => strip(s).toLowerCase();

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------------------------
   Preview templates
--------------------------- */

function landingPageTemplate({ proPrice = 29, starterPrice = 9, brand = "FlowPro" } = {}) {
  // NOTE: data-price spans are deliberate so edits are reliable.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(brand)} — Landing</title>
<style>
  :root{
    --bg:#070b16;
    --text:#eaf0ff;
    --muted:#a9b6d3;
    --line:rgba(255,255,255,.10);
    --blue:#2a66ff; --blue2:#1f4dd6;
    --shadow: 0 18px 55px rgba(0,0,0,.45);
  }
  *{box-sizing:border-box}
  body{
    margin:0;
    font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
    color:var(--text);
    background:
      radial-gradient(900px 520px at 15% 5%, rgba(42,102,255,.35), transparent 55%),
      radial-gradient(800px 520px at 85% 10%, rgba(48,255,176,.12), transparent 55%),
      var(--bg);
    padding:22px;
  }
  .card{
    max-width:980px;margin:0 auto;
    border:1px solid var(--line);
    border-radius:22px;
    background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
    box-shadow:var(--shadow);
    padding:22px;
  }
  h1{margin:0 0 10px;font-size:46px;letter-spacing:.2px;line-height:1.05}
  p{margin:0 0 16px;color:rgba(233,240,255,.75);font-size:16px;line-height:1.45}
  .cta{display:flex;gap:12px;margin-top:16px;flex-wrap:wrap}
  .btn{
    padding:12px 16px;border-radius:14px;
    border:1px solid rgba(255,255,255,.12);
    background:rgba(255,255,255,.05);
    color:var(--text);font-weight:900;
  }
  .btn.primary{
    background:linear-gradient(180deg, rgba(42,102,255,.95), rgba(31,77,214,.95));
    border-color:rgba(42,102,255,.55);
  }
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:14px}
  .chip{
    border:1px solid rgba(255,255,255,.10);
    background:rgba(0,0,0,.18);
    border-radius:16px;padding:14px;
    color:rgba(233,240,255,.85);
    min-height:64px;
  }
  .pricing{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-top:16px}
  .plan{
    border:1px solid rgba(255,255,255,.10);
    background:rgba(0,0,0,.18);
    border-radius:20px;
    padding:18px;
    text-align:center;
  }
  .name{font-weight:1000;letter-spacing:.3px;color:rgba(233,240,255,.88)}
  .price{font-size:54px;font-weight:1000;margin:6px 0 6px}
  .muted{color:rgba(233,240,255,.65)}
  .badge{
    display:inline-block;
    padding:6px 10px;border-radius:999px;
    border:1px solid rgba(42,102,255,.35);
    background:rgba(42,102,255,.12);
    font-size:12px;font-weight:1000;
    margin-bottom:8px;
  }
  .planBtn{
    margin-top:12px;
    display:inline-block;
    padding:10px 16px;border-radius:12px;
    background:linear-gradient(180deg, rgba(42,102,255,.95), rgba(31,77,214,.95));
    border:1px solid rgba(42,102,255,.55);
    color:#fff;font-weight:1000;
  }
  .section{margin-top:18px}
  .section h2{margin:0 0 10px;font-size:18px;letter-spacing:.3px}
  .list{display:grid;gap:10px}
  .q{
    border:1px solid rgba(255,255,255,.10);
    background:rgba(0,0,0,.18);
    border-radius:16px;padding:14px;
  }
  .q b{display:block;margin-bottom:4px}
  @media (max-width: 860px){
    .grid{grid-template-columns:1fr}
    .pricing{grid-template-columns:1fr}
    h1{font-size:36px}
  }
</style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(brand)} helps you automate your workflow.</h1>
    <p>Save time. Reduce manual work. Scale smarter.</p>

    <div class="cta">
      <button class="btn primary">Get Started</button>
      <button class="btn">See Demo</button>
    </div>

    <div class="grid">
      <div class="chip">Automated task pipelines</div>
      <div class="chip">Smart scheduling</div>
      <div class="chip">Real-time analytics dashboard</div>
    </div>

    <div class="pricing" style="margin-top:16px">
      <div class="plan" data-plan="starter">
        <div class="name">Starter</div>
        <div class="price">$<span data-price="starter">${starterPrice}</span>/mo</div>
        <div class="muted">Basic support<br/>Core features<br/>1 user</div>
        <div class="planBtn">Choose Plan</div>
      </div>

      <div class="plan" data-plan="pro">
        <div class="badge">Most Popular</div>
        <div class="name">Pro</div>
        <div class="price">$<span data-price="pro">${proPrice}</span>/mo</div>
        <div class="muted">Priority support<br/>All features<br/>5 users</div>
        <div class="planBtn">Choose Plan</div>
      </div>
    </div>

    <div class="section" data-section="testimonials">
      <h2>Testimonials</h2>
      <div class="list">
        <div class="q"><b>“We shipped faster in week one.”</b><span class="muted">— Ops Lead</span></div>
        <div class="q"><b>“The dashboard saved us hours.”</b><span class="muted">— Founder</span></div>
      </div>
    </div>

    <div class="section" data-section="faq">
      <h2>FAQ</h2>
      <div class="list">
        <div class="q"><b>Can I cancel anytime?</b>Yes — cancel in seconds.</div>
        <div class="q"><b>Do you offer team plans?</b>Yep — upgrade whenever you want.</div>
        <div class="q"><b>Is there a free trial?</b>We offer a 7-day trial on Pro.</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function bookCoverTemplate({
  title = "THE AMERICAN DREAM",
  subtitle = "An immigrant story of arriving young, working hard, and earning it.",
  author = "SIMON GOJCAJ",
} = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Book Cover</title>
<style>
  :root{
    --bg:#070b16;
    --text:#eaf0ff;
    --muted:#a9b6d3;
    --line:rgba(255,255,255,.10);
    --shadow: 0 18px 55px rgba(0,0,0,.45);
  }
  *{box-sizing:border-box}
  body{
    margin:0;
    font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
    background:
      radial-gradient(1000px 650px at 25% 10%, rgba(42,102,255,.35), transparent 55%),
      radial-gradient(900px 650px at 85% 25%, rgba(48,255,176,.10), transparent 55%),
      var(--bg);
    color:var(--text);
    padding:24px;
  }
  .cover{
    width:min(540px, 92vw);
    height:min(760px, 132vw);
    margin:0 auto;
    border-radius:26px;
    border:1px solid var(--line);
    box-shadow:var(--shadow);
    background:
      linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.02)),
      radial-gradient(900px 520px at 20% 10%, rgba(42,102,255,.35), transparent 60%),
      radial-gradient(700px 520px at 85% 55%, rgba(48,255,176,.10), transparent 60%);
    position:relative;
    overflow:hidden;
    padding:34px;
  }
  .title{
    font-size:44px;
    letter-spacing:.08em;
    font-weight:900;
    line-height:1.05;
    text-transform:uppercase;
  }
  .subtitle{
    margin-top:14px;
    max-width:460px;
    color:rgba(233,240,255,.78);
    font-size:16px;
    line-height:1.45;
  }
  .author{
    position:absolute;
    left:34px;
    right:34px;
    bottom:30px;
    font-weight:900;
    letter-spacing:.18em;
    text-transform:uppercase;
    opacity:.9;
  }
  .stripe{
    position:absolute;
    left:-40%;
    bottom:-25%;
    width:180%;
    height:50%;
    background:linear-gradient(90deg, rgba(255,255,255,.08), rgba(255,255,255,0));
    transform:rotate(-10deg);
  }
  .meta{display:none}
</style>
</head>
<body>
  <div class="cover">
    <div class="stripe"></div>

    <div class="title" data-book="title">${escapeHtml(title)}</div>
    <div class="subtitle" data-book="subtitle">${escapeHtml(subtitle)}</div>
    <div class="author" data-book="author">${escapeHtml(author)}</div>

    <div class="meta" data-preview="book_cover"></div>
  </div>
</body>
</html>`;
}

function genericAppMockTemplate({ appName = "Your App", tagline = "A clean preview mockup generated instantly." } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>App Mock</title>
<style>
  :root{
    --bg:#070b16;
    --text:#eaf0ff;
    --muted:#a9b6d3;
    --line:rgba(255,255,255,.10);
    --shadow: 0 18px 55px rgba(0,0,0,.45);
    --blue:#2a66ff; --blue2:#1f4dd6;
  }
  *{box-sizing:border-box}
  body{
    margin:0;
    font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
    color:var(--text);
    background:
      radial-gradient(900px 520px at 20% 0%, rgba(42,102,255,.32), transparent 55%),
      radial-gradient(800px 520px at 85% 10%, rgba(48,255,176,.10), transparent 55%),
      var(--bg);
    padding:22px;
  }
  .shell{
    max-width:980px;margin:0 auto;
    border:1px solid var(--line);
    border-radius:22px;
    background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
    box-shadow:var(--shadow);
    padding:18px;
  }
  .top{
    display:flex;align-items:center;justify-content:space-between;
    gap:14px;padding:8px 10px 14px;
  }
  .name{font-weight:900;font-size:22px}
  .tag{color:rgba(233,240,255,.75);font-size:14px}
  .btn{
    padding:10px 14px;border-radius:14px;
    border:1px solid rgba(255,255,255,.12);
    background:linear-gradient(180deg, rgba(42,102,255,.95), rgba(31,77,214,.95));
    color:#fff;font-weight:900;
  }
  .grid{display:grid;grid-template-columns:1.2fr .8fr;gap:14px}
  .card{
    border:1px solid rgba(255,255,255,.10);
    background:rgba(0,0,0,.18);
    border-radius:18px;
    padding:14px;
    min-height:320px;
  }
  .row{display:flex;gap:10px;margin-top:10px;flex-wrap:wrap}
  .pill{
    border:1px solid rgba(255,255,255,.12);
    background:rgba(255,255,255,.05);
    padding:8px 10px;border-radius:999px;
    font-weight:800;font-size:12px;color:rgba(233,240,255,.80)
  }
  .big{
    height:220px;border-radius:16px;
    border:1px dashed rgba(255,255,255,.16);
    display:flex;align-items:center;justify-content:center;
    color:rgba(233,240,255,.65);
    margin-top:12px;
  }
  @media (max-width:860px){ .grid{grid-template-columns:1fr} }
</style>
</head>
<body>
  <div class="shell">
    <div class="top">
      <div>
        <div class="name">${escapeHtml(appName)}</div>
        <div class="tag">${escapeHtml(tagline)}</div>
      </div>
      <button class="btn">Primary Action</button>
    </div>

    <div class="grid">
      <div class="card">
        <div style="font-weight:900">Main panel</div>
        <div class="row">
          <div class="pill">Search</div><div class="pill">Filters</div><div class="pill">Results</div>
        </div>
        <div class="big">Preview content area</div>
      </div>
      <div class="card">
        <div style="font-weight:900">Side panel</div>
        <div class="row" style="margin-top:12px">
          <div class="pill">Settings</div><div class="pill">Billing</div><div class="pill">Share</div>
        </div>
        <div class="big">Details</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/* ---------------------------
   Deterministic intent + edits
--------------------------- */

function extractMoney(text) {
  const m = strip(text).match(/\$?\s*(\d{1,4})(?:\.\d{1,2})?/);
  return m ? Number(m[1]) : null;
}

function isAffirmation(text) {
  const t = lower(text);
  return (
    t === "yes" ||
    t === "yep" ||
    t === "yeah" ||
    t === "ok" ||
    t === "okay" ||
    t === "thats good" ||
    t === "that's good" ||
    t === "good" ||
    t === "perfect" ||
    t === "looks good" ||
    t === "that works"
  );
}

function wantsLanding(text) {
  const t = lower(text);
  return t.includes("landing") || t.includes("pricing") || t.includes("faq") || t.includes("testimonial");
}

function wantsBookCover(text) {
  const t = lower(text);
  return t.includes("book cover") || t.includes("cover preview") || t.includes("bookcover");
}

function explicitPreview(text) {
  const t = lower(text);
  return t.includes("show me a preview") || t === "show preview" || t.includes("preview of");
}

function isPriceEdit(text) {
  const t = lower(text);
  return t.includes("change pro price") || t.includes("set pro price") || (t.includes("pro price") && extractMoney(t));
}

function isAddFaq(text) {
  const t = lower(text);
  return t.includes("add faq") || t.includes("include faq");
}

function isAddTestimonials(text) {
  const t = lower(text);
  return t.includes("add testimonials") || t.includes("include testimonials");
}

function isChangeTitle(text) {
  const t = lower(text);
  return t.includes("set title") || t.includes("change title") || t.startsWith("title:");
}

function isChangeSubtitle(text) {
  const t = lower(text);
  return t.includes("set subtitle") || t.includes("change subtitle") || t.startsWith("subtitle:");
}

function isChangeAuthor(text) {
  const t = lower(text);
  return t.includes("set author") || t.includes("change author") || t.startsWith("author:");
}

function pullAfterColon(text) {
  const s = strip(text);
  const idx = s.indexOf(":");
  if (idx >= 0) return strip(s.slice(idx + 1));
  return "";
}

function replaceSpan(html, attr, value) {
  // Replaces the innerHTML for element marked like data-book="title" OR data-price="pro"
  const safe = escapeHtml(value);
  const re = new RegExp(`(data-${attr}="[^"]+"[^>]*>)([\\s\\S]*?)(<)`, "i");
  if (re.test(html)) return html.replace(re, `$1${safe}$3`);
  return html;
}

function replacePrice(html, which, newPrice) {
  // Targets: <span data-price="pro">29</span>
  const re = new RegExp(`(data-price="${which}">)\\d{1,4}(<)`, "i");
  if (re.test(html)) return html.replace(re, `$1${newPrice}$2`);
  // Fallback: $29/mo somewhere
  return html.replace(/\$\s*\d{1,4}\s*\/mo/i, `$${newPrice}/mo`);
}

function ensureSection(html, sectionKey) {
  if (html.includes(`data-section="${sectionKey}"`)) return html;

  const insertPoint = html.lastIndexOf("</div>\n</body>");
  if (insertPoint < 0) return html;

  let block = "";
  if (sectionKey === "faq") {
    block = `
    <div class="section" data-section="faq">
      <h2>FAQ</h2>
      <div class="list">
        <div class="q"><b>Can I cancel anytime?</b>Yes — cancel in seconds.</div>
        <div class="q"><b>Do you offer team plans?</b>Yep — upgrade whenever you want.</div>
        <div class="q"><b>Is there a free trial?</b>We offer a 7-day trial on Pro.</div>
      </div>
    </div>`;
  } else if (sectionKey === "testimonials") {
    block = `
    <div class="section" data-section="testimonials">
      <h2>Testimonials</h2>
      <div class="list">
        <div class="q"><b>“We shipped faster in week one.”</b><span class="muted">— Ops Lead</span></div>
        <div class="q"><b>“The dashboard saved us hours.”</b><span class="muted">— Founder</span></div>
      </div>
    </div>`;
  } else {
    return html;
  }

  return html.slice(0, insertPoint) + block + "\n" + html.slice(insertPoint);
}

/* ---------------------------
   OpenAI (chat-only)
--------------------------- */

async function callOpenAI({ mode, message }) {
  if (!OPENAI_API_KEY) return null;

  const sys =
    mode === "venting"
      ? "You are Simo. Respond like a private best friend. Be real, supportive, direct. Avoid therapy clichés."
      : mode === "solving"
      ? "You are Simo. Be practical, structured, concise. Ask at most ONE clarifying question if needed."
      : "You are Simo. Builder + best friend. In building mode, give clear next steps. If user asked for a preview, describe it briefly.";

  const payload = {
    model: MODEL,
    temperature: 0.6,
    input: [
      { role: "system", content: sys },
      { role: "user", content: message },
    ],
  };

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`OpenAI error: ${t.slice(0, 260)}`);
  }

  const data = await resp.json();
  return strip(data.output_text || "");
}

/* ---------------------------
   Handler
--------------------------- */

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  try {
    const body = JSON.parse(event.body || "{}");

    const message = strip(body.message || body.text || "");
    const mode = strip(body.mode || "building"); // building | solving | venting
    const pro = !!body.pro;

    const curName = strip(body.current_preview_name || body.preview_name || "");
    const curHtml = strip(body.current_preview_html || body.preview_html || "");

    if (!message) return json(400, { ok: false, error: "Missing message" });

    const t = lower(message);

    // Decide whether we should generate/update a preview.
    // Rules:
    // - In building mode: previews are allowed.
    // - In venting/solving: ONLY if explicitly requested (preview/book cover/landing).
    const wantsAnyPreview =
      mode === "building" || explicitPreview(message) || wantsLanding(message) || wantsBookCover(message);

    let nextPreviewName = curName;
    let nextPreviewHtml = curHtml;

    // --- Preview routing (prevents "stuck on book cover") ---
    if (wantsAnyPreview) {
      if (wantsLanding(message) || t.includes("show landing page") || t.includes("show landing")) {
        nextPreviewName = "landing_page";
        if (!nextPreviewHtml || curName !== "landing_page") {
          nextPreviewHtml = landingPageTemplate({ proPrice: 29, starterPrice: 9, brand: "FlowPro" });
        }
      } else if (wantsBookCover(message) || t.includes("show book cover") || t.includes("show cover")) {
        nextPreviewName = "book_cover";
        if (!nextPreviewHtml || curName !== "book_cover") {
          // Default author to Simon if user doesn’t specify
          nextPreviewHtml = bookCoverTemplate({});
        }
      } else if (explicitPreview(message) || t.includes("show me preview")) {
        // Generic “preview” that works for ANY request (open-ended builder)
        nextPreviewName = "app_mock";
        nextPreviewHtml = genericAppMockTemplate({ appName: "Preview Mock", tagline: "Generated from your request." });
      }
    }

    // --- Deterministic edits ---
    if (nextPreviewName === "landing_page" && nextPreviewHtml) {
      if (isPriceEdit(message)) {
        const money = extractMoney(message);
        if (money) {
          nextPreviewHtml = replacePrice(nextPreviewHtml, "pro", money);
          const reply = `Done. Pro price is now $${money}/mo.`;
          return json(200, {
            ok: true,
            reply,
            preview: pro ? { name: nextPreviewName, kind: "html", html: nextPreviewHtml } : null,
            preview_name: nextPreviewName,
            preview_html: nextPreviewHtml,
          });
        }
      }
      if (isAddFaq(message)) {
        nextPreviewHtml = ensureSection(nextPreviewHtml, "faq");
        return json(200, {
          ok: true,
          reply: "Done. FAQ added.",
          preview: pro ? { name: nextPreviewName, kind: "html", html: nextPreviewHtml } : null,
          preview_name: nextPreviewName,
          preview_html: nextPreviewHtml,
        });
      }
      if (isAddTestimonials(message)) {
        nextPreviewHtml = ensureSection(nextPreviewHtml, "testimonials");
        return json(200, {
          ok: true,
          reply: "Done. Testimonials added.",
          preview: pro ? { name: nextPreviewName, kind: "html", html: nextPreviewHtml } : null,
          preview_name: nextPreviewName,
          preview_html: nextPreviewHtml,
        });
      }
    }

    if (nextPreviewName === "book_cover" && nextPreviewHtml) {
      // Book cover edits OR affirmations shouldn’t loop
      if (isChangeTitle(message)) {
        const v = pullAfterColon(message) || message.replace(/change title to/i, "").replace(/set title to/i, "");
        const title = strip(v) || "THE AMERICAN DREAM";
        nextPreviewHtml = replaceSpan(nextPreviewHtml, "book", title); // (fallback if used incorrectly)
        // Correct replacement (data-book="title")
        nextPreviewHtml = nextPreviewHtml.replace(
          /data-book="title">[\s\S]*?</i,
          `data-book="title">${escapeHtml(title)}<`
        );
        return json(200, {
          ok: true,
          reply: `Locked. Title updated to “${title}”. Want a subtitle or author name on the bottom?`,
          preview: pro ? { name: nextPreviewName, kind: "html", html: nextPreviewHtml } : null,
          preview_name: nextPreviewName,
          preview_html: nextPreviewHtml,
        });
      }

      if (isChangeSubtitle(message)) {
        const v = pullAfterColon(message) || message.replace(/change subtitle to/i, "").replace(/set subtitle to/i, "");
        const sub = strip(v) || "An immigrant story of arriving young, working hard, and earning it.";
        nextPreviewHtml = nextPreviewHtml.replace(
          /data-book="subtitle">[\s\S]*?</i,
          `data-book="subtitle">${escapeHtml(sub)}<`
        );
        return json(200, {
          ok: true,
          reply: "Done. Subtitle updated. Want the author name updated too?",
          preview: pro ? { name: nextPreviewName, kind: "html", html: nextPreviewHtml } : null,
          preview_name: nextPreviewName,
          preview_html: nextPreviewHtml,
        });
      }

      if (isChangeAuthor(message)) {
        const v = pullAfterColon(message) || message.replace(/change author to/i, "").replace(/set author to/i, "");
        const a = strip(v) || "SIMON GOJCAJ";
        nextPreviewHtml = nextPreviewHtml.replace(
          /data-book="author">[\s\S]*?</i,
          `data-book="author">${escapeHtml(a)}<`
        );
        return json(200, {
          ok: true,
          reply: "Done. Author updated.",
          preview: pro ? { name: nextPreviewName, kind: "html", html: nextPreviewHtml } : null,
          preview_name: nextPreviewName,
          preview_html: nextPreviewHtml,
        });
      }

      if (isAffirmation(message)) {
        // Don’t re-ask the same title question.
        return json(200, {
          ok: true,
          reply: "Perfect. Cover locked. If you want changes later: “change title: …” / “subtitle: …” / “author: …”.",
          preview: pro ? { name: nextPreviewName, kind: "html", html: nextPreviewHtml } : null,
          preview_name: nextPreviewName,
          preview_html: nextPreviewHtml,
        });
      }

      // If user asks to “show book cover”
      if (t.includes("show me the book cover") || t === "show book cover") {
        return json(200, {
          ok: true,
          reply: "Here it is. Want the title/subtitle/author changed?",
          preview: pro ? { name: nextPreviewName, kind: "html", html: nextPreviewHtml } : null,
          preview_name: nextPreviewName,
          preview_html: nextPreviewHtml,
        });
      }
    }

    // --- If we have a preview in building mode, don’t get “lost” ---
    if (mode === "building" && wantsAnyPreview && pro && nextPreviewName && nextPreviewHtml) {
      // If user typed “build landing page” or “show landing page” etc, return the preview.
      if (wantsLanding(message) || wantsBookCover(message) || explicitPreview(message)) {
        const msg =
          nextPreviewName === "landing_page"
            ? "Preview loaded. Tell me what to change (price / add FAQ / add testimonials / headline)."
            : nextPreviewName === "book_cover"
            ? "Book cover preview loaded. If you want changes: “change title: …” / “subtitle: …” / “author: …”."
            : "Preview loaded. Tell me what to change about the mockup.";
        return json(200, {
          ok: true,
          reply: msg,
          preview: { name: nextPreviewName, kind: "html", html: nextPreviewHtml },
          preview_name: nextPreviewName,
          preview_html: nextPreviewHtml,
        });
      }
    }

    // --- Chat response (OpenAI) ---
    // IMPORTANT: we avoid OpenAI when user is clearly doing deterministic preview edits.
    // Also: in venting/solving we never attach previews unless explicitly requested.
    let reply = "";
    try {
      // If user is in building mode but not asking for a deterministic edit, we can still chat.
      reply = (await callOpenAI({ mode, message })) || "";
    } catch (e) {
      // Fallback
      reply =
        mode === "venting"
          ? "I’m here. What’s hitting you the hardest right now?"
          : mode === "solving"
          ? "Alright — what’s the goal and what’s blocking you?"
          : "Tell me what you want to build next (and say “show me a preview” if you want visuals).";
    }

    // Attach preview only if allowed + pro ON (your UI gates saving/downloads by pro).
    const previewObj =
      pro && wantsAnyPreview && nextPreviewName && nextPreviewHtml
        ? { name: nextPreviewName, kind: "html", html: nextPreviewHtml }
        : null;

    return json(200, {
      ok: true,
      version: "simo-backend-locked-v5",
      reply: reply || "Okay.",
      preview: previewObj,
      preview_name: previewObj ? previewObj.name : (nextPreviewName || ""),
      preview_html: previewObj ? previewObj.html : (nextPreviewHtml || ""),
    });
  } catch (e) {
    return json(500, { ok: false, error: "Server error", details: String(e?.message || e) });
  }
};
