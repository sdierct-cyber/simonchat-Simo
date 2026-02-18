// ✅ LOCKED BASELINE (OK to keep as comment — does not affect code)
// netlify/functions/simon.js
// Simo backend (locked):
// - Deterministic previews: Landing Page + Book Cover
// - Deterministic edits: landing pricing + sections + headline
// - Prevents "show me the book cover" loop by reusing existing preview
// - Returns BOTH contracts: preview{} + legacy preview_html/preview_name
// - Accepts BOTH request fields: message/text, and current_preview_html/current_preview_name

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
  const n = strip(name) || "preview";
  return n.slice(0, 80);
}

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function extractMoney(text) {
  const m = String(text || "").match(/\$?\s*(\d{1,4})(?:\.\d{1,2})?/);
  if (!m) return null;
  return Number(m[1]);
}

function wantsPreview(text) {
  const t = strip(text).toLowerCase();
  return (
    t.includes("show me a preview") ||
    t.includes("show me preview") ||
    t.includes("show preview") ||
    t.includes("preview please") ||
    t.includes("show me the preview")
  );
}

function isShowCurrentPreview(text) {
  const t = strip(text).toLowerCase();
  return (
    t === "show me the book cover" ||
    t === "show the book cover" ||
    t === "show me the cover" ||
    t === "show cover" ||
    t === "show me the preview" ||
    t === "show preview" ||
    t === "show me preview"
  );
}

function isAffirmation(text) {
  const t = strip(text).toLowerCase();
  return (
    t === "yes" ||
    t === "yep" ||
    t === "yeah" ||
    t === "that's good" ||
    t === "thats good" ||
    t === "looks good" ||
    t === "perfect" ||
    t === "ok" ||
    t === "okay" ||
    t === "good" ||
    t === "great"
  );
}

function extractQuotedOrAfter(text, keyPhrase) {
  // e.g. "change title to The American Dream"
  const t = String(text || "");
  const idx = t.toLowerCase().indexOf(keyPhrase.toLowerCase());
  if (idx >= 0) {
    return strip(t.slice(idx + keyPhrase.length));
  }
  // e.g. Title: Something
  const m = t.match(/title\s*:\s*(.+)$/i);
  if (m) return strip(m[1]);
  return "";
}

/** ---------------------------
 *  Preview templates (HTML)
 *  --------------------------*/

