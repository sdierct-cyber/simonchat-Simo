// netlify/functions/simon.js — Simo Backend V2.1 LOCKED
// Goals:
// - No "Done" without returning HTML in building/edit mode
// - Continuing edits stay on same build using lastHtml
// - Real images (Unsplash) so preview renders
// - Dark base enforced so preview never flashes white
// - Auto-retry once if model fails to include full HTML

const OPENAI_URL = "https://api.openai.com/v1/responses";

function jres(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST,OPTIONS"
    },
    body: JSON.stringify(obj)
  };
}

function msgItem(role, text, kind) {
  return {
    type: "message",
    role,
    content: [{ type: kind, text: String(text || "") }]
  };
}

function safeStr(x, n = 6000) {
  return String(x || "").slice(0, n);
}

function isEdity(text) {
  const t = (text || "").toLowerCase();
  return /(continue|next|add|remove|change|edit|tweak|update|make it|replace|swap|headline|cta|pricing|testimonial|faq|image|color|layout)/.test(t);
}

function detectMode(inMode, inputText) {
  const t = (inputText || "").toLowerCase();
  // user can set mode from client, but we can upgrade "general" to "building" if it's clearly build/edit intent
  if (/(build|design|create|make|landing page|website|app|preview|ui|wireframe|page)/.test(t)) return "building";
  if (isEdity(t)) return "building";
  if (/(wife|husband|girlfriend|boyfriend|relationship|fight|argu|mad at|upset|vent)/.test(t)) return "venting";
  if (/(how do i|help me|fix|debug|error|issue|broken|why|what is)/.test(t)) return "solving";
  const m = String(inMode || "general").toLowerCase();
  return ["venting", "solving", "building", "general"].includes(m) ? m : "general";
}

