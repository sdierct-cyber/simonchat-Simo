// netlify/functions/simon.js
// Simo backend — STABLE deterministic builder
// Always returns: { ok, reply, html }

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return j(405, { ok: false, reply: "Use POST", html: "" });
    }

    const body = safeJSON(event.body) || {};
    const input = String(body.input || "").trim();
    const lastHTML = String(body.lastHTML || "").trim();

    if (!input) {
      return j(200, { ok: true, reply: "Say something. If you want a page, type: build a landing page for a fitness coach", html: "" });
    }

    const lower = input.toLowerCase();

    // Build intent
    if (lower.includes("build") && lower.includes("landing page")) {
      const html = makeLanding({
        headline: "Get Fit Without Guesswork",
        cta: "Start Your Free Consultation",
        price: "29",
        includeFAQ: true,
        includePricing: true,
        includeTestimonials: true
      });

      return j(200, {
        ok: true,
        reply:
          "Done. Built a landing page and updated the preview.\n\nEdits:\n- headline: …\n- cta: …\n- price: 29\n- add faq / remove faq\n- add pricing / remove pricing\n- add testimonials / remove testimonials",
        html
      });
    }

    // Simple chat (never blank)
    if (lower === "hello" || lower === "hi" || lower === "hey") {
      return j(200, { ok: true, reply: "Hey — build something or tweak a page?", html: "" });
    }

    // Edit commands
    const cmd = parseCommand(input);
    if (cmd.type !== "none") {
      // If no previous html supplied, start from default
      const base = lastHTML || makeLanding({
        headline: "Get Fit Without Guesswork",
        cta: "Start Your Free Consultation",
        price: "29",
        includeFAQ: true,
        includePricing: true,
        includeTestimonials: true
      });

      const updated = applyCommand(base, cmd);

      return j(200, {
        ok: true,
        reply: replyFor(cmd),
        html: updated
      });
    }

    return j(200, {
      ok: true,
      reply: "If you want a page, say: build a landing page for a fitness coach. Or edit with: headline: … / cta: … / price: …",
      html: ""
    });
  } catch (e) {
    return j(200, { ok: false, reply: "Backend error. Try again.", html: "", error: String(e?.message || e) });
  }
};

// ---------- Helpers ----------
function j(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(obj)
  };
}

function safeJSON(s) {
  try { return JSON.parse(s || "{}"); } catch { return null; }
}

