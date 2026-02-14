// netlify/functions/simon.js
export default async (req) => {
  // --- CORS ---
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
  };
  if (req.method === "OPTIONS") {
    return new Response("", { status: 200, headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing OPENAI_API_KEY" }),
        { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const userText = (body?.message || "").toString();
    const history = Array.isArray(body?.history) ? body.history : []; // [{role:'user'|'assistant', content:'...'}]

    if (!userText.trim()) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing message" }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // ---------------------------
    // Simo Brain: Behavior Contract
    // ---------------------------
    const SYSTEM_PROMPT = `
You are Simo — a private best-friend AI.

Core rule: match the user's vibe, keep up with topic switches, and never get "stuck" repeating yourself.

You have 2 modes:
1) Best-friend mode (default): warm, real, not therapy-speak, short helpful replies.
2) Builder mode: when the user asks to design/build/create an app, website, UI, code, or a concrete artifact.

Mode switching:
- If user asks to design/build/create an app/site/feature/mockup/plan, switch to Builder mode automatically.
- In Builder mode you must immediately ask 1–2 tight questions OR offer a quick preview.
- If the user asks f
