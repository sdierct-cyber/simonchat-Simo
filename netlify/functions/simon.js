// netlify/functions/simon.js
export async function handler(event) {
  try {
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: "",
      };
    }

    if (event.httpMethod !== "POST") {
      return json(405, { ok: false, error: "Use POST" });
    }

    const body = safeJsonParse(event.body);
    const message = String(body?.message || "").trim();

    if (!message) return json(400, { ok: false, error: "Missing message" });

    // ---- ROUTE (visual must be FIRST) ----
    const intent = detectIntent(message);

    // Output contract to the frontend:
    // { ok:true, reply, mode, domain, preview? }
    if (intent.kind === "visual_images") {
      const subject = intent.subject || "that";
      const images = await fetchImages(event, subject);

      return json(200, {
        ok: true,
        mode: "friend",
        domain: "VISUAL",
        reply: `Got you. Here are images for "${subject}". Want **surface close-ups**, **from space**, or **rovers**?`,
        preview: {
          kind: "images",
          title: `Images: ${subject}`,
          items: images,
        },
      });
    }

    if (intent.kind === "vent") {
      return json(200, {
        ok: true,
        mode: "friend",
        domain: "VENT",
        reply: `I’m here. What’s the part that’s hitting the hardest right now?`,
      });
    }

    if (intent.kind === "solve") {
      return json(200, {
        ok: true,
        mode: "friend",
        domain: "SOLVE",
        reply: `Alright — tell me what you expected to happen vs what actually happened, and paste any error text.`,
      });
    }

    if (intent.kind === "build") {
      return json(200, {
        ok: true,
        mode: "builder",
        domain: "BUILDER",
        reply: `Cool — I can build that. If you want visuals, say **"show me…"** and tell me what you want on it.`,
      });
    }

    // Default friend chat (NO “venting/solving/building?” loop)
    return json(200, {
      ok: true,
      mode: "friend",
      domain: "GENERAL",
      reply: `I’m here. What do you want to do next?`,
    });
  } catch (err) {
    return json(500, { ok: false, error: String(err?.message || err) });
  }
}

/* -----------------------------
   Intent detection
------------------------------ */

function detectIntent(textRaw) {
  const text = (textRaw || "").trim();
  const t = text.toLowerCase();

  // VISUAL IMAGES (must take priority)
  if (isImageRequest(t)) {
    return { kind: "visual_images", subject: extractSubjectForImages(text) };
  }

  // Venting
  if (hasAny(t, [
    "i'm stressed","im stressed","i am stressed",
    "i'm tired","im tired","i'm upset","im upset",
    "anxious","panic","depressed","lonely",
    "argument","fight","im drained","i can't do this","i hate this"
  ])) {
    return { kind: "vent" };
  }

  // Solve/debug
  if (hasAny(t, [
    "fix","bug","error","doesn't work","doesnt work","not working",
    "help me","why is","how do i","step by step","walk me through",
    "issue","problem","debug"
  ])) {
    return { kind: "solve" };
  }

  // Builder
  if (hasAny(t, [
    "build","create","design","make","generate","draft",
    "html","css","javascript","react","ui","app","website",
    "floor plan","home layout","prototype"
  ])) {
    return { kind: "build" };
  }

  return { kind: "general" };
}

function isImageRequest(t) {
  // avoid "show me how" being treated as visual
  if (t.startsWith("show me how") || t.startsWith("show me the steps")) return false;

  return hasAny(t, [
    "show me images", "show me pictures", "show me photos", "show me pics",
    "images of", "pictures of", "photos of", "pics of",
    "can you show me images", "can you show me pictures", "can you show me photos",
    "show me", "images", "pictures", "photos"
  ]);
}

function extractSubjectForImages(text) {
  const t = text.trim();

  // "images of mars"
  let m = t.match(/\b(images|pictures|photos|pics)\s+of\s+(.+)$/i);
  if (m?.[2]) return cleanSubject(m[2]);

  // "show me images of mars" or "show me mars"
  m = t.match(/\bshow\s+me\s+(.+)$/i);
  if (m?.[1]) {
    let s = m[1];
    s = s.replace(/\b(images|pictures|photos|pics)\b/i, "");
    s = s.replace(/\bof\b/i, "");
    return cleanSubject(s);
  }

  return cleanSubject(text);
}

function cleanSubject(s) {
  return String(s || "")
    .replace(/[?.!]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(hay, needles) {
  return needles.some(n => hay.includes(n));
}

/* -----------------------------
   Image fetch via your search.js function
------------------------------ */

async function fetchImages(event, subject) {
  // Call your own Netlify function: /.netlify/functions/search?type=images&q=...
  const proto = event.headers["x-forwarded-proto"] || "https";
  const host = event.headers.host;
  const url = `${proto}://${host}/.netlify/functions/search?type=images&num=8&q=${encodeURIComponent(subject)}`;

  const resp = await fetch(url);
  if (!resp.ok) return [];

  const data = await resp.json();
  const results = Array.isArray(data.results) ? data.results : [];

  // Return items the frontend can render
  return results.slice(0, 8).map(r => ({
    title: r.title || "Image",
    url: r.imageUrl || r.thumbnailUrl || "",
    link: r.link || "",
    source: r.source || ""
  })).filter(x => x.url);
}

/* -----------------------------
   Utils
------------------------------ */

function safeJsonParse(s) {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}

function corsHeaders() {
  return {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST,OPTIONS",
  };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(body),
  };
}
