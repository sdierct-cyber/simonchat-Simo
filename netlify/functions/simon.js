// netlify/functions/simon.js
// Simo backend: best-friend core + intent router + previews + (optional) Serper web+image search.
// + Server memory (forever until Forget) using Netlify Blobs (@netlify/blobs)
//
// ENV VARS in Netlify:
// - OPENAI_API_KEY   (required)
// - OPENAI_MODEL     (optional, default: gpt-4.1-mini)
// - SERPER_API_KEY   (optional, enables web lookup)
//
// Client supports:
// - POST with { action:"forget", user_id:"..." } to clear server memory.
//
// FIXES in this version:
// 1) Never show raw JSON in chat (robust JSON extraction + parsing).
// 2) Auto-preview in Building mode for buildable prompts.
// 3) Frontend-friendly response shape: { ok, text, preview:{title,html} } + legacy keys kept.

const OPENAI_URL = "https://api.openai.com/v1/responses";

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalize(s = "") {
  return String(s).toLowerCase().trim();
}

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

// If the model output contains extra text, grab the first JSON object we can.
function extractJsonObject(text = "") {
  const t = String(text || "").trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  const slice = t.slice(first, last + 1);
  return safeJsonParse(slice);
}

// If the assistant accidentally returns raw JSON, try to convert it to a readable reply.
function coerceReply(outText = "") {
  const direct = safeJsonParse(outText);
  if (direct && typeof direct.reply === "string" && direct.reply.trim()) return direct.reply.trim();

  const extracted = extractJsonObject(outText);
  if (extracted && typeof extracted.reply === "string" && extracted.reply.trim()) return extracted.reply.trim();

  // Worst case: strip a JSON-looking wrapper if present
  const t = String(outText || "").trim();
  if (t.startsWith("{") && t.includes('"reply"')) {
    // last resort: keep it from showing a blob of JSON
    return "Got you. Say what you want next and I’ll move with you.";
  }
  return t || "Reset. I’m here.";
}

/* --------------------------- Preview logic --------------------------- */

function wantsPreview(text = "") {
  const t = normalize(text);
  return (
    /\bshow me\b.*\b(preview|mockup|ui|layout|wireframe)\b/.test(t) ||
    /\b(show|make|build|generate|create)\b.*\b(preview|mockup|ui|layout|wireframe)\b/.test(t)
  );
}

function seemsBuildRequest(text = "") {
  const t = normalize(text);
  return /\b(build|design|make|create|generate|draft|mockup|wireframe|layout|ui|dashboard|landing page|homepage|resume|cv|app)\b/.test(t);
}

function detectPreviewKind(text = "", fallbackTopic = "") {
  const t = normalize(text);
  const topic = normalize(fallbackTopic);
  const any = `${t} ${topic}`.trim();

  if (/\b(resume|cv)\b/.test(any)) return "resume";
  if (/\b(landing page|homepage|hero section|portfolio)\b/.test(any)) return "landing_page";
  if (/\b(dashboard|admin|analytics)\b/.test(any)) return "dashboard";
  if (/\b(space renting|driveway|garage|rent out space|parking spot)\b/.test(any)) return "space_renting_app";
  if (/\b(home|house)\b/.test(any) && /\b(layout|floor plan|2 story|two story)\b/.test(any)) return "home_layout";
  if (/\b(app|mobile app)\b/.test(any)) return "generic_app";

  return "wireframe";
}

