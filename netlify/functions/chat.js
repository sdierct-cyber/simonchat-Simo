// netlify/functions/simo.js
export default async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ reply: "Method not allowed." }), { status: 405 });
    }

    const { messages = [], builderEnabled = false, forceShow = false } = await req.json();

    const lastUser = [...messages].reverse().find(m => m.role === "user")?.content || "";
    const wantsBuild = /(\bbuild\b|\bmake\b|\bcreate\b|\bdesign\b|\bwrite\b|\bcode\b|\bfull\b|\blayout\b|\bresume\b|\bwebsite\b|\bdonation\b|\bportfolio\b)/i.test(lastUser);

    // If builder not enabled and user is asking for execution, do the fork + offer
    if (!builderEnabled && wantsBuild) {
      return new Response(JSON.stringify({
        reply: "I can help you think this through here — or I can actually build it and show you a first version. What do you want?",
        builder: { status: "offered", offer_reason: "execution request" }
      }), { status: 200, headers: { "Content-Type": "application/json" }});
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ reply: "Server is missing OPENAI_API_KEY." }), { status: 500 });
    }

    // System prompts (core always; builder adds capabilities)
    const SIMO_CORE = `
You are Simo.
You are not an assistant, tool, or AI helper first. You are a trusted best friend who happens to be capable.
Default goal: connection, understanding, clarity — not output.
Speak like a real person: warm, calm, direct, human. Never corporate. Never robotic. Never salesy.
Adapt to user tone. Never over-explain. Never teach unless asked. Never dump information.
Never push upgrades. Never mention pricing unless instructed by system UI.
If emotions are present, stay with them and do not introduce monetization.
`;

    const SIMO_BUILDER = `
Builder Mode is active. You can execute work fully, not just discuss it.
You may build real artifacts (including HTML) and iterate based on feedback.
Provide a fast first pass so the user has something real to react to.
Describe changes in human language.
If a request is big, break into stages and pace it calmly.
`;

    const SIMO_PREVIEW = `
You control previews.
If the user asks "show me" (or similar) OR seeing something would reduce confusion, provide a preview.
When you provide a preview, include HTML in the response schema.
Never force a preview; offer it naturally.
`;

    // We force the model to output strict JSON so the frontend is stable
    const responseSchema = `
Return ONLY valid JSON with this shape:
{
  "reply": string,
  "preview": { "type": "html", "title": string, "html": string } | null
}

Rules:
- "reply" must always be present.
- If builderEnabled is false, NEVER include a preview unless forceShow is true.
- If builderEnabled is true, you may include a preview when appropriate, especially for websites or donation pages.
- If you include "preview.html", it must be a complete HTML document with inline CSS.
- Keep the preview simple and clean. No external assets.
`;

    const sys = [
      { role: "system", content: SIMO_CORE.trim() },
      ...(builderEnabled ? [{ role: "system", content: SIMO_BUILDER.trim() }, { role: "system", content: SIMO_PREVIEW.trim() }] : []),
      { role: "system", content: responseSchema.trim() },
    ];

    // If not builder, keep it conversational unless forceShow is true
    const userHint = (!builderEnabled && !forceShow)
      ? "\n(Stay in best-friend mode. Ask 1 good question if needed.)"
      : builderEnabled
        ? "\n(If they want a website/donation page/resume layout, you can draft a first-pass preview.)"
        : "\n(They asked to see something. Provide a simple preview if you can.)";

    const payload = {
      model: MODEL,
      messages: [
        ...sys,
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: "user", content: userHint }
      ],
      temperature: 0.7
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const j = await r.json();
    const raw = j?.choices?.[0]?.message?.content || "{}";

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch {
      // Fail safe: return plain reply
      parsed = { reply: "I’m here. Tell me what you want to do next.", preview: null };
    }

    // Enforce rules
    if (!builderEnabled && !forceShow) parsed.preview = null;

    return new Response(JSON.stringify({
      reply: parsed.reply || "I’m here. What’s on your mind?",
      preview: parsed.preview || null,
      builder: { status: builderEnabled ? "enabled" : "free" }
    }), { status: 200, headers: { "Content-Type": "application/json" }});

  } catch (e) {
    return new Response(JSON.stringify({
      reply: "I couldn’t reach my brain for a second. Try again."
    }), { status: 200, headers: { "Content-Type": "application/json" }});
  }
};
