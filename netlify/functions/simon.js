// netlify/functions/simon.js
// Simo E bundle: best-friend tone lock + structured outputs + web search + image generation + free-limit gating
// NOTE: Pro verification is handled by your separate /.netlify/functions/pro.
// This function trusts the boolean "pro" passed by the UI.
//
// If you see "Unexpected end of input" again, it means the file did not paste fully.

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
        if (c?.type === "output_text" && typeof c?.text === "string") text += c.text;
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
    /<main[\s>]/i.test(t) ||
    /<div[\s>]/i.test(t)
  );
}

function wantsWebSearch(input) {
  const t = String(input || "").toLowerCase();
  return (
    t.includes("search") ||
    t.includes("look up") ||
    t.includes("latest") ||
    t.includes("current") ||
    t.includes("news") ||
    t.includes("sources") ||
    t.includes("cite") ||
    t.includes("references") ||
    t.includes("with sources")
  );
}

function wantsImage(input) {
  const t = String(input || "").toLowerCase();
  return (
    t.includes("generate an image") ||
    t.includes("create an image") ||
    t.includes("make an image") ||
    t.includes("book cover image") ||
    t.includes("cover image") ||
    t.includes("poster image") ||
    t.includes("render an image")
  );
}

function normalizeIP(headers) {
  const xf = headers?.["x-forwarded-for"] || headers?.["X-Forwarded-For"];
  if (!xf) return "anon";
  return String(xf).split(",")[0].trim() || "anon";
}

// Best-effort in-memory usage counter (resets on cold starts)
const MEMORY =
  globalThis.__SIMO_MEMORY__ ||
  (globalThis.__SIMO_MEMORY__ = {
    usage: new Map(), // key -> {count, ts}
  });

function getUsage(key) {
  const v = MEMORY.usage.get(key);
  if (!v) return { count: 0, ts: Date.now() };
  const age = Date.now() - v.ts;
  if (age > 24 * 60 * 60 * 1000) return { count: 0, ts: Date.now() };
  return v;
}

function bumpUsage(key) {
  const v = getUsage(key);
  const next = { count: (v.count || 0) + 1, ts: v.ts || Date.now() };
  MEMORY.usage.set(key, next);
  return next.count;
}

async function callOpenAI({ apiKey, payload }) {
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const raw = await r.text();
  let j;
  try {
    j = JSON.parse(raw);
  } catch {
    return { ok: false, status: r.status, error: "OpenAI returned non-JSON", raw: raw.slice(0, 800) };
  }

  if (!r.ok) {
    return { ok: false, status: r.status, error: j?.error?.message || "OpenAI API error", details: j };
  }
  return { ok: true, status: r.status, json: j };
}

async function moderate({ apiKey, input }) {
  const r = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "omni-moderation-latest", input }),
  });

  const raw = await r.text();
  let j;
  try {
    j = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Moderation returned non-JSON", raw: raw.slice(0, 400) };
  }

  if (!r.ok) return { ok: false, error: j?.error?.message || "Moderation error" };

  const res = j?.results?.[0];
  return { ok: true, flagged: !!res?.flagged, detail: res };
}

async function generateImageBase64({ apiKey, prompt }) {
  // If your account/model doesn’t support this, we fail soft.
  const r = await fetch("https://api.openai.com/v1/images", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
    }),
  });

  const raw = await r.text();
  let j;
  try {
    j = JSON.parse(raw);
  } catch {
    return { ok: false, error: "images non-json", raw: raw.slice(0, 800) };
  }

  if (!r.ok) return { ok: false, error: j?.error?.message || "images api error", details: j };

  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) return { ok: false, error: "No b64_json returned from images API." };
  return { ok: true, b64 };
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function imageHTMLPage({ title, b64 }) {
  const img = `data:image/png;base64,${b64}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title || "Generated Image")}</title>
<style>
  html,body{height:100%;margin:0}
  body{display:flex;align-items:center;justify-content:center;background:#0b1020}
  .frame{width:min(820px,92vw);aspect-ratio:1/1;border-radius:18px;overflow:hidden;
         box-shadow:0 20px 60px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.14)}
  img{width:100%;height:100%;object-fit:cover;display:block}
</style>
</head>
<body>
  <div class="frame"><img alt="generated" src="${img}"></div>
</body>
</html>`;
}

