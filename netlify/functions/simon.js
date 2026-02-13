// netlify/functions/simon.js
// Fixes: OpenAI Responses API role/content type mismatch.
// - user/developer -> content.type = "input_text"
// - assistant      -> content.type = "output_text"

export async function handler(event) {
  // Basic CORS (works same-origin + safe for local testing)
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: "Method not allowed" }),
    };
  }

  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          ok: false,
          error: "Missing OPENAI_API_KEY in environment variables",
        }),
      };
    }

    // If you want to change models without editing code, set OPENAI_MODEL in Netlify env vars.
    const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

    // Parse body safely
    let payload = {};
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      payload = {};
    }

    // Your frontend might send message as: message / text / msg / input
    const userText =
      (payload && (payload.message || payload.text || payload.msg || payload.input)) || "";

    // History can be sent as payload.history: [{role:"user"/"assistant", content:"..."}]
    const history = Array.isArray(payload.history) ? payload.history : [];

    // Optional: your UI might send "mode" or "intent"
    const modeHint = (payload.mode || payload.intent || "").toString();

    // --- System / developer instruction (Simo behavior) ---
    // Keep this short and stable; your UI logic can still do previews & images separately.
    const DEV_PROMPT = `
You are Simo — a best-friend AI with builder capability.
Rules:
- Follow topic switches naturally. Don't get stuck repeating instructions.
- If the user is venting: be supportive, direct, human, not therapy-speak.
- If the user is building: give usable steps, code, and concrete output.
- If the user asks for "show me images of X", respond briefly and confirm what to search for.
- Keep responses concise unless the user asks for "whole code" or "full steps".
`.trim();

    // --- Responses API message builder ---
    function toResponsesItem(role, text) {
      const safeText = String(text ?? "");
      const isAssistant = role === "assistant";
      return {
        role,
        content: [
          {
            // CRITICAL FIX:
            // assistant content must be output_text; user/developer is input_text
            type: isAssistant ? "output_text" : "input_text",
            text: safeText,
          },
        ],
      };
    }

    // Build the input array in the correct schema
    const input = [];
    input.push(toResponsesItem("developer", DEV_PROMPT));

    // Map history safely (support either {content} or {text})
    for (const m of history) {
      if (!m) continue;
      const role =
        m.role === "assistant" || m.role === "user" || m.role === "developer"
          ? m.role
          : "user";

      const content = m.content ?? m.text ?? "";
      input.push(toResponsesItem(role, content));
    }

    input.push(toResponsesItem("user", userText));

    // Call OpenAI Responses API
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        input,
        // Keep it predictable; adjust if you want longer outputs
        max_output_tokens: 500,
      }),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      // Preserve OpenAI error details for debugging (no secrets included)
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          ok: false,
          error: "OpenAI error",
          details: JSON.stringify(data, null, 2),
        }),
      };
    }

    // Extract assistant text from Responses API output
    // Common shapes:
    // data.output_text (sometimes available)
    // data.output -> [{content:[{type:"output_text", text:"..."}]}]
    let assistantText = "";

    if (typeof data.output_text === "string" && data.output_text.trim()) {
      assistantText = data.output_text.trim();
    } else if (Array.isArray(data.output)) {
      const chunks = [];
      for (const item of data.output) {
        const contentArr = item?.content;
        if (!Array.isArray(contentArr)) continue;
        for (const c of contentArr) {
          if (c?.type === "output_text" && typeof c.text === "string") {
            chunks.push(c.text);
          }
        }
      }
      assistantText = chunks.join("").trim();
    }

    if (!assistantText) {
      assistantText = "Hey. I’m here. What’s going on?";
    }

    // Return in a way your frontend is unlikely to break:
    // - reply (some versions use this)
    // - text (some versions use this)
    // - ok
    // - mode echo (optional)
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: true,
        reply: assistantText,
        text: assistantText,
        mode: modeHint || null,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        ok: false,
        error: "Server error",
        details: String(err?.stack || err?.message || err),
      }),
    };
  }
}