function buildSystem(mode, pro) {
  const spirit = `
You are Simo — human as possible: loyal, sharp, present.
When the user vents: respond like a private best friend. No therapy clichés unless asked.
When the user builds: ship paste-ready results. Keep momentum. Do not reset unless asked.
`.trim();

  CRITICAL HTML RULES (must follow):
- If mode is BUILDING or the user is EDITING/CONTINUING a build, you MUST return a COMPLETE HTML document every time:
  It MUST start with <!doctype html> and include <html> ... </html>.
- Your HTML must include:
  <meta name="color-scheme" content="dark">
  and a dark base so the preview never flashes white:
    body { background:#0b1020; color:#eaf0ff; margin:0; font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; }
- Never use source.unsplash.com.
- Use reliable images that always load:
  Use https://picsum.photos/seed/<seed>/1200/800
  Examples:
    https://picsum.photos/seed/mountain-bike-snow/1200/800
    https://picsum.photos/seed/road-bike/1200/800
- IMAGE CONSISTENCY RULE:
  Each product image must use a stable seed by slot:
    Product 1 image src must be https://picsum.photos/seed/p1-<keywords>/1200/800
    Product 2 image src must be https://picsum.photos/seed/p2-<keywords>/1200/800
    Product 3 image src must be https://picsum.photos/seed/p3-<keywords>/1200/800
  When the user says "change image 1 to: X", you MUST:
    - change the alt text to match X
    - change ONLY product 1 image src seed to include X (slugged), e.g. p1-mountain-bike-snow
    - keep the other product images unchanged
- Every <img> tag MUST include an onerror fallback:
  onerror="this.onerror=null;this.src='https://picsum.photos/seed/fallback/1200/800';"
- Keep it self-contained (inline CSS). No external JS frameworks.
- When the user says "continue/next/add/change/remove", edit the CURRENT_ACTIVE_HTML and return the full updated document.
- Do NOT say “updated preview” unless you included full HTML in your response.
`.trim();
  
  const modeLine =
    mode === "venting"
      ? "MODE: venting. Be direct + supportive. Ask at most 1 question if needed."
      : mode === "solving"
      ? "MODE: solving. Give concrete steps. Minimize rework."
      : mode === "building"
      ? "MODE: building. Return FULL HTML every time."
      : "MODE: general. Be useful and concise.";

  const proLine = pro ? "User is Pro: YES." : "User is Pro: NO.";

  return [spirit, htmlRules, modeLine, proLine].join("\n\n");
}

function extractAssistantText(data) {
  const out = Array.isArray(data?.output) ? data.output : [];
  let text = "";
  for (const item of out) {
    if (item?.type === "message" && item?.role === "assistant") {
      for (const c of Array.isArray(item.content) ? item.content : []) {
        if (c?.type === "output_text" && typeof c.text === "string") text += c.text;
      }
    }
  }
  return (text || "").trim();
}

function extractHtml(text) {
  if (!text) return "";
  const t = String(text);
  const fence = t.match(/```html\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  if (/<html[\s>]/i.test(t) && /<\/html>/i.test(t) && /<!doctype html>/i.test(t)) return t.trim();
  return "";
}

async function callOpenAI({ system, memory, input, lastHtml }) {
  const items = [];
  items.push(msgItem("system", system, "input_text"));

  if (lastHtml && lastHtml.length > 60) {
    items.push(
      msgItem(
        "system",
        `CURRENT_ACTIVE_HTML (edit this when user requests changes):\n${safeStr(lastHtml, 38000)}`,
        "input_text"
      )
    );
  }

  for (const m of Array.isArray(memory) ? memory : []) {
    if (!m || !m.role || !m.content) continue;
    const role = m.role === "user" ? "user" : m.role === "assistant" ? "assistant" : null;
    if (!role) continue;
    const kind = role === "assistant" ? "output_text" : "input_text";
    items.push(msgItem(role, safeStr(m.content, 6000), kind));
  }

  items.push(msgItem("user", safeStr(input, 6000), "input_text"));

  const reqBody = {
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    input: items,
    max_output_tokens: 1100,
    truncation: "auto",
    text: { format: { type: "text" } }
  };

  const r = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(reqBody)
  });

  const raw = await r.text();
  let data = null;
  try { data = JSON.parse(raw); } catch {}
  return { ok: r.ok, data, raw };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jres(200, { ok: true });
  if (event.httpMethod !== "POST") return jres(405, { ok: false, error: "Use POST" });

  try {
    const body = JSON.parse(event.body || "{}");
    const input = String(body.input || "").trim();
    if (!input) return jres(200, { ok: true, message: "Say something and I’ll respond.", html: "" });

    const mode = detectMode(body.mode, input);
    const pro = !!body.pro;
    const memory = Array.isArray(body.memory) ? body.memory : [];
    const lastHtml = String(body.lastHtml || "").trim();

    const system = buildSystem(mode, pro);

    // 1) First call
    let { ok, data, raw } = await callOpenAI({ system, memory, input, lastHtml });
    if (!ok || !data) return jres(200, { ok: false, error: "OpenAI error", details: safeStr(raw, 1200) });

    let text = extractAssistantText(data);
    let html = extractHtml(text);

    // 2) If in building mode but no HTML was returned, retry ONCE with a stricter nudge
    if (mode === "building" && !html) {
      const retrySystem = system + "\n\nFINAL REMINDER: Output ONLY a full HTML document. No prose. No markdown fences.";
      const retry = await callOpenAI({ system: retrySystem, memory, input, lastHtml });
      if (retry.ok && retry.data) {
        const t2 = extractAssistantText(retry.data);
        const h2 = extractHtml(t2) || t2;
        // accept if it looks like html
        if (/<\/html>/i.test(h2) && /<!doctype html>/i.test(h2)) {
          text = t2;
          html = extractHtml(t2) || h2;
        }
      }
    }

    // Clean message: if we have html, keep chat short and consistent
    let message = text || "I’m here. What do you want to do next?";
    if (html) message = "Done. I updated the preview on the right.";

    return jres(200, { ok: true, message, html: html || "" });
  } catch (e) {
    return jres(200, { ok: false, error: "Server error", details: safeStr(e?.message || e, 600) });
  }
};
