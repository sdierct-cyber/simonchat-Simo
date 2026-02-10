export default async (req) => {
  try {
    if (req.method !== "POST") return json(405, { error: "Method not allowed" });

    const body = await req.json().catch(() => ({}));
    const incoming = Array.isArray(body.messages) ? body.messages : [];
    const userText = String(body.user_text || "").trim();

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
    if (!OPENAI_API_KEY) return json(500, { error: "Missing OPENAI_API_KEY in Netlify env vars." });

    // Simo vibe: stable + concise + best-friend
    const system = {
      role: "system",
      content:
`You are Simo. You sound like a private best friend: direct, warm, sometimes a little edgy, never clinical.
No therapy-speak unless asked.

Rules:
- If the user asks simple math (like 217*22), answer with ONLY the number.
- Keep replies tight and human. 1–10 sentences.
- If the user vents, validate briefly and ask ONE real question.`
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
        max_tokens: 260
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
