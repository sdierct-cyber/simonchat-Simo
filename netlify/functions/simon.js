export async function handler(event) {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const userText = String(body.message || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];

    if (!userText) {
      return json({ ok: false, error: "Missing message" }, 400);
    }

    // ---- 1) Simo style stays the same (system prompt) ----
    // Key addition: clear rule for when to use web_search (live facts).
    const systemPrompt = `
You are Simo — a best-friend vibe assistant.
- Keep replies tight and helpful.
- No therapy-speak unless asked.
- If user asks for simple math, give just the answer.
- If the user asks for live/current info (weather, news, addresses, "right now", "today"), call the web_search tool.
- When you use web_search, summarize results in plain English and don’t dump links unless asked.
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
              query: { type: "string", description: "Search query" }
            },
            required: ["query"]
          }
        }
      }
    ];

    // ---- 3) Build messages (keep your existing history behavior) ----
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "")
      })),
      { role: "user", content: userText }
    ];

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) return json({ ok: false, error: "Missing OPENAI_API_KEY" }, 500);

    // helper: call OpenAI chat completions
    async function callOpenAI(msgs) {
      const payload = {
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: msgs,
        tools,
        tool_choice: "auto"
      };

      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify(payload)
      });

      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || "OpenAI error");
      return j;
    }

    // helper: call your Netlify /api/search endpoint
    async function runWebSearch(query) {
      const host = event.headers["host"];
      const proto = event.headers["x-forwarded-proto"] || "https";
      const base = `${proto}://${host}`;
      const url = `${base}/api/search?q=${encodeURIComponent(query)}`;

      const r = await fetch(url);
      const j = await r.json();
      return j;
    }

    // ---- 4) First OpenAI call ----
    const first = await callOpenAI(messages);
    const assistantMsg = first.choices?.[0]?.message;

    // If no tool calls, return
    const toolCalls = assistantMsg?.tool_calls || [];
    if (!toolCalls.length) {
      return json({ ok: true, reply: assistantMsg?.content || "…" });
    }

    // ---- 5) Execute tool calls and append tool outputs to messages ----
    const msgsWithTools = [...messages, assistantMsg];

    for (const tc of toolCalls) {
      const name = tc.function?.name;
      const args = safeParse(tc.function?.arguments);

      if (name === "web_search") {
        const query = String(args?.query || "").trim();
        const result = query
          ? await runWebSearch(query)
          : { ok: false, error: "Missing query" };

        msgsWithTools.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result)
        });
      } else {
        msgsWithTools.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ ok: false, error: `Unknown tool: ${name}` })
        });
      }
    }

    // ---- 6) Second OpenAI call (model sees tool results) ----
    const second = await callOpenAI(msgsWithTools);
    const finalText = second.choices?.[0]?.message?.content || "…";

    return json({ ok: true, reply: finalText });
  } catch (err) {
    return json({ ok: false, error: err?.message || "Unknown error" }, 500);
  }
}

// helpers
function json(obj, statusCode = 200) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(obj)
  };
}

function safeParse(s) {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
}
