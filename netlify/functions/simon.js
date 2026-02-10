// netlify/functions/simon.js
export default async (req) => {
  try {
    if (req.method !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    const body = await req.json().catch(() => ({}));
    const incoming = Array.isArray(body.messages) ? body.messages : [];
    const userText = String(body.user_text || "").trim();

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

    if (!OPENAI_API_KEY) {
      return json(500, {
        error: "Missing OPENAI_API_KEY env var in Netlify."
      });
    }

    // --- Lightweight intent shortcuts (fast + cheap) ---
    // Math like 217*22, 10+5, 12/3
    if (/^\s*[-+]?(\d+(\.\d+)?)(\s*[-+*/]\s*[-+]?(\d+(\.\d+)?))+\s*$/.test(userText)) {
      // Safe eval for basic arithmetic only
      const safe = userText.replace(/[^0-9+\-*/().\s]/g, "");
      let result;
      try {
        // eslint-disable-next-line no-new-func
        result = Function(`"use strict"; return (${safe});`)();
      } catch {
        result = null;
      }
      if (result !== null && Number.isFinite(result)) {
        return json(200, { reply: String(result) });
      }
    }

    // Time
    if (/^\s*(what\s+time\s+is\s+it|time)\s*\??\s*$/i.test(userText)) {
      const now = new Date();
      return json(200, { reply: now.toLocaleString("en-US", { timeZone: "America/Detroit" }) });
    }

    // If you want weather later, we’ll add it without breaking anything.

    // --- Simo system prompt (stable) ---
    const system = {
      role: "system",
      content:
`You are Simo. You sound like a private best friend: direct, warm, a little edgy when appropriate, not clinical.
No therapy-speak unless the user asks for it. Keep replies tight and human.

Rules:
- If user asks a simple math question, give ONLY the answer.
- If user vents, validate briefly and ask ONE grounding question.
- If user asks for app/product building, give an actionable plan and optional code snippets.
- Never mention policy or internal tools.`
    };

    // Limit conversation size to keep cost stable
    const trimmed = trimMessages(incoming, 18);

    const messages = [
      system,
      ...trimmed,
      { role: "user", content: userText }
    ];

    const apiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        temperature: 0.8,
        max_tokens: 280
      })
    });

    const data = await apiRes.json().catch(() => ({}));

    if (!apiRes.ok) {
      const msg = data?.error?.message || `OpenAI error (${apiRes.status})`;
      return json(500, { error: msg });
    }

    const reply = data?.choices?.[0]?.message?.content?.trim() || "I’m here. What’s going on?";
    return json(200, { reply });

  } catch (err) {
    return json(500, { error: err?.message || "Server error" });
  }
};

function json(statusCode, obj) {
  return new Response(JSON.stringify(obj), {
    status: statusCode,
    headers: { "content-type": "application/json" }
  });
}

function trimMessages(msgs, maxPairs) {
  // Keep last N user/assistant messages only (drop anything else)
  const clean = msgs
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map(m => ({ role: m.role, content: m.content }));

  // maxPairs means user+assistant pairs → 2*maxPairs messages
  const max = Math.max(2, maxPairs * 2);
  return clean.slice(-max);
}