function buildPreviewHtml(kind, userText = "") {
  const titleMap = {
    space_renting_app: "Space Rentals",
    resume: "Resume Layout",
    home_layout: "2-Story Home Layout",
    landing_page: "Landing Page",
    dashboard: "Dashboard UI",
    generic_app: "App UI",
    wireframe: "Wireframe Preview",
  };

  const title = titleMap[kind] || "Preview";
  const subtitle = escapeHtml(userText).slice(0, 140);

  const shell = (inner) => `
  <html><head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      :root{
        --bg:#0b1020; --text:#eaf0ff; --muted:#a9b6d3;
        --line:rgba(255,255,255,.12);
        --btn:#2a66ff;
      }
      *{box-sizing:border-box}
      body{
        margin:0;
        font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
        background:radial-gradient(900px 520px at 20% 0%, #162a66 0%, var(--bg) 60%);
        color:var(--text);
        padding:16px;
      }
      .shell{max-width:980px;margin:0 auto}
      .top{display:flex;justify-content:space-between;align-items:end;gap:12px;margin-bottom:12px}
      .title{font-size:18px;font-weight:900;margin:0}
      .sub{color:rgba(234,240,255,.68);font-size:12px;margin-top:4px}
      .tag{color:rgba(234,240,255,.68);font-size:12px}
      .bar{
        display:flex; gap:10px; flex-wrap:wrap;
        padding:12px; border:1px solid var(--line); border-radius:14px;
        background:rgba(0,0,0,.22);
      }
      .input{
        flex:1; min-width:240px;
        padding:10px 12px; border-radius:12px; border:1px solid var(--line);
        background:rgba(0,0,0,.28); color:var(--text);
      }
      .chip{
        padding:8px 10px; border-radius:999px;
        border:1px solid var(--line); background:rgba(255,255,255,.05);
        color:rgba(234,240,255,.78); font-size:12px;
      }
      .grid{
        display:grid; grid-template-columns: 1.2fr .8fr; gap:12px;
        margin-top:12px;
      }
      .card{
        border:1px solid var(--line);
        background:rgba(0,0,0,.22);
        border-radius:14px;
        overflow:hidden;
      }
      .card h3{margin:0;padding:12px;border-bottom:1px solid var(--line);font-size:14px}
      .list{padding:12px; display:grid; gap:10px}
      .item{
        border:1px solid var(--line);
        background:rgba(255,255,255,.04);
        border-radius:12px;
        padding:10px;
        display:flex; justify-content:space-between; gap:10px;
      }
      .meta{color:rgba(234,240,255,.65); font-size:12px; margin-top:4px}
      .price{font-weight:900}
      .btn{
        display:inline-flex; justify-content:center; align-items:center;
        padding:10px 12px;
        border-radius:12px;
        background:linear-gradient(180deg, var(--btn), #1f4dd6);
        color:white; font-weight:800; border:0;
      }
      .map{
        height:240px;
        display:flex;align-items:center;justify-content:center;
        color:rgba(234,240,255,.65);
        background:repeating-linear-gradient(45deg, rgba(255,255,255,.04), rgba(255,255,255,.04) 10px, rgba(255,255,255,.02) 10px, rgba(255,255,255,.02) 20px);
      }
      @media (max-width: 860px){ .grid{grid-template-columns:1fr} }
    </style>
  </head><body>
    <div class="shell">
      <div class="top">
        <div>
          <div class="title">${escapeHtml(title)}</div>
          <div class="sub">${subtitle}</div>
        </div>
        <div class="tag">Preview • rendered mockup</div>
      </div>
      ${inner}
    </div>
  </body></html>`;

  if (kind === "space_renting_app") {
    return shell(`
      <div class="bar">
        <input class="input" placeholder="Search city, zip, address (e.g., 48044)" />
        <span class="chip">Under $20/day</span>
        <span class="chip">24/7 access</span>
        <span class="chip">Covered</span>
        <span class="chip">EV friendly</span>
      </div>

      <div class="grid">
        <div class="card">
          <h3>Listings</h3>
          <div class="list">
            <div class="item">
              <div>
                <div><strong>Driveway • 2 spots</strong></div>
                <div class="meta">0.8 mi • Available today • Camera on-site</div>
              </div>
              <div style="text-align:right">
                <div class="price">$14/day</div>
                <div class="meta">Instant book</div>
              </div>
            </div>

            <div class="item">
              <div>
                <div><strong>Garage Bay • Secure</strong></div>
                <div class="meta">2.1 mi • Available weekends • Locked gate</div>
              </div>
              <div style="text-align:right">
                <div class="price">$28/day</div>
                <div class="meta">Request</div>
              </div>
            </div>

            <div class="item">
              <div>
                <div><strong>Side Lot • Large</strong></div>
                <div class="meta">4.4 mi • Available nightly • Easy access</div>
              </div>
              <div style="text-align:right">
                <div class="price">$10/day</div>
                <div class="meta">Instant book</div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <h3>Map + Booking</h3>
          <div class="map">Map placeholder</div>
          <div class="list">
            <div class="item">
              <div>
                <div><strong>Selected:</strong> Driveway • 2 spots</div>
                <div class="meta">Pick dates + vehicle</div>
              </div>
              <div style="text-align:right">
                <div class="price">$14</div>
                <div class="meta">+ fees</div>
              </div>
            </div>
            <button class="btn">Book now</button>
          </div>
        </div>
      </div>
    `);
  }

  if (kind === "landing_page") {
    return shell(`
      <div class="grid">
        <div class="card">
          <h3>Hero</h3>
          <div class="list">
            <div style="font-size:28px;font-weight:900;line-height:1.05;">Clear headline that says what this is.</div>
            <div class="meta" style="font-size:13px;">Short subheadline. One sentence. Concrete benefit.</div>
            <div style="display:flex;gap:10px;margin-top:12px;">
              <button class="btn">Get started</button>
              <button class="btn" style="background:rgba(255,255,255,.10);color:var(--text);border:1px solid rgba(255,255,255,.12);">See demo</button>
            </div>
            <div style="margin-top:12px;display:grid;gap:10px;">
              <div class="item"><div><strong>Feature</strong><div class="meta">Benefit in one line</div></div></div>
              <div class="item"><div><strong>Feature</strong><div class="meta">Benefit in one line</div></div></div>
              <div class="item"><div><strong>Feature</strong><div class="meta">Benefit in one line</div></div></div>
            </div>
          </div>
        </div>
        <div class="card">
          <h3>Hero Image</h3>
          <div class="map">Screenshot / graphic</div>
        </div>
      </div>
    `);
  }

  if (kind === "dashboard") {
    return shell(`
      <div class="grid" style="grid-template-columns:1fr;gap:12px;">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div class="card"><h3>Revenue</h3><div class="list"><div style="font-size:22px;font-weight:900;">—</div><div class="meta">This month</div></div></div>
          <div class="card"><h3>Active Users</h3><div class="list"><div style="font-size:22px;font-weight:900;">—</div><div class="meta">Today</div></div></div>
          <div class="card"><h3>Bookings</h3><div class="list"><div style="font-size:22px;font-weight:900;">—</div><div class="meta">This week</div></div></div>
        </div>
        <div class="card">
          <h3>Recent Activity</h3>
          <div class="list">
            <div class="item"><div><strong>New signup</strong><div class="meta">2 min ago</div></div></div>
            <div class="item"><div><strong>Payment completed</strong><div class="meta">17 min ago</div></div></div>
            <div class="item"><div><strong>New message</strong><div class="meta">1 hr ago</div></div></div>
          </div>
        </div>
      </div>
    `);
  }

  // generic fallback
  return shell(`
    <div class="grid">
      <div class="card">
        <h3>Left Panel</h3>
        <div class="list"><div class="map" style="height:180px;">Content</div></div>
      </div>
      <div class="card">
        <h3>Right Panel</h3>
        <div class="list"><div class="map" style="height:180px;">Content</div></div>
      </div>
    </div>
  `);
}

