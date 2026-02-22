// netlify/functions/simon.js
// Simo "E" bundle: Best-friend tone lock + ChatGPT-level brain + web search + image generation + moderation + free->pro gating
//
// Uses OpenAI Responses API with Structured Outputs (JSON schema) to return stable {reply, html}. :contentReference[oaicite:4]{index=4}
// Uses OpenAI web_search tool for live resources. :contentReference[oaicite:5]{index=5}
// Uses OpenAI Images API for image generation (base64 embedded into HTML). :contentReference[oaicite:6]{index=6}
// Uses OpenAI Moderation endpoint to filter unsafe requests. :contentReference[oaicite:7]{index=7}

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
  const t = input.toLowerCase();
  return (
    t.includes("search") ||
    t.includes("look up") ||
    t.includes("latest") ||
    t.includes("current") ||
    t.includes("news") ||
    t.includes("sources") ||
    t.includes("cite") ||
    t.includes("references")
  );
}

function wantsImage(input) {
  const t = input.toLowerCase();
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
  const xf = headers["x-forwarded-for"] || headers["X-Forwarded-For"];
  if (!xf) return "anon";
  // x-forwarded-for can be "client, proxy, proxy"
  return String(xf).split(",")[0].trim() || "anon";
}

/**
 * BEST-EFFORT FREE LIMIT:
 * Netlify Functions are stateless across cold starts. This in-memory counter resets sometimes.
 * It's still useful as a first gate; for "real" billing-grade gating we should add persistent storage later.
 */
const MEMORY = globalThis.__SIMO_MEMORY__ || (globalThis.__SIMO_MEMORY__ = {
  usage: new Map(), // key -> {count, ts}
});

function getUsage(key) {
  const v = MEMORY.usage.get(key);
  if (!v) return { count: 0, ts: Date.now() };
  // Optional: decay window (24h)
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
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const raw = await r.text();
  let j;
  try { j = JSON.parse(raw); } catch {
    return { ok: false, status: r.status, error: "OpenAI non-JSON response", raw: raw.slice(0, 600) };
  }
  if (!r.ok) {
    return { ok: false, status: r.status, error: j?.error?.message || "OpenAI API error", details: j };
  }
  return { ok: true, status: r.status, json: j };
}

async function moderate({ apiKey, input }) {
  // Moderation endpoint is free and recommended for gating. :contentReference[oaicite:8]{index=8}
  const r = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input,
    }),
  });
  const raw = await r.text();
  let j;
  try { j = JSON.parse(raw); } catch { return { ok: false, error: "moderation non-json" }; }
  if (!r.ok) return { ok: false, error: j?.error?.message || "moderation error" };

  const res = j?.results?.[0];
  const flagged = !!res?.flagged;
  return { ok: true, flagged, detail: res };
}

