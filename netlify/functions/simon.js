// netlify/functions/simon.js
// Simo backend (stable):
// - OpenAI Responses API for chat + HTML builds
// - Pro-only: real images via Serper (Google Images) with hard fallback to Picsum
// - Clear memory / New thread actions supported
// - Always returns { ok, message, html } with ok:true on success

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const SERPER_API_KEY = process.env.SERPER_API_KEY;

// Soft in-memory store (resets on cold starts, but OK for now)
const MEM = new Map(); // threadId -> { turns: [{role, content}] }

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(obj),
  };
}

function safeId(x) {
  return String(x || "default").slice(0, 80);
}

function stripCodeFences(s) {
  if (!s) return "";
  return s.replace(/```[a-zA-Z]*\n([\s\S]*?)```/g, "$1").trim();
}

function extractHtml(text) {
  if (!text) return "";
  const t = stripCodeFences(text);
  const m = t.match(/<!doctype html[\s\S]*<\/html>/i);
  return m ? m[0].trim() : "";
}

function extractTextOutput(respJson) {
  // Prefer output_text if present
  if (typeof respJson?.output_text === "string" && respJson.output_text.trim()) {
    return respJson.output_text.trim();
  }
  // Otherwise walk outputs
  const out = respJson?.output;
  if (!Array.isArray(out)) return "";
  let acc = "";
  for (const item of out) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (c?.type === "output_text" && typeof c?.text === "string") {
        acc += c.text;
      }
    }
  }
  return acc.trim();
}

function buildSystem(mode, pro) {
  const spirit = `
You are Simo — human as possible: loyal, sharp, present.
When the user vents: respond like a private best friend. No therapy clichés unless asked.
When the user builds: ship paste-ready results. Keep momentum. Do not reset unless asked.
`.trim();

  const htmlRules = `
CRITICAL HTML RULES (must follow):
- If mode is BUILDING or the user is EDITING/CONTINUING a build, you MUST return a COMPLETE HTML document every time:
  It MUST start with <!doctype html> and include <html> ... </html>.
- Your HTML must include:
  <meta name="color-scheme" content="dark">
  and a dark base so the preview never flashes white:
    body { background:#0b1020; color:#eaf0ff; margin:0; font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; }
- Never use source.unsplash.com.
- Use reliable images that always load:
  Use https://picsum.photos/seed/<seed>/1200/800
- IMAGE CONSISTENCY RULE:
  Each product image must use a stable seed by slot:
    Product 1 image src must be https://picsum.photos/seed/p1-<keywords>/1200/800
    Product 2 image src must be https://picsum.photos/seed/p2-<keywords>/1200/800
    Product 3 image src must be https://picsum.photos/seed/p3-<keywords>/1200/800
  Treat these as the same command: "image 1 to X", "change image 1 to X", "change image 1 to: X", "set image 1 to X".
- Every <img> tag MUST include an onerror fallback:
  onerror="this.onerror=null;this.src='https://picsum.photos/seed/fallback/1200/800';"
- Keep it self-contained (inline CSS). No external JS frameworks.
- When the user says "continue/next/add/change/remove", edit the CURRENT_ACTIVE_HTML and return the full updated document.
- Do NOT say “updated preview” unless you included full HTML in your response.
`.trim();

  const modeLine =
    mode === "venting"
      ? "MODE: venting. Be direct + supportive. Ask at most 1 question if needed."
      : mode === "solving"
      ? "MODE: solving. Give concrete steps. Minimize rework."
      : mode === "building"
      ? "MODE: building. Return FULL HTML every time."
      : "MODE: general. Be useful and concise.";

  const proLine = pro ? "User is Pro: YES." : "User is Pro: NO.";

  return [spirit, htmlRules, modeLine, proLine].join("\n\n");
}

async function openaiResponse({ system, user }) {
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

  const payload = {
    model: OPENAI_MODEL,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: system }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: user }],
      },
    ],
    temperature: 0.6,
  };

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const txt = await r.text();
  let data;
  try {
    data = JSON.parse(txt);
  } catch {
    throw new Error(`OpenAI non-JSON response: ${txt.slice(0, 200)}`);
  }

  if (!r.ok) {
    const msg = data?.error?.message || `OpenAI error (${r.status})`;
    throw new Error(msg);
  }

  return extractTextOutput(data);
}

