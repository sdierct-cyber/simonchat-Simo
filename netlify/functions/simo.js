// netlify/functions/simo.js  (CommonJS - safe on Netlify)

const fetch = global.fetch || require("node-fetch");

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { reply: "Method not allowed." });
    }

    const body = JSON.parse(event.body || "{}");
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const builderToken = body.builderToken || null;
    const forceShow = !!body.forceShow;

    // If you haven't added Stripe token verification yet, keep it simple:
    // builderEnabled comes from the client until you wire entitlement tokens.
    // (Once you wire tokens, replace this with server verification.)
    const builderEnabled = !!body.builderEnabled || !!builderToken;

    const lastUser = [...messages].reverse().find(m => m.role === "user")?.content || "";
    const wantsBuild = /(\bbuild\b|\bmake\b|\bcreate\b|\bdesign\b|\bwrite\b|\bcode\b|\bfull\b|\blayout\b|\bresume\b|\bwebsite\b|\bdonation\b|\bportfolio\b)/i.test(lastUser);

    // Soft gate: if user asks for execution and builder isn't enabled
    if (!builderEnabled && wantsBuild) {
      return json(200, {
        reply: "I can help you think this through here — or I can actually build it and show you a first version. What do you want?",
        builder: { status: "offered" },
        preview: null
      });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

    if (!OPENAI_API_KEY) {
      return json(500, { reply: "Server is missing OPENAI_API_KEY." });
    }

    const SIMO_CORE = `
You are Simo.
You are a trusted best friend first — warm, calm, direct, human.
Never sound corporate or robotic. Never over-explain. Never teach unless asked.
Default to conversation and clarity before output.
Never mention pricing unless UI explicitly instructs you.
If the user is emotional, stay present and grounded — no feature talk.
`.trim();

    const SIMO_BUILDER = `
Builder Mode is active.
You can execute work fully and create real artifacts.
Provide a fast first pass when building something visual.
Describe changes in human language, not technical jargon.
If the request is big, break it into stages calmly.
`.trim();

    const SIMO_PREVIEW = `
You control previews.
If builder is enabled, you may include a preview when helpful (especially for websites/donation pages).
If user asks “show me”, include a preview if possible.
Preview must be complete HTML with inline CSS, no external assets.
`.trim();

    const RESPONSE_SCHEMA = `
Return ONLY valid JSON:
{
  "reply": string,
  "preview": { "type":"html", "title": string, "html": string } | null
}
Rules:
- Always include "reply".
- If builder is NOT enabled, do NOT include preview unless forceShow is true.
`.trim();

    const sys = [
      { role: "system", content: SIMO_CORE },
      ...(builderEnabled ? [
        { role: "system", content: SIMO_BUILDER },
        { role: "system", content: SIMO_PREVIEW },
      ] : []),
      { role: "system", content: RESPONSE_SCHEMA }
    ];

    const payload = {
      model: MODEL,
      temperature: 0.7,
      messages: [
        ...sys,
        ...messages
      ],
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const text = await r.text();
      return json(200, { reply: "I couldn’t reach my brain for a second. Try again.", debug: text });
    }

    const j = await r.json();
    const raw = j?.choices?.[0]?.message?.content || "{}";

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { parsed = { reply: "I’m here. What do you want to do next?", preview: null }; }

    if (!builderEnabled && !forceShow) parsed.preview = null;

    return json(200, {
      reply: parsed.reply || "I’m here. What’s on your mind?",
      preview: parsed.preview || null,
      builder: { status: builderEnabled ? "enabled" : "free" }
    });

  } catch (e) {
    return json(200, { reply: "I couldn’t reach my brain for a second. Try again." });
  }
};
