// netlify/functions/simon.js
// ChatGPT-level brain via OpenAI Responses API (Structured Outputs)
// Returns stable JSON { reply, html } -> mapped to { ok, text, html }

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
    return json(500, { ok: false, error: "Missing OPENAI_API_KEY in Netlify env vars." });
  }

  let data = {};
  try { data = JSON.parse(event.body || "{}"); } catch {}

  const userInput = String(data.input || "").trim();
  const history = Array.isArray(data.history) ? data.history : [];
  const pro = !!data.pro;

  if (!userInput) return json(200, { ok: true, text: "Tell me what you want to build.", html: "" });

  const model = process.env.OPENAI_MODEL || "gpt-5.2";

  // Build input messages (system + short conversation + current user)
  const inputItems = [];

  inputItems.push({
    role: "system",
    content:
`You are Simo: the user's private best-friend vibe assistant + builder.
Rules:
- Sound like a real supportive best friend (no therapy-speak unless asked).
- Be direct and helpful. No patronizing.
- If the user asks to build a page/app/site, produce BOTH:
  1) a friendly reply (short) in "reply"
  2) complete valid single-file HTML in "html" (NO markdown fences)
- If the user asks edits like "headline: ..." or "add faq", update the last HTML you produced (return updated HTML).
- If not building/editing HTML, return html as an empty string.
- Never include triple backticks in html.`
  });

  const trimmed = history.slice(-12);
  for (const h of trimmed) {
    const role = h?.role === "assistant" ? "assistant" : "user";
    const content = String(h?.content || "").trim();
    if (content) inputItems.push({ role, content });
  }

  inputItems.push({ role: "user", content: userInput });

  // ✅ Correct Responses API Structured Outputs shape:
  // text.format requires name + schema + strict at this level (not nested)
  const responseFormat = {
    type: "json_schema",
    name: "simo_reply",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        reply: { type: "string" },
        html: { type: "string" },
      },
      required: ["reply", "html"],
    },
  };

  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: inputItems,
        text: { format: responseFormat }, // ✅ fixed
        temperature: 0.7,
        max_output_tokens: pro ? 1400 : 900,
        truncation: "auto",
      }),
    });

    const raw = await r.text();
    let resp;
    try { resp = JSON.parse(raw); }
    catch {
      return json(502, { ok: false, error: "OpenAI returned non-JSON.", details: raw.slice(0, 400) });
    }

    if (!r.ok) {
      return json(r.status, {
        ok: false,
        error: resp?.error?.message || "OpenAI API error",
      });
    }

    const outText = pickAssistantText(resp);

    let parsed;
    try { parsed = JSON.parse(outText); }
    catch {
      // If for any reason we didn't get JSON, don't break UI
      return json(200, { ok: true, text: outText || "Done.", html: "" });
    }

    const reply = String(parsed.reply || "").trim() || "Done.";
    const html = String(parsed.html || "").trim();
    const safeHtml = isProbablyHTML(html) ? html : "";

    return json(200, { ok: true, text: reply, html: safeHtml });

  } catch (e) {
    return json(500, { ok: false, error: `Backend exception: ${e?.message || e}` });
  }
};