function landingPageTemplate({ proPrice = 29, starterPrice = 9, headline = "FlowPro helps you automate your workflow." } = {}) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Landing Page</title>
<style>
  :root{
    --bg:#070b16;
    --text:#eaf0ff;
    --muted:#a9b6d3;
    --line:rgba(255,255,255,.10);
    --blue:#2a66ff; --blue2:#1f4dd6;
  }
  *{box-sizing:border-box}
  body{
    margin:0;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
    color:var(--text);
    background:
      radial-gradient(900px 520px at 15% 5%, rgba(42,102,255,.35), transparent 55%),
      radial-gradient(800px 520px at 85% 10%, rgba(48,255,176,.12), transparent 55%),
      var(--bg);
  }
  .wrap{max-width:980px;margin:0 auto;padding:22px}
  .hero{
    border:1px solid var(--line);
    background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
    border-radius:22px;
    padding:22px;
  }
  h1{margin:0 0 8px;font-size:44px;letter-spacing:.2px;line-height:1.05}
  p{margin:0;color:rgba(233,240,255,.75);font-size:16px;line-height:1.45}
  .cta{display:flex;gap:12px;margin-top:16px;flex-wrap:wrap}
  .btn{
    padding:12px 16px;border-radius:14px;
    border:1px solid rgba(255,255,255,.12);
    background:rgba(255,255,255,.05);
    color:var(--text);font-weight:800;
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
  .plan .name{font-weight:900;letter-spacing:.3px;color:rgba(233,240,255,.85)}
  .plan .price{font-size:54px;font-weight:1000;margin:6px 0 6px}
  .plan .muted{color:rgba(233,240,255,.65)}
  .badge{
    display:inline-block;
    padding:6px 10px;border-radius:999px;
    border:1px solid rgba(42,102,255,.35);
    background:rgba(42,102,255,.12);
    font-size:12px;font-weight:900;
    margin-bottom:8px;
  }
  .planBtn{
    margin-top:12px;
    display:inline-block;
    padding:10px 16px;border-radius:12px;
    background:linear-gradient(180deg, rgba(42,102,255,.95), rgba(31,77,214,.95));
    border:1px solid rgba(42,102,255,.55);
    color:#fff;font-weight:900;
  }
  .section{margin-top:18px}
  .section h2{margin:0 0 10px;font-size:18px;letter-spacing:.3px}
  .faq{display:grid;gap:10px}
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
  <div class="wrap">
    <div class="hero">
      <h1 data-headline="1">${escapeHtml(headline)}</h1>
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

      <div class="pricing">
        <div class="plan" data-plan="starter">
          <div class="name">Starter</div>
          <div class="price"><span data-price="starter">${starterPrice}</span>/mo</div>
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
        <div class="faq">
          <div class="q"><b>“We shipped faster in week one.”</b><span class="muted">— Ops Lead</span></div>
          <div class="q"><b>“The dashboard saved us hours.”</b><span class="muted">— Founder</span></div>
        </div>
      </div>

      <div class="section" data-section="faq">
        <h2>FAQ</h2>
        <div class="faq">
          <div class="q"><b>Can I cancel anytime?</b>Yes — cancel in seconds.</div>
          <div class="q"><b>Do you offer team plans?</b>Yep — upgrade whenever you want.</div>
          <div class="q"><b>Is there a free trial?</b>We offer a 7-day trial on Pro.</div>
        </div>
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
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Book Cover</title>
<style>
  :root{
    --bg:#070b16;
    --text:#eaf0ff;
    --muted:rgba(234,240,255,.75);
    --line:rgba(255,255,255,.12);
    --g: rgba(20,255,180,.20);
  }
  *{box-sizing:border-box}
  body{
    margin:0;
    height:100vh;
    display:flex;
    align-items:center;
    justify-content:center;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
    background:
      radial-gradient(900px 520px at 20% 10%, rgba(42,102,255,.30), transparent 55%),
      radial-gradient(800px 520px at 85% 15%, rgba(20,255,180,.10), transparent 55%),
      var(--bg);
    color:var(--text);
    padding:18px;
  }
  .cover{
    width:min(760px, 96vw);
    aspect-ratio: 2/3;
    border:1px solid var(--line);
    border-radius:22px;
    overflow:hidden;
    background:
      linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02)),
      radial-gradient(700px 420px at 20% 0%, rgba(20,255,180,.12), transparent 55%);
    box-shadow: 0 22px 70px rgba(0,0,0,.55);
    position:relative;
    padding:28px;
  }
  .stripe{
    position:absolute;left:-20%;bottom:-10%;
    width:140%;height:38%;
    background: linear-gradient(90deg, rgba(255,255,255,.10), rgba(255,255,255,.02));
    transform: rotate(-7deg);
    border-top:1px solid rgba(255,255,255,.10);
  }
  h1{
    margin:0;
    font-size: clamp(32px, 5vw, 60px);
    letter-spacing:.8px;
    line-height:1.0;
    text-transform:uppercase;
  }
  .sub{
    margin-top:14px;
    max-width: 90%;
    font-size: clamp(14px, 2vw, 18px);
    color: var(--muted);
    line-height:1.4;
  }
  .author{
    position:absolute;
    left:28px;
    bottom:26px;
    font-weight:900;
    letter-spacing:2px;
    font-size: 14px;
    opacity:.92;
  }
  .tag{
    position:absolute;
    right:18px; top:18px;
    padding:8px 12px;
    border-radius:999px;
    border:1px solid rgba(20,255,180,.35);
    background: rgba(20,255,180,.10);
    color: rgba(234,240,255,.92);
    font-weight:900;
    font-size:12px;
  }
</style>
</head>
<body>
  <div class="cover" data-cover="1">
    <div class="tag">book_cover</div>
    <h1 data-title="1">${escapeHtml(title)}</h1>
    <div class="sub" data-subtitle="1">${escapeHtml(subtitle)}</div>
    <div class="stripe"></div>
    <div class="author" data-author="1">${escapeHtml(author)}</div>
  </div>
