// netlify/functions/simon.js
// Simo backend: best-friend core + intent router + optional web search + preview_html support.
// Works with OpenAI Responses API (/v1/responses).

const OPENAI_URL = "https://api.openai.com/v1/responses";

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function normalize(s = "") {
  return String(s).toLowerCase().trim();
}

/** ---------- Preview detection + builders (server fallback) ---------- **/

function detectPreviewKind(text = "", fallbackTopic = "") {
  const t = normalize(text);
  const topic = normalize(fallbackTopic);

  const any = `${t} ${topic}`.trim();

  if (/\b(resume|cv)\b/.test(any)) return "resume";
  if (/\b(landing page|homepage|hero section)\b/.test(any)) return "landing_page";
  if (/\b(dashboard|admin|analytics)\b/.test(any)) return "dashboard";
  if (/\b(app|mobile app)\b/.test(any)) return "generic_app";
  if (/\b(space renting|driveway|garage|rent out space|parking spot)\b/.test(any)) return "space_renting_app";
  if (/\b(home|house)\b/.test(any) && /\b(layout|floor plan|2 story|two story)\b/.test(any)) return "home_layout";

  // fall back: try to infer from verbs
  if (/\b(portfolio|personal site)\b/.test(any)) return "landing_page";

  return "wireframe";
}

