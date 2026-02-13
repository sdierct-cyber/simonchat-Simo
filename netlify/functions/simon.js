// netlify/functions/simon.js
export async function handler(event) {
  try {
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 200, headers: corsHeaders(), body: "" };
    }
    if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Use POST" });

    const body = safeJsonParse(event.body);
    const message = String(body?.message || "").trim();
    const history = Array.isArray(body?.history) ? body.history : []; // [{role:"user"|"assistant", content:"..."}]

    if (!message) return json(400, { ok: false, error: "Missing message" });

    // ---- Fast lanes FIRST (keep what works) ----
    const intent = detectIntent(message);

    if (intent.kind === "visual_images") {
      const subject = intent.subject || "that";
      const images = await fetchImages(event, subject);
      return json(200, {
        ok: true,
        mode: "friend",
        domain: "VISUAL",
        reply: `Got you. Here are images for "${subject}". Want **surface close-ups**, **from space**, or **rovers**?`,
        preview: { kind: "images", title: `Images: ${subject}`, items: images },
      });
    }

    // ---- Everything else: REAL brain (LLM) ----
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      // fallback if key missing
      return json(200, {
        ok: true,
        mode: "friend",
        domain: intent.kind === "build" ? "BUILDER" : "GENERAL",
        reply:
          "Your OPENAI_API_KEY isn’t set in Netlify yet. Add it, then I’ll respond like full Simo (topic switching + deep help).",
      });
    }

    const mode = intent.kind === "build" ? "builder" : "friend";
    const domain =
      intent.kind === "vent" ? "VENT" :
      intent.kind === "solve" ? "SOLVE" :
      intent.kind === "build" ? "BUILDER" : "GENERAL";

    const instructions = buildSimoInstructions(mode);

    // Keep last ~20 turns to stay fast/cheap
    const clipped = clipHistory(history, 20);

    // Responses API call (modern)
    // Docs: https://platform.openai.com/docs/api-reference/responses
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1", // solid default; you can change later
        instructions,
        input: [
          ...clipped.map(m => ({ role: m.role, content: [{ type: "input_text", text: String(m.content || "") }] })),
          { role: "user", content: [{ type: "input_text", text: message }] }
        ],
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      return json(500, { ok: false, error: "OpenAI error", details: t });
    }

    const data = await resp.json();
    const reply = extractOutputText(data) || "I’m here. Say that again?";

    return json(200, {
      ok: true,
      mode,
      domain,
      reply,
    });
  } catch (err) {
    return json(500, { ok: false, error: String(err?.message || err) });
  }
}

/* -----------------------------
   Simo personality + behavior
------------------------------ */

function buildSimoInstructions(mode) {
  // Friend-first tone, follow topic switches, give usable outputs, minimal therapy-speak.
  // Mode only changes how proactive we are about building artifacts.
  return `
You are "Simo" — a private best-friend AI.

Core rules:
- Track the user's topic as it changes. Do NOT get stuck in one topic.
- If the user asks for something new, follow it naturally.
- Keep responses practical and directly useful (steps, checklists, code blocks when asked).
- Be warm and human, but avoid generic therapy-speak unless user asks for it.
- Never spam "venting/solving/building?" questions. Just respond appropriately.

Mode:
- If mode is friend: prioritize emotional support + clarity + next step.
- If mode is builder: proactively offer concrete outputs (UI mockups, file structures, code) when user asks.

If user asks for images, the system will handle it separately — you don't need to apologize or redirect.
Current mode: ${mode}.
`.trim();
}

/* -----------------------------
   Intent detection (fast lanes)
------------------------------ */
function detectIntent(textRaw) {
  const text = (textRaw || "").trim();
  const t = text.toLowerCase();

  if (isImageRequest(t)) return { kind: "visual_images", subject: extractSubjectForImages(text) };

  if (hasAny(t, [
    "i'm stressed","im stressed","i am stressed",
    "i'm tired","im tired","i'm upset","im upset",
    "anxious","panic","depressed","lonely",
    "argument","fight","im drained","i can't do this","i hate this"
  ])) return { kind: "vent" };

  if (hasAny(t, [
    "fix","bug","error","doesn't work","doesnt work","not working",
    "help me","why is","how do i","step by step","walk me through",
    "issue","problem","debug"
  ])) return { kind: "solve" };

  if (hasAny(t, [
    "build","create","design","make","generate","draft",
    "html","css","javascript","react","ui","app","website",
    "floor plan","home layout","prototype"
  ])) return { kind: "build" };

  return { kind: "general" };
}

function isImageRequest(t) {
  if (t.startsWith("show me how") || t.startsWith("show me the steps")) return false;
  return hasAny(t, [
    "show me images", "show me pictures", "show me photos", "show me pics",
    "images of", "pictures of", "photos of", "pics of",
    "can you show me images", "can you show me pictures", "can you show me photos",
    "show me", "images", "pictures", "photos"
  ]);
}
function extractSubjectForImages(text) {
  let m = text.match(/\b(images|pictures|photos|pics)\s+of\s+(.+)$/i);
  if (m?.[2]) return cleanSubject(m[2]);
  m = text.match(/\bshow\s+me\s+(.+)$/i);
  if (m?.[1]) {
    let s = m[1].replace(/\b(images|pictures|photos|pics)\b/i, "").replace(/\bof\b/i, "");
    return cleanSubject(s);
  }
  return cleanSubject(text);
}
function cleanSubject(s) {
  return String(s || "").replace(/[?.!]+$/g, "").replace(/\s+/g, " ").trim();
}
function hasAny(hay, needles) { return needles.some(n => hay.includes(n)); }

/* -----------------------------
   Call your own search.js for images
------------------------------ */
async function fetchImages(event, subject) {
  const proto = event.headers["x-forwarded-proto"] || "https";
  const host = event.headers.host;
  const url = `${proto}://${host}/.netlify/functions/search?type=images&num=8&q=${encodeURIComponent(subject)}`;

  const resp = await fetch(url);
  if (!resp.ok) return [];
  const data = await resp.json().catch(() => ({}));
  const results = Array.isArray(data.results) ? data.results : [];
  return results.slice(0, 8).map(r => ({
    title: r.title || "Image",
    url: r.imageUrl || r.thumbnailUrl || r.url || "",
    link: r.link || r.url || "",
    source: r.source || ""
  })).filter(x => x.url);
}

/* -----------------------------
   History utils + Responses parsing
------------------------------ */
function clipHistory(history, maxTurns) {
  // Keep only role/content and last N
  const cleaned = history
    .filter(m => m && (m.role === "user" || m.role === "assistant"))
    .map(m => ({ role: m.role, content: String(m.content || "") }));
  return cleaned.slice(Math.max(0, cleaned.length - maxTurns));
}

function extractOutputText(responsesJson) {
  // Responses API returns output array with content parts
  // We try to pull all output_text parts.
  const out = responsesJson?.output;
  if (!Array.isArray(out)) return "";
  let text = "";
  for (const item of out) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part?.type === "output_text" && typeof part.text === "string") {
        text += part.text;
      }
    }
  }
  return text.trim();
}

/* -----------------------------
   Netlify helpers
------------------------------ */
function safeJsonParse(s) { try { return JSON.parse(s || "{}"); } catch { return {}; } }
function corsHeaders() {
  return {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST,OPTIONS",
  };
}
function json(statusCode, body) { return { statusCode, headers: corsHeaders(), body: JSON.stringify(body) }; }
