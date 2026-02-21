// netlify/functions/simon.js
// Stable backend contract: ALWAYS returns { ok, message, html }
// No silent failures. No "Reset. I'm here." masking.
// Uses Chat Completions because it's predictable across setups.

export default async (req) => {
  // CORS
  const headers = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST,OPTIONS",
    "content-type": "application/json; charset=utf-8",
  };

  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Use POST" }), { status: 405, headers });
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return new Response(JSON.stringify({ ok: false, error: "Missing OPENAI_API_KEY in Netlify env vars." }), {
      status: 500,
      headers,
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body." }), { status: 400, headers });
  }

  const mode = (body?.mode || "solving").toString();
  const topic = (body?.topic || "general").toString();
  const input = (body?.input || "").toString().trim();

  if (!input) {
    return new Response(JSON.stringify({ ok: true, message: "Say something and I’ll respond.", html: "" }), {
      status: 200,
      headers,
    });
  }

  // System behavior: ChatGPT-like routing without "brainfart" resets.
  // IMPORTANT: We never output "Reset. I'm here." unless user asked to reset.
  const system = `
You are "Simo": a helpful, steady assistant that can handle rapid topic switches.
Mode can be: venting | solving | building.
- venting: supportive best-friend vibe, no therapy-speak unless asked, ask 1-2 clarifying questions max.
- solving: direct, practical steps.
- building: produce usable artifacts. If the user asks for a preview, generate HTML.

CRITICAL OUTPUT RULE:
Return ONLY a valid JSON object with keys:
- "message": string (what you say in chat)
- "html": string (optional; either "" or a complete HTML doc starting with <!doctype html>)
No extra keys. No markdown. No backticks.

Preview policy:
- Only put HTML in "html" when the user clearly requests a preview/build ("build a landing page", "show me a preview", "make a website", etc.).
- Otherwise set "html" to "".

Do NOT claim you updated the preview unless you actually put HTML in "html".
  `.trim();

  // User prompt includes mode/topic so it can switch cleanly.
  const userPrompt = `mode=${mode}\ntopic=${topic}\nuser=${input}`;

  // Pick a common, widely-available model name.
  // If your account uses a specific model, this still usually works:
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.6,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
        // Force JSON-ish behavior
        response_format: { type: "json_object" },
      }),
    });

    const raw = await r.text();

    if (!r.ok) {
      return new Response(JSON.stringify({ ok: false, error: "OpenAI error", details: raw.slice(0, 1200) }), {
        status: 500,
        headers,
      });
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "Bad OpenAI response JSON", details: raw.slice(0, 1200) }), {
        status: 500,
        headers,
      });
    }

    const content = data?.choices?.[0]?.message?.content || "";
    let out;
    try {
      out = JSON.parse(content);
    } catch {
      // If the model ever breaks format, degrade safely instead of blank/looping
      return new Response(JSON.stringify({ ok: true, message: content || "I responded but formatting failed.", html: "" }), {
        status: 200,
        headers,
      });
    }

    const message = (out?.message || "").toString();
    const html = (out?.html || "").toString();

    // Guardrails: ensure html is either empty or a full doc
    const safeHTML = html.trim().startsWith("<!doctype html") ? html : "";

    return new Response(JSON.stringify({ ok: true, message: message || "…", html: safeHTML }), {
      status: 200,
      headers,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: "Server exception", details: String(e?.message || e) }),
      { status: 500, headers }
    );
  }
};
