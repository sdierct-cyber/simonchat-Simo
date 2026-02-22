// netlify/functions/simon.js
// ChatGPT-level brain via OpenAI Responses API
// - Returns stable JSON { reply, html }
// - Keeps your UI stable (no changes to index.html/app.js)
// Docs: https://api.openai.com/v1/responses :contentReference[oaicite:3]{index=3}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(obj),
  };
}

function pickAssistantText(responseJson) {
  // Responses API returns an `output` array with message items.
  // We extract assistant output_text and concatenate.
  const out = responseJson?.output;
  if (!Array.isArray(out)) return "";

  let text = "";
  for (const item of out) {
    if (item?.type === "message" && item?.role === "assistant" && Array.isArray(item?.content)) {
      for (const c of item.content) {
        if (c?.type === "output_text" && typeof c?.text === "string") {
          text += c.text;
        }
      }
    }
  }
  return (text || "").trim();
}

function isProbablyHTML(s) {
  if (!s) return false;
  const t = String(s).trim();
  return (
    t.startsWith("<!doctype html") ||
    t.startsWith("<html") ||
    /<body[\s>]/i.test(t) ||
    /<main[\s>]/i.test(t)
  );
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Use POST" });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return json(500, {
      ok: false,
      error: "Missing OPENAI_API_KEY in Netlify environment variables.",
    });
  }

  let data = {};
  try { data = JSON.parse(event.body || "{}"); } catch {}

  const userInput = String(data.input || "").trim();
  const history = Array.isArray(data.history) ? data.history : [];
  const pro = !!data.pro;

  if (!userInput) {
    return json(200, { ok: true, text: "Tell me what you want to build.", html: "" });
  }

  // Model choice (you can swap later if you want)
  const model = process.env.OPENAI_MODEL || "gpt-5.2";

  // Build “messages” list for Responses API
  // History comes from your app.js: [{role:"user"/"assistant", content:"..."}]
  const inputItems = [];

  // System behavior: "best friend" + "builder"
  inputItems.push({
    role: "system",
    content:
`You are Simo: the user's private best-friend vibe assistant + builder.
Rules:
- Sound like a real supportive best friend (no therapy-speak unless asked).
- Be direct, calm, and helpful. No patronizing.
- If the user asks to "build" a page/app/site, produce BOTH:
  1) a friendly reply (short)
  2) complete valid single-file HTML in the html field (no markdown fences)
- If the user asks edits like "headline: ..." or "add faq", update the last HTML you produced (return updated HTML).
- If not building/editing HTML, keep html as an empty string.
- Never put triple backticks inside html.
- Keep replies concise, like ChatGPT default.`
  });

  // Rehydrate a bit of conversation
  // Keep last ~12 turns to avoid huge token usage
  const trimmed = history.slice(-12);
  for (const h of trimmed) {
    const r = h?.role === "assistant" ? "assistant" : "user";
    const c = String(h?.content || "").trim();
    if (!c) continue;
    inputItems.push({ role: r, content: c });
  }

  // Add current user message
  inputItems.push({ role: "user", content: userInput });

  // Structured output schema: stable JSON
  // (This is the key to preventing “brainfart” formatting that breaks your preview.)
  const schema = {
    name: "simo_reply",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        reply: { type: "string" },
        html: { type: "string" }
      },
      required: ["reply", "html"]
    },
    strict: true
  };

  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`, // Bearer auth :contentReference[oaicite:4]{index=4}
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: inputItems,
        // Force structured JSON output :contentReference[oaicite:5]{index=5}
        text: { format: { type: "json_schema", json_schema: schema } },
        // Keep it “ChatGPT-like”
        temperature: 0.7,
        max_output_tokens: pro ? 1200 : 800,
        truncation: "auto",
      }),
    });

    const raw = await r.text();
    let resp;
    try { resp = JSON.parse(raw); } catch {
      return json(502, { ok: false, error: "OpenAI returned non-JSON response.", details: raw.slice(0, 400) });
    }

    if (!r.ok) {
      return json(r.status, {
        ok: false,
        error: resp?.error?.message || "OpenAI API error",
        details: resp,
      });
    }

    // The model’s structured JSON is in the assistant output_text
    const outText = pickAssistantText(resp);
    let parsed;
    try { parsed = JSON.parse(outText); } catch {
      // Fallback: return whatever text we got
      return json(200, { ok: true, text: outText || "Done.", html: "" });
    }

    const reply = String(parsed.reply || "").trim() || "Done.";
    const html = String(parsed.html || "").trim();

    // Safety: only send html if it's actually HTML
    const safeHtml = isProbablyHTML(html) ? html : "";

    return json(200, { ok: true, text: reply, html: safeHtml });

  } catch (e) {
    return json(500, { ok: false, error: `Backend exception: ${e?.message || e}` });
  }
};
