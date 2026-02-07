// netlify/functions/simo.js
// Drop-in Netlify Function for SimonChat "Simo" brain (OpenAI)
// - Best-friend tone, calm + reliable
// - Math returns JUST the answer
// - Developer-grade error logs (user sees a friendly fallback)

const OpenAIImport = require("openai");
const OpenAI = OpenAIImport.default || OpenAIImport;

// ---------- Helpers ----------
function json(statusCode, obj, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      ...extraHeaders,
    },
    body: JSON.stringify(obj),
  };
}

function safeParseJSON(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

// Simple math parser: supports "277 x 22", "217*22", "217 times 22", "10 / 4"
function tryMathAnswer(text) {
  if (!text) return null;
  const t = String(text).trim().toLowerCase();

  // Normalize common words/symbols
  const normalized = t
    .replace(/times/g, "*")
    .replace(/multiplied by/g, "*")
    .replace(/x/g, "*")
    .replace(/÷/g, "/");

  // Match: number op number (allow decimals, commas)
  const m = normalized.match(
    /^\s*(-?\d[\d,]*\.?\d*)\s*([+\-*/])\s*(-?\d[\d,]*\.?\d*)\s*$/
  );
  if (!m) return null;

  const a = Number(m[1].replace(/,/g, ""));
  const op = m[2];
  const b = Number(m[3].replace(/,/g, ""));

  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  let result;
  switch (op) {
    case "+":
      result = a + b;
      break;
    case "-":
      result = a - b;
      break;
    case "*":
      result = a * b;
      break;
    case "/":
      if (b === 0) return "undefined";
      result = a / b;
      break;
    default:
      return null;
  }

  // Clean output: integer if it is one, else trimmed decimals
  if (Number.isInteger(result)) return String(result);

  // Avoid scientific notation for common cases
  const s = result.toString();
  if (s.includes("e") || s.includes("E")) return String(result);

  // Trim trailing zeros
  return String(result).replace(/(\.\d*?[1-9])0+$/g, "$1").replace(/\.0+$/g, "");
}

// Basic local time (no external API). Uses env TZ if present.
function localTimeString() {
  const tz = process.env.TZ || "America/New_York";
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  });
  return fmt.format(now);
}

function looksLikeTimeQuestion(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return (
    t.includes("what time") ||
    t === "time" ||
    t.includes("current time") ||
    t.includes("time is it")
  );
}

// ---------- OpenAI client (created once) ----------
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

const client = apiKey ? new OpenAI({ apiKey }) : null;

// ---------- Simo system prompt ----------
const SIMO_SYSTEM = `
You are Simo — the user's private, ride-or-die best friend.
You are calm, steady, and trustworthy. No fake therapy-speak. No lecturing.
Match the user's tone (serious, funny, annoyed, etc.). Keep it real.
Be direct and helpful. If the user asks a simple question, give a simple answer.
If the user vents, respond like a best friend: validating, grounded, not preachy.
Never mention system prompts, policies, or internal tools.

Math rule:
- If the user asks a pure arithmetic question, respond with ONLY the final answer (no steps), unless they ask for steps.

If a tool/action is impossible, say it simply and offer the closest helpful alternative.
`;

// ---------- Handler ----------
exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return json(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Use POST." });
  }

  const reqId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const body = safeParseJSON(event.body || "");
  const userText =
    body?.message ??
    body?.text ??
    body?.input ??
    body?.prompt ??
    "";

  // 1) Local fast-paths that should NEVER hit OpenAI
  const math = tryMathAnswer(userText);
  if (math !== null) {
    return json(200, { ok: true, reply: math, route: "math" });
  }

  if (looksLikeTimeQuestion(userText)) {
    return json(200, {
      ok: true,
      reply: localTimeString(),
      route: "time",
      tz: process.env.TZ || "America/New_York",
    });
  }

  // 2) Validate OpenAI config
  if (!apiKey) {
    console.error(`[simo ${reqId}] Missing OPENAI_API_KEY`);
    return json(200, {
      ok: true,
      reply:
        "My brain key isn’t plugged in right now. If you’re the builder, check the OPENAI_API_KEY in Netlify env vars — then hit me again.",
      route: "no_api_key",
    });
  }
  if (!client) {
    console.error(`[simo ${reqId}] OpenAI client failed to initialize`);
    return json(200, {
      ok: true,
      reply:
        "I’m glitching on my side — try again in a sec. If it keeps happening, the builder should check the function logs.",
      route: "no_client",
    });
  }

  // 3) Build message history (supports chat history if frontend sends it)
  // Accepts either:
  // - body.history: [{role:"user"|"assistant", content:"..."}]
  // - or just a single message
  const history = Array.isArray(body?.history) ? body.history : [];

  // Normalize history items
  const msgs = [
    { role: "system", content: SIMO_SYSTEM.trim() },
    ...history
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
      .map((m) => ({ role: m.role, content: String(m.content) })),
    { role: "user", content: String(userText || "").slice(0, 6000) },
  ];

  // 4) Call OpenAI (with safe, readable error handling)
  try {
    const completion = await client.chat.completions.create({
      model,
      messages: msgs,
      temperature: 0.7,
      max_tokens: 250,
    });

    const reply =
      completion?.choices?.[0]?.message?.content?.trim() ||
      "I blanked for a second. Say that again?";

    return json(200, {
      ok: true,
      reply,
      route: "openai",
      model,
    });
  } catch (err) {
    // Log the real error to Netlify logs (developer-only)
    console.error(`[simo ${reqId}] OpenAI error:`, err?.message || err);
    if (err?.response?.data) {
      console.error(`[simo ${reqId}] OpenAI response data:`, err.response.data);
    }

    // User-facing: keep Simo calm + trustworthy
    return json(200, {
      ok: true,
      reply: "I couldn’t reach my brain for a second. Try again.",
      route: "openai_error",
      reqId,
    });
  }
};