function escapeHTML(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseCommand(input) {
  const t = input.trim();
  const lower = t.toLowerCase();

  const m = t.match(/^([a-zA-Z ]+)\s*:\s*(.+)$/);
  if (m) {
    const key = m[1].trim().toLowerCase();
    const val = m[2].trim();
    if (key === "headline") return { type: "headline", value: val };
    if (key === "cta") return { type: "cta", value: val };
    if (key === "price") return { type: "price", value: val.replace(/[^0-9.]/g, "") || val };
  }

  if (lower === "add faq") return { type: "faq", value: true };
  if (lower === "remove faq") return { type: "faq", value: false };

  if (lower === "add pricing") return { type: "pricing", value: true };
  if (lower === "remove pricing") return { type: "pricing", value: false };

  if (lower === "add testimonials") return { type: "testimonials", value: true };
  if (lower === "remove testimonials") return { type: "testimonials", value: false };

  return { type: "none" };
}

function replyFor(cmd) {
  if (cmd.type === "headline") return "Done. Updated headline.";
  if (cmd.type === "cta") return "Done. Updated CTA.";
  if (cmd.type === "price") return "Done. Updated price.";
  if (cmd.type === "faq") return cmd.value ? "Done. Added FAQ." : "Done. Removed FAQ.";
  if (cmd.type === "pricing") return cmd.value ? "Done. Added pricing." : "Done. Removed pricing.";
  if (cmd.type === "testimonials") return cmd.value ? "Done. Added testimonials." : "Done. Removed testimonials.";
  return "Done.";
}

// ---------- Template + Edits (SAFE, no fragile regex) ----------
// We embed tiny markers then replace them with plain string replace.
function applyCommand(html, cmd) {
  let out = html;

  if (cmd.type === "headline") {
    out = out.replace("{{HEADLINE}}", escapeHTML(cmd.value));
    return out;
  }
  if (cmd.type === "cta") {
    out = out.replace("{{CTA}}", escapeHTML(cmd.value));
    return out;
  }
  if (cmd.type === "price") {
    out = out.replace("{{PRICE}}", escapeHTML(cmd.value));
    return out;
  }

  if (cmd.type === "faq") {
    out = out.replace("{{SHOW_FAQ}}", cmd.value ? "block" : "none");
    return out;
  }
  if (cmd.type === "pricing") {
    out = out.replace("{{SHOW_PRICING}}", cmd.value ? "block" : "none");
    return out;
  }
  if (cmd.type === "testimonials") {
    out = out.replace("{{SHOW_TESTIMONIALS}}", cmd.value ? "block" : "none");
    return out;
  }

  return out;
}

function makeLanding(opts) {
  const headline = escapeHTML(opts.headline || "Get Fit Without Guesswork");
  const cta = escapeHTML(opts.cta || "Start Your Free Consultation");
  const price = escapeHTML(opts.price || "29");

  const showFAQ = opts.includeFAQ ? "block" : "none";
  const showPricing = opts.includePricing ? "block" : "none";
  const showTestimonials = opts.includeTestimonials ? "block" : "none";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Fitness Coach — Online Coaching</title>
<style>
  :root{
    --bg:#0b0f14; --card:#101826; --muted:#93a4b8; --text:#eaf1ff;
    --brand:#6ee7ff; --brand2:#a78bfa; --ok:#34d399;
    --line:rgba(255,255,255,.10); --r:18px; --shadow: 0 18px 60px rgba(0,0,0,.45);
    --max:1100px;
  }
  *{box-sizing:border-box}
  body{
    margin:0; color:var(--text);
    font-family: ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
    background:
      radial-gradient(1200px 700px at 10% 10%, rgba(110,231,255,.18), transparent 60%),
      radial-gradient(1100px 700px at 90% 15%, rgba(167,139,250,.16), transparent 55%),
      radial-gradient(900px 600px at 50% 95%, rgba(52,211,153,.10), transparent 55%),
      var(--bg);
    line-height:1.5;
  }
  .wrap{max-width:var(--max); margin:0 auto; padding:28px}
  .card{
    border:1px solid var(--line);
    background: rgba(255,255,255,.04);
    border-radius: var(--r);
    box-shadow: var(--shadow);
    padding:18px;
  }
  header{
    display:flex; justify-content:space-between; align-items:center;
    padding:14px 0 18px; border-bottom:1px solid var(--line);
  }
  .logo{
    width:38px; height:38px; border-radius:14px;
    background:linear-gradient(135deg, rgba(110,231,255,.95), rgba(167,139,250,.95));
    box-shadow: 0 18px 40px rgba(110,231,255,.18);
    margin-right:10px;
  }
  .brand{display:flex; align-items:center; font-weight:900}
  h1{margin:0 0 10px; font-size:42px; line-height:1.1}
  p{margin:0 0 12px; color: var(--muted)}
  .btn{
    display:inline-block;
    padding:12px 14px;
    border-radius: 14px;
    border:1px solid rgba(110,231,255,.35);
    background: linear-gradient(180deg, rgba(110,231,255,.22), rgba(167,139,250,.16));
    font-weight:900;
    text-decoration:none;
  }
  .grid{display:grid; grid-template-columns: 1.2fr .8fr; gap:16px; margin-top:18px}
  .section{margin-top:14px}
  .pricing{display:grid; grid-template-columns: 1fr 1fr; gap:12px}
  .box{padding:16px; border-radius:14px; border:1px solid var(--line); background: rgba(0,0,0,.18)}
  .price{font-size:34px; font-weight:950; margin:6px 0 10px}
  .muted{color:var(--muted)}
  @media (max-width: 900px){ .grid{grid-template-columns: 1fr} .pricing{grid-template-columns:1fr} h1{font-size:34px} }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand"><div class="logo"></div>Fitness Coach</div>
    <div class="muted">1:1 Online Coaching</div>
  </header>

  <div class="grid">
    <div class="card">
      <h1>{{HEADLINE}}</h1>
      <p>Online coaching for strength, fat loss, and habits that stick—without confusing plans.</p>
      <a class="btn" href="#lead">{{CTA}}</a>
    </div>

    <div class="card" id="lead">
      <h2 style="margin:0 0 10px">Free consult</h2>
      <p class="muted">Tell me your goal and schedule. I’ll suggest a plan.</p>
      <form onsubmit="event.preventDefault(); alert('Submitted (demo).');">
        <input required placeholder="Name" style="width:100%; padding:12px; border-radius:14px; border:1px solid var(--line); background:rgba(0,0,0,.18); color:var(--text); margin:8px 0"/>
        <input required placeholder="Email" type="email" style="width:100%; padding:12px; border-radius:14px; border:1px solid var(--line); background:rgba(0,0,0,.18); color:var(--text); margin:8px 0"/>
        <button class="btn" type="submit" style="width:100%; text-align:center; margin-top:10px">Request My Plan</button>
      </form>
      <p class="muted" style="font-size:12px; margin-top:10px">No spam. Just your plan.</p>
    </div>
  </div>

  <div class="section card" style="display: {{SHOW_TESTIMONIALS}}">
    <h2 style="margin-top:0">Real results</h2>
    <p class="muted">“Down 12 lbs, stronger than ever.” — Alex</p>
    <p class="muted">“Finally stuck to a routine.” — Jordan</p>
    <p class="muted">“Energy up, cravings down.” — Sam</p>
  </div>

  <div class="section card" style="display: {{SHOW_PRICING}}">
    <h2 style="margin-top:0">Pricing</h2>
    <div class="pricing">
      <div class="box">
        <div class="muted" style="font-weight:800">Starter</div>
        <div class="price">$ {{PRICE}} /mo</div>
        <div class="muted">Weekly check-ins • Training plan • Habit coaching</div>
      </div>
      <div class="box" style="border-color: rgba(110,231,255,.35); box-shadow: 0 0 0 3px rgba(110,231,255,.10)">
        <div class="muted" style="font-weight:800">1:1 Coaching</div>
        <div class="price">$ ${Number(opts.price || 29) * 3} /mo</div>
        <div class="muted">Everything + nutrition guidance + messaging support</div>
      </div>
    </div>
  </div>

  <div class="section card" style="display: {{SHOW_FAQ}}">
    <h2 style="margin-top:0">FAQ</h2>
    <p class="muted"><b>Beginners?</b> Yes—programs scale to your level.</p>
    <p class="muted"><b>Need a gym?</b> No—home or gym plans.</p>
    <p class="muted"><b>Results?</b> Stronger in 2–3 weeks, visible change 4–8 weeks.</p>
  </div>

  <footer class="muted" style="text-align:center; padding:18px 0">© ${new Date().getFullYear()} Fitness Coach • Built with Simo</footer>
</div>

<script>
// Replace markers once on load (safe)
document.body.innerHTML = document.body.innerHTML
  .replace('{{HEADLINE}}', '${headline}')
  .replace('{{CTA}}', '${cta}')
  .replace('{{PRICE}}', '${price}')
  .replace('{{SHOW_FAQ}}', '${showFAQ}')
  .replace('{{SHOW_PRICING}}', '${showPricing}')
  .replace('{{SHOW_TESTIMONIALS}}', '${showTestimonials}');
</script>

</body>
</html>`;
}