/* --------------------------- Intent routing -------------------------- */

function isContinue(text = "") {
  const t = normalize(text);
  return /^(continue|resume|keep going)\b/.test(t) || /\bcontinue that\b/.test(t) || /\bkeep going\b/.test(t);
}

function detectIntent(text = "") {
  const t = normalize(text);

  if (/\bswitch topics?\b/.test(t)) return "switch";
  if (isContinue(t)) return "continue";
  if (/\b(show me|preview|mockup|ui|layout|wireframe)\b/.test(t)) return "building";
  if (/\b(stressed|anxious|tired|overwhelmed|upset|mad|angry|sad|fight|argu(ment|ing))\b/.test(t)) return "venting";
  if (/\b(help me|how do i|fix|debug|error|issue|broken)\b/.test(t)) return "solving";
  if (/\b(build|design|make|create|generate)\b/.test(t)) return "building";

  return "auto";
}

/* ---------------------------- Serper tools --------------------------- */

async function serperWebSearch(query, apiKey) {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: 6 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.message || `Serper HTTP ${res.status}` };

  const organic = Array.isArray(data?.organic) ? data.organic.slice(0, 6) : [];
  const top = organic.map((r) => ({
    title: r.title || "",
    link: r.link || "",
    snippet: r.snippet || "",
  })).filter(x => x.title || x.link || x.snippet);

  return { ok: true, top };
}

