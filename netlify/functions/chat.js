// netlify/functions/chat.js
// Simo single-brain: math + time local, chat via OpenAI, with history support.
// Adds a safety guardrail for violence/harm threats, with best-friend de-escalation.

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

  let out;
  switch (op) {
    case "+": out = a + b; break;
    case "-": out = a - b; break;
    case "*": out = a * b; break;
    case "/": out = (b === 0) ? "undefined" : (a / b); break;
    default: return null;
  }
  return typeof out === "string" ? out : String(out);
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

// Convert "now" into the user's local time using tzOffset (minutes).
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

// ---- Violence / harm guardrail (best-friend style) ----
function looksLikeViolence(text) {
  if (!text) return false;
  const t = text.toLowerCase();

  // Keep it simple + obvious. This triggers when user mentions hitting/assaulting someone.
  const patterns = [
    /\bkick (his|her|their)?\s*ass\b/,
    /\bbeat (him|her|them)\b/,
    /\bhit (him|her|them)\b/,
    /\bsmack (him|her|them)\b/,
    /\bput (him|her|them) in (their|a) place\b/,
    /\bkill\b/,
    /\bhurt (him|her|them)\b/,
    /\bassault\b/,
  ];

  return patterns.some((re) => re.test(t));
}

function violenceReply() {
  // Firm boundary + de-escalation, without sounding like HR or a therapist.
  return [
    "Nah. I can’t help with hurting her — even if you’re just venting.",
    "But I *do* get the anger. You’re cooked after work and you want peace, not more noise.",
    "Do this instead, right now:",
    "1) Take 10 minutes when you get home — car, shower, whatever — no talking.",
    "2) Then say one clean line: “I’m drained. I need a bit to decompress, then I can listen.”",
    "If she pushes back, repeat it once and don’t argue. You’re setting a boundary, not starting a war.",
    "",
    "Tell me what usually sets the drama off when you walk in — the first 2 minutes matter.",
  ].join("\n");
}

const SIMO_SYSTEM = [
  "You are Simo — the user's trusted best friend.",
  "Be calm, grounded, and real. Match their tone.",
  "Avoid preachy therapy-speak and generic 'communicate better' lectures unless they ask for that.",
  "Be direct and practical. Keep it human.",
  "If they vent: validate + give a real next step, not a lecture.",
  "Do NOT help with violence, threats, or harming anyone; de-escalate and redirect safely.",
  "If they ask a simple question, answer simply.",
  "If you’re unsure, say so plainly and help them find the answer.",
  "Math rule: for pure arithmetic questions, respond with ONLY the final answer (no steps) unless asked.",
].join(" ");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Use POST." });

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_) {}

  const text = String(body.message || "").trim();
  const history = normalizeHistory(body.history);

  if (!text) {
    return json(200, { ok: true, reply: "Say it again — I didn’t catch that." });
  }

  // 0) violence guardrail (local, instant)
  if (looksLikeViolence(text)) {
    return json(200, { ok: true, reply: violenceReply() });
  }

  // 1) local math
  const math = tryMath(text);
  if (math !== null) {
    return json(200, { ok: true, reply: math });
  }

  // 2) local time
  if (isTimeQuestion(text)) {
    const time = localTimeFromOffset(body.tzOffset);
    return json(200, { ok: true, reply: time || "Set your timezone in Settings and ask again." });
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
        temperature: 0.7,
        max_tokens: 420,
      }),
    });

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    return json(200, {
      ok: true,
      reply: reply || "I blanked for a second — say that again?",
    });
  } catch (err) {
    console.error("Simo error:", err);
    return json(200, {
      ok: true,
      reply: "I couldn’t reach my brain for a second. Try again.",
    });
  }
};
