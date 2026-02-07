// netlify/functions/chat.js
// Single-brain Simo — no frontend logic, no SDK, no split responses

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    },
    body: JSON.stringify(obj)
  };
}

// ---------- helpers ----------
function tryMath(text) {
  if (!text) return null;
  const t = text.toLowerCase()
    .replace(/times|x/g, "*")
    .replace(/multiplied by/g, "*")
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
  return t.includes("what time") || t.includes("time is it") || t === "time";
}

function getLocalTime() {
  const tz = process.env.TZ || "America/New_York";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date());
}

// ---------- handler ----------
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return json(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false });
  }

  const body = JSON.parse(event.body || "{}");
  const text = (body.message || "").trim();

  // 1) math (local, instant)
  const math = tryMath(text);
  if (math !== null) {
    return json(200, { ok: true, reply: math });
  }

  // 2) time (local, instant)
  if (isTimeQuestion(text)) {
    return json(200, { ok: true, reply: getLocalTime() });
  }

  // 3) OpenAI (everything else)
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are Simo — the user's trusted best friend. Calm, grounded, human. Match their tone. No preachy advice. Be real and supportive."
          },
          { role: "user", content: text }
        ],
        temperature: 0.7,
        max_tokens: 300
      })
    });

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    return json(200, {
      ok: true,
      reply: reply || "I blanked for a second — say that again?"
    });

  } catch (err) {
    console.error("Simo error:", err);
    return json(200, {
      ok: true,
      reply: "I couldn’t reach my brain for a second. Try again."
    });
  }
};
