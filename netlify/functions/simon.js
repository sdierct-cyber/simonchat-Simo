// netlify/functions/simon.js
// Simo backend (stable):
// - POST-only JSON API
// - Uses OpenAI Responses API (correct input_text)
// - Returns { ok, reply, html, message } and never crashes on bad model output
// - Optional SERPER image lookup (fallback to picsum)

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
const SERPER_API_KEY = process.env.SERPER_API_KEY;

// In-memory “best effort” memory (note: serverless is not guaranteed persistent)
const THREADS = globalThis.__SIMO_THREADS__ || (globalThis.__SIMO_THREADS__ = new Map());

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      "cache-control": "no-store",
    },
    body: JSON.stringify(obj),
  };
}

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function getThread(threadId) {
  const id = (threadId && String(threadId).trim()) || "default";
  if (!THREADS.has(id)) THREADS.set(id, { messages: [], activeHtml: "" });
  return THREADS.get(id);
}

function clampMessages(msgs, max = 18) {
  if (!Array.isArray(msgs)) return [];
  return msgs.slice(-max);
}

function buildSystem(mode, pro) {
  const spirit = `
You are Simo — human as possible: loyal, sharp, present.
When the user vents: respond like a private best friend. No therapy clichés unless asked.
When the user builds: ship paste-ready results. Keep momentum. Do not reset unless asked.
Be concise, useful, and consistent. Never gaslight or claim you updated something unless you did.
`.trim();

  const htmlRules = `
CRITICAL HTML RULES (must follow):
- If the user is BUILDING or EDITING/CONTINUING a build, you MUST return a COMPLETE HTML document every time.
  It MUST start with <!doctype html> and include <html> ... </html>.
- Always include: <meta name="color-scheme" content="dark">
- Always use a dark base so preview never flashes white:
  body{background:#0b1020;color:#eaf0ff;margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;}
- Never use source.unsplash.com (it can break / 3rd-party errors).
- Default image source MUST be reliable:
  https://picsum.photos/seed/<seed>/1200/800
- IMAGE CONSISTENCY RULE (important):
  Product 1 image src MUST be https://picsum.photos/seed/p1-<keywords>/1200/800
  Product 2 image src MUST be https://picsum.photos/seed/p2-<keywords>/1200/800
  Product 3 image src MUST be https://picsum.photos/seed/p3-<keywords>/1200/800
  When the user says "change image 1 to: X", you MUST:
    - change ONLY product 1 image seed to p1-<slug(X)>
    - update the alt text to X
    - keep product 2 and 3 image seeds unchanged
- Every <img> MUST include onerror fallback:
  onerror="this.onerror=null;this.src='https://picsum.photos/seed/fallback/1200/800';"
- Keep the HTML self-contained (inline CSS). No external frameworks.
- If the user says "continue/next/add/change/remove", edit CURRENT_ACTIVE_HTML and return the full updated document.
`.trim();

  const outputContract = `
OUTPUT CONTRACT:
Return ONE JSON object only (no markdown fences).
{
  "reply": "what you say in chat (friendly, useful)",
  "html":  "full HTML document string or empty string if not building"
}
Rules:
- If building/editing a page: html MUST be a full document (<!doctype html>...).
- If not building: html MUST be "" (empty string).
`.trim();

  const modeLine = `Current mode: ${mode || "general"} | Pro: ${pro ? "ON" : "OFF"}`;
  return [spirit, modeLine, htmlRules, outputContract].join("\n\n");
}

// Optional: use Serper for *image URL suggestions*.
// We only use it if SERPER_API_KEY exists AND caller asks for it via `useSerper: true`.
async function serperImageUrl(query) {
  if (!SERPER_API_KEY) return null;
  const r = await fetch("https://google.serper.dev/images", {
    method: "POST",
    headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: 1 }),
  });
  if (!r.ok) return null;
  const data = await r.json().catch(() => null);
  const first = data && Array.isArray(data.images) && data.images[0];
  const url = first && (first.imageUrl || first.thumbnailUrl || first.link);
  return (url && typeof url === "string") ? url : null;
}

