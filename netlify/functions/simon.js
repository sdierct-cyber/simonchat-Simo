// netlify/functions/simon.js
// Simo backend: best-friend + solver + builder with edit-in-place previews.
// Endpoint: POST { message, mode, pro, state }  (mode: venting|solving|building)
// Returns: { ok, assistant, preview_html?, kind?, title?, state }

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"; // change in Netlify env if needed

exports.handler = async (event) => {
  try {
    // Health / info
    if (event.httpMethod === "GET") {
      return json(200, {
        version: "simo-backend-2026-02-17a",
        ok: true,
        note: "POST {message, mode} to generate previews."
      });
    }

    if (event.httpMethod !== "POST") {
      return json(405, { ok: false, error: "Method not allowed" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return json(500, { ok: false, error: "Missing OPENAI_API_KEY in Netlify environment variables." });
    }

    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { ok: false, error: "Invalid JSON body." });
    }

    const message = (body.message || "").toString().trim();
    const mode = (body.mode || "building").toString().trim().toLowerCase();
    const pro = !!body.pro;

    const incomingState = body.state && typeof body.state === "object" ? body.state : {};
    const state = {
      current_kind: incomingState.current_kind || null,
      current_title: incomingState.current_title || null,
      current_html: incomingState.current_html || null,
      // lightweight memory of what we built last
      last_user_goal: incomingState.last_user_goal || null
    };

    if (!message) {
      return json(400, { ok: false, error: "Missing message" });
    }

    // 1) Quick deterministic “edit Pro price” (fast + reliable)
    const priceEdit = detectProPriceEdit(message, state.current_html);
    if (priceEdit && state.current_html) {
      const updated = applyProPriceEdit(state.current_html, priceEdit.newPrice);
      state.current_html = updated;
      state.current_kind = state.current_kind || "landing_page";
      state.current_title = state.current_title || "Updated (price edit)";
      return json(200, {
        ok: true,
        assistant: `Done. I updated the **Pro** price to **$${priceEdit.newPrice}/mo** (kept layout).`,
        preview_html: state.current_html,
        kind: state.current_kind,
        title: state.current_title,
        state
      });
    }

    // 2) Decide whether to BUILD or EDIT or just CHAT
    // Heuristic: if there's current_html and user says "change/edit/update" => edit
    // otherwise if building mode or user asks for preview/layout/page => build
    const wantsEdit = !!state.current_html && /\b(edit|change|update|swap|replace|fix|adjust|modify)\b/i.test(message);
    const wantsBuild = (mode === "building") || /\b(preview|mockup|landing page|pricing|dashboard|layout|resume|site|webpage)\b/i.test(message);

    let action = "chat";
    if (wantsEdit) action = "edit";
    else if (wantsBuild) action = "build";

    // 3) Compose system prompt (ChatGPT-like personality)
    const system = makeSystemPrompt({ mode, pro });

    // 4) Call OpenAI once to generate assistant text + (optional) html
    const result = await callOpenAI_JSON(apiKey, DEFAULT_MODEL, system, {
      action,
      mode,
      pro,
      message,
      state
    });

    // If model fails to return JSON, fall back gracefully
    if (!result || typeof result !== "object") {
      return json(200, {
        ok: true,
        assistant: fallbackAssistant(mode),
        state
      });
    }

    // expected result shape:
    // { assistant: string, kind?: string, title?: string, html?: string, update_html_only?: boolean }
    const assistant = (result.assistant || "").toString().trim() || "Okay.";
    const kind = (result.kind || "").toString().trim() || state.current_kind || null;
    const title = (result.title || "").toString().trim() || state.current_title || null;

    let preview_html = null;

    if (result.html && typeof result.html === "string" && result.html.trim().length > 20) {
      // If action is edit, model should return a full HTML doc
      preview_html = normalizeHtmlDoc(result.html);
      state.current_html = preview_html;
      state.current_kind = kind || state.current_kind || "preview";
      state.current_title = title || state.current_title || "Preview";
      state.last_user_goal = message;
    } else {
      // no html returned
      if (action === "edit" && state.current_html) {
        // model didn't edit; gently tell user what to do
        // (but keep current preview)
      }
    }

    return json(200, {
      ok: true,
      assistant,
      preview_html,
      kind: state.current_kind,
      title: state.current_title,
      state
    });
  } catch (err) {
    return json(500, { ok: false, error: "Server error", details: String(err?.stack || err?.message || err) });
  }
};

