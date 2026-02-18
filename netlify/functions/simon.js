// netlify/functions/simon.js
// Locked backend: deterministic previews + edits, plus optional LLM for chat.
// Contract supported:
// - reply (string)
// - preview_name + preview_html (legacy)
// - preview: { name, html } (new)
// Also returns backend_label for UI badge.

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

function strip(s){ return (s||"").toString().trim(); }
function lower(s){ return strip(s).toLowerCase(); }

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isAffirmation(text){
  const t = lower(text);
  return (
    t === "yes" || t === "yep" || t === "ok" || t === "okay" ||
    t.includes("that's good") || t.includes("thats good") ||
    t.includes("looks good") || t.includes("perfect") || t.includes("fine")
  );
}

function extractMoney(text){
  const m = String(text || "").match(/\$?\s*(\d{1,4})(?:\.\d{1,2})?/);
  if(!m) return null;
  return Number(m[1]);
}

function hasAny(text, arr){
  const t = lower(text);
  return arr.some(k => t.includes(k));
}

/* ---------------------------
   Preview templates
--------------------------- */

function landingPageTemplate({ proPrice = 29, starterPrice = 9 } = {}) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Landing Page</title>
<style>
  :root{
    --bg:#070b16;
    --card:#0b132a;
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
  .muted{color:rgba(233,240,255,.65)}
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
      <h1>FlowPro helps you automate your workflow.</h1>
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

function bookCoverTemplate({ title, subtitle, author } = {}) {
  const T = escapeHtml(title || "THE AMERICAN DREAM");
  const S = escapeHtml(subtitle || "An immigrant story of arriving young, working hard, and earning it.");
  const A = escapeHtml(author || "SIMON GOJCAJ");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Book Cover</title>
<style>
  :root{--bg:#071021;--text:#eaf0ff;--muted:rgba(234,240,255,.78);--line:rgba(255,255,255,.10);}
  *{box-sizing:border-box}
  body{
    margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
    background:
      radial-gradient(1100px 700px at 15% 0%, rgba(42,102,255,.35), transparent 55%),
      radial-gradient(900px 700px at 85% 10%, rgba(25,255,154,.12), transparent 55%),
      linear-gradient(180deg, #071021, #050b16);
    color:var(--text);
    height:100vh;display:flex;align-items:center;justify-content:center;padding:22px;
  }
  .cover{
    width:min(760px, 95vw);
    aspect-ratio: 3 / 4;
    border-radius:22px;
    border:1px solid var(--line);
    background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(0,0,0,.22));
    box-shadow: 0 22px 70px rgba(0,0,0,.55);
    padding:34px;
    position:relative;
    overflow:hidden;
  }
  .glow{
    position:absolute;inset:-40%;
    background: radial-gradient(circle at 20% 20%, rgba(42,102,255,.35), transparent 55%),
                radial-gradient(circle at 80% 20%, rgba(25,255,154,.14), transparent 55%);
    filter: blur(10px);
    opacity:.9;
  }
  .content{position:relative;z-index:2}
  .title{
    font-weight:1000;
    letter-spacing:1px;
    font-size: clamp(36px, 6vw, 62px);
    line-height:1.04;
    text-transform:uppercase;
    margin:0 0 10px;
  }
  .subtitle{
    max-width: 90%;
    font-size: clamp(14px, 2.2vw, 18px);
    color: var(--muted);
    margin:0 0 18px;
  }
  .stripe{
    position:absolute;left:0;right:0;bottom:-22%;
    height:42%;
    background:
      linear-gradient(90deg, rgba(255,255,255,.06), rgba(255,255,255,0)),
      repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0, rgba(255,255,255,.05) 10px, rgba(0,0,0,0) 10px, rgba(0,0,0,0) 22px);
    transform: skewY(-10deg);
    opacity:.35;
  }
  .author{
    position:absolute;left:34px;right:34px;bottom:26px;
    font-weight:900;letter-spacing:2px;
    color:rgba(234,240,255,.72);
    display:flex;justify-content:space-between;align-items:center;
  }
  .tag{
    border:1px solid rgba(25,255,154,.28);
    background:rgba(25,255,154,.10);
    padding:8px 12px;border-radius:999px;
    font-size:12px;font-weight:900;
    box-shadow: 0 0 24px rgba(25,255,154,.10);
  }
</style>
</head>
<body>
  <div class="cover">
    <div class="glow"></div>
    <div class="stripe"></div>
    <div class="content">
      <h1 class="title">${T}</h1>
      <p class="subtitle">${S}</p>
    </div>
    <div class="author">
      <div>${A}</div>
      <div class="tag">book_cover</div>
    </div>
  </div>
</body>
</html>`;
}

function genericAppMockTemplate({ title } = {}) {
  const T = escapeHtml(title || "App Preview");
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${T}</title>
<style>
  :root{--bg:#070b16;--text:#eaf0ff;--muted:rgba(234,240,255,.75);--line:rgba(255,255,255,.10);--blue:#2a66ff;}
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:var(--text);
    background:radial-gradient(900px 520px at 15% 5%, rgba(42,102,255,.28), transparent 55%),
               radial-gradient(800px 520px at 85% 10%, rgba(25,255,154,.10), transparent 55%),var(--bg);}
  .wrap{max-width:980px;margin:0 auto;padding:22px}
  .card{border:1px solid var(--line);border-radius:22px;background:rgba(0,0,0,.18);padding:18px}
  h1{margin:0 0 6px;font-size:34px}
  p{margin:0 0 12px;color:var(--muted)}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .box{border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.04);padding:14px}
  .btn{display:inline-block;margin-top:10px;background:var(--blue);color:#fff;font-weight:900;padding:10px 14px;border-radius:12px;text-decoration:none}
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>${T}</h1>
      <p>This is a generic mockup preview. Tell Simo what screens you want (home, listing, profile, checkout, etc.).</p>
      <div class="grid">
        <div class="box"><b>Home</b><br/><span style="color:var(--muted)">Search + featured items</span></div>
        <div class="box"><b>Details</b><br/><span style="color:var(--muted)">Photos + CTA button</span></div>
        <div class="box"><b>Messages</b><br/><span style="color:var(--muted)">Chat between users</span></div>
        <div class="box"><b>Checkout</b><br/><span style="color:var(--muted)">Pay + confirm</span></div>
      </div>
      <a class="btn" href="#">Primary Action</a>
    </div>
  </div>
</body>
</html>`;
}

/* ---------------------------
   Deterministic edits
--------------------------- */

function replaceProPrice(html, newPrice){
  if(html.includes('data-price="pro"')){
    return html.replace(/data-price="pro">(\d{1,4})</, `data-price="pro">${newPrice}<`);
  }
  return html.replace(/\$\s*\d{1,4}\s*\/mo/, `$${newPrice}/mo`);
}

function ensureSection(html, sectionKey){
  if(html.includes(`data-section="${sectionKey}"`)) return html;

  const insertAt = html.lastIndexOf("</div>\n  </div>\n</body>");
  if(insertAt < 0) return html;

  let block = "";
  if(sectionKey === "faq"){
    block = `
      <div class="section" data-section="faq">
        <h2>FAQ</h2>
        <div class="faq">
          <div class="q"><b>Can I cancel anytime?</b>Yes — cancel in seconds.</div>
          <div class="q"><b>Do you offer team plans?</b>Yep — upgrade whenever you want.</div>
          <div class="q"><b>Is there a free trial?</b>We offer a 7-day trial on Pro.</div>
        </div>
      </div>`;
  } else if(sectionKey === "testimonials"){
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

/* ---------------------------
   Optional LLM chat
--------------------------- */
async function callOpenAIChat(system, user){
  if(!OPENAI_API_KEY) return null;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method:"POST",
    headers:{
      "content-type":"application/json",
      "authorization":`Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        { role:"system", content: system },
        { role:"user", content: user }
      ]
    })
  });

  if(!resp.ok){
    const txt = await resp.text().catch(()=> "");
    throw new Error("OpenAI error: " + txt.slice(0, 220));
  }
  const data = await resp.json();
  const msg = data?.choices?.[0]?.message?.content;
  return typeof msg === "string" ? msg.trim() : null;
}

/* ---------------------------
   Intent routing
--------------------------- */

function wantsLanding(text){
  const t = lower(text);
  return t.includes("landing page") || t.includes("build landing") || t.includes("build me a landing");
}

function wantsBookCover(text){
  const t = lower(text);
  return t.includes("book cover") || t.includes("cover preview") || t.includes("cover for this story");
}

function wantsPreview(text){
  const t = lower(text);
  return t.includes("show me a preview") || t.includes("show preview") || t.includes("preview of");
}

function wantsPriceEdit(text){
  const t = lower(text);
  return t.includes("change pro price") || t.includes("set pro price") || t.includes("pro price") || t.includes("change price");
}

function wantsAddFaq(text){
  return hasAny(text, ["add faq", "include faq"]);
}

function wantsAddTestimonials(text){
  return hasAny(text, ["add testimonials", "include testimonials"]);
}

function parseBookFields(text){
  // very light parsing
  const t = String(text || "");
  const mTitle = t.match(/title\s*:\s*([^\n]+)/i);
  const mSub = t.match(/subtitle\s*:\s*([^\n]+)/i);
  const mAuth = t.match(/author\s*:\s*([^\n]+)/i);
  return {
    title: mTitle ? strip(mTitle[1]) : null,
    subtitle: mSub ? strip(mSub[1]) : null,
    author: mAuth ? strip(mAuth[1]) : null,
  };
}

exports.handler = async (event) => {
  if(event.httpMethod === "OPTIONS") return json(200, { ok:true });
  if(event.httpMethod !== "POST") return json(405, { ok:false, error:"Method not allowed" });

  try{
    const body = JSON.parse(event.body || "{}");
    const text = strip(body.text);
    const mode = strip(body.mode) || "building";
    const pro = !!body.pro;

    const currentHtml = strip(body.current_preview_html);
    const currentName = strip(body.current_preview_name) || "none";

    if(!text) return json(400, { ok:false, error:"Missing message", backend_label:"simo-backend-locked-v4" });

    // --- UNIVERSAL: if user explicitly asks for preview, allow it in any mode ---
    const allowPreview = wantsPreview(text) || wantsLanding(text) || wantsBookCover(text);

    // If they're in venting/solving and NOT asking for preview, do pure chat.
    if((mode === "venting" || mode === "solving") && !allowPreview){
      if(mode === "venting"){
        const reply = await callOpenAIChat(
          "You are Simo, a private best friend. Be natural, warm, not therapy-speak. Ask 1 good follow-up. No generic clichés.",
          `User said: ${text}`
        ).catch(()=> null);

        return json(200, {
          ok:true,
          backend_label:"simo-backend-locked-v4",
          reply: reply || "I’m here. What’s hitting you the hardest right now?"
        });
      }

      const reply = await callOpenAIChat(
        "You are Simo, a practical problem-solver. Be concise. Ask 1-2 clarifying questions max. Provide actionable steps.",
        `User said: ${text}`
      ).catch(()=> null);

      return json(200, {
        ok:true,
        backend_label:"simo-backend-locked-v4",
        reply: reply || "Alright — what’s the goal, and what’s blocking you?"
      });
    }

    // --- BUILDING / PREVIEW ROUTING ---
    // 1) Deterministic edit takes priority if there is an existing landing page preview
    if(currentHtml && currentName === "landing_page" && wantsPriceEdit(text)){
      const money = extractMoney(text);
      if(money){
        const updated = replaceProPrice(currentHtml, money);
        return json(200, {
          ok:true,
          backend_label:"simo-backend-locked-v4",
          reply: `Done. Pro price is now $${money}/mo.`,
          preview_name: "landing_page",
          preview_html: updated,
          preview: { name:"landing_page", html: updated }
        });
      }
    }

    if(currentHtml && currentName === "landing_page" && wantsAddFaq(text)){
      const updated = ensureSection(currentHtml, "faq");
      return json(200, {
        ok:true,
        backend_label:"simo-backend-locked-v4",
        reply: "Done. FAQ section added.",
        preview_name: "landing_page",
        preview_html: updated,
        preview: { name:"landing_page", html: updated }
      });
    }

    if(currentHtml && currentName === "landing_page" && wantsAddTestimonials(text)){
      const updated = ensureSection(currentHtml, "testimonials");
      return json(200, {
        ok:true,
        backend_label:"simo-backend-locked-v4",
        reply: "Done. Testimonials added.",
        preview_name: "landing_page",
        preview_html: updated,
        preview: { name:"landing_page", html: updated }
      });
    }

    // 2) Landing page build
    if(wantsLanding(text)){
      const html = landingPageTemplate({ proPrice: 29, starterPrice: 9 });
      return json(200, {
        ok:true,
        backend_label:"simo-backend-locked-v4",
        reply: pro
          ? "Preview loaded. Tell me what to change (price / add FAQ / add testimonials / headline)."
          : "Preview loaded. (Turn Pro ON to enable saving + downloads.)",
        preview_name: "landing_page",
        preview_html: html,
        preview: { name:"landing_page", html }
      });
    }

    // 3) Book cover build
    if(wantsBookCover(text)){
      // If user just affirmed, don't loop. Acknowledge and offer next.
      if(currentName === "book_cover" && isAffirmation(text)){
        return json(200, {
          ok:true,
          backend_label:"simo-backend-locked-v4",
          reply: "Nice. Want to tweak the title/subtitle/author, or do you want me to help outline the book next?"
        });
      }

      // If they provided explicit fields, use them; else use defaults
      const fields = parseBookFields(text);
      const html = bookCoverTemplate({
        title: fields.title || "THE AMERICAN DREAM",
        subtitle: fields.subtitle || "An immigrant story of arriving young, working hard, and earning it.",
        author: fields.author || "SIMON GOJCAJ",
      });

      return json(200, {
        ok:true,
        backend_label:"simo-backend-locked-v4",
        reply: "Book cover preview loaded. If you want changes, say: title: ..., subtitle: ..., author: ...",
        preview_name: "book_cover",
        preview_html: html,
        preview: { name:"book_cover", html }
      });
    }

    // 4) Generic preview for "show me a preview" requests
    if(wantsPreview(text)){
      // If they asked preview of landing page, route it
      if(lower(text).includes("landing")) {
        const html = landingPageTemplate({ proPrice: 29, starterPrice: 9 });
        return json(200, {
          ok:true,
          backend_label:"simo-backend-locked-v4",
          reply: "Preview loaded. Tell me what to change.",
          preview_name: "landing_page",
          preview_html: html,
          preview: { name:"landing_page", html }
        });
      }

      // If they asked preview of book cover, route it
      if(lower(text).includes("book") || lower(text).includes("cover")) {
        const html = bookCoverTemplate({});
        return json(200, {
          ok:true,
          backend_label:"simo-backend-locked-v4",
          reply: "Book cover preview loaded. Want to change title/subtitle/author?",
          preview_name: "book_cover",
          preview_html: html,
          preview: { name:"book_cover", html }
        });
      }

      // Otherwise generic app mock
      const html = genericAppMockTemplate({ title: "App Preview" });
      return json(200, {
        ok:true,
        backend_label:"simo-backend-locked-v4",
        reply: "Preview loaded. Tell me what kind of app this is and what 3 screens you want.",
        preview_name: "app_mock",
        preview_html: html,
        preview: { name:"app_mock", html }
      });
    }

    // 5) If nothing matched, provide a ChatGPT-like builder reply (optional LLM), but NO preview
    const sys = "You are Simo: best friend + builder. Be concise, natural, and helpful. Avoid therapy-speak unless user asks.";
    const reply = await callOpenAIChat(sys, text).catch(()=> null);

    return json(200, {
      ok:true,
      backend_label:"simo-backend-locked-v4",
      reply: reply || "Tell me what you want next — and if you want visuals, say “show me a preview”."
    });

  }catch(err){
    return json(500, { ok:false, backend_label:"simo-backend-locked-v4", error:"Server error", details:String(err?.message || err) });
  }
};
