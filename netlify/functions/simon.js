// netlify/functions/simon.js
// Simo backend (stable-v4): Responses API + strict HTML rules for building.
// Note: Thread memory is client-sent for stability; server remains stateless.

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return ok(200, "");
    if (event.httpMethod !== "POST") return j(405, { ok:false, error:"Use POST" });

    const body = safeJson(event.body);
    const mode = (body.mode || "general").toString();
    const pro = !!body.pro;
    const input = (body.input || "").toString();
    const activeHTML = (body.activeHTML || "").toString();
    const msgs = Array.isArray(body.messages) ? body.messages : [];

    if (!input.trim()) return j(400, { ok:false, error:"Missing input" });

    const system = buildSystem(mode, pro);

    // Build a compact conversation
    const conversation = [];
    conversation.push({ role: "system", content: system });

    // If we have active HTML and we’re building/editing, include it as context
    if (activeHTML && shouldBuild(mode, input)) {
      conversation.push({
        role: "system",
        content: `CURRENT_ACTIVE_HTML (use this as the source of truth and edit it when user says change/add/remove/continue):\n\n${activeHTML}`
      });
    }

    // Add last messages
    for (const m of msgs.slice(-28)) {
      const role = m.role === "assistant" ? "assistant" : "user";
      const text = (m.content || m.text || "").toString();
      if (text) conversation.push({ role, content: text });
    }

    // Add latest user input
    conversation.push({ role: "user", content: input });

    const model = "gpt-4.1"; // stable default in docs/examples :contentReference[oaicite:1]{index=1}
    const result = await callOpenAI(conversation, model);

    const replyText = (result.text || "").trim();

    // Extract HTML if present
    const html = extractHTML(replyText);

    const reply = html
      ? stripHTMLFromReply(replyText).trim() || "Done."
      : replyText || "Done.";

    return j(200, {
      ok: true,
      reply,
      html: html || ""
    });

  } catch (e) {
    return j(500, { ok:false, error:"Server error", details: String(e && e.message ? e.message : e) });
  }
};

function shouldBuild(mode, input){
  const t = input.toLowerCase();
  if (mode === "building") return true;
  return ["build", "landing page", "website", "app", "preview", "add ", "remove ", "change ", "continue", "next"].some(k => t.includes(k));
}

function buildSystem(mode, pro){
  const spirit = `
You are Simo — human as possible: loyal, sharp, present.
When the user vents: respond like a private best friend. No therapy clichés unless asked.
When the user builds: ship paste-ready results. Keep momentum. Do not reset unless asked.
Do NOT loop with “I’m here. What do you want to do next?” — only ask a question if truly needed.
  `.trim();

  const htmlRules = `
CRITICAL HTML RULES (must follow):
- If the user is BUILDING or EDITING/CONTINUING a build, you MUST return a COMPLETE HTML document every time:
  It MUST start with <!doctype html> and include <html> ... </html> (full document).
- Your HTML MUST include:
  <meta name="color-scheme" content="dark">
  and a dark base so preview never flashes white:
    html,body{background:#0b1020;color:#eaf0ff;margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
- Never use source.unsplash.com (it often breaks).
- Use reliable images that always load:
  https://picsum.photos/seed/<seed>/1200/800
  Example:
    https://picsum.photos/seed/p1-mountain-bike-snow/1200/800
- IMAGE CONSISTENCY RULE:
  Each product image must use a stable seed by slot:
    Product 1 image src MUST be https://picsum.photos/seed/p1-<keywords>/1200/800
    Product 2 image src MUST be https://picsum.photos/seed/p2-<keywords>/1200/800
    Product 3 image src MUST be https://picsum.photos/seed/p3-<keywords>/1200/800
  When user says "change image 1 to: X", you MUST:
    - change alt text to X
    - change ONLY product 1 image src seed to include X (slugged)
    - keep other product images unchanged
- Every <img> MUST include onerror fallback:
  onerror="this.onerror=null;this.src='https://picsum.photos/seed/fallback/1200/800';"
- Keep it self-contained (inline CSS). No external JS frameworks.
- When the user says "continue/next/add/change/remove", edit CURRENT_ACTIVE_HTML and return the full updated document.
- Do NOT claim “updated preview” unless you actually included the full HTML in your output.
  `.trim();

  const behavior = shouldBuild(mode, "") ? `\n\n${htmlRules}` : "";

  // Pro can be used to be more “builder-ish” but must not change safety.
  const proBoost = pro ? `\n\nPRO MODE: be extra thorough, include sections like pricing/FAQ/testimonials when requested.` : "";

  return `${spirit}${behavior}${proBoost}`;
}

async function callOpenAI(conversation, model){
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  // Use Responses API input format correctly :contentReference[oaicite:2]{index=2}
  const input = conversation.map(m => ({
    role: m.role,
    content: [{ type: "input_text", text: m.content }]
  }));

  const payload = {
    model,
    input,
    temperature: 0.6
  };

  const r = await fetchWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }, 30000);

  const text = await r.text();
  const data = safeJson(text);

  if (!r.ok) {
    const msg = (data && data.error && data.error.message) ? data.error.message : `OpenAI error (${r.status})`;
    throw new Error(msg);
  }

  // Extract assistant text from output messages
  const out = (data.output || []).find(x => x.type === "message" && x.role === "assistant");
  const parts = out && Array.isArray(out.content) ? out.content : [];
  const tpart = parts.find(p => p.type === "output_text");
  return { text: (tpart && tpart.text) ? tpart.text : "" };
}

function extractHTML(replyText){
  const t = String(replyText || "");
  // Prefer full doc
  const m = t.match(/<!doctype html[\s\S]*<\/html>/i);
  return m ? m[0].trim() : "";
}

function stripHTMLFromReply(replyText){
  const t = String(replyText || "");
  const html = extractHTML(t);
  if (!html) return t;
  return t.replace(html, "").replace(/\n{3,}/g, "\n\n");
}

function safeJson(s){
  try { return JSON.parse(s); } catch { return null; }
}

function j(statusCode, obj){
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST,OPTIONS"
    },
    body: JSON.stringify(obj)
  };
}

function ok(statusCode, body){
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST,OPTIONS"
    },
    body
  };
}

async function fetchWithTimeout(url, opts, ms){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}