async function callOpenAI({ system, user, model }) {
  if (!OPENAI_API_KEY) {
    return { ok: false, error: "Missing OPENAI_API_KEY in Netlify env vars." };
  }

  const payload = {
    model: model || "gpt-4.1-mini",
    input: [
      { role: "system", content: [{ type: "input_text", text: system }] },
      { role: "user",   content: [{ type: "input_text", text: user }] },
    ],
  };

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const raw = await r.text();
  if (!r.ok) {
    return { ok: false, error: `OpenAI ${r.status}`, details: raw.slice(0, 2000) };
  }

  // Responses API can include output_text in different shapes; safest is to collect text blocks.
  const data = safeJsonParse(raw);
  let text = "";

  if (data && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c && c.type === "output_text" && typeof c.text === "string") {
            text += c.text;
          }
        }
      }
    }
  }

  text = (text || "").trim();
  return { ok: true, text, raw: data };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

    if (event.httpMethod !== "POST") {
      return json(405, { ok: false, error: "Use POST" });
    }

    const body = safeJsonParse(event.body || "{}") || {};
    const {
      input = "",
      mode = "general",
      pro = false,
      threadId = "default",
      command = "",
      useSerper = false,
      model = "gpt-4.1-mini",
    } = body;

    const t = getThread(threadId);

    // Commands (from UI buttons)
    if (command === "clear_memory") {
      t.messages = [];
      t.activeHtml = "";
      return json(200, { ok: true, message: "MEM_OK", html: "" });
    }
    if (command === "new_thread") {
      const newId = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      THREADS.set(newId, { messages: [], activeHtml: "" });
      return json(200, { ok: true, message: "THREAD_OK", threadId: newId });
    }

    const userText = String(input || "").trim();
    if (!userText) return json(200, { ok: true, reply: "Say something and I’m on it.", html: t.activeHtml || "" });

    // Build a “current active html” hint for continuing edits
    const activeHint = t.activeHtml
      ? `CURRENT_ACTIVE_HTML (edit this when user continues):\n${t.activeHtml.slice(0, 8000)}`
      : `CURRENT_ACTIVE_HTML: (none yet)`;

    const system = buildSystem(mode, pro);
    const user = `${activeHint}\n\nUser says:\n${userText}`;

    const res = await callOpenAI({ system, user, model });

    if (!res.ok) {
      return json(200, { ok: false, error: res.error, details: res.details || "" });
    }

    // Model must return JSON object (reply/html). Parse it safely.
    const parsed = safeJsonParse(res.text);
    if (!parsed || typeof parsed !== "object") {
      // Don’t crash; return helpful error
      return json(200, {
        ok: false,
        error: "Model did not return valid JSON.",
        details: res.text.slice(0, 1200),
      });
    }

    let reply = typeof parsed.reply === "string" ? parsed.reply : "";
    let html = typeof parsed.html === "string" ? parsed.html : "";
    // --- reply guard: if HTML was produced but reply is vague, fix it ---
const hasHtmlDoc = html && html.trim().toLowerCase().startsWith("<!doctype html");
const vague = (reply || "").trim().toLowerCase();

if (hasHtmlDoc) {
  const tooGeneric =
    vague === "" ||
    vague === "i’m here. what do you want to do next?" ||
    vague === "i'm here. what do you want to do next?" ||
    vague === "i'm here" ||
    vague.includes("what do you want to do next");

  if (tooGeneric) {
    reply =
      "Done — I built it and rendered it in Preview. " +
      "Tell me edits like: `headline: ...`, `add testimonials`, `change image 1 to: ...`, `add pricing`, `remove faq`.";
  }
}

    // Optional: if user requests image changes AND serper enabled, we can swap seeds to real URLs
    // BUT we keep this conservative: only if useSerper true AND SERPER_API_KEY exists.
    if (useSerper && SERPER_API_KEY && html && /<img\b/i.test(html)) {
      // Light touch: replace any picsum src that looks like p1-<keywords> with a serper URL for that keywords
      // If Serper fails, keep original.
      const imgSeedMatches = [...html.matchAll(/https:\/\/picsum\.photos\/seed\/(p[123]-[^\/]+)\/1200\/800/g)];
      for (const m of imgSeedMatches) {
        const seed = m[1]; // e.g. p1-mountain-bike-snow
        const query = seed.replace(/^p[123]-/, "").replace(/-/g, " ");
        const url = await serperImageUrl(query);
        if (url) {
          html = html.replaceAll(`https://picsum.photos/seed/${seed}/1200/800`, url);
        }
      }
    }

    // Update thread memory
    t.messages.push({ role: "user", text: userText });
    t.messages.push({ role: "assistant", text: reply });
    t.messages = clampMessages(t.messages);

    // Update active HTML only if it looks like a full HTML doc
    if (typeof html === "string" && html.trim().toLowerCase().startsWith("<!doctype html")) {
      t.activeHtml = html;
    } else if (html && typeof html === "string" && html.trim() !== "") {
      // If model returned partial HTML, we refuse to cache it (prevents broken preview)
      html = "";
    }

    return json(200, { ok: true, reply, html: t.activeHtml || "" });
  } catch (err) {
    return json(200, { ok: false, error: "Function crashed", details: String(err && err.stack ? err.stack : err) });
  }
};