function buildPreviewHtml(kind, userText = "") {
  const titleMap = {
    space_renting_app: "Space Renting App",
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
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;background:#0b1020;color:#eaf0ff;height:100%;padding:18px;box-sizing:border-box;">
    <div style="max-width:960px;margin:0 auto;">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;">
        <div>
          <div style="font-size:22px;font-weight:900;letter-spacing:.3px;">${escapeHtml(title)}</div>
          <div style="font-size:12px;color:rgba(234,240,255,.65);margin-top:4px;">${subtitle}</div>
        </div>
        <div style="font-size:12px;color:rgba(234,240,255,.65);">Preview • rendered mockup</div>
      </div>
      <div style="height:1px;background:rgba(255,255,255,.10);margin:14px 0 16px;"></div>
      ${inner}
    </div>
  </div>`;

  if (kind === "space_renting_app") {
    return shell(`
      <div style="display:grid;grid-template-columns: 1.4fr .9fr;gap:14px;">
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);border-radius:12px;padding:12px;">
            <div style="font-size:12px;color:rgba(234,240,255,.7);margin-bottom:8px;">Search</div>
            <div style="display:flex;gap:10px;">
              <div style="flex:1;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.10);border-radius:10px;padding:10px;color:rgba(234,240,255,.75);">
                🔎 City / Zip / Address
              </div>
              <div style="background:#2a66ff;border-radius:10px;padding:10px 14px;font-weight:800;">Search</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
              ${["Driveway", "Garage", "Lot", "EV-Ready", "Covered", "24/7"].map(chip => `
                <div style="border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);border-radius:999px;padding:6px 10px;font-size:12px;color:rgba(234,240,255,.8);">${chip}</div>
              `).join("")}
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            ${[
              { price:"$12/day", name:"Wide Driveway • Quiet Street", meta:"0.6 mi • Available tonight" },
              { price:"$18/day", name:"Covered Spot • Security Cam", meta:"1.1 mi • 7am–7pm" },
              { price:"$9/day",  name:"Side Lot • Easy Access", meta:"0.9 mi • Weekends" },
              { price:"$22/day", name:"Garage Space • EV Outlet", meta:"2.3 mi • 24/7" },
            ].map(card => `
              <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:12px;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
                  <div style="font-weight:900;">${escapeHtml(card.name)}</div>
                  <div style="font-weight:900;color:#39d98a;">${escapeHtml(card.price)}</div>
                </div>
                <div style="margin-top:6px;color:rgba(234,240,255,.70);font-size:12px;">${escapeHtml(card.meta)}</div>
                <div style="margin-top:10px;display:flex;gap:8px;">
                  <div style="flex:1;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.10);border-radius:10px;padding:8px 10px;font-size:12px;color:rgba(234,240,255,.75);">Map preview</div>
                  <div style="background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:8px 10px;font-size:12px;">Details</div>
                </div>
              </div>
            `).join("")}
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:12px;">
            <div style="font-weight:900;margin-bottom:10px;">Map</div>
            <div style="height:180px;border-radius:12px;background:linear-gradient(135deg, rgba(42,102,255,.35), rgba(0,0,0,.35));border:1px solid rgba(255,255,255,.10);display:flex;align-items:center;justify-content:center;color:rgba(234,240,255,.75);">
              Map placeholder
            </div>
          </div>

          <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:12px;">
            <div style="font-weight:900;margin-bottom:10px;">Booking</div>
            <div style="display:grid;gap:8px;">
              <div style="background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.10);border-radius:10px;padding:10px;color:rgba(234,240,255,.75);">Dates: Select</div>
              <div style="background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.10);border-radius:10px;padding:10px;color:rgba(234,240,255,.75);">Vehicle: Select</div>
              <div style="display:flex;gap:10px;">
                <div style="flex:1;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:10px;text-align:center;">Message host</div>
                <div style="flex:1;background:#2a66ff;border-radius:10px;padding:10px;text-align:center;font-weight:900;">Book</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `);
  }

  if (kind === "resume") {
    return shell(`
      <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:16px;">
        <div style="font-size:28px;font-weight:900;">Your Name</div>
        <div style="margin-top:6px;color:rgba(234,240,255,.75);font-size:13px;">
          Email • Phone • City, State • LinkedIn
        </div>
        <div style="height:1px;background:rgba(255,255,255,.10);margin:14px 0;"></div>
        <div style="font-weight:900;margin-bottom:8px;">Experience</div>
        <div style="background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.10);border-radius:12px;padding:12px;color:rgba(234,240,255,.78);font-size:13px;">
          Job Title • Company • Dates
          <ul style="margin:8px 0 0 18px;line-height:1.45;">
            <li>Impact bullet</li><li>Leadership / projects</li><li>Tools / systems</li>
          </ul>
        </div>
      </div>
    `);
  }

  if (kind === "landing_page") {
    return shell(`
      <div style="display:grid;grid-template-columns:1.1fr .9fr;gap:14px;">
        <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:16px;">
          <div style="font-size:28px;font-weight:900;line-height:1.05;">Big headline that says what this is.</div>
          <div style="margin-top:10px;color:rgba(234,240,255,.75);">Short subheadline. Clear value. One sentence.</div>
          <div style="display:flex;gap:10px;margin-top:14px;">
            <div style="background:#2a66ff;border-radius:10px;padding:10px 14px;font-weight:900;">Get started</div>
            <div style="background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:10px 14px;">See demo</div>
          </div>
          <div style="margin-top:16px;display:grid;gap:10px;">
            ${["Feature one (fast)", "Feature two (simple)", "Feature three (trust)"].map(f => `
              <div style="background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.10);border-radius:12px;padding:12px;color:rgba(234,240,255,.78);">${escapeHtml(f)}</div>
            `).join("")}
          </div>
        </div>
        <div style="background:linear-gradient(135deg, rgba(42,102,255,.28), rgba(0,0,0,.35));border:1px solid rgba(255,255,255,.10);border-radius:14px;display:flex;align-items:center;justify-content:center;color:rgba(234,240,255,.75);">
          Screenshot / Hero image
        </div>
      </div>
    `);
  }

  if (kind === "dashboard") {
    return shell(`
      <div style="display:grid;grid-template-columns:1fr;gap:12px;">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          ${["Revenue", "Active Users", "Bookings"].map(k => `
            <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:12px;">
              <div style="color:rgba(234,240,255,.7);font-size:12px;">${escapeHtml(k)}</div>
              <div style="font-size:22px;font-weight:900;margin-top:6px;">—</div>
            </div>
          `).join("")}
        </div>
        <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:12px;">
          <div style="font-weight:900;margin-bottom:10px;">Recent Activity</div>
          ${["New booking request", "Payment completed", "New message from user"].map(r => `
            <div style="padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.28);margin-top:8px;color:rgba(234,240,255,.78);">${escapeHtml(r)}</div>
          `).join("")}
        </div>
      </div>
    `);
  }

  // wireframe / generic
  return shell(`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:12px;">
        <div style="font-weight:900;margin-bottom:10px;">Left Panel</div>
        <div style="height:160px;border-radius:12px;border:1px dashed rgba(255,255,255,.20);display:flex;align-items:center;justify-content:center;color:rgba(234,240,255,.65);">Content</div>
      </div>
      <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:12px;">
        <div style="font-weight:900;margin-bottom:10px;">Right Panel</div>
        <div style="height:160px;border-radius:12px;border:1px dashed rgba(255,255,255,.20);display:flex;align-items:center;justify-content:center;color:rgba(234,240,255,.65);">Content</div>
      </div>
    </div>
  `);
}

/** ---------- Intent detection ---------- **/

function detectIntent(text = "") {
  const t = normalize(text);

  // explicit switches
  if (/\bswitch topics?\b/.test(t)) return "switch";
  if (/\b(vent|venting)\b/.test(t)) return "venting";
  if (/\b(build|builder|design|make|create|generate)\b/.test(t)) return "building";
  if (/\b(help me|how do i|fix|debug|error|issue|broken)\b/.test(t)) return "solving";

  // vent signals
  if (/\b(stressed|anxious|tired|overwhelmed|upset|mad|angry|sad|fight|argu(ment|ing))\b/.test(t)) return "venting";

  // preview signals
  if (/\b(preview|mockup|ui|layout|wireframe)\b/.test(t)) return "building";

  return "auto";
}

function wantsPreview(text = "") {
  const t = normalize(text);
  return (
    /\bshow me\b.*\b(preview|mockup|ui|layout|wireframe)\b/.test(t) ||
    /\b(show|make|build|generate|create)\b.*\b(preview|mockup|ui|layout|wireframe)\b/.test(t)
  );
}

/** ---------- Optional: Serper web search ---------- **/

async function serperSearch(query, apiKey) {
  const url = "https://google.serper.dev/search";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data?.message || `Serper HTTP ${res.status}` };
  }

  // keep it tight
  const top = []
    .concat(data?.answerBox ? [data.answerBox] : [])
    .concat(Array.isArray(data?.organic) ? data.organic.slice(0, 5) : [])
    .map((r) => ({
      title: r.title || r.name || "",
      link: r.link || r.website || "",
      snippet: r.snippet || r.description || "",
    }))
    .filter((r) => r.title || r.snippet || r.link);

  return { ok: true, top };
}

function seemsLikeLookup(text = "") {
  const t = normalize(text);
  // user explicitly asks to look up / search OR asks for local businesses / addresses / current info
  if (/\b(look up|lookup|search|find|near me|addresses|phone number|website|hours)\b/.test(t)) return true;
  if (/\b(weather|forecast)\b/.test(t)) return true;
  return false;
}

/** ---------- OpenAI call ---------- **/

function extractOutputText(respJson) {
  const out = respJson?.output || [];
  const text = out
    .flatMap((o) => o?.content || [])
    .filter((c) => c?.type === "output_text")
    .map((c) => c?.text || "")
    .join("\n")
    .trim();
  return text;
}

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

    const userText = (body.message || "").toString();
    const history = Array.isArray(body.history) ? body.history : [];
    const clientMode = (body.mode || "auto").toString();
    const clientTopic = (body.topic || "").toString();

    if (!userText.trim()) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "Missing message" }) };
    }

    // Fast path: switch topics
    if (detectIntent(userText) === "switch") {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          mode: "bestfriend",
          reply: "Bet. What do you wanna talk about now — venting, solving, or building?",
          preview_kind: "",
          preview_html: "",
        }),
      };
    }

    // Fast path: preview request => always generate preview_html server-side (no waiting on model)
    if (wantsPreview(userText)) {
      const kind = detectPreviewKind(userText, clientTopic);
      const preview_html = buildPreviewHtml(kind, userText);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          mode: "builder",
          reply: "Preview’s on the right. Want it more simple or more detailed?",
          preview_kind: kind,
          preview_html,
        }),
      };
    }

    // Build tool context (optional web lookup)
    let toolContext = "";
    if (SERPER_API_KEY && seemsLikeLookup(userText)) {
      const s = await serperSearch(userText, SERPER_API_KEY);
      if (s.ok && Array.isArray(s.top) && s.top.length) {
        toolContext =
          "Live web results (use as facts, cite titles/links in plain text if helpful):\n" +
          s.top
            .map((r, i) => `${i + 1}. ${r.title}\n   ${r.link}\n   ${r.snippet}`.trim())
            .join("\n\n");
      }
    }

    const cleanedHistory = history
      .slice(-18)
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content }));

    // Intent: if client already has a mode, respect it lightly, but let user override naturally
    const intent = detectIntent(userText);
    const inferredMode =
      intent === "venting" ? "bestfriend" :
      intent === "building" ? "builder" :
      intent === "solving" ? "builder" : // solving usually needs steps/code
      (clientMode === "builder" || clientMode === "bestfriend") ? clientMode :
      "bestfriend";

    const SYSTEM_PROMPT = `
You are Simo — a private best-friend AI with builder powers.

Core vibe:
- Talk like a real friend. No therapy-speak. No lectures.
- Keep it confident, practical, and calm.
- If user says "wife", treat her as wife (not "friendship").

Behavior:
- Always handle ANY topic the user brings. Never say you "can't do that" unless it truly requires a tool you do not have.
- Decide intent per message: venting vs solving vs building.
- If venting: validate + ask ONE direct question.
- If solving: give clear steps/checklist. If code is needed, offer full code.
- If building: propose a simple structure + offer preview prompt: "Say 'show me a preview' and I'll render it."

Output rules:
Return ONLY valid JSON (no markdown) with EXACT keys:
{"mode":"bestfriend"|"builder","reply":"...","preview_kind":"","preview_html":""}

Notes:
- preview_html must be an empty string unless the user explicitly asks for a preview/mockup/layout.
- Keep reply short and useful.
`.trim();

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...cleanedHistory,
      ...(toolContext ? [{ role: "system", content: toolContext }] : []),
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
        temperature: 0.6,
        max_output_tokens: 700,
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
    const parsed = safeJsonParse(outText);

    // If model didn't follow JSON, fall back gracefully.
    const mode =
      parsed?.mode === "builder" ? "builder" :
      parsed?.mode === "bestfriend" ? "bestfriend" :
      inferredMode === "builder" ? "builder" : "bestfriend";

    let reply =
      typeof parsed?.reply === "string" && parsed.reply.trim()
        ? parsed.reply.trim()
        : (outText || "Reset. I’m here.");

    // Hard guard: do not leak preview_html unless user asked for preview
    const previewAllowed = wantsPreview(userText);
    let preview_html = "";
    let preview_kind = "";

    if (previewAllowed && typeof parsed?.preview_html === "string" && parsed.preview_html.trim()) {
      preview_html = parsed.preview_html;
      preview_kind = typeof parsed?.preview_kind === "string" ? parsed.preview_kind : "";
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        mode,
        reply,
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