function extractJsonObject(s) {
  if (!s) return null;
  const t = String(s).trim();
  try {
    return JSON.parse(t);
  } catch {}
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    const maybe = t.slice(first, last + 1);
    try {
      return JSON.parse(maybe);
    } catch {}
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Use POST" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return json(500, { ok: false, error: "Missing OPENAI_API_KEY in Netlify env vars." });

  let data = {};
  try {
    data = JSON.parse(event.body || "{}");
  } catch {}

  const input = String(data.input || "").trim();
  const history = Array.isArray(data.history) ? data.history : [];
  const pro = !!data.pro;

  if (!input) return json(200, { ok: true, text: "Tell me what you want to build.", html: "" });

  // Free limit gate (only affects free mode)
  const FREE_LIMIT = Number(process.env.FREE_LIMIT || "25");
  const ip = normalizeIP(event.headers || {});
  const key = `ip:${ip}`;
  const usage = getUsage(key);

  if (!pro && usage.count >= FREE_LIMIT) {
    return json(200, {
      ok: true,
      text: `You’ve hit the free limit (${FREE_LIMIT}). Upgrade to Pro to keep going and unlock web search + image generation.`,
      html: "",
      meta: { free_limit: FREE_LIMIT, used: usage.count },
    });
  }

  // Moderation gate (fail soft if moderation fails)
  const mod = await moderate({ apiKey, input });
  if (mod.ok && mod.flagged) {
    bumpUsage(key);
    return json(200, { ok: true, text: "I can’t help with that request. Try rephrasing it in a safe way.", html: "" });
  }

  // Image tool path (Pro only)
  if (wantsImage(input)) {
    if (!pro) {
      bumpUsage(key);
      return json(200, { ok: true, text: "Image generation is Pro. Toggle Pro to unlock it, then try again.", html: "" });
    }

    const img = await generateImageBase64({ apiKey, prompt: input });
    bumpUsage(key);

    if (!img.ok) {
      return json(200, { ok: true, text: `Image generation failed: ${img.error}`, html: "" });
    }

    const html = imageHTMLPage({ title: "Generated Image", b64: img.b64 });
    return json(200, { ok: true, text: "Done. I generated the image and put it in the preview.", html });
  }

  const model = process.env.OPENAI_MODEL || "gpt-5.2";

  const system =
`You are Simo.

You are NOT a motivational poster.
You are NOT a therapist.
You are the user’s best-friend vibe assistant + builder.

Tone:
- Calm, grounded, direct.
- No clichés (“you’ve got this”, “every masterpiece starts somewhere”).
- Validate briefly, then offer ONE practical next step.
- Emotional support under 6 sentences unless asked.

Builder:
- If user asks to build/design/edit, return complete single-file HTML in "html".
- If user is just chatting, html must be "".
- Never include markdown fences in html.
- Don’t use placeholders like [Your Name] unless user explicitly asked.

If web search tool is available, use it only when the user asks for current info/sources/lookup.`;

  const inputItems = [{ role: "system", content: system }];

  for (const h of history.slice(-12)) {
    const role = h?.role === "assistant" ? "assistant" : "user";
    const content = String(h?.content || "").trim();
    if (content) inputItems.push({ role, content });
  }
  inputItems.push({ role: "user", content: input });

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

  const tools = [];
  if (pro && wantsWebSearch(input)) tools.push({ type: "web_search" });

  const payload = {
    model,
    input: inputItems,
    text: { format: responseFormat },
    temperature: 0.7,
    max_output_tokens: pro ? 1600 : 900,
    truncation: "auto",
    ...(tools.length ? { tools } : {}),
  };

  const res = await callOpenAI({ apiKey, payload });
  bumpUsage(key);

  if (!res.ok) {
    // fail soft: do not throw, do not 502
    const msg = res.error || "Backend error";
    return json(200, { ok: true, text: `Backend error: ${msg}`, html: "" });
  }

  const outText = pickAssistantText(res.json);
  const parsed = extractJsonObject(outText);

  if (!parsed || typeof parsed !== "object") {
    // If model somehow didn’t return JSON, show text only (no crash)
    return json(200, { ok: true, text: outText || "Done.", html: "" });
  }

  const reply = String(parsed.reply || "").trim() || "Done.";
  const html = String(parsed.html || "").trim();
  const safeHtml = isProbablyHTML(html) ? html : "";

  return json(200, { ok: true, text: reply, html: safeHtml });
};
