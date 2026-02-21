// netlify/functions/simon.js
const OPENAI_URL = "https://api.openai.com/v1/responses";

function jres(statusCode, obj){
  return {
    statusCode,
    headers: {
      "Content-Type":"application/json",
      "Access-Control-Allow-Origin":"*",
      "Access-Control-Allow-Headers":"Content-Type",
      "Access-Control-Allow-Methods":"POST,OPTIONS"
    },
    body: JSON.stringify(obj)
  };
}

function safeMode(mode){
  const m = String(mode || "general").toLowerCase();
  return ["venting","solving","building","general"].includes(m) ? m : "general";
}

function msgItem(role, text, kind){
  return {
    type: "message",
    role,
    content: [{ type: kind, text: String(text || "") }]
  };
}

function buildSystem(mode, pro){
  const spirit = `
You are Simo — human as possible: loyal, sharp, present.
When the user vents: respond like a private best friend (no therapy clichés unless asked).
When the user builds: respond like a builder who ships paste-ready results.
Keep momentum. Don't reset the conversation unless asked.
  `.trim();

  const stability = `
STABILITY RULES (critical):
- If the user says "continue", "next", "add", "change", "remove", "tweak", treat it as edits to the CURRENT active build.
- In building mode, always output EITHER:
  (A) a full HTML document (<!doctype html> ... </html>) OR
  (B) a short message explaining why no HTML was produced.
- Never use placeholder image domains like example.com.
- Use reliable real images so preview renders:
  Prefer: https://source.unsplash.com/1200x800/?<keywords>
- Keep HTML self-contained (inline CSS). Avoid external JS frameworks.
  `.trim();

  const proLine = pro ? `User is Pro: YES.` : `User is Pro: NO (still help fully; UI gates Save/Download/Library).`;

  const modeLine = mode === "venting"
    ? "MODE: venting. Be direct + supportive. Ask at most 1 question if needed."
    : mode === "solving"
    ? "MODE: solving. Give concrete steps. Minimize rework."
    : mode === "building"
    ? "MODE: building. Return full HTML when appropriate. Use real images."
    : "MODE: general. Be useful and concise.";

  return [spirit, stability, modeLine, proLine].join("\n\n");
}

function extractAssistantText(data){
  const out = Array.isArray(data?.output) ? data.output : [];
  let text = "";
  for (const item of out){
    if (item?.type === "message" && item?.role === "assistant"){
      for (const c of (Array.isArray(item.content) ? item.content : [])){
        if (c?.type === "output_text" && typeof c.text === "string"){
          text += c.text;
        }
      }
    }
  }
  return (text || "").trim();
}

function extractHtml(text){
  if (!text) return "";
  const t = String(text);

  const fence = t.match(/```html\s*([\s\S]*?)```/i);
  if (fence && fence[1]) return fence[1].trim();

  if (/<html[\s>]/i.test(t) && /<\/html>/i.test(t)) return t.trim();

  return "";
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jres(200, { ok:true });
  if (event.httpMethod !== "POST") return jres(405, { ok:false, error:"Use POST" });

  try{
    const body = JSON.parse(event.body || "{}");
    const input = String(body.input || "").trim();
    if (!input) return jres(200, { ok:true, message:"Say something and I’ll respond.", html:"" });

    const mode = safeMode(body.mode);
    const pro = !!body.pro;

    const memory = Array.isArray(body.memory) ? body.memory : [];
    const lastHtml = String(body.lastHtml || "").trim();
    const system = buildSystem(mode, pro);

    const items = [];
    items.push(msgItem("system", system, "input_text"));

    // Provide lastHtml as context ONLY when it exists (helps "continue/edit" stay consistent)
    if (lastHtml && lastHtml.length > 60) {
      items.push(msgItem(
        "system",
        `CURRENT_ACTIVE_HTML (edit this when user requests changes):\n${lastHtml.slice(0, 38000)}`,
        "input_text"
      ));
    }

    // Memory: user as input_text, assistant as output_text
    for (const m of memory){
      if (!m || !m.role || !m.content) continue;
      const role = m.role === "user" ? "user" : (m.role === "assistant" ? "assistant" : null);
      if (!role) continue;
      const kind = role === "assistant" ? "output_text" : "input_text";
      items.push(msgItem(role, String(m.content).slice(0, 6000), kind));
    }

    items.push(msgItem("user", input, "input_text"));

    const reqBody = {
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: items,
      max_output_tokens: 750,
      truncation: "auto",
      text: { format: { type: "text" } }
    };

    const r = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(reqBody)
    });

    const raw = await r.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = null; }

    if (!r.ok || !data){
      return jres(200, { ok:false, error:"OpenAI error", details: raw.slice(0, 1200) });
    }

    const text = extractAssistantText(data);
    const message = text || "I’m here. What do you want to do next?";
    const html = extractHtml(message);

    // If HTML exists, replace the code block with a clean confirmation in chat
    const cleanMessage = html
      ? message.replace(/```html[\s\S]*?```/ig, "Done. I updated the preview on the right.").trim()
      : message;

    return jres(200, { ok:true, message: cleanMessage, html: html || "" });
  }catch(e){
    return jres(200, { ok:false, error:"Server error", details: String(e?.message || e).slice(0, 600) });
  }
};
