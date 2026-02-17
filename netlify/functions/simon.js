// netlify/functions/simon.js
// CommonJS Netlify Function (safe default)

// NOTE: In serverless, "memory" can reset on cold starts.
// This still works for quick tests, but later we’ll move state to the client for reliability.
let currentPreviewHTML = null;

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const message = (body.message || "").toString();
    const m = message.toLowerCase();

    // --- detect edit intent ---
    const isEdit = /\b(change|edit|update)\b/i.test(message);

    // --- edit existing preview HTML (only if we have one in memory) ---
    if (isEdit && currentPreviewHTML) {
      // Example: change Pro price to $19
      if (/\bpro\b/i.test(message) && /\$?\s*19\b/.test(message)) {
        currentPreviewHTML = currentPreviewHTML.replace(/\$29\/mo/g, "$19/mo");
      }

      return json200({
        reply: "Updated existing preview.",
        preview: currentPreviewHTML,
      });
    }

    // --- build initial landing page preview ---
    if (m.includes("landing page")) {
      currentPreviewHTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>FlowPro</title>
<style>
  :root{
    --bg1:#0b1437; --bg2:#1a2c5b; --card:#16224a; --text:#eaf0ff; --muted:#b8c4dd;
    --btn:#2d6cff; --btn2:#1f57d6;
  }
  *{box-sizing:border-box}
  body{
    margin:0;
    font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
    background:linear-gradient(135deg,var(--bg1),var(--bg2));
    color:var(--text);
  }
  .container{max-width:1100px;margin:70px auto;padding:20px}
  h1{font-size:48px;line-height:1.05;margin:0 0 10px}
  .sub{color:var(--muted);margin:0 0 28px;font-size:18px}
  .cards{display:flex;gap:18px;flex-wrap:wrap}
  .card{
    background:rgba(22,34,74,.92);
    padding:26px;
    border-radius:14px;
    flex:1 1 260px;
    text-align:center;
    box-shadow:0 18px 50px rgba(0,0,0,.25);
    border:1px solid rgba(255,255,255,.08);
  }
  .card h2{margin:0 0 10px;font-size:22px}
  .price{font-size:34px;margin:12px 0 10px;font-weight:800}
  .card div{color:var(--muted);margin:6px 0}
  button{
    margin-top:14px;
    padding:10px 18px;
    background:var(--btn);
    border:none;
    border-radius:8px;
    color:#fff;
    font-weight:700;
    cursor:pointer;
  }
  button:hover{background:var(--btn2)}
</style>
</head>
<body>
  <div class="container">
    <h1>FlowPro helps you automate your workflow.</h1>
    <p class="sub">Save time. Reduce manual work. Scale smarter.</p>

    <div class="cards">
      <div class="card">
        <h2>Starter</h2>
        <div class="price">$9/mo</div>
        <div>Basic support</div>
        <div>Core features</div>
        <div>1 user</div>
        <button>Choose Plan</button>
      </div>

      <div class="card">
        <h2>Pro</h2>
        <div class="price">$29/mo</div>
        <div>Priority support</div>
        <div>All features</div>
        <div>5 users</div>
        <button>Choose Plan</button>
      </div>

      <div class="card">
        <h2>Enterprise</h2>
        <div class="price">$99/mo</div>
        <div>Dedicated support</div>
        <div>Custom integrations</div>
        <div>Unlimited users</div>
        <button>Contact Sales</button>
      </div>
    </div>
  </div>
</body>
</html>`;

      return json200({
        reply: "Preview rendered.",
        preview: currentPreviewHTML,
      });
    }

    // --- default ---
    return json200({
      reply: "I’m here. Pick a mode — or just talk.",
    });

  } catch (err) {
    // Return the real error to the UI so we can see it
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
    body: JSON.stringify({ ok: true, ...obj }),
  };
}