// -----------------------------
// Prompts
// -----------------------------
function makeSystemPrompt({ mode, pro }) {
  const bestFriend = `
You are "Simo" — a private best friend + builder.
Be natural, supportive, and direct. Avoid generic therapy-speak unless asked.
If user vents, validate feelings and ask 1 grounded question.
If user wants solutions, give steps and options. If user wants building, produce real artifacts.
`;

  const modeRules = {
    venting: `
MODE: VENTING
- Keep it human and supportive.
- No lectures. No clichés.
- Ask one simple question that helps them continue.
`,
    solving: `
MODE: SOLVING
- Ask at most ONE clarifying question only if absolutely necessary.
- Otherwise give a short plan + next action.
`,
    building: `
MODE: BUILDING
- Default to producing an artifact (HTML preview) when user asks for layouts/pages/previews.
- If user asks to edit, edit the existing HTML in-place. Keep layout unless asked to redesign.
`
  };

  const proNote = pro
    ? `PRO: enabled. You may suggest tool-like capabilities (research, resume builder, etc.), but do not claim to browse unless the system provides it.`
    : `PRO: disabled. Keep outputs lightweight; still can build HTML previews locally (no browsing).`;

  // JSON response contract:
  // Must respond ONLY in strict JSON with keys:
  // assistant (string)
  // kind (string optional)
  // title (string optional)
  // html (string optional) -> full HTML document if building/editing
  // If editing: use provided state.current_html and modify it.

  return `
${bestFriend}

${modeRules[mode] || modeRules.building}

${proNote}

YOU MUST OUTPUT STRICT JSON ONLY (no markdown, no backticks).
Schema:
{
  "assistant": "string",
  "kind": "landing_page|pricing_section|resume|dashboard|layout|wireframe|preview",
  "title": "short title",
  "html": "FULL HTML DOCUMENT (optional)"
}

BUILDING RULES:
- When action="build": return a complete, standalone HTML document.
- Use a dark, clean style similar to a modern SaaS landing page.
- Include sections: Hero, 3 feature rows, pricing cards (Starter/Pro/Enterprise), and buttons.
- Keep HTML self-contained (inline CSS, no external assets).

EDITING RULES:
- When action="edit": you will be given state.current_html.
- Return the SAME document with ONLY requested changes.
- Do NOT wipe content. Do NOT return commentary in html.
- Keep layout; only modify what user asked.

If user request is unclear, still respond as Simo and propose a next step, and only include html if it's clearly a build/edit request.
`.trim();
}

function fallbackAssistant(mode) {
  if (mode === "venting") return "I got you. Tell me what part is hitting the hardest right now.";
  if (mode === "solving") return "Okay—what’s the goal and what’s the one thing blocking you right now?";
  return "Okay. Tell me what you want to build (landing page, pricing section, dashboard, resume), and I’ll render it.";
}

// -----------------------------
// OpenAI call (Chat Completions)
// -----------------------------
async function callOpenAI_JSON(apiKey, model, systemPrompt, payload) {
  const userPrompt = `
Action: ${payload.action}
Mode: ${payload.mode}
Pro: ${payload.pro ? "true" : "false"}

User message:
${payload.message}

Current state:
${JSON.stringify(payload.state || {}, null, 2)}

If action="edit", state.current_html contains the current HTML document to modify.
Return JSON only.
`.trim();

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`OpenAI error ${resp.status}: ${text}`);
  }

  let data = {};
  try { data = JSON.parse(text); } catch { throw new Error("OpenAI returned non-JSON."); }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) return null;

  // Parse the model JSON safely
  const parsed = safeJsonParse(content);
  return parsed;
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    // try to extract first JSON object if the model included extra text
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(s.slice(start, end + 1)); } catch {}
    }
    return null;
  }
}

// -----------------------------
// Deterministic Pro price editing
// -----------------------------
function detectProPriceEdit(message, html) {
  if (!html) return null;
  const m = message.match(/\bpro\b.*\$(\d{1,4})\s*(?:\/\s*mo|mo|month|\/month)?/i) ||
            message.match(/\bchange\b.*\bpro\b.*\bto\b.*\$(\d{1,4})/i);
  if (!m) return null;
  const newPrice = parseInt(m[1], 10);
  if (!Number.isFinite(newPrice) || newPrice <= 0) return null;
  return { newPrice };
}

function applyProPriceEdit(html, newPrice) {
  // Attempt to replace price inside the "Pro" card only.
  // We try a few patterns, but keep it safe.
  const pricePatterns = [
    /\$29\/mo/g,
    /\$29\s*\/\s*mo/g,
    /\$29\/month/g,
    /\$29\s*\/\s*month/g
  ];

  // First: narrow to a chunk around "Pro"
  const idx = html.search(/>\s*Pro\s*</i);
  if (idx >= 0) {
    const start = Math.max(0, idx - 4000);
    const end = Math.min(html.length, idx + 6000);
    const before = html.slice(0, start);
    let chunk = html.slice(start, end);
    const after = html.slice(end);

    // Replace only the first matching $xx/mo in that chunk
    chunk = chunk.replace(/\$(\d{1,4})\s*\/\s*mo/i, `$${newPrice}/mo`);
    chunk = chunk.replace(/\$(\d{1,4})\s*\/\s*month/i, `$${newPrice}/mo`);
    // If Pro card uses "$29/mo" with no spaces
    chunk = chunk.replace(/\$29\/mo/i, `$${newPrice}/mo`);

    return before + chunk + after;
  }

  // Fallback: replace first occurrence globally (least ideal)
  let out = html;
  for (const p of pricePatterns) {
    if (p.test(out)) {
      out = out.replace(p, `$${newPrice}/mo`);
      break;
    }
  }
  // Also handle "$29/mo" with other digits
  out = out.replace(/\$29\s*\/\s*mo/i, `$${newPrice}/mo`);
  return out;
}

function normalizeHtmlDoc(html) {
  const s = html.trim();
  // If model returned only a fragment, wrap it
  const hasHtml = /<html[\s>]/i.test(s);
  const hasBody = /<body[\s>]/i.test(s);
  if (hasHtml && hasBody) return s;

  return `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Preview</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;margin:0;padding:24px;background:#0b1020;color:#eaf0ff}
</style>
</head>
<body>
${s}
</body>
</html>
`.trim();
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST,GET,OPTIONS"
    },
    body: JSON.stringify(obj)
  };
}