</body>
</html>`;
}

/** ---------------------------
 *  Deterministic edit helpers
 *  --------------------------*/

function replaceProPrice(html, newPrice) {
  if (html.includes('data-price="pro"')) {
    return html.replace(/data-price="pro">(\d{1,4})</, `data-price="pro">${newPrice}<`);
  }
  return html.replace(/\$\s*\d{1,4}\s*\/mo/i, `$${newPrice}/mo`);
}

function ensureSection(html, sectionKey) {
  if (html.includes(`data-section="${sectionKey}"`)) return html;

  const anchor = "</div>\n  </div>\n</body>";
  const insertAt = html.lastIndexOf(anchor);
  if (insertAt < 0) return html;

  let block = "";
  if (sectionKey === "faq") {
    block = `
      <div class="section" data-section="faq">
        <h2>FAQ</h2>
        <div class="faq">
          <div class="q"><b>Can I cancel anytime?</b>Yes — cancel in seconds.</div>
          <div class="q"><b>Do you offer team plans?</b>Yep — upgrade whenever you want.</div>
          <div class="q"><b>Is there a free trial?</b>We offer a 7-day trial on Pro.</div>
        </div>
      </div>`;
  } else if (sectionKey === "testimonials") {
    block = `
      <div class="section" data-section="testimonials">
        <h2>Testimonials</h2>
        <div class="faq">
          <div class="q"><b>“We shipped faster in week one.”</b><span class="muted">— Ops Lead</span></div>
          <div class="q"><b>“The dashboard saved us hours.”</b><span class="muted">— Founder</span></div>
        </div>
      </div>`;
  } else {
    return html;
  }

  return html.slice(0, insertAt) + block + "\n" + html.slice(insertAt);
}

function replaceHeadline(html, newHeadline) {
  if (!newHeadline) return html;
  if (html.includes('data-headline="1"')) {
    return html.replace(/<h1 data-headline="1">([\s\S]*?)<\/h1>/, `<h1 data-headline="1">${escapeHtml(newHeadline)}</h1>`);
  }
  return html;
}

function replaceBookCoverText(html, { title, subtitle, author }) {
  let out = html;
  if (title && out.includes('data-title="1"')) {
    out = out.replace(/<h1 data-title="1">([\s\S]*?)<\/h1>/, `<h1 data-title="1">${escapeHtml(title)}</h1>`);
  }
  if (subtitle && out.includes('data-subtitle="1"')) {
    out = out.replace(/<div class="sub" data-subtitle="1">([\s\S]*?)<\/div>/, `<div class="sub" data-subtitle="1">${escapeHtml(subtitle)}</div>`);
  }
  if (author && out.includes('data-author="1"')) {
    out = out.replace(/<div class="author" data-author="1">([\s\S]*?)<\/div>/, `<div class="author" data-author="1">${escapeHtml(author)}</div>`);
  }
  return out;
}

/** ---------------------------
 *  Intent detection
 *  --------------------------*/

function isBuildLandingRequest(text) {
  const t = strip(text).toLowerCase();
  return (
    t.includes("build landing page") ||
    t.includes("build a landing page") ||
    t.includes("landing page preview")
  );
}

function isPriceEdit(text) {
  const t = strip(text).toLowerCase();
  return (
    t.includes("change pro price") ||
    t.includes("set pro price") ||
    t.includes("pro price") ||
    t.includes("change price")
  );
}

function isAddFaq(text) {
  const t = strip(text).toLowerCase();
  return t.includes("add faq") || t.includes("include faq");
}

function isAddTestimonials(text) {
  const t = strip(text).toLowerCase();
  return t.includes("add testimonials") || t.includes("include testimonials");
}

function isHeadlineEdit(text) {
  const t = strip(text).toLowerCase();
  return t.includes("change headline") || t.includes("headline to");
}

function isBookCoverRequest(text) {
  const t = strip(text).toLowerCase();
  return (
    t.includes("book cover") ||
    t.includes("cover for my book") ||
    t.includes("make a cover")
  );
}

function isChangeTitle(text) {
  const t = strip(text).toLowerCase();
  return t.includes("change title") || t.includes("title to") || t.startsWith("title:");
}

function isChangeSubtitle(text) {
  const t = strip(text).toLowerCase();
  return t.includes("change subtitle") || t.includes("subtitle to") || t.startsWith("subtitle:");
}

function isChangeAuthor(text) {
  const t = strip(text).toLowerCase();
  return t.includes("change author") || t.includes("author to") || t.startsWith("author:");
}

/** ---------------------------
 *  Optional OpenAI chat helper
 *  --------------------------*/
async function callOpenAIChat(system, user) {
  if (!OPENAI_API_KEY) return null;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.SIMO_MODEL || "gpt-4o-mini",
      temperature: 0.7,
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

/** ---------------------------
 *  Handler
 *  --------------------------*/
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  try {
    const body = JSON.parse(event.body || "{}");

    // Accept both message/text (your project has used both at different times)
    const text = strip(body.message || body.text || "");
    const mode = strip(body.mode || "building");
    const pro = !!body.pro;

    // Accept current preview from UI (legacy fields your UI uses)
    const currentHtml = strip(body.current_preview_html || "");
    const currentName = safeName(body.current_preview_name || "preview");

    if (!text) return json(400, { ok: false, error: "Missing message" });

    // ------------------------------------------------------------------
    // RULE: no previews in venting/solving unless user explicitly asks.
    // ------------------------------------------------------------------
    const allowPreview = mode === "building" && pro;

    // ------------------------------------------------------------------
    // BUILDING MODE
    // ------------------------------------------------------------------
    if (mode === "building") {
      // ✅ If user asks to show current preview again, reuse it (prevents book-cover loops)
      if (isShowCurrentPreview(text) && currentHtml) {
        return json(200, {
          ok: true,
          version: "simo-backend-locked-v4",
          reply: "Here it is.",
          // legacy
          preview_name: currentName,
          preview_html: currentHtml,
          // new contract
          preview: { name: currentName, kind: "html", html: currentHtml },
        });
      }

      // 1) Landing page build
      if (isBuildLandingRequest(text)) {
        if (!allowPreview) {
          return json(200, {
            ok: true,
            version: "simo-backend-locked-v4",
            reply: "Turn Pro ON to enable previews + save/downloads, then say: “build landing page”.",
          });
        }
        const html = landingPageTemplate({ proPrice: 29, starterPrice: 9 });
        return json(200, {
          ok: true,
          version: "simo-backend-locked-v4",
          reply: "Preview loaded. Tell me what to change (price / add FAQ / add testimonials / headline).",
          // legacy
          preview_name: "landing_page",
          preview_html: html,
          // new
          preview: { name: "landing_page", kind: "html", html },
        });
      }

      // 2) Book cover build
      if (isBookCoverRequest(text) || (wantsPreview(text) && text.toLowerCase().includes("cover"))) {
        if (!allowPreview) {
          return json(200, {
            ok: true,
            version: "simo-backend-locked-v4",
            reply: "Turn Pro ON to enable previews + save/downloads, then say: “make a book cover preview…”.",
          });
        }

        // If they already have a book cover preview and they affirm, don't loop.
        if (currentName === "book_cover" && currentHtml && isAffirmation(text)) {
          return json(200, {
            ok: true,
            version: "simo-backend-locked-v4",
            reply: "Perfect. Want to change the title, subtitle, or author — or should we start outlining Chapter 1?",
            preview_name: currentName,
            preview_html: currentHtml,
            preview: { name: currentName, kind: "html", html: currentHtml },
          });
        }

        const html = bookCoverTemplate({});
        return json(200, {
          ok: true,
          version: "simo-backend-locked-v4",
          reply: "Book cover preview loaded. Want the title to be ‘THE AMERICAN DREAM’ or something else?",
          preview_name: "book_cover",
          preview_html: html,
          preview: { name: "book_cover", kind: "html", html },
        });
      }

      // 3) Deterministic edits for landing page (only if current preview exists)
      if (allowPreview && currentHtml && currentName === "landing_page") {
        // Pro price edits
        if (isPriceEdit(text)) {
          const money = extractMoney(text);
          if (money) {
            const updated = replaceProPrice(currentHtml, money);
            return json(200, {
              ok: true,
              version: "simo-backend-locked-v4",
              reply: `Done. Pro price is now $${money}/mo.`,
              preview_name: "landing_page",
              preview_html: updated,
              preview: { name: "landing_page", kind: "html", html: updated },
            });
          }
        }

        // Add FAQ
        if (isAddFaq(text)) {
          const updated = ensureSection(currentHtml, "faq");
          return json(200, {
            ok: true,
            version: "simo-backend-locked-v4",
            reply: "Done. FAQ section added.",
            preview_name: "landing_page",
            preview_html: updated,
            preview: { name: "landing_page", kind: "html", html: updated },
          });
        }

        // Add testimonials
        if (isAddTestimonials(text)) {
          const updated = ensureSection(currentHtml, "testimonials");
          return json(200, {
            ok: true,
            version: "simo-backend-locked-v4",
            reply: "Done. Testimonials added.",
            preview_name: "landing_page",
            preview_html: updated,
            preview: { name: "landing_page", kind: "html", html: updated },
          });
        }

        // Headline edit
        if (isHeadlineEdit(text)) {
          const newHeadline = extractQuotedOrAfter(text, "headline to") || extractQuotedOrAfter(text, "change headline to");
          if (newHeadline) {
            const updated = replaceHeadline(currentHtml, newHeadline);
            return json(200, {
              ok: true,
              version: "simo-backend-locked-v4",
              reply: "Done. Headline updated.",
              preview_name: "landing_page",
              preview_html: updated,
              preview: { name: "landing_page", kind: "html", html: updated },
            });
          }
        }
      }

      // 4) Deterministic edits for book cover (only if current preview is book_cover)
      if (allowPreview && currentHtml && currentName === "book_cover") {
        let title = "";
        let subtitle = "";
        let author = "";

        if (isChangeTitle(text)) title = extractQuotedOrAfter(text, "change title to") || extractQuotedOrAfter(text, "title to") || extractQuotedOrAfter(text, "title:");
        if (isChangeSubtitle(text)) subtitle = extractQuotedOrAfter(text, "change subtitle to") || extractQuotedOrAfter(text, "subtitle to") || extractQuotedOrAfter(text, "subtitle:");
        if (isChangeAuthor(text)) author = extractQuotedOrAfter(text, "change author to") || extractQuotedOrAfter(text, "author to") || extractQuotedOrAfter(text, "author:");

        // If user says "that's good" or "yes", don't restart the title question loop.
        if (isAffirmation(text)) {
          return json(200, {
            ok: true,
            version: "simo-backend-locked-v4",
            reply: "Nice. Want a stronger subtitle, a different vibe (cinematic / minimalist), or should we start outlining the book?",
            preview_name: "book_cover",
            preview_html: currentHtml,
            preview: { name: "book_cover", kind: "html", html: currentHtml },
          });
        }

        if (title || subtitle || author) {
          const updated = replaceBookCoverText(currentHtml, { title, subtitle, author });
          return json(200, {
            ok: true,
            version: "simo-backend-locked-v4",
            reply: "Done. Updated the cover text.",
            preview_name: "book_cover",
            preview_html: updated,
            preview: { name: "book_cover", kind: "html", html: updated },
          });
        }
      }

      // 5) For other building requests, respond like a builder (no preview unless requested and pro)
      // If user says "show me a preview" for something generic, we can guide instead of looping.
      if (wantsPreview(text) && !pro) {
        return json(200, {
          ok: true,
          version: "simo-backend-locked-v4",
          reply: "Turn Pro ON for previews + saving. Tell me what you’re building (app / page / logo / UI), and what style you want.",
        });
      }

      // Optional AI reply in building (but never required for previews)
      let reply = "";
      try {
        reply = await callOpenAIChat(
          "You are Simo: best friend + builder. For BUILDING: be concise, action-oriented, and do NOT ask repetitive platform questions. If user switches topics, follow naturally. Ask at most one clarifying question.",
          `User: ${text}`
        );
      } catch (e) {
        reply = "";
      }

      return json(200, {
        ok: true,
        version: "simo-backend-locked-v4",
        reply:
          reply ||
          (pro
            ? "Tell me what you want next — build something, edit the preview, or switch modes."
            : "Tell me what you want to build. (Tip: Pro ON enables previews + save/download.)"),
      });
    }

    // ------------------------------------------------------------------
    // VENTING MODE
    // ------------------------------------------------------------------
    if (mode === "venting") {
      // If they explicitly ask for a preview while venting, we can instruct them to switch to building.
      if (wantsPreview(text) || text.toLowerCase().includes("preview")) {
        return json(200, {
          ok: true,
          version: "simo-backend-locked-v4",
          reply: "If you want visuals, switch to Building mode and say what you want to preview. If you want to vent, I’m here — what’s going on?",
        });
      }

      let reply = "";
      try {
        reply = await callOpenAIChat(
          "You are Simo: respond like a private best friend. No therapy clichés. Be real, supportive, direct. Ask one simple question to keep it moving.",
          `User: ${text}`
        );
      } catch (e) {
        reply = "";
      }

      return json(200, {
        ok: true,
        version: "simo-backend-locked-v4",
        reply: reply || "I’m here. What’s hitting you right now?",
      });
    }

    // ------------------------------------------------------------------
    // SOLVING MODE
    // ------------------------------------------------------------------
    if (mode === "solving") {
      if (wantsPreview(text) || text.toLowerCase().includes("preview")) {
        return json(200, {
          ok: true,
          version: "simo-backend-locked-v4",
          reply: "For previews, switch to Building mode. For solving: tell me the goal and what’s blocking you.",
        });
      }

      let reply = "";
      try {
        reply = await callOpenAIChat(
          "You are Simo: practical problem-solver. Be structured, concise. Give steps. Ask at most one clarifying question.",
          `User: ${text}`
        );
      } catch (e) {
        reply = "";
      }

      return json(200, {
        ok: true,
        version: "simo-backend-locked-v4",
        reply: reply || "Alright — what are we trying to fix, and what have you tried so far?",
      });
    }

    // fallback
    return json(200, {
      ok: true,
      version: "simo-backend-locked-v4",
      reply: "I’m here. Use Building / Solving / Venting — or just tell me what you need.",
    });
  } catch (err) {
    return json(500, {
      ok: false,
      error: "Server error",
      details: String(err?.message || err),
    });
  }
};
