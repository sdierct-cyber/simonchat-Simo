// netlify/functions/chat.js
// Simo single-brain: math + time local, chat via OpenAI, with history support.
// Tone rewrite: best-friend, grounded, fewer therapy questions.
// Guardrail: violence triggers a firm refusal + de-escalation.
// Capability: never says "I can't code it for you" — offers step-by-step building.

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

// ---------- guardrail: violence / harm ----------
function looksLikeViolence(text) {
  if (!text) return false;
  const t = text.toLowerCase();

  // broader match so it triggers even with slang/variations
  const patterns = [
    /\bkick\b.*\bass\b/,
    /\bbeat\b/,
    /\bhit\b/,
    /\bsmack\b/,
    /\bslap\b/,
    /\bpunch\b/,
    /\bassault\b/,
    /\bhurt\b.*\bher\b|\bhurt\b.*\bhim\b|\bhurt\b.*\bthem\b/,
    /\bkill\b/,
  ];

  return patterns.some((re) => re.test(t));
}

function violenceReply() {
  return [
    "Nope. I can’t help with hurting her — even if you’re just blowing off steam.",
    "But I *get* the feeling: you’re drained and you want peace when you walk in.",
    "",
    "Do this tonight instead (simple, not a big speech):",
    "1) Take 10 minutes when you get home — car, shower, whatever — no talking.",
    "2) Then say: “I’m wiped. Give me 15 to decompress, then I can listen.”",
    "3) If she keeps going, repeat it once and walk away. Boundary, not war.",
    "",
    "What usually happens in the first 2 minutes after you walk in?",
  ].join("\n");
}

// ---------- Simo voice (rewritten hard) ----------
const SIMO_SYSTEM = `
You are Simo — the user's trusted best friend.

Core vibe:
- Grounded, loyal, human.
- Less “therapist,” more “I’ve got you.”
- Speak plainly. No lectures. No HR tone.

How to respond:
- If the user vents: validate fast, then give one practical next move.
- Ask fewer questions. Only ask one when you truly need a detail.
- Avoid “What do you think?” and “How does that sound?” as default phrases.
- Don’t over-explain.

Safety:
- Never help with violence or harm. If the user says anything violent, refuse and de-escalate like a best friend.

Capabilities:
- If asked to code/build something: say yes, and guide step-by-step.
  Do NOT say “I can’t code it for you.” You can provide code and instructions.

Simple rules:
- Math: answer only the final number.
- If you don’t know something, say so plainly and suggest the best next step.

You are not trying to “fix” the user.
You’re trying to help them get through the moment and make a better next move.
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

  if (!text) return json(200, { ok: true, reply: "Say it again — I didn’t catch that." });

  // 0) violence guardrail (local, instant)
  if (looksLikeViolence(text)) {
    return json(200, { ok: true, reply: violenceReply() });
  }

  // 1) math (local)
  const math = tryMath(text);
  if (math !== null) return json(200, { ok: true, reply: math });

  // 2) time (local)
  if (isTimeQuestion(text)) {
    const time = localTimeFromOffset(body.tzOffset);
    return json(200, { ok: true, reply: time || "Open Settings once so I can use your device timezone." });
  }

  // 3) OpenAI chat
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
        temperature: 0.62,
        max_tokens: 420,
      }),
    });

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    return json(200, { ok: true, reply: reply || "I’m here. Say it again." });
  } catch (err) {
    console.error("Simo error:", err);
    return json(200, { ok: true, reply: "I couldn’t reach my brain for a second. Try again." });
  }
};
