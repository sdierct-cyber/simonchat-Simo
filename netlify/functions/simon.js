// netlify/functions/simon.js
// Simo backend — stable thread memory + "current active HTML" editing + (optional) Serper images
// - Option A: in-memory only (fastest; resets if function cold-starts)
// - Enforces: build/edit returns COMPLETE HTML doc
// - Image commands can resolve to real images via SERPER_API_KEY, with safe fallback.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SERPER_API_KEY = process.env.SERPER_API_KEY;

// Pick your model (you can set MODEL in Netlify env if you want)
const MODEL = process.env.MODEL || "gpt-4.1-mini";

// In-memory session store: threadId -> { messages: [], activeHtml: "", updatedAt: ms }
const SESSIONS = new Map();
const SESSION_TTL_MS = 1000 * 60 * 45; // 45 minutes

function now() { return Date.now(); }
function cleanOldSessions() {
  const t = now();
  for (const [k, v] of SESSIONS.entries()) {
    if (!v || (t - (v.updatedAt || 0)) > SESSION_TTL_MS) SESSIONS.delete(k);
  }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST, OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

function safeParseJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function isBuildMode(mode) {
  return String(mode || "").toLowerCase() === "building";
}

function looksLikeEditCommand(text) {
  const t = String(text || "").toLowerCase().trim();
  return (
    t.startsWith("add ") ||
    t.startsWith("remove ") ||
    t.startsWith("change ") ||
    t.startsWith("update ") ||
    t.startsWith("edit ") ||
    t === "continue" ||
    t === "next" ||
    t.includes("change image") ||
    t.includes("image 1") ||
    t.includes("image 2") ||
    t.includes("image 3") ||
    t.includes("headline:") ||
    t.includes("cta:") ||
    t.includes("price:")
  );
}

function needsHtmlReturn(mode, userText, hasActiveHtml) {
  if (isBuildMode(mode)) return true;
  // If user is continuing/editing a build and we have active HTML, always return updated HTML
  if (hasActiveHtml && looksLikeEditCommand(userText)) return true;
  // If user explicitly asks for HTML or "build"
  const t = String(userText || "").toLowerCase();
  if (t.includes("<!doctype") || t.includes("html") && t.includes("build")) return true;
  if (t.startsWith("build ")) return true;
  return false;
}

// --- Serper image search ---
async function serperImageSearch(q) {
  if (!SERPER_API_KEY) return [];
  const r = await fetch("https://google.serper.dev/images", {
    method: "POST",
    headers: {
      "X-API-KEY": SERPER_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ q, num: 6 })
  });
  const j = await r.json().catch(() => ({}));
  const imgs = Array.isArray(j.images) ? j.images : [];
  // Return URLs in priority order
  return imgs
    .map(x => x.imageUrl || x.thumbnailUrl || x.link)
    .filter(Boolean)
    .slice(0, 6);
}

function slug(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "fallback";
}

function picsumFallback(seed) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/1200/800`;
}

// We support images by slot via data-img-slot + data-img-query
// Example: <img data-img-slot="p1" data-img-query="mountain bike in snow" ...>
async function hydrateImagesWithSerper(html) {
  if (!SERPER_API_KEY) return html;

  // Find all img tags with data-img-query
  const imgTags = [];
  const re = /<img\b[^>]*data-img-query="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    imgTags.push({ full: m[0], query: m[1] });
  }
  if (!imgTags.length) return html;

  let out = html;

  for (const it of imgTags) {
    const q = it.query;
    const urls = await serperImageSearch(q);
    const chosen = urls[0] || picsumFallback(`p-${slug(q)}`);

    // Ensure src is set to chosen
    let tag = it.full;

    if (/\bsrc=/.test(tag)) {
      tag = tag.replace(/\bsrc="[^"]*"/i, `src="${chosen}"`);
    } else {
      tag = tag.replace(/<img/i, `<img src="${chosen}"`);
    }

    // Always add fallback onerror
    if (!/\bonerror=/.test(tag)) {
      tag = tag.replace(/<img/i, `<img onerror="this.onerror=null;this.src='${picsumFallback("fallback")}';"`);
    }

    out = out.replace(it.full, tag);
  }

  return out;
}

// --- OpenAI Responses call ---
async function callOpenAI({ system, user, schema }) {
  if (!OPENAI_API_KEY) {
    return { ok: false, error: "Missing OPENAI_API_KEY in Netlify env vars." };
  }

  const controller = new AbortController();
  const timeoutMs = 25000; // 25s (reduce abort rage)
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        input: [
          input: [
  { role: "system", content: [{ type: "input_text", text: system }] },
  { role: "user", content: [{ type: "input_text", text: user }] }
],
        // Force structured output so we always get {reply, html}
        response_format: {
          type: "json_schema",
          json_schema: schema
        }
      })
    });

    const text = await resp.text();
    const data = safeParseJson(text);

    if (!resp.ok) {
      return { ok: false, error: `OpenAI ${resp.status}`, details: data || text };
    }

    // Responses API output: data.output_text is often present; but in json_schema mode,
    // the content will be in data.output[0].content[0].text typically. We'll search safely.
    let raw = "";
    if (typeof data?.output_text === "string") raw = data.output_text;
    else {
      const blocks = data?.output?.flatMap(o => o.content || []) || [];
      const txt = blocks.find(b => typeof b.text === "string")?.text;
      raw = txt || "";
    }

    const parsed = safeParseJson(raw) || data; // fallback if already parsed
    return { ok: true, data: parsed };
  } catch (e) {
    const msg = String(e?.name || "") === "AbortError"
      ? "Network/timeout error: request took too long"
      : (e?.message || String(e));
    return { ok: false, error: msg };
  } finally {
    clearTimeout(t);
  }
}

// --- Core prompt builder ---
function buildSystem(mode, pro, activeHtml) {
  const spirit = `
