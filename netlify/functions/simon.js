// netlify/functions/simon.js
// Netlify Function (Node) - CommonJS handler format

const OPENAI_URL = "https://api.openai.com/v1/responses";

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Content-Type": "application/json",
  };

  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: "Method not allowed" }),
    };
  }

  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

    if (!OPENAI_API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: "Missing OPENAI_API_KEY env var" }),
      };
    }

    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      body = {};
    }

    const userText = (body.message || "").toString();
    const history = Array.isArray(body.history) ? body.history : [];

    if (!userText.trim()) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: "Missing message" }),
      };
    }

    // Strong behavior contract (Simo vibe + builder switching + preview support)
    const SYSTEM_PROMPT = `
You are Simo — a private best-friend AI.

Default: best-friend mode (warm, real, not therapy-speak).
Switch to Builder mode automatically when user asks to design/build/create an app, website, UI, or code.

If user asks "show me a preview" (or mockup/UI/layout), produce a simple 1-page UI mockup in HTML.

Return ONLY valid JSON (no markdown) with EXACT keys:
{
  "mode": "bestfriend" | "builder",
  "reply": "string",
  "preview_html": "string (or empty)"
}
No extra keys.
`.trim();

    // Keep only last turns
    const cleanedHistory = history
      .slice(-16)
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content }));

    const input = [
      { role: "system", content: SYSTEM_PROMPT },
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
        input,                 // <-- IMPORTANT: no input_text, only roles+content
        temperature: 0.6,
        max_output_tokens: 900,
      }),
    });

    const data = await openaiResp.json().catch(() => ({}));

    if (!openaiResp.ok) {
      // Return clear OpenAI error so you never see "unknown" again
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

    // Extract text from Responses API output
    const outText = (data.output || [])
      .flatMap((o) => o.content || [])
      .filter((c) => c.type === "output_text")
      .map((c) => c.text)
      .join("\n")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(outText);
    } catch {
      // If model doesn't obey JSON rule, coerce safely
      parsed = {
        mode: "bestfriend",
        reply: outText || "Reset. I’m here.",
        preview_html: "",
      };
    }

    const mode = parsed.mode === "builder" ? "builder" : "bestfriend";
    const reply = typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : "Reset. I’m here.";
    const preview_html = typeof parsed.preview_html === "string" ? parsed.preview_html : "";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, mode, reply, preview_html }),
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
