export async function handler(event) {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const userText = String(body.message || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];

    if (!userText) {
      return json({ ok: false, error: "Missing message" }, 400);
    }

    // ---- 1) Your Simo style stays the same (system prompt) ----
    const systemPrompt = `
You are Simo — a best-friend vibe assistant.
- Keep replies tight and helpful.
- No therapy-speak unless asked.
- If user asks for simple math, give just the answer.
- You can use tools when you need fresh/live info.
`.trim();

    // ---- 2) TOOL: web_search definition ----
    const tools = [
      {
        type: "function",
        function: {
          name: "web_search",
          description:
            "Search the web for fresh/live info (weather, current events, addresses, hours, prices, etc.)",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string" }
            },
            required: ["query"]
          }
        }
      }
    ];

    // ---- 3) Build messages (keep your existing history behavior) ----
    // Expecting history like: [{role:"user"/"assistant", content:"..."}]
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "")
      })),
      { role: "user", content: userText }
    ];

    // ---- 4) Call OpenAI once; if it requests tool(s), run them and call again ----
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) return json({ ok: false, error: "Missing OPENAI_API_KEY" }, 500);

    // helper: call OpenAI chat completions (works everywhere)
    async function callOpenAI(msgs, toolOutputs) {
      const payload = {
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: msgs,
        tools,
        tool_choice: "auto"
      };

      // If we have tool outputs to attach, we append them as tool messages:
      if (toolOutputs?.length) {
        payload.messages = [...msgs, ...toolOutputs];
      }

      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify(payload)
      });

      const j = await r.json();
      if (!r.ok) {
        throw new Error(j?.error?.message || "OpenAI error");
      }
      return j;
    }

    // helper: run your Netlify search function
    async function runWebSearch(query) {
      // Build absolute URL for Netlify. In production, use URL env or Host header.
      const host = event.headers["host"];
      const proto = event.headers["x-forwarded-proto"] || "https";
      const base = `${proto}://${host}`;
      const url = `${base}/api/search?q=${encodeURIComponent(query)}`;

      const r = await fetch(url);
      const j = await r.json();
      return j;
    }

    // First OpenAI call
    const first = await callOpenAI(messages);

    const choice = first.choices?.[0];
    const assistantMsg = choice?.message;

    // If no tool calls, return the answer as-is
    const toolCalls = assistantMsg?.tool_calls || [];
    if (!toolCalls.length) {
      const text = assistantMsg?.content || "…";
      return json({ ok: true, reply: text });
    }

    // If there are tool calls, execute them and send results back
    const toolOutputs = [];
    for (const tc of toolCalls) {
      const name = tc.function?.name;
      const args = safeParse(tc.function?.arguments);

      if (name === "web_search") {
        const query = String(args?.query || "").trim();
        const result = query ? await runWebSearch(query) : { ok: false, error: "Missing query" };

        toolOutputs.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result)
        });
      } else {
        toolOutputs.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ ok: false, error: `Unknown tool: ${name}` })
        });
      }
    }

    // Second OpenAI call with tool outputs
    const second = await callOpenAI(messages, toolOutputs);
    const finalText = second.choices?.[0]?.message?.content || "…";

    return json({ ok: true, reply: finalText });
  } catch (err) {
    return json({ ok: false, error: err?.message || "Unknown error" }, 500);
  }
}

// small helpers
function json(obj, statusCode = 200) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(obj)
  };
}

function safeParse(s) {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}
