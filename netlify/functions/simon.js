// netlify/functions/simon.js
// Simo backend — Hardened JSON output (V1.0 hardening)
// Goal: reliability + consistent shape: { ok, text, html, mode, intent }
// - Always returns HTTP 200 (prevents frontend "Something went wrong.")
// - Detects build intent and requests HTML when needed.
// - Robustly parses model output (JSON / codefences / raw html).
//
// Env required:
// - OPENAI_API_KEY

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini"; // safe default; set OPENAI_MODEL if you want

function json(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "POST, OPTIONS",
      "cache-control": "no-store",
    },
    body: JSON.stringify(bodyObj),
  };
}

function ok(bodyObj) {
  // Always 200 to avoid frontend falling into res.ok false
  return json(200, bodyObj);
}

function isBuildIntent(message = "") {
  const m = message.toLowerCase();
  return (
    /build|make|create|generate|design/.test(m) &&
    /(landing page|website|homepage|site|portfolio|app|dashboard|pricing page|sales page)/.test(m)
  ) || /show me a preview|preview\b/.test(m);
}

function normalizeMode(mode) {
  const m = String(mode || "").toLowerCase();
  if (m === "venting" || m === "solving" || m === "building") return m;
  return "building";
}

function stripCodeFences(s = "") {
  return s.replace(/^```[a-zA-Z0-9_-]*\s*/g, "").replace(/```$/g, "").trim();
}

function extractHtmlFromText(text = "") {
  // 1) ```html ... ```
  const m1 = text.match(/```html\s*([\s\S]*?)```/i);
  if (m1 && m1[1]) return m1[1].trim();

  // 2) Raw HTML
  const lower = text.toLowerCase();
  if (lower.includes("<!doctype") || lower.includes("<html")) {
    // try to slice from first doctype/html
    const idx = lower.indexOf("<!doctype");
    if (idx >= 0) return text.slice(idx).trim();
    const idx2 = lower.indexOf("<html");
    if (idx2 >= 0) return text.slice(idx2).trim();
  }
  return "";
}

function looksLikeHtml(html = "") {
  const h = String(html || "").trim();
  if (h.length < 200) return false;
  const low = h.toLowerCase();
  return low.includes("<!doctype") || low.includes("<html");
}

function tryParseJsonFromText(text = "") {
  // If model returns JSON wrapped in fences or plain
  const t = stripCodeFences(text);

  // Find first "{" and last "}" to avoid surrounding chatter
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const slice = t.slice(start, end + 1);
    try {
      return JSON.parse(slice);
    } catch {
      return null;
    }
  }
  return null;
}

function safeText(x) {
  return typeof x === "string" ? x : "";
}

function buildSystem(mode) {
  // Keep it simple and stable.
  // IMPORTANT: We ask for JSON with {text, html} when building.
  return `
You are Simo.
You must follow the user's current mode: ${mode}.

Rules:
- If intent is BUILD (website/landing/app), produce BOTH:
  1) "text": a short confirmation + how to customize
  2) "html": a complete single-file HTML (<!doctype html>...), responsive, modern, inline CSS only.
- If intent is NOT BUILD, produce:
  1) "text": helpful response
  2) "html": "" (empty string)

Return ONLY valid JSON with keys: ok, text, html, intent.
"ok" must be true unless you truly cannot comply.
"intent" must be "build" or "chat".
No markdown fences. No extra keys.
`.trim();
}

function buildUserMessage(message, mode, topic, lastHtml, wantHtml) {
  // Provide context but avoid huge payloads.
  const clippedLast = safeText(lastHtml).slice(0, 2500);
  return `
User mode: ${mode}
Topic: ${topic || "none"}
want_html: ${wantHtml ? "true" : "false"}

User message:
${message}

Last HTML (may be empty, for context only):
${clippedLast ? clippedLast : "[none]"}
`.trim();
}

async function callOpenAI({ apiKey, system, user }) {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      input: [
        { role: "system", content: [{ type: "output_text", text: system }] },
        { role: "user", content: [{ type: "output_text", text: user }] }
      ],
      // Keep it deterministic-ish for UI
      temperature: 0.4,
      max_output_tokens: 2200,
    }),
  });

  const data = await res.json().catch(() => ({}));

  // Extract text from Responses API shape
  // Try common shapes:
  // - data.output[0].content[0].text
  // - data.output_text
  let outText = "";
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c && typeof c.text === "string") outText += c.text;
        }
      }
    }
  }
  if (!outText && typeof data.output_text === "string") outText = data.output_text;
  if (!outText && typeof data.text === "string") outText = data.text;

  return { ok: true, outText: outText || "", raw: data };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type, authorization",
        "access-control-allow-methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return ok({
      ok: false,
      text: "Server missing OPENAI_API_KEY.",
      html: "",
      mode: "building",
      intent: "chat",
    });
  }

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }

  const message = safeText(body.message || body.input || body.prompt || "");
  const mode = normalizeMode(body.mode);
  const topic = safeText(body.topic || "");
  const lastHtml = safeText(body.last_html || body.lastHtml || "");
  const wantHtml = body.want_html !== false; // default true

  if (!message.trim()) {
    return ok({
      ok: true,
      text: "Say what you want — venting, solving, or building.",
      html: "",
      mode,
      intent: "chat",
    });
  }

  // Decide intent
  const intent = isBuildIntent(message) && wantHtml ? "build" : "chat";

  const system = buildSystem(mode);
  const user = buildUserMessage(message, mode, topic, lastHtml, wantHtml);

  try {
    const { outText } = await callOpenAI({ apiKey, system, user });

    // Parse model output as JSON first
    const parsed = tryParseJsonFromText(outText);

    let finalText = "";
    let finalHtml = "";
    let finalIntent = intent;
    let finalOk = true;

    if (parsed && typeof parsed === "object") {
      finalOk = parsed.ok !== false;
      finalText = safeText(parsed.text) || "";
      finalHtml = safeText(parsed.html) || "";
      finalIntent = safeText(parsed.intent) || intent;
    } else {
      // Fallback: treat as normal assistant text and try to extract HTML if present
      finalText = outText || "Done.";
      finalHtml = extractHtmlFromText(outText);
      finalIntent = looksLikeHtml(finalHtml) ? "build" : "chat";
    }

    // Hardening: if intent was build but html is missing, keep ok true but be explicit
    if (intent === "build" && !looksLikeHtml(finalHtml)) {
      // Keep any useful text, but ensure we don't fake html
      if (!finalText) finalText = "I can build that, but I didn’t generate usable HTML. Try again with: “build a landing page for …”";
      finalHtml = "";
      finalIntent = "build";
    }

    return ok({
      ok: finalOk,
      text: finalText || "Done.",
      // return both keys for frontend compatibility
      html: finalHtml,
      preview_html: finalHtml,
      message: finalText || "Done.",
      mode,
      intent: finalIntent,
    });
  } catch (e) {
    // Never throw a 500 to the frontend (keeps UI stable)
    return ok({
      ok: false,
      text: "Backend error talking to OpenAI.",
      html: "",
      preview_html: "",
      message: "Backend error talking to OpenAI.",
      mode,
      intent,
    });
  }
};