async function generateImageBase64({ apiKey, prompt }) {
  // Images API guide: can return b64_json. :contentReference[oaicite:9]{index=9}
  // We'll use model gpt-image-1 if available; OpenAI may change model names in the future.
  const r = await fetch("https://api.openai.com/v1/images", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
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
  try { j = JSON.parse(raw); } catch {
    return { ok: false, error: "images non-json", raw: raw.slice(0, 600) };
  }
  if (!r.ok) return { ok: false, error: j?.error?.message || "images api error", details: j };

  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) return { ok: false, error: "No b64_json returned from images API." };

  return { ok: true, b64 };
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

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Use POST" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return json(500, { ok: false, error: "Missing OPENAI_API_KEY in Netlify env vars." });

  let data = {};
  try { data = JSON.parse(event.body || "{}"); } catch {}

  const input = String(data.input || "").trim();
  const history = Array.isArray(data.history) ? data.history : [];
  const pro = !!data.pro;

  if (!input) return json(200, { ok: true, text: "Tell me what you want to build.", html: "" });

  // ---------- Free -> Pro threshold ----------
  const FREE_LIMIT = Number(process.env.FREE_LIMIT || "25");
  const ip = normalizeIP(event.headers || {});
  const key = `ip:${ip}`;
  const usage = getUsage(key);
  if (!pro && usage.count >= FREE_LIMIT) {
    return json(200, {
      ok: true,
      text: `You’ve hit the free limit (${FREE_LIMIT}). Upgrade to Pro to keep going and unlock web search + image generation.`,
      html: "",
      meta: { free_limit: FREE_LIMIT, used: usage.count }
    });
  }

  // ---------- Moderation gate ----------
  const mod = await moderate({ apiKey, input });
  if (!mod.ok) {
    // If moderation fails, don't hard-fail the user; just proceed cautiously.
  } else if (mod.flagged) {
    return json(200, {
      ok: true,
      text: "I can’t help with that request. Try rephrasing it in a safe, non-harmful way.",
      html: ""
    });
  }

  // ---------- Image generation path (Pro only) ----------
  if (wantsImage(input)) {
    if (!pro) {
      bumpUsage(key);
      return json(200, {
        ok: true,
        text: "Image generation is Pro. Toggle Pro to unlock it, then try again.",
        html: ""
      });
    }

    const img = await generateImageBase64({ apiKey, prompt: input });
    bumpUsage(key);

    if (!img.ok) {
      return json(200, { ok: true, text: `Image generation failed: ${img.error}`, html: "" });
    }

    const html = imageHTMLPage({ title: "Generated Image", b64: img.b64 });
    return json(200, { ok: true, text: "Done. I generated the image and put it in the preview.", html });
  }

  // ---------- ChatGPT-level response path ----------
  const model = process.env.OPENAI_MODEL || "gpt-5.2";

  const system = `
You are Simo.

You are NOT a motivational poster.
You are NOT a therapist.
You are the user’s best-friend vibe assistant + builder.

Tone rules:
- Calm, grounded, direct.
- No clichés (no “you’ve got this”, no “every masterpiece starts somewhere”).
- Validate briefly, then offer one practical next step.
- Keep emotional support under 6 sentences unless asked.

Builder rules:
- If user asks to build/design/edit, return complete single-file HTML in "html".
- If user is just chatting, html must be "".
- Never include markdown fences in html.
- Don’t use placeholders like [Your Name] unless user explicitly asked.

If web search is available, use it only when the user asks for current info, sources, or “look up”.
When you cite sources, include the raw URLs in the reply text.
`;

  const inputItems = [{ role: "system", content: system }];

  // Keep last 12 turns
  const trimmed = history.slice(-12);
  for (const h of trimmed) {
    const role = h?.role === "assistant" ? "assistant" : "user";
    const content = String(h?.content || "").trim();
    if (content) inputItems.push({ role, content });
  }
  inputItems.push({ role: "user", content: input });

  // Structured output schema: stable JSON
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
  // Only allow web_search when user intent suggests it AND Pro is ON (tools as a Pro perk)
  if (pro && wantsWebSearch(input)) {
    tools.push({ type: "web_search" }); // OpenAI hosted web search tool :contentReference[oaicite:10]{index=10}
  }

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
    return json(200, { ok: true, text: `Backend error: ${res.error}`, html: "" });
  }

  const outText = pickAssistantText(res.json);

function extractJsonObject(s) {
  if (!s) return null;
  const t = String(s).trim();

  // If it's clean JSON already, use it
  try { return JSON.parse(t); } catch {}

  // If it contains extra text, extract the first {...} block
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    const maybe = t.slice(first, last + 1);
    try { return JSON.parse(maybe); } catch {}
  }
  return null;
}

const parsed = extractJsonObject(outText);

if (!parsed || typeof parsed !== "object") {
  // Fail soft (don't break UI)
  return json(200, { ok: true, text: outText || "Done.", html: "" });
}

const reply = String(parsed.reply || "").trim() || "Done.";
const html = String(parsed.html || "").trim();
const safeHtml = isProbablyHTML(html) ? html : "";

return json(200, { ok: true, text: reply, html: safeHtml });
