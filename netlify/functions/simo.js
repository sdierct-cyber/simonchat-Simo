// netlify/functions/simo.js
// Strict JSON output + reliable preview generation (no deps)

function j(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}

function wantsBuildOrPreview(text = "") {
  return /(\bpreview\b|\bshow me\b|\bmockup\b|\bui\b|\bscreen\b|\bbuild\b|\bcreate\b|\bdesign\b|\bapp\b|\bwebsite\b|\bpage\b|\bprototype\b)/i.test(text);
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return j(405, { reply: "Method not allowed.", preview: null });

    const body = JSON.parse(event.body || "{}");
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const builderEnabled = !!body.builderEnabled;
    const forceShow = !!body.forceShow;

    const lastUser = [...messages].reverse().find(m => m.role === "user")?.content || "";
    const askedToBuild = wantsBuildOrPreview(lastUser);

    // Soft gate: offer builder if user asks for building and builder isn't enabled
    if (!builderEnabled && askedToBuild) {
      return j(200, {
        reply: "I can help you think this through here — or I can actually build it and show you a first version. What do you want?",
        preview: null,
        builder: { status: "offered" }
      });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

    if (!OPENAI_API_KEY) return j(500, { reply: "Server is missing OPENAI_API_KEY.", preview: null });

    // --- SYSTEM: Simo personality + builder rules ---
    const SIMO_CORE = `
You are Simo — a trusted best friend first: warm, calm, direct, human.
No corporate voice. No therapy-speak unless asked. Don’t over-explain.
Answer in the user’s tone. Keep it simple, practical, and real.
`.trim();

    const BUILDER_RULES = `
Builder mode is ON. When the user asks to "show me", "preview", "mock up", or asks for an app/website/page:
- Provide a fast first version preview.
- Preview must be a complete HTML document with inline CSS (no external assets).
- Include at least: landing/login, browse listings, listing details, host list-your-space, booking request, messages, profile.
- Keep it clean and modern.
If user request is vague, make reasonable assumptions and still show a first pass.
`.trim();

    // This is the strict schema the model MUST output.
    const schema = {
      name: "simo_reply",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          reply: { type: "string" },
          preview: {
            anyOf: [
              { type: "null" },
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  type: { type: "string", enum: ["html"] },
                  title: { type: "string" },
                  html: { type: "string" }
                },
                required: ["type", "title", "html"]
              }
            ]
          }
        },
        required: ["reply", "preview"]
      }
    };

    // Convert chat history into a single prompt chunk to keep it stable.
    const history = messages
      .slice(-20)
      .map(m => `${m.role.toUpperCase()}: ${String(m.content || "")}`)
      .join("\n");

    // Decide whether we SHOULD produce a preview
    const shouldPreview = builderEnabled && (forceShow || /(\bpreview\b|\bshow me\b|\bmockup\b)/i.test(lastUser) || askedToBuild);

    const userTask = shouldPreview
      ? `User wants a preview. Produce preview HTML for: ${lastUser}`
      : `User wants chat help. Respond as Simo: ${lastUser}`;

    const input = `
${SIMO_CORE}

${builderEnabled ? BUILDER_RULES : ""}

Conversation so far:
${history}

Now do this:
${userTask}

Important:
- Output must follow the JSON schema exactly.
- If preview is requested, preview must not be null.
- If preview is not requested, preview must be null.
`.trim();

    // Call OpenAI Responses API with strict schema output
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        input,
        temperature: 0.7,
        response_format: { type: "json_schema", json_schema: schema }
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return j(200, { reply: "I couldn’t reach my brain for a second. Try again.", preview: null, debug: txt });
    }

    const data = await resp.json();

    // The structured JSON is returned as the "output_text" (string) in many cases;
    // but schema mode should give clean JSON text.
    const outText = data.output_text || "";

    let parsed;
    try {
      parsed = JSON.parse(outText);
    } catch {
      // Absolute fallback: no preview
      return j(200, { reply: "I’m here — tell me what you want to build and I’ll show a first version.", preview: null });
    }

    // Safety: enforce preview rules server-side
    if (!shouldPreview) parsed.preview = null;
    if (shouldPreview && !parsed.preview) {
      parsed.preview = {
        type: "html",
        title: "Space rental app (first pass)",
        html: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SpaceRent — Preview</title>
<style>body{font-family:system-ui;margin:0;background:#0b1220;color:#e8eefc} .wrap{padding:24px} .card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:16px;max-width:860px} a{color:#9fb0d0}</style>
</head><body><div class="wrap"><div class="card"><h2>Preview generator failed</h2><p>Your builder mode is on, but the model didn't return preview HTML. Try again.</p></div></div></body></html>`
      };
    }

    return j(200, {
      reply: parsed.reply || "Okay — what do you want to build first?",
      preview: parsed.preview || null,
      builder: { status: builderEnabled ? "enabled" : "free" }
    });

  } catch (e) {
    return j(200, { reply: "I couldn’t reach my brain for a second. Try again.", preview: null });
  }
};
