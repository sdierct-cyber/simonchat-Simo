// netlify/functions/simon.js
// Simo backend: ChatGPT-like behavior for your product:
// - mode: venting/solving/building
// - building ALWAYS returns valid HTML (full document) + a short text confirmation
// - returns stable JSON shape: { ok, text, html, mode, topic }
// - never 500s on bad model output (auto-wrap fallback)

export default async (req) => {
  // CORS (so DevTools fetch works too)
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") {
    return new Response("", { status: 200, headers: cors });
  }

  try {
    if (req.method !== "POST") {
      return json({ ok: false, error: "Use POST" }, 405, cors);
    }

    const body = await req.json().catch(() => ({}));
    const mode = cleanMode(body.mode) || "building";
    const topic = cleanText(body.topic) || "general";
    const input = cleanText(body.input) || "";

    if (!input.trim()) {
      return json({ ok: true, mode, topic, text: "Say something and I’ll respond.", html: "" }, 200, cors);
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return json({ ok: false, error: "Missing OPENAI_API_KEY in Netlify env vars." }, 500, cors);
    }

    // Decide if the user is asking for an HTML build/preview.
    const wantsBuild = mode === "building" || isBuildIntent(input);

    // Build the prompt for the Responses API.
    const messages = buildMessages({ mode, topic, input, wantsBuild });

    // Call OpenAI Responses API
    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini"; // safe default
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: messages,
        // Keep it deterministic-ish
        temperature: wantsBuild ? 0.4 : 0.7,
        max_output_tokens: wantsBuild ? 2200 : 700,
      }),
    });

    const raw = await resp.text();
    if (!resp.ok) {
      return json(
        { ok: false, error: "OpenAI error", status: resp.status, details: safeTrim(raw, 1200) },
        500,
        cors
      );
    }

    const data = JSON.parse(raw);

    // Extract text from response.output_text (Responses API)
    const outText = (data.output_text || "").trim();

    // If building: enforce HTML. If model didn't give HTML, generate safe fallback HTML.
    let html = "";
    let text = "";

    if (wantsBuild) {
      // Try to extract HTML from a fenced block if present; else use output_text directly.
      const extracted = extractHtml(outText);
      if (looksLikeHtml(extracted)) {
        html = normalizeHtml(extracted);
        text = "Done. I updated the preview on the right.";
      } else {
        // Auto-wrap fallback so preview never becomes junk/blank.
        html = wrapAsHtmlDocument({
          title: deriveTitle(input, topic),
          body: outText || "Build generated, but no HTML was returned. Here is the output as a page.",
        });
        text = "I generated the build, but it came back as text—so I wrapped it into a valid HTML page for preview.";
      }
    } else {
      // Not building: just best-friend / solving replies
      text = outText || friendlyFallback(mode);
      html = "";
    }

    return json({ ok: true, mode, topic, text, html }, 200, cors);

  } catch (err) {
    return json({ ok: false, error: err?.message || String(err) }, 500);
  }
};


// ---------- helpers ----------

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function cleanText(x) {
  if (typeof x !== "string") return "";
  return x.replace(/\u0000/g, "").trim();
}

function cleanMode(m) {
  const s = String(m || "").toLowerCase().trim();
  if (["venting", "solving", "building"].includes(s)) return s;
  return "";
}

function safeTrim(s, n) {
  const t = String(s || "");
  return t.length > n ? t.slice(0, n) + "…" : t;
}

function isBuildIntent(input) {
  const t = input.toLowerCase();
  return (
    t.includes("build ") ||
    t.includes("landing page") ||
    t.includes("mockup") ||
    t.includes("wireframe") ||
    t.includes("ui") ||
    t.includes("design") ||
    t.includes("book cover") ||
    t.includes("poster") ||
    t.includes("show me a preview") ||
    t.includes("preview") ||
    t.includes("html")
  );
}

