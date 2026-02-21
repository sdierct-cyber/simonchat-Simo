// netlify/functions/simon.js
// Stable Simo backend: stateless server, durable client memory.
// Expects POST JSON: { threadId, mode, input, memory:[{role,content}], pro }
// Returns: { ok:true, message, html }

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini"; // safe default; change if you want

function json(statusCode, obj){
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

function extractHtml(text){
  if (!text) return "";
  const t = String(text);

  // ```html ... ```
  const fence = t.match(/```html\s*([\s\S]*?)```/i);
  if (fence && fence[1]) return fence[1].trim();

  // looks like full HTML
  if (/<html[\s>]/i.test(t) && /<\/html>/i.test(t)) return t.trim();

  // sometimes returns only body-ish markup; if it contains tags, wrap it
  if (/<(div|section|main|header|footer|style|script)\b/i.test(t)){
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"></head><body>${t}</body></html>`;
  }

  return "";
}

function safeModeLabel(mode){
  const m = String(mode || "general").toLowerCase();
  return ["venting","solving","building","general"].includes(m) ? m : "general";
}

function buildSystem(mode, pro){
  const base = `You are Simo: a sharp, loyal best-friend assistant who can also build practical outputs.
Rules:
- Stay consistent with the ongoing conversation context provided in memory.
- If the user asks to "continue", continue the most recent relevant work.
- Be direct. No therapy-speak unless asked.
- If building, produce clean, usable output. When returning HTML, include FULL HTML document.`;

  const modeRules = {
    venting: `Mode: venting.
- Be supportive like a best friend. Ask 1–2 tight questions max.
- No generic "communicate better" filler.`,
    solving: `Mode: solving.
- Diagnose and propose steps that reduce risk and rework. Be concrete.`,
    building: `Mode: building.
- Produce a result the user can paste/use. If relevant, return HTML. Keep it clean and modern.`
  };

  const proLine = pro ? `User is Pro: YES (they can Save/Download/Library).` : `User is Pro: NO.`;

  return [base, modeRules[mode] || modeRules.general || "", proLine].filter(Boolean).join("\n\n");
}

async function callOpenAI({ system, memory, input }){
  const messages = [];

  // system instruction
  messages.push({
    role: "system",
    content: system
  });

  // memory turns (user+assistant)
  for (const m of (memory || [])){
    if (!m || !m.role || !m.content) continue;
    const role = m.role === "user" ? "user" : (m.role === "assistant" ? "assistant" : null);
    if (!role) continue;
    messages.push({ role, content: String(m.content).slice(0, 6000) });
  }

  // current input
  messages.push({ role:"user", content: String(input || "") });

  const body = {
    model: MODEL,
    input: messages,
   max_output_tokens: 650,
    // Ask for plain text; we parse HTML if it appears
    text: { format: { type: "text" } }
  };

  const r = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const raw = await r.text();
  let data;
  try{ data = JSON.parse(raw); } catch { data = null; }

  if (!r.ok){
    return { ok:false, error: "OpenAI error", details: raw.slice(0, 1200) };
  }

  // Responses API: text is often in output_text on convenience, but safest: scan output
  let outText = "";
  if (data && typeof data.output_text === "string"){
    outText = data.output_text;
  } else if (data && Array.isArray(data.output)){
    // try to find any text chunks
    for (const item of data.output){
      const content = item?.content || [];
      for (const c of content){
        if (c?.type === "output_text" && typeof c.text === "string"){
          outText += c.text;
        }
      }
    }
  }

  outText = (outText || "").trim();
  if (!outText) outText = "I’m here. Tell me what you want to do next.";

  return { ok:true, text: outText };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS"){
    return json(200, { ok:true });
  }
  if (event.httpMethod !== "POST"){
    return json(405, { ok:false, error:"Use POST" });
  }

  try{
    const body = JSON.parse(event.body || "{}");
    const input = (body.input || "").trim();
    if (!input){
      return json(200, { ok:true, message:"Say something and I’ll respond.", html:"" });
    }

    const mode = safeModeLabel(body.mode);
    const pro = !!body.pro;
    const memory = Array.isArray(body.memory) ? body.memory : [];

    const system = buildSystem(mode, pro);

    const ai = await callOpenAI({ system, memory, input });
    if (!ai.ok){
      return json(200, { ok:false, error: ai.error, details: ai.details || "" });
    }

    const message = ai.text;
    const html = extractHtml(message);

    // If we extracted HTML from the response, keep message human-friendly:
    // Optionally strip the HTML fence text from message (but keep it simple).
    const cleanMessage = message.replace(/```html[\s\S]*?```/ig, "Done. I updated the preview on the right.").trim();

    return json(200, { ok:true, message: cleanMessage, html: html || "" });
  }catch(e){
    return json(200, { ok:false, error:"Server error", details: String(e?.message || e).slice(0, 600) });
  }
};
