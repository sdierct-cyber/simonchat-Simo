// netlify/functions/simon.js
// Simo V2 — Intent-first (ChatGPT-like) + Stable Builder
// Goals:
// - Act like ChatGPT by default (text answers, best-friend, problem solving)
// - ONLY return HTML when the user clearly asked for a build/preview/mockup/cover/page
// - Never 504 (time-box OpenAI). Always has fast fallbacks.
// - Output contract: { ok, mode, topic, text, html, routed_mode, intent }

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
    const requestedMode = cleanMode(body.mode) || "building"; // UI mode; we may override for routing
    const topic = clean(body.topic) || "general";
    const input = clean(body.input) || "";

    if (!input.trim()) {
      return j(
        {
          ok: true,
          mode: requestedMode,
          routed_mode: "solving",
          topic,
          intent: "idle",
          text: "Tell me what you want right now — venting, solving, or building.",
          html: "",
        },
        200,
        cors
      );
    }

    // --- INTENT-FIRST ROUTING (this is the big change) ---
    const intent = detectIntent(input);
    const routedMode = intent.mode; // "building" | "solving" | "venting"
    const wantsHtml = intent.wantsHtml;

    // ===== BUILD PATH (HTML) =====
    if (wantsHtml) {
      const kind = detectBuildKind(input);
      const template = buildTemplate(kind, input);

      // Optional AI HTML upgrade (time-boxed). Never blocks preview.
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
            {
              ok: true,
              mode: requestedMode,
              routed_mode: "building",
              topic,
              intent: "build",
              text: "Done. Preview updated.",
              html: normalizeHtml(maybeHtml),
            },
            200,
            cors
          );
        }
        // AI gave text only: keep template for preview, use AI as chat copy
        return j(
          {
            ok: true,
            mode: requestedMode,
            routed_mode: "building",
            topic,
            intent: "build",
            text: ai.text.trim(),
            html: template,
          },
          200,
          cors
        );
      }

      // AI slow/down: still perfect preview via template (no blank, no white pane)
      return j(
        {
          ok: true,
          mode: requestedMode,
          routed_mode: "building",
          topic,
          intent: "build",
          text: "Done. Preview updated.",
          html: template,
        },
        200,
        cors
      );
    }

    // ===== TEXT PATH (ChatGPT-like) =====
    // When user asks to "write a book" or general questions, we do NOT force HTML.
    // We time-box OpenAI; if it's slow, we return a helpful fallback response.

    const ai = await tryOpenAIQuick({
      mode: routedMode,
      topic,
      input,
      timeoutMs: 6500,
      maxTokens: routedMode === "venting" ? 420 : 650,
    });

    if (ai.ok && ai.text) {
      return j(
        {
          ok: true,
          mode: requestedMode,
          routed_mode: routedMode,
          topic,
          intent: routedMode === "venting" ? "vent" : "text",
          text: ai.text.trim(),
          html: "",
        },
        200,
        cors
      );
    }

    // ---- Fallbacks (fast, no 504) ----
    // (Still "ChatGPT-like": helpful, not just "try again")
    const fallbackText = fallbackForIntent(routedMode, input);
    return j(
      {
        ok: true,
        mode: requestedMode,
        routed_mode: routedMode,
        topic,
        intent: routedMode === "venting" ? "vent" : "text",
        text: fallbackText,
        html: "",
      },
      200,
      cors
    );
  } catch (e) {
    return j({ ok: false, error: e?.message || String(e) }, 500, cors);
  }
};

