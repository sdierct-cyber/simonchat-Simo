// netlify/functions/simon.js
// FAST + 504-proof + always-HTML builder.
// - Always responds within ~7s (Netlify won't 504)
// - Building returns an instant HTML template every time
// - OpenAI is optional + time-boxed. If slow/down, you still get the template.
// - Output contract: { ok, mode, topic, text, html }

export default async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: cors });

  try {
    if (req.method !== "POST") return j({ ok: false, error: "Use POST" }, 405, cors);

    const body = await req.json().catch(() => ({}));
    const mode = cleanMode(body.mode) || "building";
    const topic = clean(body.topic) || "general";
    const input = clean(body.input) || "";

    if (!input.trim()) {
      return j({ ok: true, mode, topic, text: "Tell me what you want right now — venting, solving, or building.", html: "" }, 200, cors);
    }

    const wantsBuild = mode === "building" || isBuildIntent(input);

    // ===== BUILDING: instant template ALWAYS (never blank, never waits) =====
    if (wantsBuild) {
      const kind = detectKind(input);
      const template = buildTemplate(kind, input);

      // Optional AI upgrade (time-boxed). Never blocks preview.
      const ai = await tryOpenAIQuick({
        mode: "building",
        topic,
        input,
        timeoutMs: 6500,
        maxTokens: 900,
      });

      if (ai.ok && ai.text) {
        const maybeHtml = extractHtml(ai.text);
        if (looksLikeHtml(maybeHtml)) {
          return j(
            { ok: true, mode, topic, text: "Done. Preview updated.", html: normalizeHtml(maybeHtml) },
            200,
            cors
          );
        }
        // AI gave text only: keep template, use AI as chat copy
        return j({ ok: true, mode, topic, text: ai.text.trim(), html: template }, 200, cors);
      }

      // AI slow/down: still perfect preview via template
      return j({ ok: true, mode, topic, text: "Done. Preview updated.", html: template }, 200, cors);
    }

    // ===== NON-BUILD: best friend / solving (time-boxed so no 504) =====
    const ai = await tryOpenAIQuick({
      mode,
      topic,
      input,
      timeoutMs: 6500,
      maxTokens: 550,
    });

    if (ai.ok && ai.text) return j({ ok: true, mode, topic, text: ai.text.trim(), html: "" }, 200, cors);

    // Fallback if OpenAI slow/down
    const fallback =
      mode === "venting"
        ? "I’m here. Say it straight — what happened?"
        : "Got you. What’s the goal, and what’s blocking you right now?";
    return j({ ok: true, mode, topic, text: fallback, html: "" }, 200, cors);
  } catch (e) {
    return j({ ok: false, error: e?.message || String(e) }, 500, cors);
  }
};

// ---------- OpenAI (time-boxed) ----------
async function tryOpenAIQuick({ mode, topic, input, timeoutMs, maxTokens }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "missing_key" };

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const sys = systemPrompt(mode, topic);

    // IMPORTANT: v1/responses uses "input" as a string or structured content.
    const payload = {
      model,
      input: `${sys}\n\nUSER:\n${input}\n`,
      temperature: mode === "building" ? 0.35 : 0.7,
      max_output_tokens: maxTokens,
    };

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const raw = await r.text();
    if (!r.ok) return { ok: false, error: `openai_${r.status}` };

    const data = JSON.parse(raw);
    return { ok: true, text: (data.output_text || "").trim() };
  } catch (e) {
    return { ok: false, error: e?.name === "AbortError" ? "timeout" : "network" };
  } finally {
    clearTimeout(t);
  }
}

function systemPrompt(mode, topic) {
  if (mode === "building") {
    return `
You are Simo, a product-grade builder.
When building, you may output HTML.
If you output HTML: it MUST be a full document starting with <!doctype html>.
No markdown fences unless the entire output is HTML.
Style: clean, modern, dark-friendly, polished.
Topic: ${topic}
`.trim();
  }
  if (mode === "venting") {
    return `
You are Simo, the user's private best friend.
Be direct and real. No therapy clichés. One question max.
Topic: ${topic}
`.trim();
  }
  return `
You are Simo, practical problem-solver.
Give a short plan with numbered steps.
Topic: ${topic}
`.trim();
}

