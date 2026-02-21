// netlify/functions/simon.js — Simo backend (stable V2)
// Uses OpenAI Responses API via fetch.
// Enforces full HTML in building/editing mode and carries CURRENT_ACTIVE_HTML forward.

const OPENAI_URL = "https://api.openai.com/v1/responses";

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(obj),
  };
}

function ok(obj) { return json(200, { ok: true, ...obj }); }
function bad(status, msg, extra = {}) { return json(status, { ok: false, error: msg, ...extra }); }

function safeParse(body) {
  try { return JSON.parse(body || "{}"); } catch { return null; }
}

function extractOutputText(resp) {
  if (!resp) return "";
  if (typeof resp.output_text === "string" && resp.output_text.trim()) return resp.output_text.trim();

  // fallback parse
  const out = resp.output;
  if (Array.isArray(out)) {
    let text = "";
    for (const item of out) {
      const content = item?.content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (c?.type === "output_text" && typeof c?.text === "string") text += c.text;
      }
    }
    return (text || "").trim();
  }
  return "";
}

function findHtmlInText(t) {
  const s = String(t || "");
  const idx = s.toLowerCase().indexOf("<!doctype html");
  if (idx >= 0) return s.slice(idx).trim();
  return "";
}

function buildSystem(mode, pro) {
  const spirit = `
You are Simo — human as possible: loyal, sharp, present.
When the user vents: respond like a private best friend. No therapy clichés unless asked.
When the user builds: ship paste-ready results. Keep momentum. Do not reset unless asked.
Be concise and useful.
`.trim();

  const htmlRules = `
CRITICAL HTML RULES (must follow):
- If mode is BUILDING, or the user is EDITING/CONTINUING a build, you MUST return a COMPLETE HTML document every time.
  It MUST start with <!doctype html> and include <html> ... </html>.
- HTML must include:
  <meta name="color-scheme" content="dark">
  and a dark base (no white flash):
    body { background:#0b1020; color:#eaf0ff; margin:0; font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; }
- Never use source.unsplash.com.
- Use reliable images that always load:
  Use https://picsum.photos/seed/<seed>/1200/800
  Examples:
    https://picsum.photos/seed/p1-mountain-bike-snow/1200/800
    https://picsum.photos/seed/p2-road-bike/1200/800
- IMAGE CONSISTENCY RULE:
  Each product image must use a stable seed by slot:
    Product 1: https://picsum.photos/seed/p1-<keywords>/1200/800
    Product 2: https://picsum.photos/seed/p2-<keywords>/1200/800
    Product 3: https://picsum.photos/seed/p3-<keywords>/1200/800
  When the user says "change image 1 to: X", you MUST:
    - change alt text to X
    - change ONLY product 1 image src to seed p1-<slugged X>
    - keep other product images unchanged
- Every <img> must include onerror fallback:
  onerror="this.onerror=null;this.src='https://picsum.photos/seed/fallback/1200/800';"
- Keep it self-contained (inline CSS). No external JS frameworks.
- When the user says "continue/next/add/change/remove", edit CURRENT_ACTIVE_HTML and return the full updated document.
- Do NOT claim “updated preview” unless you actually returned full HTML.
`.trim();

  const proNote = pro ? `Pro is ON. You may include a tiny "Export" hint in the HTML footer, but keep the page clean.` : `Pro is OFF. Keep it clean.`;

  return `${spirit}\n\nMode: ${mode}\n${proNote}\n\n${mode === "building" ? htmlRules : ""}`.trim();
}

function buildPrompt({ mode, pro, input, messages, currentHtml }) {
  const sys = buildSystem(mode, pro);

  // Build conversation summary for continuity
  const lastTurns = (Array.isArray(messages) ? messages : []).slice(-20)
    .map(m => `${m.role === "user" ? "User" : "Simo"}: ${String(m.text || "").trim()}`)
    .join("\n");

  const htmlContext = currentHtml
    ? `CURRENT_ACTIVE_HTML (edit this when user asks changes/continue):\n${currentHtml}\n`
    : `CURRENT_ACTIVE_HTML: (none yet)\n`;

  return `
SYSTEM:
${sys}

CONVERSATION (recent):
${lastTurns || "(none)"}

${mode === "building" ? htmlContext : ""}

USER REQUEST:
${input}

INSTRUCTIONS:
- If mode is BUILDING, return ONLY the final answer the user should see.
- If BUILDING, include the full HTML document in your response (starting <!doctype html>).
- If GENERAL, reply normally in Simo style.
`.trim();
}

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);

  try {
    const r = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: prompt,          // IMPORTANT: string input is the safest format
        max_output_tokens: 1800,
      }),
      signal: ctrl.signal,
    });

    const raw = await r.text();
    let data = null;
    try { data = JSON.parse(raw); } catch { /* keep null */ }

    if (!r.ok) {
      const details = data?.error?.message || raw || `HTTP ${r.status}`;
      const e = new Error(details);
      e.status = r.status;
      throw e;
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return bad(405, "Use POST");

  const body = safeParse(event.body);
  if (!body) return bad(400, "Bad JSON");

  const mode = (body.mode === "building" ? "building" : "general");
  const pro = !!body.pro;
  const input = String(body.input || "").trim();
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const currentHtml = String(body.currentHtml || "").trim();

  if (!input) return bad(400, "Missing input");

  try {
    const prompt = buildPrompt({ mode, pro, input, messages, currentHtml });
    const resp = await callOpenAI(prompt);
    const text = extractOutputText(resp);

    if (!text) return ok({ reply: "I didn’t get a usable response. Try again." });

    const html = mode === "building" ? findHtmlInText(text) : "";
    const reply = text.trim();

    return ok({
      reply,
      html: html || undefined,
    });
  } catch (e) {
    const msg = String(e?.message || e);
    const status = e?.status || 500;
    return bad(status, msg);
  }
};
