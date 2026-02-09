// netlify/functions/simo.js
// Robust Simo brain: always returns real errors, supports preview_html, supports listen/build modes.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Optional: set a default model in Netlify env: OPENAI_MODEL
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// Small helper
function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    },
    body: JSON.stringify(obj),
  };
}

exports.handler = async (event) => {
  // OPTIONS preflight
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  // Allow GET in browser (so you don’t see “Method not allowed”)
  if (event.httpMethod === "GET") {
    return json(200, { ok: true, reply: "Simo brain is up. Send POST with JSON.", preview: null });
  }

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed. Use POST." });
  }

  // Parse body
  let body;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (e) {
    return json(400, { ok: false, error: "Invalid JSON body." });
  }

  const message = (body.message || "").toString();
  const mode = (body.mode || "listen").toString(); // "listen" or "build"
  const history = Array.isArray(body.history) ? body.history : [];

  if (!message.trim()) return json(400, { ok: false, error: "Missing 'message'." });

  if (!OPENAI_API_KEY) {
    return json(500, {
      ok: false,
      error: "Missing OPENAI_API_KEY in Netlify environment variables.",
    });
  }

  // Build system prompt
  const system = [
    "You are Simo: a best-friend companion first, builder second.",
    "In listen mode: be supportive, natural, concise, no therapy-speak.",
    "In build mode: do the work. If user asks to 'show me' or preview, return both a chat reply and preview_html.",
    "",
    "IMPORTANT OUTPUT RULE:",
    "Return JSON with keys:",
    "- reply: string (always present)",
    "- preview_html: string (optional; include when building a visual/preview).",
    "",
    "When you include preview_html, it must be a complete standalone HTML document.",
    "Keep it simple and clean; no external assets required.",
  ].join("\n");

  // Convert history into OpenAI format
  const messages = [
    { role: "system", content: system },
    ...history
      .slice(-14)
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || ""),
      })),
    { role: "user", content: message },
  ];

  // If user is asking for a preview in build mode, nudge model to provide preview_html
  const wantsPreview =
    mode === "build" &&
    /show me|preview|mockup|wireframe|ui|website|landing|app/i.test(message);

  const responseSchemaHint = wantsPreview
    ? "You MUST include preview_html."
    : "Include preview_html only if it adds value.";

  const finalUserNudge = {
    role: "user",
    content:
      "Output JSON ONLY. " +
      responseSchemaHint +
      " No markdown. No backticks. Keys: reply, preview_html (optional).",
  };

  // Call OpenAI (Chat Completions)
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        temperature: mode === "listen" ? 0.6 : 0.4,
        messages: [...messages, finalUserNudge],
      }),
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // If OpenAI ever returns non-JSON, show the raw text (truncated)
      return json(502, {
        ok: false,
        error: `OpenAI returned non-JSON: ${text.slice(0, 300)}`,
      });
    }

    if (!res.ok) {
      const errMsg =
        (data && data.error && data.error.message) ||
        `OpenAI error HTTP ${res.status}`;
      return json(502, { ok: false, error: errMsg });
    }

    const content = data?.choices?.[0]?.message?.content || "";

    // We told the model: "Output JSON ONLY" so parse it
    let out;
    try {
      out = JSON.parse(content);
    } catch (e) {
      // If the model didn't follow JSON-only, surface content for debugging
      return json(502, {
        ok: false,
        error: "Model output was not valid JSON.",
        raw: content.slice(0, 600),
      });
    }

    const reply = typeof out.reply === "string" ? out.reply : null;
    const preview_html =
      typeof out.preview_html === "string" ? out.preview_html : null;

    if (!reply) {
      return json(502, {
        ok: false,
        error: "Model JSON missing 'reply'.",
        raw: out,
      });
    }

    return json(200, {
      ok: true,
      reply,
      preview_html,
    });
  } catch (e) {
    // THIS is the key difference: real error shown to frontend
    return json(500, {
      ok: false,
      error: e?.message || "Unknown server error calling OpenAI.",
    });
  }
};
