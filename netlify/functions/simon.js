// netlify/functions/simon.js
// 504-proof Simo backend:
// - ALWAYS responds quickly (prevents Netlify inactivity timeout)
// - building mode ALWAYS returns full HTML
// - OpenAI call is time-boxed; if slow, we fall back to instant templates

export default async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: cors });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405, cors);

    const body = await req.json().catch(() => ({}));
    const mode = cleanMode(body.mode) || "building";
    const topic = cleanText(body.topic) || "general";
    const input = cleanText(body.input) || "";

    if (!input.trim()) {
      return json({ ok: true, mode, topic, text: "Tell me what you want to build.", html: "" }, 200, cors);
    }

    const wantsBuild = mode === "building" || isBuildIntent(input);

    // ✅ Instant deterministic HTML for common build types (prevents timeouts)
    if (wantsBuild) {
      const kind = detectBuildKind(input);
      const baseHtml = buildTemplate(kind, input);

      // Try to improve copy via OpenAI, but NEVER block preview on it
      const ai = await tryOpenAIQuick({ mode, topic, input, timeoutMs: 7000 });
      if (ai.ok && ai.text) {
        // If AI returned full HTML, use it; else just swap in better text blocks
        const maybeHtml = extractHtml(ai.text);
        if (looksLikeHtml(maybeHtml)) {
          return json({ ok: true, mode, topic, text: "Done. Preview updated.", html: normalizeHtml(maybeHtml) }, 200, cors);
        }

        // otherwise: keep deterministic HTML and return AI response as chat text
        return json(
          {
            ok: true,
            mode,
            topic,
            text: ai.text.trim() || "Done. Preview updated.",
            html: baseHtml,
          },
          200,
          cors
        );
      }

      // OpenAI slow/down -> still return instantly with template
      return json(
        {
          ok: true,
          mode,
          topic,
          text: "Done. Preview updated.",
          html: baseHtml,
          note: ai.error ? `fallback: ${ai.error}` : "fallback: timeout",
        },
        200,
        cors
      );
    }

    // Non-build modes (venting/solving): still time-box OpenAI so we never 504
    const ai = await tryOpenAIQuick({ mode, topic, input, timeoutMs: 7000 });
    if (ai.ok && ai.text) {
      return json({ ok: true, mode, topic, text: ai.text.trim(), html: "" }, 200, cors);
    }
    return json(
      {
        ok: true,
        mode,
        topic,
        text: mode === "venting"
          ? "I’m here. Tell me what happened — start wherever you want."
          : "Got it. What’s the goal and what’s blocking you right now?",
        html: "",
        note: ai.error ? `fallback: ${ai.error}` : "fallback: timeout",
      },
      200,
      cors
    );

  } catch (err) {
    return json({ ok: false, error: err?.message || String(err) }, 500, cors);
  }
};

// ---------- OpenAI (time-boxed) ----------
async function tryOpenAIQuick({ mode, topic, input, timeoutMs }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "missing_openai_key" };

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const sys = systemPrompt(mode, topic);
    const payload = {
      model,
      input: `${sys}\n\nUSER:\n${input}\n`,
      temperature: mode === "building" ? 0.4 : 0.7,
      max_output_tokens: mode === "building" ? 900 : 450, // ✅ keep small to stay fast
    };

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const raw = await r.text();
    if (!r.ok) return { ok: false, error: `openai_${r.status}`, details: safeTrim(raw, 300) };

    const data = JSON.parse(raw);
    const outText = (data.output_text || "").trim();
    return { ok: true, text: outText };

  } catch (e) {
    // AbortError = timeout. Others = network.
    return { ok: false, error: e?.name === "AbortError" ? "timeout" : "network_error" };
  } finally {
    clearTimeout(t);
  }
}

