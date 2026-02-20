// netlify/functions/simon.js
// Simo backend (V1.2) — returns { ok, text, html }
// - Uses OpenAI Responses API
// - Always includes html when building
// - CORS enabled

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "cache-control": "no-store",
    },
    body: JSON.stringify(obj),
  };
}

function extractOutputText(respJson) {
  // Responses API typically returns output array with message content blocks of type "output_text". :contentReference[oaicite:1]{index=1}
  const out = respJson && respJson.output;
  if (!Array.isArray(out)) return "";
  let text = "";
  for (const item of out) {
    if (item && item.type === "message" && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c && c.type === "output_text" && typeof c.text === "string") text += c.text;
      }
    }
  }
  return text.trim();
}

function extractHtmlFromText(t = "") {
  const m = t.match(/```html\s*([\s\S]*?)```/i);
  return m ? m[1].trim() : "";
}

function wantsBuild(message = "", mode = "building") {
  const t = message.toLowerCase();
  if (mode === "building") return true;
  return /build|make|create|landing page|website|homepage|app|dashboard|page\b/.test(t);
}

function wantsPreview(message = "") {
  return /show me (a )?preview|preview\b/i.test(message || "");
}

function safeModeLabel(mode) {
  if (mode === "venting") return "venting";
  if (mode === "solving") return "solving";
  return "building";
}

function buildDeveloperPrompt({ mode }) {
  const m = safeModeLabel(mode);
  return `
You are Simo: a best-friend + builder assistant.
Tone rules:
- If mode is venting: respond like a real best friend (not therapy-speak). Ask 1-2 sharp questions max.
- If mode is solving: practical steps, concise.
- If mode is building: produce usable output.

CRITICAL OUTPUT RULE:
Return a JSON object ONLY with keys:
- "text": the chat reply (string)
- "html": full HTML page string OR "" if not building

If building (web/landing page/app mock):
- html MUST be a complete HTML document starting with <!doctype html>
- include simple modern CSS inline
- keep it responsive
- do not include external assets
- no markdown in html field

If not building:
- html must be "".
`.trim();
}

async function callOpenAI({ developerPrompt, userText }) {
  if (!OPENAI_API_KEY) {
    return { ok: false, error: "Missing OPENAI_API_KEY env var." };
  }

  const payload = {
    model: "gpt-4.1-mini",
    input: [
      {
        role: "developer",
        content: [{ type: "input_text", text: developerPrompt }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: userText }],
      },
    ],
  };

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    return { ok: false, error: "OpenAI error", details: j };
  }
  return { ok: true, data: j };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Use POST" });
  }

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }

  const message = (body.message || "").toString();
  const mode = (body.mode || "building").toString();
  const lastHtml = (body.last_html || "").toString();

  // If user asks preview but we already have cached html from frontend, just echo it back.
  // This keeps preview consistent even if model doesn't rebuild.
  if (wantsPreview(message) && lastHtml.trim()) {
    return json(200, {
      ok: true,
      text: "Preview updated on the right.",
      html: lastHtml,
    });
  }

  // Build behavior
  const shouldBuild = wantsBuild(message, mode);

  const developerPrompt = buildDeveloperPrompt({ mode });

  // If user only asks preview but no cached HTML exists, request a build
  if (wantsPreview(message) && !lastHtml.trim() && !shouldBuild) {
    return json(200, {
      ok: true,
      text: "I don’t have any HTML yet. Ask me to build something first (example: “build a landing page for a fitness coach”).",
      html: "",
    });
  }

  // Call OpenAI
  const userText = shouldBuild
    ? `${message}\n\n(If this request implies a website/app, include html in the JSON.)`
    : message;

  const resp = await callOpenAI({ developerPrompt, userText });
  if (!resp.ok) {
    return json(500, resp);
  }

  const rawText = extractOutputText(resp.data);

  // Expect JSON from the model; if parse fails, fall back safely
  let parsed = null;
  try { parsed = JSON.parse(rawText); } catch { parsed = null; }

  let textOut = "";
  let htmlOut = "";

  if (parsed && typeof parsed === "object") {
    textOut = (parsed.text || "").toString();
    htmlOut = (parsed.html || "").toString();
  } else {
    // fallback: try extracting html from fenced block, else none
    htmlOut = extractHtmlFromText(rawText);
    textOut = rawText || "Done.";
  }

  // Safety: if we say preview updated but no html exists, correct it.
  if ((/updated the preview/i.test(textOut) || wantsPreview(message)) && !htmlOut.trim()) {
    textOut = "I didn’t generate HTML yet, so I can’t render a preview. Ask for a build like: “build a landing page for a fitness coach”.";
  }

  // If building and html is still empty, also say it plainly
  if (shouldBuild && !htmlOut.trim()) {
    textOut = textOut || "I didn’t return HTML this time. Try again with: “build a landing page for a fitness coach.”";
  }

  return json(200, {
    ok: true,
    text: textOut || "Done.",
    html: htmlOut || "",
  });
};