// ---------- Templates (instant = never fails) ----------
function detectKind(input) {
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
  const p = String(prompt || "");
  const t = p.toLowerCase();

  // Detect category
  const isFitness =
    t.includes("fitness") || t.includes("workout") || t.includes("coach") ||
    t.includes("gym") || t.includes("training") || t.includes("nutrition") ||
    t.includes("health") || t.includes("fat loss") || t.includes("strength");

  const isImmigrant =
    t.includes("immigrant") || t.includes("factory") || t.includes("migration") ||
    t.includes("new country") || t.includes("american dream");

  const isSpace =
    t.includes("space") || t.includes("outer space") || t.includes("galaxy") ||
    t.includes("cosmic") || t.includes("astronaut") || t.includes("stars") ||
    t.includes("planet") || t.includes("universe") || t.includes("nebula") ||
    t.includes("sci-fi") || t.includes("scifi") || t.includes("science fiction") ||
    t.includes("rocket") || t.includes("orbit") || t.includes("moon") || t.includes("mars");

  // Pull explicit title/subtitle/author if user provided them
  const titleFromPrompt = pick(p, /title\s*:\s*["“]?([^"\n”]+)["”]?/i);
  const subtitleFromPrompt = pick(p, /subtitle\s*:\s*["“]?([^"\n”]+)["”]?/i);
  const authorFromPrompt = pick(p, /author\s*:\s*["“]?([^"\n”]+)["”]?/i);

  // Keyword fallback from prompt (so it never feels unrelated)
  const keywords = extractKeywords(t);
  const kwTitle = keywords.length ? toTitleCase(keywords.slice(0, 2).join(" ")) : "";

  // Defaults
  let title = titleFromPrompt || "";
  let subtitle = subtitleFromPrompt || "";
  let author = authorFromPrompt || "Simo Studio";
  let kicker = "Book cover concept";
  let blurb =
    "Give me the vibe (minimal, gritty, cinematic) and I’ll tune the design + copy to match your book.";
  let meta = "Concept • Custom • Clean";

  if (isFitness) {
    title = title || "The Coach’s Playbook";
    subtitle = subtitle || "A practical manual for health & fitness";
    kicker = "Fitness manual";
    blurb =
      "A no-fluff system: training templates, habit rules, nutrition basics, and progress checkpoints — all in one place.";
    meta = "Manual • Strength • Health";
  } else if (isImmigrant) {
    title = title || "New Roots";
    subtitle = subtitle || "A factory worker’s American journey";
    kicker = "A modern immigrant story";
    blurb =
      "Early mornings. Factory floors. Quiet pride. A modest life built one shift at a time — and gratitude for what America offers.";
    meta = "Memoir • Contemporary • Hope";
    author = authorFromPrompt || "Simon Gojcaj";
  } else if (isSpace) {
    title = title || "Beyond the Stars";
    subtitle = subtitle || "A journey through the silence of space";
    kicker = "Space / Sci-Fi";
    blurb =
      "Dark matter. Distant worlds. A mission that changes everything — where one signal can rewrite what humanity believes.";
    meta = "Sci-Fi • Space • Adventure";
  } else {
    // Generic but prompt-driven so it never feels random
    title = title || (kwTitle ? kwTitle : "A New Chapter");
    subtitle = subtitle || (keywords.length ? `A story of ${keywords.slice(0, 3).join(", ")}` : "A story shaped by grit and growth");
    kicker = keywords.length ? ("About " + keywords.slice(0, 3).join(" • ")) : "Book cover concept";
    blurb =
      "Give me: genre + vibe + 3 keywords and I’ll lock the title/subtitle and redesign the cover to match.";
    meta = "Concept • Custom • Clean";
  }

  // Subtle space styling switch
  const bgTop = isSpace ? "#1a2b7a" : "#1b2a5a";
  const bgBottom = isSpace ? "#070a16" : "#0d1224";
  const stripes = isSpace
    ? "repeating-linear-gradient(90deg, rgba(255,255,255,.035) 0 2px, transparent 2px 14px)"
    : "repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0 2px, transparent 2px 10px)";

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
      ${stripes},
      linear-gradient(180deg, ${bgTop}, ${bgBottom});
  }
  .stripe{
    position:absolute; inset:22px 22px auto 22px;
    padding:16px 14px; border-radius:14px;
    background:rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.18);
    backdrop-filter: blur(10px);
  }
  h1{margin:0; font-size:34px; letter-spacing:.4px; line-height:1.05}
  h2{margin:10px 0 0; font-size:14px; color:rgba(234,240,255,.82); font-weight:600}
  .art{position:absolute; inset:0; display:grid; place-items:center; padding-top:105px;}
  .badge{
    width:76%; border-radius:18px;
    background:rgba(242,239,232,.92);
    color:var(--ink);
    padding:18px;
    box-shadow:0 12px 30px rgba(0,0,0,.25);
  }
  .badge .k{font-size:12px; letter-spacing:.2em; text-transform:uppercase; color:#3a4460}
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
  .right p{margin:0;color:var(--muted);line-height:1.5}
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
          <div class="k">${esc(kicker)}</div>
          <div class="line"></div>
          <p>${esc(blurb)}</p>
        </div>
      </div>

      <div class="author">
        <strong>${esc(author)}</strong>
        <div class="meta">${esc(meta)}</div>
      </div>
    </div>

    <div class="right">
      <h3>Quick edits</h3>
      <p>Say: <b>title:</b> …  <b>subtitle:</b> …  <b>author:</b> …  or “more minimal / more gritty / more bold”.</p>
    </div>
  </div>
</body>
</html>`;
}

function landingHtml(prompt) {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Landing</title><style>
body{margin:0;font-family:system-ui;background:#0b1020;color:#eaf0ff;display:grid;place-items:center;min-height:100vh}
.card{max-width:900px;width:92%;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.06);padding:18px}
p{color:rgba(234,240,255,.75);line-height:1.5}
</style></head><body><div class="card"><h1>Landing Page</h1><p>${esc(prompt)}</p></div></body></html>`;
}

function genericHtml(prompt) {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Simo Build</title><style>
body{margin:0;font-family:system-ui;background:#0b1020;color:#eaf0ff;display:grid;place-items:center;min-height:100vh}
.card{max-width:900px;width:92%;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.06);padding:18px}
</style></head><body><div class="card"><h1>Simo Build</h1><div>${esc(prompt)}</div></div></body></html>`;
}

// --- keyword helpers (used by bookCoverHtml) ---
function extractKeywords(t) {
  const stop = new Set(["show","me","a","an","the","book","cover","about","for","of","and","to","that","is","like","manual"]);
  const words = String(t || "").replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter(Boolean);
  const out = [];
  for (const w of words) {
    if (w.length < 3) continue;
    if (stop.has(w)) continue;
    if (!out.includes(w)) out.push(w);
    if (out.length >= 6) break;
  }
  return out;
}
function toTitleCase(s) {
  return String(s || "")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ---------- Utils ----------
function j(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
function clean(x) {
  return typeof x === "string" ? x.replace(/\u0000/g, "").trim() : "";
}
function cleanMode(m) {
  const s = String(m || "").toLowerCase().trim();
  return ["venting", "solving", "building"].includes(s) ? s : "";
}
function isBuildIntent(input) {
  const t = String(input || "").toLowerCase();
  return (
    t.includes("build ") ||
    t.includes("preview") ||
    t.includes("html") ||
    t.includes("book cover") ||
    t.includes("mockup") ||
    t.includes("landing page")
  );
}
function extractHtml(text) {
  const t = String(text || "").trim();
  const m = t.match(/```html([\s\S]*?)```/i);
  return m && m[1] ? m[1].trim() : t;
}
function looksLikeHtml(s) {
  const t = String(s || "").trim();
  return /^<!doctype html/i.test(t) || /<html[\s>]/i.test(t) || /<body[\s>]/i.test(t);
}
function normalizeHtml(s) {
  const t = String(s || "").trim();
  return /^<!doctype html/i.test(t) ? t : "<!doctype html>\n" + t;
}
function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
}
function pick(s, re) {
  const m = String(s || "").match(re);
  return m ? m[1].trim() : "";
}
