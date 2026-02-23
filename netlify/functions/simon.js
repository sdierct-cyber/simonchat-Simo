// netlify/functions/simon.js
// Simo backend — CORE STABLE (no edits, no regex, no surprises)
// Always returns JSON: { ok, reply, html }

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { ok: false, reply: "Use POST", html: "" });
    }

    const body = safeJson(event.body) || {};
    const input = String(body.input || "").trim();
    const lower = input.toLowerCase();

    if (!input) {
      return json(200, { ok: true, reply: "Type: build a landing page for a fitness coach", html: "" });
    }

    // Build trigger
    if (lower.includes("build") && lower.includes("landing page")) {
      const html = landingPageHTML();
      return json(200, {
        ok: true,
        reply: "Done. Built a landing page and updated the preview on the right.",
        html
      });
    }

    // Normal chat (never blank)
    if (lower === "hello" || lower === "hi" || lower === "hey") {
      return json(200, { ok: true, reply: "Hey — tell me what you want to build.", html: "" });
    }

    return json(200, {
      ok: true,
      reply: "If you want a page, type: build a landing page for a fitness coach",
      html: ""
    });
  } catch (e) {
    // NEVER crash the UI — always return JSON
    return json(200, {
      ok: false,
      reply: "Backend error. Try again.",
      html: "",
      error: String(e && e.message ? e.message : e)
    });
  }
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(obj)
  };
}

function safeJson(s) {
  try { return JSON.parse(s || "{}"); } catch { return null; }
}

function landingPageHTML() {
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
    --line:rgba(255,255,255,.10); --r:18px; --shadow:0 18px 60px rgba(0,0,0,.45);
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
  header{
    display:flex; align-items:center; justify-content:space-between; gap:16px;
    padding:14px 0 18px; border-bottom:1px solid var(--line);
  }
  .brand{display:flex; align-items:center; gap:10px; font-weight:950}
  .logo{
    width:38px; height:38px; border-radius:14px;
    background:linear-gradient(135deg, rgba(110,231,255,.95), rgba(167,139,250,.95));
    box-shadow: 0 18px 40px rgba(110,231,255,.18);
  }
  .pill{
    padding:10px 12px; border-radius:999px; border:1px solid var(--line);
    background: rgba(255,255,255,.04);
    color: var(--muted); font-weight:800;
  }
  .grid{display:grid; grid-template-columns: 1.2fr .8fr; gap:16px; margin-top:18px}
  .card{
    border:1px solid var(--line);
    background: rgba(255,255,255,.04);
    border-radius: var(--r);
    box-shadow: var(--shadow);
    padding:18px;
  }
  h1{margin:0 0 10px; font-size:42px; line-height:1.1}
  p{margin:0 0 12px; color: var(--muted)}
  .btn{
    display:inline-block;
    padding:12px 14px;
    border-radius: 14px;
    border:1px solid rgba(110,231,255,.35);
    background: linear-gradient(180deg, rgba(110,231,255,.22), rgba(167,139,250,.16));
    font-weight:950;
    text-decoration:none;
  }
  input{
    width:100%;
    padding:12px;
    border-radius:14px;
    border:1px solid var(--line);
    background: rgba(0,0,0,.18);
    color: var(--text);
    margin:8px 0;
    outline:none;
  }
  @media (max-width: 900px){
    .grid{grid-template-columns: 1fr}
    h1{font-size:34px}
  }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <div class="brand"><div class="logo"></div>Fitness Coach</div>
      <div class="pill">1:1 Online Coaching</div>
    </header>

    <div class="grid">
      <div class="card">
        <h1>Get Fit Without Guesswork</h1>
        <p>Online coaching for strength, fat loss, and habits that stick—without confusing plans.</p>
        <a class="btn" href="#lead">Start Your Free Consultation</a>
        <p style="margin-top:12px">✅ Training plan tailored to your schedule<br/>✅ Weekly check-ins + accountability<br/>✅ Simple habit system that lasts</p>
      </div>

      <div class="card" id="lead">
        <h2 style="margin:0 0 10px">Free consult</h2>
        <p>Tell me your goal and schedule. I’ll suggest a plan.</p>
        <form onsubmit="event.preventDefault(); alert('Submitted (demo).');">
          <input required placeholder="Name" />
          <input required type="email" placeholder="Email" />
          <button class="btn" type="submit" style="width:100%; text-align:center; margin-top:10px">Request My Plan</button>
        </form>
        <p style="margin-top:10px; font-size:12px; color:var(--muted)">No spam. Just your plan.</p>
      </div>
    </div>

    <footer style="padding:18px 0; color:var(--muted); text-align:center">
      © ${new Date().getFullYear()} Fitness Coach • Built with Simo
    </footer>
  </div>
</body>
</html>`;
}