function seemsLikeLookup(text = "") {
  const t = normalize(text);
  return /\b(look up|lookup|search|find|near me|addresses|phone number|website|hours|weather|forecast|temperature|temp)\b/.test(t);
}

/* ---------------------------- OpenAI helpers -------------------------- */

function extractOutputText(respJson) {
  const out = respJson?.output || [];
  return out
    .flatMap((o) => o?.content || [])
    .filter((c) => c?.type === "output_text")
    .map((c) => c?.text || "")
    .join("\n")
    .trim();
}

/* ------------------------- Server memory (Blobs) ---------------------- */

async function getMemoryStore() {
  const mod = await import("@netlify/blobs");
  return mod.getStore("simo-memory");
}

function looksLikeJunkTopic(topic) {
  const t = normalize(topic);
  return !t || t === "none" || t === "continue that app" || t === "continue" || t === "resume" || t === "keep going";
}

/* ------------------------------ Handler ------------------------------ */

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: "Method not allowed" }) };
  }

  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const SERPER_API_KEY = process.env.SERPER_API_KEY || "";
    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

    if (!OPENAI_API_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: "Missing OPENAI_API_KEY env var" }) };
    }

    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }

    const action = (body.action || "").toString();
    const userId = (body.user_id || "").toString();

    // UI sends body.mode = "venting" | "solving" | "building"
    const uiMode = (body.mode || "auto").toString();
    const isPro = !!body.pro;

    if (action === "forget" && userId) {
      try {
        const store = await getMemoryStore();
        await store.delete(userId);
      } catch {}
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          mode: "bestfriend",
          text: "Forgot.",
          message: "Forgot.",
          reply: "Forgot.",
          preview: null,
          preview_kind: "",
          preview_html: "",
        }),
      };
    }

    const userText = (body.message || "").toString();
    const history = Array.isArray(body.history) ? body.history : [];
    const clientTopic = (body.topic || "").toString();

    if (!userText.trim()) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "Missing message" }) };
    }

    // Load server memory
    let mem = null;
    if (userId) {
      try {
        const store = await getMemoryStore();
        mem = await store.get(userId, { type: "json" });
      } catch { mem = null; }
    }

    const intent = detectIntent(userText);

    const savedTopic = (mem?.last_topic || "").toString();
    const effectiveTopic = looksLikeJunkTopic(clientTopic) ? savedTopic : (clientTopic || savedTopic);

    // Switch topics
    if (intent === "switch") {
      const msg = "Understood. What do you want to do next — venting, solving, or building?";
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          mode: "bestfriend",
          text: msg,
          message: msg,
          reply: msg,
          preview: null,
          preview_kind: "",
          preview_html: "",
        }),
      };
    }

    // Preview decision
    const explicitPreview = wantsPreview(userText);
    const autoPreview = (uiMode === "building") && !explicitPreview && seemsBuildRequest(userText) && intent !== "venting";
    const previewShouldRender = explicitPreview || autoPreview;

    let fastPreview = null;
    if (previewShouldRender) {
      const kind = detectPreviewKind(userText, effectiveTopic);
      const title = ({
        space_renting_app: "Space Rentals",
        resume: "Resume Layout",
        home_layout: "2-Story Home Layout",
        landing_page: "Landing Page",
        dashboard: "Dashboard UI",
        generic_app: "App UI",
        wireframe: "Wireframe Preview",
      }[kind] || "Preview");

      fastPreview = { kind, title, html: buildPreviewHtml(kind, userText) };
    }

    // Lookup context
    let toolContext = "";
    if (SERPER_API_KEY && seemsLikeLookup(userText)) {
      const s = await serperWebSearch(userText, SERPER_API_KEY);
      if (s.ok && s.top?.length) {
        toolContext =
          "Live web results (use as facts; include direct links in reply):\n" +
          s.top.map((r, i) => `${i + 1}. ${r.title}\n${r.link}\n${r.snippet}`.trim()).join("\n\n");
      }
    }

    const cleanedHistory = history
      .slice(-18)
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content }));

    const inferredMode =
      intent === "venting" ? "bestfriend" :
      (intent === "building" || intent === "continue" || uiMode === "building") ? "builder" :
      intent === "solving" ? "builder" :
      "bestfriend";

    const memoryBlock = (userId && mem)
      ? `Saved user memory:
- preferred_mode: ${mem?.preferred_mode || "auto"}
- last_topic: ${mem?.last_topic || ""}
- project_brief: ${mem?.project_brief || ""}`.trim()
      : "";

    const SYSTEM_PROMPT = `
You are Simo — a private best-friend + creator hybrid.

Voice:
- Calm, steady, direct.
- No therapy-speak. No "stress can really weigh you down" phrasing.
- If venting: validate in 1 sentence, then ask ONE simple question.
- No markdown headings. Avoid heavy formatting.

Output:
Return ONLY valid JSON (no markdown) with EXACT keys:
{"mode":"bestfriend"|"builder","reply":"...","preview_kind":"","preview_html":""}

Preview rules:
- If user asks for preview/mockup/ui/layout, include preview_html.
- If client is in Building mode, you may include preview_html when the request is clearly buildable.
`.trim();

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(memoryBlock ? [{ role: "system", content: memoryBlock }] : []),
      ...(toolContext ? [{ role: "system", content: toolContext }] : []),
      { role: "system", content: `Client context: ui_mode=${uiMode}; pro=${isPro}; preview_should_render=${previewShouldRender}` },
      ...cleanedHistory,
      { role: "user", content: userText },
    ];

    const openaiResp = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: messages,
        temperature: 0.5,
        max_output_tokens: 750,
      }),
    });

    const data = await openaiResp.json().catch(() => ({}));
    if (!openaiResp.ok) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: "OpenAI error",
          status: openaiResp.status,
          details: data?.error || data,
        }),
      };
    }

    const outText = extractOutputText(data);

    // Robust parse
    const parsed = safeJsonParse(outText) || extractJsonObject(outText);

    const mode =
      parsed?.mode === "builder" ? "builder" :
      parsed?.mode === "bestfriend" ? "bestfriend" :
      inferredMode === "builder" ? "builder" : "bestfriend";

    // Always coerce reply to plain text
    let reply = "";
    if (parsed && typeof parsed.reply === "string" && parsed.reply.trim()) {
      reply = parsed.reply.trim();
    } else {
      reply = coerceReply(outText);
    }

    // Strip accidental markdown headings
    reply = reply.replace(/^\s*#{1,6}\s+/gm, "").trim();

    // Previews: prefer our fastPreview (consistent), otherwise accept model fields
    let preview_kind = "";
    let preview_html = "";

    if (previewShouldRender && fastPreview) {
      preview_kind = fastPreview.kind;
      preview_html = fastPreview.html;
    } else if (previewShouldRender) {
      preview_kind = typeof parsed?.preview_kind === "string" ? parsed.preview_kind : "";
      preview_html = typeof parsed?.preview_html === "string" ? parsed.preview_html : "";
    }

    const preview =
      previewShouldRender && preview_html
        ? { title: (fastPreview?.title || "Preview"), html: preview_html }
        : null;

    // Save memory
    if (userId) {
      try {
        const store = await getMemoryStore();
        const nextTopic = preview_kind || effectiveTopic || mem?.last_topic || "";
        const nextBrief = mem?.project_brief || "";
        await store.setJSON(userId, {
          preferred_mode: mode,
          last_topic: nextTopic,
          project_brief: nextBrief,
          updated_at: new Date().toISOString()
        });
      } catch {}
    }

    // Return frontend-friendly + legacy keys
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        mode,
        text: reply,
        message: reply,
        reply: reply,

        preview,
        preview_kind,
        preview_html,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: "Server crash",
        details: String(err?.message || err),
      }),
    };
  }
};