function buildMessages({ mode, topic, input, wantsBuild }) {
  // Responses API accepts an array of "input" items; simplest is {role, content:[{type:"input_text", text:"..."}]}
  // BUT your earlier error shows your integration expects allowed types. So we use plain strings in "input".
  // The API accepts "input" as a string OR array; using array of role/content works but must use correct content type.
  // To avoid the "input_text" vs "output_text" confusion you hit earlier, we send input as a SINGLE STRING.
  // This is the most stable path.

  const sys = systemPrompt(mode, topic, wantsBuild);
  const full = `${sys}\n\nUSER:\n${input}\n`;

  // Return as a plain string (most compatible)
  return full;
}

function systemPrompt(mode, topic, wantsBuild) {
  if (wantsBuild) {
    return `
You are Simo, a fast web builder.
Return ONLY a complete, valid HTML document.
Rules:
- Output must start with <!doctype html>.
- Include <html>, <head>, <body>.
- Use inline CSS in <style>. No external assets.
- Dark theme by default, modern, clean.
- Make it feel like a real product mockup.
- Do NOT include markdown fences unless the entire response is the HTML itself.
- If user asks for a book cover, produce a centered cover mockup with title/subtitle/author and a textured background.
- No explanations. Just the HTML.
Context:
- mode: building
- topic: ${topic}
`.trim();
  }

  if (mode === "venting") {
    return `
You are Simo, the user's private best friend.
Be direct, warm, and human—no therapy clichés.
Ask 1 good question max.
Context:
- mode: venting
- topic: ${topic}
`.trim();
  }

  if (mode === "solving") {
    return `
You are Simo, practical problem-solver.
Give a short plan with numbered steps.
Ask for only essential info.
Context:
- mode: solving
- topic: ${topic}
`.trim();
  }

  return `
You are Simo.
Context:
- mode: ${mode}
- topic: ${topic}
`.trim();
}

function friendlyFallback(mode) {
  if (mode === "venting") return "I’m here. Tell me what happened, start wherever you want.";
  if (mode === "solving") return "Got it. What’s the goal and what’s blocking you right now?";
  return "Tell me what you want to build.";
}

function extractHtml(text) {
  const t = String(text || "").trim();
  // If model returned fenced html, extract it.
  const m = t.match(/```html([\s\S]*?)```/i);
  if (m && m[1]) return m[1].trim();
  return t;
}

function looksLikeHtml(s) {
  const t = String(s || "").trim();
  return /^<!doctype html/i.test(t) || /<html[\s>]/i.test(t) || /<body[\s>]/i.test(t);
}

function normalizeHtml(s) {
  // Ensure doctype exists
  const t = String(s || "").trim();
  if (/^<!doctype html/i.test(t)) return t;
  return "<!doctype html>\n" + t;
}

function wrapAsHtmlDocument({ title, body }) {
  const safeTitle = escapeHtml(String(title || "Simo Build"));
  const safeBody = escapeHtml(String(body || "")).replace(/\n/g, "<br/>");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${safeTitle}</title>
<style>
  :root{--bg:#0b1020;--text:#eaf0ff;--muted:#a9b6d3;--card:rgba(255,255,255,.06);--line:rgba(255,255,255,.12)}
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;background:radial-gradient(1100px 650px at 18% 0%, #162a66 0%, var(--bg) 55%);color:var(--text)}
  .wrap{max-width:900px;margin:0 auto;padding:28px}
  .card{border:1px solid var(--line);background:var(--card);border-radius:18px;padding:18px}
  h1{margin:0 0 10px}
  p{color:var(--muted);line-height:1.5}
  .note{margin-top:12px;font-size:12px;color:var(--muted)}
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>${safeTitle}</h1>
      <p>${safeBody}</p>
      <div class="note">Wrapped into valid HTML for reliable preview.</div>
    </div>
  </div>
</body>
</html>`;
}

function deriveTitle(input, topic) {
  const t = String(input || "").trim();
  if (!t) return "Simo Build";
  // simple heuristic
  if (t.toLowerCase().includes("book cover")) return "Book Cover Mockup";
  if (t.toLowerCase().includes("landing page")) return "Landing Page";
  return topic ? `Build: ${topic}` : "Simo Build";
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}
