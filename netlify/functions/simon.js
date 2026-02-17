// netlify/functions/simon.js
// Simo backend (CommonJS) — versioned + stable preview contract
// If OpenAI key exists, you can wire it later — for now this never crashes and always returns predictable JSON.

let state = {
  currentPreviewKind: null,
  currentPreviewTitle: null,
  currentPreviewHTML: null,
};

const VERSION = "simo-backend-2026-02-17a";

exports.handler = async (event) => {
  try {
    // ✅ Quick browser check: open /.netlify/functions/simon
    if (event.httpMethod === "GET") {
      return json200({
        version: VERSION,
        ok: true,
        note: "POST {message, mode} to generate previews.",
      });
    }

    const body = JSON.parse(event.body || "{}");
    const message = (body.message || "").toString().trim();
    const mode = (body.mode || "building").toString().toLowerCase();

    if (!message) {
      return json200({ ok: true, assistant: "Say something and I’ll respond." });
    }

    // ---- MODE BEHAVIOR (best friend + builder) ----
    if (mode === "venting") {
      return json200({
        ok: true,
        assistant:
          "I’m here. What happened — and what’s the part that’s hitting you the hardest right now?",
      });
    }

    if (mode === "solving") {
      return json200({
        ok: true,
        assistant:
          "Got you. What’s the goal, what’s blocking you, and what have you tried so far?",
      });
    }

    // ---- BUILDING MODE ----
    const lower = message.toLowerCase();

    // BUILD: landing page preview
    if (lower.includes("landing page") || lower.includes("landingpage")) {
      state.currentPreviewKind = "landing_page";
      state.currentPreviewTitle = "Landing Page";
      state.currentPreviewHTML = buildFlowProLandingHTML();

      return json200({
        ok: true,
        assistant: "Preview rendered on the right.",
        preview: {
          kind: state.currentPreviewKind,
          title: state.currentPreviewTitle,
          html: state.currentPreviewHTML,
        },
      });
    }

    // EDIT: price change (works on the existing preview)
    if (
      /(change|edit|update)/i.test(message) &&
      state.currentPreviewHTML &&
      /\bpro\b/i.test(message)
    ) {
      // detect $19
      if (/\$?\s*19\b/.test(message) || /19\/mo/i.test(message)) {
        state.currentPreviewHTML = state.currentPreviewHTML.replace(
          /\$29\/mo/g,
          "$19/mo"
        );
        return json200({
          ok: true,
          assistant: "Done — Pro updated to $19/mo.",
          preview: {
            kind: state.currentPreviewKind || "landing_page",
            title: state.currentPreviewTitle || "Updated Preview",
            html: state.currentPreviewHTML,
          },
        });
      }

      return json200({
        ok: true,
        assistant:
          "Tell me the exact Pro price you want (example: “change Pro price to $19/mo”).",
      });
    }

    // If they said “change pro price” but we don’t have a preview yet
    if (/\bpro\b/i.test(message) && /price/i.test(message) && !state.currentPreviewHTML) {
      return json200({
        ok: true,
        assistant:
          "I can do that — but first generate a preview: “build a landing page preview”.",
      });
    }

    // Default builder reply (keeps you moving forward)
    return json200({
      ok: true,
      assistant:
        "In Building mode, try: “build a landing page preview” or “build a pricing section preview”.",
    });
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: "Server error in simon.js",
        details: String(err && err.message ? err.message : err),
      }),
    };
  }
};

function json200(obj) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}

function buildFlowProLandingHTML() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>FlowPro</title>
<style>
  :root{
    --bg:#0b1020;
    --text:#eaf0ff;
    --muted:#a9b6d3;
    --line:rgba(255,255,255,.10);
    --card:rgba(255,255,255,.06);
    --btn:#2a66ff;
    --btn2:#1f4dd6;
  }
  *{box-sizing:border-box}
  body{
    margin:0; font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
    background:radial-gradient(1200px 700px at 20% 0%, #162a66 0%, var(--bg) 55%);
    color:var(--text);
  }
  .wrap{max-width:1040px;margin:0 auto;padding:54px 22px 70px}
  h1{font-size:56px;line-height:1.05;margin:0 0 10px}
  .sub{color:var(--muted);margin:0 0 22px;font-size:18px}
  .btnrow{display:flex;gap:14px;margin:18px 0 34px;flex-wrap:wrap}
  .btn{
    background:var(--btn); border:none; color:#fff; font-weight:800;
    padding:12px 18px; border-radius:12px; cursor:pointer;
    box-shadow:0 12px 30px rgba(0,0,0,.25);
  }
  .btn.secondary{background:rgba(255,255,255,.10); color:#eaf0ff}
  .btn:hover{background:var(--btn2)}
  .btn.secondary:hover{background:rgba(255,255,255,.14)}
  .featureList{display:grid;gap:14px;margin:0 0 44px}
  .pill{
    background:rgba(255,255,255,.06);
    border:1px solid var(--line);
    border-radius:14px;
    padding:18px 18px;
    color:#eaf0ff;
  }
  .pricing{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
  .card{
    background:rgba(255,255,255,.06);
    border:1px solid var(--line);
    border-radius:18px;
    padding:22px;
    text-align:center;
    box-shadow:0 16px 50px rgba(0,0,0,.22);
  }
  .card h2{margin:6px 0 10px;font-size:22px}
  .price{font-size:42px;font-weight:900;margin:10px 0 14px}
  .meta{color:var(--muted);margin:8px 0}
  .tag{
    display:inline-block;
    background:rgba(42,102,255,.25);
    border:1px solid rgba(42,102,255,.45);
    color:#dbe6ff;
    font-weight:800;
    padding:6px 10px;
    border-radius:999px;
    font-size:12px;
    margin-bottom:10px;
  }
  @media (max-width: 900px){
    h1{font-size:44px}
    .pricing{grid-template-columns:1fr}
  }
</style>
</head>
<body>
  <div class="wrap">
    <h1>FlowPro helps you automate your workflow.</h1>
    <div class="sub">Save time. Reduce manual work. Scale smarter.</div>

    <div class="btnrow">
      <button class="btn">Get Started</button>
      <button class="btn secondary">See Demo</button>
    </div>

    <div class="featureList">
      <div class="pill">Automated task pipelines</div>
      <div class="pill">Smart scheduling</div>
      <div class="pill">Real-time analytics dashboard</div>
    </div>

    <div class="pricing">
      <div class="card">
        <h2>Starter</h2>
        <div class="price">$9/mo</div>
        <div class="meta">Basic support</div>
        <div class="meta">Core features</div>
        <div class="meta">1 user</div>
        <button class="btn" style="margin-top:16px">Choose Plan</button>
      </div>

      <div class="card">
        <div class="tag">Most Popular</div>
        <h2>Pro</h2>
        <div class="price">$29/mo</div>
        <div class="meta">Priority support</div>
        <div class="meta">All features</div>
        <div class="meta">5 users</div>
        <button class="btn" style="margin-top:16px">Choose Plan</button>
      </div>

      <div class="card">
        <h2>Enterprise</h2>
        <div class="price">$99/mo</div>
        <div class="meta">Dedicated support</div>
        <div class="meta">Custom integrations</div>
        <div class="meta">Unlimited users</div>
        <button class="btn" style="margin-top:16px">Contact Sales</button>
      </div>
    </div>
  </div>
</body>
</html>`;
}