// =====================
// OpenAI (time-boxed)
// =====================
async function tryOpenAIQuick({ mode, topic, input, timeoutMs, maxTokens }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "missing_key" };

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const sys = systemPrompt(mode, topic);

    const payload = {
      model,
      input: `${sys}\n\nUSER:\n${input}\n`,
      temperature: mode === "building" ? 0.35 : mode === "venting" ? 0.8 : 0.65,
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
You are Simo, a product-grade builder who outputs usable results.
If you output HTML: it MUST be a full document starting with <!doctype html>.
No markdown fences unless the entire output is HTML.
Make it clean, modern, dark-friendly, and realistic for a real customer.
Topic: ${topic}
`.trim();
  }

  if (mode === "venting") {
    return `
You are Simo, the user's private best friend.
Be real and grounded. Avoid therapy clichés. No lectures.
Validate briefly, reflect the core emotion, then ask ONE good question.
Keep it human and direct.
Topic: ${topic}
`.trim();
  }

  // solving
  return `
You are Simo, practical problem-solver.
Give a tight plan with clear steps and specifics.
If they need instructions, be step-by-step.
Topic: ${topic}
`.trim();
}

// =====================
// Intent detection
// =====================
function detectIntent(input) {
  const t = String(input || "").toLowerCase();

  // Explicit build triggers (HTML)
  const explicitBuild =
    /\b(build|create|design|generate|make|mockup|wireframe)\b/.test(t) ||
    /\b(show me)\b/.test(t) ||
    /\b(preview|landing page|website|web page|homepage|book cover|cover mockup|ui)\b/.test(t);

  // If they explicitly ask for writing longform, DO NOT force HTML
  const explicitWriting =
    /\b(write|draft|outline|chapter|novel|storybook|memoir|script|essay)\b/.test(t) &&
    !/\b(book cover|cover)\b/.test(t); // "book cover" stays build

  // Venting signals
  const ventSignals =
    /\b(i'm|im|i am)\b/.test(t) &&
    /\b(stressed|overwhelmed|tired|anxious|sad|angry|mad|upset|depressed|burnt out|frustrated)\b/.test(t);

  const argumentSignals =
    /\b(fighting|argument|she said|he said|we keep|loop|relationship|wife|husband)\b/.test(t);

  // Solving signals
  const solveSignals =
    /\b(how do i|how to|help me|steps|plan|fix|debug|why is|what should i do)\b/.test(t);

  // Decide
  if (explicitWriting) {
    return { wantsHtml: false, mode: solveSignals ? "solving" : "solving" }; // writing is a "text answer"
  }
  if (ventSignals || argumentSignals) {
    return { wantsHtml: false, mode: "venting" };
  }
  if (explicitBuild) {
    return { wantsHtml: true, mode: "building" };
  }
  if (solveSignals) {
    return { wantsHtml: false, mode: "solving" };
  }

  // Default: ChatGPT-like helpful text
  return { wantsHtml: false, mode: "solving" };
}

// =====================
// Build templates (instant, never fails)
// =====================
function detectBuildKind(input) {
  const t = input.toLowerCase();
  if (t.includes("book cover")) return "book_cover";
  if (t.includes("landing page") || t.includes("website") || t.includes("homepage")) return "landing";
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

  const titleFromPrompt = pick(p, /title\s*:\s*["“]?([^"\n”]+)["”]?/i);
  const subtitleFromPrompt = pick(p, /subtitle\s*:\s*["“]?([^"\n”]+)["”]?/i);
  const authorFromPrompt = pick(p, /author\s*:\s*["“]?([^"\n”]+)["”]?/i);

  const keywords = extractKeywords(t);
  const kwTitle = keywords.length ? toTitleCase(keywords.slice(0, 2).join(" ")) : "";

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
    title = title || (kwTitle ? kwTitle : "A New Chapter");
    subtitle = subtitle || (keywords.length ? `A story of ${keywords.slice(0, 3).join(", ")}` : "A story shaped by grit and growth");
    kicker = keywords.length ? ("About " + keywords.slice(0, 3).join(" • ")) : "Book cover concept";
    blurb =
      "Give me: genre + vibe + 3 keywords and I’ll lock the title/subtitle and redesign the cover to match.";
    meta = "Concept • Custom • Clean";
  }

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
      <p>Say: <b>title:</b> … <b>subtitle:</b> … <b>author:</b> … or “more minimal / more gritty / more bold”.</p>
    </div>
  </div>
</body>
</html>`;
}

function landingHtml(prompt) {
  // Still simple + stable. OpenAI can replace with full real landing page when available.
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
p{color:rgba(234,240,255,.75);line-height:1.5}
</style></head><body><div class="card"><h1>Simo Build</h1><p>${esc(prompt)}</p></div></body></html>`;
}

// =====================
// Fast fallback text
// =====================
function fallbackForIntent(mode, input) {
  const t = String(input || "").trim();

  // If they asked to "write a book", give a real structured start (ChatGPT-like).
  if (/\b(write|draft|outline|chapter|novel|memoir|book)\b/i.test(t) && !/\b(book cover)\b/i.test(t)) {
    return [
      "Alright. Here’s a strong start — tell me if you want this as a memoir tone or a novel tone:",
      "",
      "**Working title ideas**",
      "1) New Roots",
      "2) Shift by Shift",
      "3) The Quiet Dream",
      "",
      "**Book structure (tight + readable)**",
      "1) Arrival: why he left, what he hoped for",
      "2) First job: learning the factory rhythm",
      "3) Pride: sending money home, small wins",
      "4) Setbacks: injuries, loneliness, doubt",
      "5) Turning point: skill-up, promotion, side hustle",
      "6) Home: building a life, gratitude without being naïve",
      "",
      "**Opening scene (first page)**",
      "He learns the sound of the factory before he learns the names. The belts hum like a distant storm, steady enough to forget—until the whistle snaps the air and reminds him that time here is bought in minutes and muscle. He tightens his gloves, checks the badge clipped to his chest, and tells himself the same thing he told himself at the airport: *one shift at a time.*",
      "",
      "Say: **memoir** or **novel**, and what country he’s from — and I’ll write Chapter 1."
    ].join("\n");
  }

  if (mode === "venting") {
    return "I’m here. Say it straight — what set you off today?";
  }
  return "Got you. What’s the outcome you want, and what’s the one thing stopping it right now?";
}

// =====================
// Keyword helpers
// =====================
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

// =====================
// Utils
// =====================
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