You are Simo — human as possible: loyal, sharp, present.
When the user vents: respond like a private best friend. No therapy clichés unless asked.
When the user builds: ship paste-ready results. Keep momentum. Do not reset unless asked.

IMPORTANT:
- You MUST keep continuity with CURRENT_ACTIVE_HTML when present.
- Never “forget” the current build. If the user says "continue/add/change/remove", you edit it.
`.trim();

  const htmlRules = `
CRITICAL HTML RULES (must follow):
- If you are building OR editing/continuing a build, you MUST return a COMPLETE HTML document every time:
  It MUST start with <!doctype html> and include <html> ... </html>.
- Include <meta name="color-scheme" content="dark"> and dark base:
  body { background:#0b1020; color:#eaf0ff; margin:0; font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; }
- Never use source.unsplash.com.
- Images must be reliable:
  Prefer real image URLs if available; otherwise use:
    https://picsum.photos/seed/p1-<keywords>/1200/800
    https://picsum.photos/seed/p2-<keywords>/1200/800
    https://picsum.photos/seed/p3-<keywords>/1200/800
- IMAGE CONSISTENCY RULE (slots):
  Product 1 image uses p1-..., product 2 uses p2-..., product 3 uses p3-...
  When user says "change image 1 to: X", change ONLY product 1 image + alt text.
- To allow the server to improve accuracy, every product image MUST include:
  data-img-slot="p1|p2|p3" and data-img-query="<user keywords>"
  Example:
    <img data-img-slot="p1" data-img-query="mountain bike in snow" ...>
- Every <img> must include onerror fallback:
  onerror="this.onerror=null;this.src='https://picsum.photos/seed/fallback/1200/800';"
- Keep it self-contained (inline CSS). No external JS frameworks.
- Do NOT claim “updated preview” unless you actually returned full HTML.
`.trim();

  const context = `
MODE: ${mode}
PRO: ${pro ? "true" : "false"}

CURRENT_ACTIVE_HTML (empty if none):
${activeHtml ? activeHtml : "(none)"}
`.trim();

  return `${spirit}\n\n${htmlRules}\n\n${context}`;
}

// JSON schema for model response
const OUT_SCHEMA = {
  name: "simo_response",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      reply: { type: "string" },
      html: { type: "string" }
    },
    required: ["reply", "html"]
  }
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return json(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Use POST" });
  }

  cleanOldSessions();

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}

  const input = String(body.input || body.prompt || body.message || "").trim();
  const mode = String(body.mode || "general").toLowerCase();
  const pro = !!body.pro;

  // Thread ID is required for stable memory; create if missing
  const threadId = String(body.threadId || body.thread || "").trim() || `t_${Math.random().toString(36).slice(2)}_${Date.now()}`;

  if (!input) {
    return json(200, { ok: true, threadId, message: "MEM_OK", html: "" });
  }

  const session = SESSIONS.get(threadId) || { messages: [], activeHtml: "", updatedAt: now() };
  session.updatedAt = now();

  const hasActiveHtml = !!session.activeHtml;
  const shouldReturnHtml = needsHtmlReturn(mode, input, hasActiveHtml);

  // If user is explicitly starting a build, we treat it as building
  const effectiveMode =
    input.toLowerCase().startsWith("build ") ? "building" : mode;

  // Build prompt
  const system = buildSystem(effectiveMode, pro, session.activeHtml);
  const user = input;

  const ai = await callOpenAI({ system, user, schema: OUT_SCHEMA });

  if (!ai.ok) {
    return json(200, { ok: false, threadId, error: ai.error, details: ai.details || null });
  }

  const data = ai.data || {};
  const reply = String(data.reply || "").trim();
  let html = String(data.html || "").trim();

  // Enforce: if we expected HTML but model returned empty, keep old HTML and warn in reply
  if (shouldReturnHtml && !html) {
    html = session.activeHtml || "";
  }

  // If HTML was returned and looks like a full doc, save as current active
  if (html && /<!doctype html>/i.test(html) && /<\/html>/i.test(html)) {
    // If Serper is enabled, try to replace data-img-query tags with real images
    html = await hydrateImagesWithSerper(html);
    session.activeHtml = html;
  }

  // Save message history lightly (for tone continuity)
  session.messages.push({ role: "user", text: input, at: now() });
  session.messages.push({ role: "assistant", text: reply, at: now() });
  // Keep history bounded
  if (session.messages.length > 40) session.messages = session.messages.slice(-40);

  SESSIONS.set(threadId, session);

  return json(200, {
    ok: true,
    threadId,
    reply,
    html: (shouldReturnHtml ? (session.activeHtml || html || "") : "")
  });
};