function systemPrompt(mode, topic) {
  if (mode === "building") {
    return `
You are Simo, a web builder.
If the user asks for a UI/mockup/book cover, you may return HTML.
If you return HTML, it MUST be a complete document starting with <!doctype html>.
No markdown fences unless the entire output is HTML.
Topic: ${topic}
`.trim();
  }
  if (mode === "venting") {
    return `
You are Simo, the user's private best friend. Direct, warm, no therapy clichés.
Ask at most one question.
Topic: ${topic}
`.trim();
  }
  return `
You are Simo, practical problem-solver.
Give numbered steps. Ask only essential info.
Topic: ${topic}
`.trim();
}

// ---------- Templates (instant) ----------
function detectBuildKind(input) {
  const t = input.toLowerCase();
  if (t.includes("book cover")) return "book_cover";
  if (t.includes("landing page")) return "landing";
  if (t.includes("dashboard")) return "dashboard";
  if (t.includes("app")) return "app";
  return "generic";
}

function buildTemplate(kind, input) {
  if (kind === "book_cover") return bookCoverHtml(input);
  if (kind === "landing") return landingHtml(input);
  return genericHtml(input);
}

function bookCoverHtml(prompt) {
  const title = guessTitle(prompt) || "New Roots";
  const subtitle = guessSubtitle(prompt) || "A factory worker’s American journey";
  const author = guessAuthor(prompt) || "Simon Gojcaj";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Book Cover Mockup</title>
<style>
  :root{--bg:#0b1020;--ink:#0e1220;--cream:#f2efe8;--muted:#b9c3dd}
  *{box-sizing:border-box}
  body{
    margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
    background:radial-gradient(1100px 650px at 18% 0%, #162a66 0%, var(--bg) 55%);
    color:#eaf0ff; display:grid; place-items:center; min-height:100vh; padding:28px;
  }
  .stage{display:grid; gap:18px; max-width:980px; width:100%; grid-template-columns: 420px 1fr;}
  .cover{
    width:420px; aspect-ratio: 2/3; border-radius:18px; overflow:hidden;
    box-shadow:0 30px 80px rgba(0,0,0,.55);
    position:relative; border:1px solid rgba(255,255,255,.14);
    background:
      radial-gradient(900px 700px at 30% 0%, rgba(255,255,255,.12), transparent 60%),
      linear-gradient(160deg, rgba(255,255,255,.06), rgba(0,0,0,.32)),
      repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0 2px, transparent 2px 10px),
      linear-gradient(180deg, #1b2a5a, #0d1224);
  }
  .stripe{
    position:absolute; inset:22px 22px auto 22px;
    padding:16px 14px; border-radius:14px;
    background:rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.18);
    backdrop-filter: blur(10px);
  }
  h1{margin:0; font-size:34px; letter-spacing:.4px; line-height:1.05}
  h2{margin:10px 0 0; font-size:14px; color:rgba(234,240,255,.82); font-weight:600}
  .art{
    position:absolute; inset:0; display:grid; place-items:center;
    padding-top:105px;
  }
  .badge{
    width:76%; border-radius:18px;
    background:rgba(242,239,232,.92);
    color:var(--ink);
    padding:18px;
    box-shadow:0 12px 30px rgba(0,0,0,.25);
  }
  .badge .kicker{font-size:12px; letter-spacing:.2em; text-transform:uppercase; color:#3a4460}
  .badge .line{height:1px; background:rgba(0,0,0,.12); margin:10px 0}
  .badge p{margin:0; color:#26304a; line-height:1.45}
  .author{
    position:absolute; left:22px; right:22px; bottom:22px;
    display:flex; justify-content:space-between; align-items:center;
    padding:12px 14px; border-radius:14px;
    background:rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.18);
    color:rgba(234,240,255,.9);
  }
  .author strong{letter-spacing:.12em; text-transform:uppercase; font-size:12px}
  .meta{color:rgba(234,240,255,.65); font-size:12px}
  .right{
    border:1px solid rgba(255,255,255,.12);
    border-radius:18px;
    background:rgba(255,255,255,.06);
    padding:18px;
    box-shadow:0 18px 44px rgba(0,0,0,.35);
  }
  .right h3{margin:0 0 8px}
  .right p{margin:0; color:var(--muted); line-height:1.5}
  .tags{margin-top:12px; display:flex; gap:10px; flex-wrap:wrap}
  .tag{padding:8px 10px; border-radius:999px; border:1px solid rgba(255,255,255,.12); background:rgba(0,0,0,.18); color:rgba(234,240,255,.8); font-size:12px}
  @media (max-width: 980px){
    .stage{grid-template-columns:1fr}
    .cover{width:min(420px, 100%)}
  }
</style>
</head>
<body>
  <div class="stage">
    <div class="cover">
      <div class="stripe">
        <h1>${esc(title)}</h1>
        <h2>${esc(subtitle)}</h2>
      </div>

      <div class="art">
        <div class="badge">
          <div class="kicker">A modern immigrant story</div>
          <div class="line"></div>
          <p>Early mornings. Factory floors. Quiet pride. A modest life built one shift at a time — and gratitude for what America offers.</p>
        </div>
      </div>

      <div class="author">
        <strong>${esc(author)}</strong>
        <div class="meta">Memoir • Contemporary • Hope</div>
      </div>
    </div>

    <div class="right">
      <h3>What you can change</h3>
      <p>Tell me: <b>title</b>, <b>subtitle</b>, <b>author</b>, and the <b>vibe</b> (gritty / hopeful / cinematic / minimal). I’ll update the cover instantly.</p>
      <div class="tags">
        <div class="tag">Book cover mockup</div>
        <div class="tag">Print-ready layout</div>
        <div class="tag">No external assets</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function landingHtml(prompt){
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Landing</title>
<style>body{margin:0;font-family:system-ui;background:#0b1020;color:#eaf0ff;display:grid;place-items:center;min-height:100vh}
.card{max-width:860px;width:92%;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.06);padding:18px}
h1{margin:0 0 8px}p{margin:0;color:rgba(234,240,255,.75);line-height:1.5}
</style></head><body><div class="card"><h1>Landing Page</h1><p>${esc(prompt)}</p></div></body></html>`;
}
function genericHtml(prompt){
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Simo Build</title>
<style>body{margin:0;font-family:system-ui;background:#0b1020;color:#eaf0ff;display:grid;place-items:center;min-height:100vh}
.card{max-width:860px;width:92%;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.06);padding:18px}
</style></head><body><div class="card"><h1>Simo Build</h1><div>${esc(prompt)}</div></div></body></html>`;
}

// ---------- Utilities ----------
function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...headers } });
}
function cleanText(x){ return typeof x === "string" ? x.replace(/\u0000/g,"").trim() : ""; }
function cleanMode(m){ const s = String(m||"").toLowerCase().trim(); return ["venting","solving","building"].includes(s) ? s : ""; }
function safeTrim(s,n){ const t=String(s||""); return t.length>n ? t.slice(0,n)+"…" : t; }
function isBuildIntent(input){
  const t = input.toLowerCase();
  return t.includes("build ") || t.includes("preview") || t.includes("html") || t.includes("book cover") || t.includes("mockup") || t.includes("landing page");
}
function extractHtml(text){
  const t = String(text||"").trim();
  const m = t.match(/```html([\s\S]*?)```/i);
  return (m && m[1]) ? m[1].trim() : t;
}
function looksLikeHtml(s){
  const t = String(s||"").trim();
  return /^<!doctype html/i.test(t) || /<html[\s>]/i.test(t) || /<body[\s>]/i.test(t);
}
function normalizeHtml(s){
  const t = String(s||"").trim();
  return /^<!doctype html/i.test(t) ? t : "<!doctype html>\n" + t;
}
function esc(s){ return String(s||"").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m])); }
function guessTitle(prompt){
  const m = String(prompt||"").match(/title\s*:\s*["“]?([^"\n”]+)["”]?/i);
  return m ? m[1].trim() : "";
}
function guessSubtitle(prompt){
  const m = String(prompt||"").match(/subtitle\s*:\s*["“]?([^"\n”]+)["”]?/i);
  return m ? m[1].trim() : "";
}
function guessAuthor(prompt){
  const m = String(prompt||"").match(/author\s*:\s*["“]?([^"\n”]+)["”]?/i);
  return m ? m[1].trim() : "";
}