async function serperImageUrl(query) {
  if (!SERPER_API_KEY) return null;

  // Serper Images endpoint
  const r = await fetch("https://google.serper.dev/images", {
    method: "POST",
    headers: {
      "X-API-KEY": SERPER_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      num: 5,
      gl: "us",
      hl: "en",
      safe: "active",
    }),
  });

  if (!r.ok) return null;
  const data = await r.json().catch(() => null);
  const images = data?.images;
  if (!Array.isArray(images) || images.length === 0) return null;

  // Prefer imageUrl, fall back to thumbnailUrl
  const pick =
    images.find((x) => typeof x?.imageUrl === "string" && x.imageUrl.startsWith("http")) ||
    images.find((x) => typeof x?.thumbnailUrl === "string" && x.thumbnailUrl.startsWith("http"));

  return pick?.imageUrl || pick?.thumbnailUrl || null;
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Replace first 3 product images with Serper results (Pro only), keep Picsum fallback.
async function injectRealImages(html) {
  if (!html) return html;

  // Find img tags with picsum seed p1-/p2-/p3-
  const imgRe = /<img\b([^>]*?)\bsrc="https:\/\/picsum\.photos\/seed\/(p[123]-[^\/"]+)\/1200\/800"([^>]*?)>/gi;

  const matches = [];
  let m;
  while ((m = imgRe.exec(html)) !== null) {
    matches.push({
      full: m[0],
      before: m[1] || "",
      seed: m[2] || "",
      after: m[3] || "",
      idx: m.index,
    });
    if (matches.length >= 3) break;
  }
  if (matches.length === 0) return html;

  // For each pX-keywords, query Serper with keywords
  let out = html;

  for (const match of matches) {
    const seed = match.seed; // e.g. p1-mountain-bike-snow
    const keywords = seed.replace(/^p[123]-/, "").replace(/-/g, " ").trim();
    const q = keywords ? `${keywords} bike photo` : "bicycle photo";

    const real = await serperImageUrl(q);
    if (!real) continue;

    // Replace only this img src with real URL, keep onerror fallback in tag (or add if missing)
    let newTag = match.full.replace(
      /src="https:\/\/picsum\.photos\/seed\/p[123]-[^\/"]+\/1200\/800"/i,
      `src="${real}"`
    );

    // Ensure onerror fallback exists
    if (!/onerror\s*=/.test(newTag)) {
      // Insert onerror before closing >
      newTag = newTag.replace(
        />$/,
        ` onerror="this.onerror=null;this.src='https://picsum.photos/seed/fallback/1200/800';">`
      );
    }

    out = out.replace(match.full, newTag);
  }

  return out;
}

function ensureDarkMeta(html) {
  if (!html) return html;
  if (!/<meta\s+name="color-scheme"/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>\n<meta name="color-scheme" content="dark">`);
  }
  return html;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return json(200, { ok: true });
    }
    if (event.httpMethod !== "POST") {
      return json(200, { ok: false, error: "Use POST" });
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const action = body.action || null;

    const threadId = safeId(body.threadId || body.thread || "default");
    const mode = (body.mode || "general").toLowerCase();
    const pro = !!body.pro;

    // UI actions
    if (action === "clear_memory") {
      MEM.delete(threadId);
      return json(200, { ok: true, message: "MEM_OK", html: "" });
    }
    if (action === "new_thread") {
      // Create a fresh thread id if caller didn't provide one
      MEM.delete(threadId);
      return json(200, { ok: true, message: "THREAD_OK", html: "" });
    }

    const input =
      body.input ||
      body.message ||
      body.text ||
      body.prompt ||
      "";

    if (!input || !String(input).trim()) {
      return json(200, { ok: true, message: "Say something and I’ll respond.", html: "" });
    }

    // Build memory turns
    if (!MEM.has(threadId)) MEM.set(threadId, { turns: [] });
    const st = MEM.get(threadId);

    // Keep last ~16 turns max to avoid bloat
    st.turns.push({ role: "user", content: String(input).slice(0, 4000) });
    st.turns = st.turns.slice(-16);

    // Compose prompt: include short recent context
    const system = buildSystem(mode, pro);
    const recent = st.turns
      .map((t) => `${t.role === "user" ? "User" : "Simo"}: ${t.content}`)
      .join("\n");

    const user = `${recent}\n\nNow respond as Simo.`;

    const modelText = await openaiResponse({ system, user });

    // Extract HTML if present
    let html = extractHtml(modelText);
    html = ensureDarkMeta(html);

    // If Pro and we have HTML, inject real images (but never break if Serper fails)
    if (pro && html) {
      html = await injectRealImages(html);
    }

    // Create message for chat pane: prefer a short assistant line if not HTML
    let message = modelText;
    if (html) {
      // Keep the message short when HTML exists (your UI doesn't need full HTML in chat)
      message = "Done. I updated the preview on the right.";
    } else {
      message = stripCodeFences(modelText);
      if (message.length > 1200) message = message.slice(0, 1200) + "…";
    }

    // Save assistant turn to memory (store concise)
    st.turns.push({ role: "assistant", content: message });
    st.turns = st.turns.slice(-16);

    return json(200, { ok: true, message, html: html || "" });
  } catch (e) {
    return json(200, {
      ok: false,
      error: e?.message || "Server error",
      html: "",
    });
  }
};
