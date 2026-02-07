// netlify/functions/chat.js
// Simo single-brain: math + time local, chat via OpenAI, with history support.
// Tone rewritten: grounded best-friend, less therapy-speak, more practical.

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(obj),
  };
}

// ---------- utilities ----------
function tryMath(text) {
  if (!text) return null;

  const t = text
    .toLowerCase()
    .replace(/multiplied by/g, "*")
    .replace(/\btimes\b/g, "*")
    .replace(/\bx\b/g, "*")
    .replace(/÷/g, "/");

  const m = t.match(/^\s*(-?\d+(\.\d+)?)\s*([+\-*/])\s*(-?\d+(\.\d+)?)\s*$/);
  if (!m) return null;

  const a = Number(m[1]);
  const op = m[3];
  const b = Number(m[4]);

  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  switch (op) {
    case "+": return String(a + b);
    case "-": return String(a - b);
    case "*": return String(a * b);
    case "/": return b === 0 ? "undefined" : String(a / b);
    default: return null;
  }
}

function isTimeQuestion(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return (
    t.includes("what time") ||
    t.includes("time is it") ||
    t.includes("time right now") ||
    (t.includes("time") && t.includes("right")) ||
    t.trim() === "time"
  );
}

function localTimeFromOffset(tzOffsetMinutes) {
  const now = new Date();
  const offset = Number(tzOffsetMinutes);
  if (!Number.isFinite(offset)) return null;

  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const userMs = utcMs - offset * 60000;
  const user = new Date(userMs);

  const hh = user.getHours();
  const mm = String(user.getMinutes()).padStart(2, "0");
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${mm} ${ampm}`;
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim()
    )
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
}

// ---------- safety (violence) ----------
function looksLikeViolence(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  const patterns = [
    /\bkick (his|her|their)?\s*ass\b/,
    /\bbeat (him|her|them)\b/,
    /\bhit (him|her|them)\b/,
    /\bsmack (him|her|them)\b/,
    /\bkill\b/,
    /\bhurt (him|her|them)\b/,
    /\bassault\b/,
  ];
  return patterns.some((re) => re.test(t));
}

function violenceReply() {
  return [
    "No — I can’t help with hurting someone.",
    "I *do* get how angry and fried you are though.",
    "",
    "Right now, the goal isn’t to fix the marriage or win an argument.",
    "It’s to not make tonight worse than it already feels.",
    "",
    "Take 10 minutes when you get home. No talking. Just decompress.",
    "Then say one clear line: “I’m wiped. I need a bit before I can listen.”",
    "",
    "That’s a boundary, not a fight.",
    "Tell me what usually happens in the first few minutes after you walk in.",
  ].join("\n");
}

// ---------- Simo voice (REWRITTEN) ----------
const SIMO_SYSTEM = `
You are Simo — the user's trusted best friend.

Your role:
- Be steady, grounded, and human.
- Sound like someone who knows the user is tired, not broken.
- Speak plainly. No therapy jargon. No HR tone.

How you respond:
- When the user vents, validate first, then offer a practical next move.
- Ask fewer questions. Prefer statements over reflections.
- Avoid "How does that make you feel?" or "What do you think?" unless truly necessary.
- If the user is overwhelmed, slow things down instead of digging deeper.

Boundaries:
- Do not assist with violence, threats, or harming anyone.
- When a line is crossed, refuse calmly and redirect to a safer action without lecturing.

Tone:
- Supportive, loyal, and honest.
- It’s okay to be blunt when the user is clearly exhausted or spiraling.
- Never shame. Never patronize.

Behavior rules:
- For simple math, return only the answer.
- For simple factual questions, be concise.
- If you don’t know something, say so plainly and help the user find it.

You are not trying to fix the user.
You are trying to help them get through the moment.
`.trim();

// ---------- handler ----------
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { ok: false });

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {}

  const text = String(body.message || "").trim();
  const history = normalizeHistory(body.history);

  if (!text) {
    return json(200, { ok: true, reply: "Say it again — I didn’t catch that." });
  }

  // Safety first
  if (looksLikeViolence(text)) {
    return json(200, { ok: true, reply: violenceReply() });
  }

  // Local math
  const math = tryMath(text);
  if (math !== null) {
    return json(200, { ok: true, reply: math });
  }

  // Local time
  if (isTimeQuestion(text)) {
    const time = localTimeFromOffset(body.tzOffset);
    return json(200, {
      ok: true,
      reply: time || "Set your timezone in Settings and ask again."
    });
  }

  // OpenAI chat
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: SIMO_SYSTEM },
          ...history,
          { role: "user", content: text },
        ],
        temperature: 0.65,
        max_tokens: 420,
      }),
    });

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    return json(200, {
      ok: true,
      reply: reply || "I’m here — say that again.",
    });
  } catch (err) {
    console.error("Simo error:", err);
    return json(200, {
      ok: true,
      reply: "I couldn’t reach my brain for a second. Try again.",
    });
  }
};
