// netlify/functions/simon.js
// Simo backend — Hardened JSON output (BACKEND V1.1)
// - Uses Responses API correctly with content type: "input_text"
// - Always returns HTTP 200 with predictable JSON shape
// - Forces the model to return JSON: { ok, text, html, intent }
// - Adds backend_version so you can confirm deploy in Network → Response

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"; // safe + cheap default
const BACKEND_VERSION = "simo-backend-v1.1";

function reply(bodyObj) {
  return {
    statusCode: 200,
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

function normalizeMode(mode) {
  const m = String(mode || "").toLowerCase();
  if (m === "venting" || m === "solving" || m === "building") return m;
  return "building";
}

function safeText(x) {
  return typeof x === "string" ? x : "";
}

function looksLikeHtml(html = "") {
  const h = String(html || "").trim();
  if (h.length < 200) return false;
  const low = h.toLowerCase();
  return low.includes("<!doctype") || low.includes("<html");
}

function isBuildIntent(message = "") {
  const m = message.toLowerCase();
  // build intent or explicit preview request
  if (/show me a preview|preview\b/.test(m)) return true;

  // build/make/create + some web artifact nouns
  const verb = /(build|make|create|generate|design)/.test(m);
  const noun = /(landing page|website|homepage|site|portfolio|app|dashboard|pricing page|sales page)/.test(m);
  return verb && noun;
}

function stripFences(s = "") {
  return s.replace(/^```(?:json|html)?\s*/i, "").replace(/```$/i, "").trim();
}

function tryParseJson(text = "") {
  const t = stripFences(text);
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const slice = t.slice(start, end + 1);
    try { return JSON.parse(slice); } catch { return null; }
  }
  return null;
}

function extractHtmlFromText(text = "") {
  const m = text.match(/```html\s*([\s\S]*?)```/i);
  if (m && m[1]) return m[1].trim();

  const low = text.toLowerCase();
  const i1 = low.indexOf("<!doctype");
  if (i1 >= 0) return text.slice(i1).trim();
  const i2 = low.indexOf("<html");
  if (i2 >= 0) return text.slice(i2).trim();
  return "";
}

function buildSystem(mode) {
  return `
You are Simo.
Current mode: ${mode}

You MUST output ONLY valid JSON (no markdown, no code fences), with exactly these keys:
- ok (boolean)
- intent ("build" or "chat")
- text (string)
- html (string; must be "" unless intent is "build")

Rules:
- If the user's request is to build a website/landing page/app UI or asks for preview, intent MUST be "build" and html MUST be a complete single-file HTML document starting with <!doctype html>.
- If not building, intent MUST be "chat" and html MUST be "".
- Keep "text" short and helpful. For build intent, include 3–6 customization commands (headline:, cta:, price:, add/remove faq, add/remove testimonials).
`.trim();
}

function buildUser({ message, mode, topic, lastHtml, wantHtml }) {
  const clipped = safeText(lastHtml).slice(0, 2000);
  return `
mode: ${mode}
topic: ${topic || "none"}
want_html: ${wantHtml ? "true" : "false"}

USER MESSAGE:
${message}

LAST_HTML (may be empty; context only):
${clipped || "[none]"}
`.trim();
}

async function callOpenAI(apiKey, systemText, userText) {
  const payload = {
    model: MODEL,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: systemText }]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: userText }]
      }
    ],
    temperature: 0.4,
    max_output_tokens: 2400,
  };

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));

  // Pull text from output array (robust)
  let out = "";
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (!item || !Array.isArray(item.content)) continue;
      for (const c of item.content) {
        if (c && typeof c.text === "string") out += c.text;
      }
    }
  }
  // Some SDKs expose output_text; if present, use it
  if (!out && typeof data.output_text === "string") out = data.output_text;

  return { resOk: res.ok, outText: out || "", raw: data };
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
    return reply({
      ok: false,
      intent: "chat",
      text: "Server missing OPENAI_API_KEY.",
      html: "",
      backend_version: BACKEND_VERSION,
    });
  }

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }

  const message = safeText(body.message || body.input || body.prompt || "").trim();
  const mode = normalizeMode(body.mode);
  const topic = safeText(body.topic || "");
  const lastHtml = safeText(body.last_html || body.lastHtml || "");
  const wantHtml = body.want_html !== false; // default true

  if (!message) {
    return reply({
      ok: true,
      intent: "chat",
      text: "Tell me what you want right now — venting, solving, or building.",
      html: "",
      backend_version: BACKEND_VERSION,
    });
  }

  const intentWanted = (isBuildIntent(message) && wantHtml) ? "build" : "chat";

  const systemText = buildSystem(mode);
  const userText = buildUser({ message, mode, topic, lastHtml, wantHtml });

  try {
    const { outText, raw } = await callOpenAI(apiKey, systemText, userText);

    // 1) Expect JSON
    const parsed = tryParseJson(outText);

    let final = {
      ok: true,
      intent: intentWanted,
      text: "",
      html: "",
    };

    if (parsed && typeof parsed === "object") {
      final.ok = parsed.ok !== false;
      final.intent = (parsed.intent === "build" || parsed.intent === "chat") ? parsed.intent : intentWanted;
      final.text = safeText(parsed.text) || "";
      final.html = safeText(parsed.html) || "";
    } else {
      // 2) Fallback: treat model output as text, attempt HTML extraction
      final.text = outText || "Done.";
      final.html = extractHtmlFromText(outText);
      final.intent = looksLikeHtml(final.html) ? "build" : "chat";
    }

    // Hard clamp: if build intent but html is not valid, do NOT pretend.
    if (intentWanted === "build" && !looksLikeHtml(final.html)) {
      final.intent = "build";
      final.html = "";
      if (!final.text) {
        final.text = "I can build that, but I didn’t generate usable HTML this time. Try: “build a landing page for a fitness coach”.";
      }
    }

    return reply({
      ok: final.ok,
      intent: final.intent,
      text: final.text || "Done.",
      message: final.text || "Done.",     // frontend compatibility
      html: final.html,
      preview_html: final.html,           // frontend compatibility
      mode,
      backend_version: BACKEND_VERSION,
      // helpful for debugging without crashing UI:
      debug_has_output: Array.isArray(raw?.output),
    });
  } catch (e) {
    // Never return 500 (keeps UI stable)
    return reply({
      ok: false,
      intent: intentWanted,
      text: "Backend error talking to OpenAI.",
      message: "Backend error talking to OpenAI.",
      html: "",
      preview_html: "",
      mode,
      backend_version: BACKEND_VERSION,
    });
  }
};
