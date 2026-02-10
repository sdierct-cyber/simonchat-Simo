export default async (req) => {
  try {
    if (req.method !== "POST") return json(405, { error: "Method not allowed" });

    const body = await req.json().catch(() => ({}));
    const incoming = Array.isArray(body.messages) ? body.messages : [];
    const userText = String(body.user_text || "").trim();

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

    if (!OPENAI_API_KEY) return json(500, { error: "Missing OPENAI_API_KEY in Netlify env vars." });

    // -------------------------
    // Reliable shortcuts (no regressions)
    // -------------------------

    // Math: 217*22 -> 4774 (answer only)
    if (/^\s*[-+]?(\d+(\.\d+)?)(\s*[-+*/]\s*[-+]?(\d+(\.\d+)?))+\s*$/.test(userText)) {
      const safe = userText.replace(/[^0-9+\-*/().\s]/g, "");
      try {
        // eslint-disable-next-line no-new-func
        const result = Function(`"use strict"; return (${safe});`)();
        if (Number.isFinite(result)) return json(200, { reply: String(result) });
      } catch {}
    }

    // Time in America/Detroit
    if (/^\s*(what\s+time\s+is\s+it|time)\s*\??\s*$/i.test(userText)) {
      const now = new Date();
      const formatted = now.toLocaleString("en-US", {
        timeZone: "America/Detroit",
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      return json(200, { reply: formatted });
    }

    // -------------------------
    // Simo prompt (best friend)
    // -------------------------
    const system = {
      role: "system",
      content:
`You are Simo: a private best friend vibe—direct, warm, sometimes a little edgy, never clinical.
No therapy-speak unless asked.

Hard rules:
- If the user asks simple math, output ONLY the answer.
- Keep replies tight and human.
- If the user vents, validate briefly and ask ONE real question.
- If they ask for building/design, give an actionable plan and ask 1–3 clarifying questions.`
    };

    const trimmed = trim(incoming, 14);

    const apiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [system, ...trimmed, { role: "user", content: userText }],
        temperature: 0.8,
        max_tokens: 280
      })
    });

    const data = await apiRes.json().catch(() => ({}));
    if (!apiRes.ok) {
      return json(500, { error: data?.error?.message || `OpenAI error (${apiRes.status})` });
    }

    const reply = data?.choices?.[0]?.message?.content?.trim() || "Hey — I’m here. What’s going on?";
    return json(200, { reply });

  } catch (e) {
    return json(500, { error: e?.message || "Server error" });
  }
};

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function trim(msgs, pairs) {
  const clean = msgs
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map(m => ({ role: m.role, content: m.content }));
  const max = Math.max(2, pairs * 2);
  return clean.slice(-max);
}
