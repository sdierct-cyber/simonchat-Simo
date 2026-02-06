
/**
 * Netlify Function: /api/simo  (via redirect)
 * Versioned + GET healthcheck to prove what's live.
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const VERSION = "simo-v1.1-livecheck";

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  },
  body: JSON.stringify(body),
});

const safeTrim = (s) => (typeof s === "string" ? s.trim() : "");
const isProbablyZip = (s) => /^[0-9]{5}(-[0-9]{4})?$/.test(s.trim());

const looksLikeMath = (s) => {
  const t = s.toLowerCase();
  const hasNums = /(\d+(\.\d+)?)/.test(t);
  const hasOp = /(\+|\-|\*|\/|x|×|times|multiplied by|divided by|minus|plus)/.test(t);
  const notTooChatty = t.length <= 60;
  return hasNums && hasOp && notTooChatty;
};

const wantsSteps = (s) => /show (the )?work|steps|explain|how do you|get that|solve it/i 기억.test(s);

function evalBasicMath(exprRaw) {
  let expr = exprRaw.toLowerCase();
  expr = expr
    .replace(/multiplied by/g, "*")
    .replace(/times/g, "*")
    .replace(/[x×]/g, "*")
    .replace(/divided by/g, "/")
    .replace(/plus/g, "+")
    .replace(/minus/g, "-");

  if (!/^[0-9+\-*/().\s]+$/.test(expr)) return null;
  if (/[*\/]{2,}/.test(expr)) return null;

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`"use strict"; return (${expr});`);
    const result = fn();
    if (typeof result !== "number" || !Number.isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}

function formatNumber(n) {
  if (Number.isInteger(n)) return n.toLocaleString("en-US");
  return Number(n.toFixed(6)).toString();
}

// ZIP -> lat/lon using Zippopotam.us (US)
async function zipToLatLonUS(zip) {
  const url = `https://api.zippopotam.us/us/${encodeURIComponent(zip)}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const data = await r.json();
  const place = data?.places?.[0];
  if (!place) return null;
  const lat = Number(place.latitude);
  const lon = Number(place.longitude);
  const label = `${place["place name"]}, ${place["state abbreviation"]} ${data["post code"]}`;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, label };
}

async function openMeteoCurrent(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}` +
    `&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto`;

  const r = await fetch(url);
  if (!r.ok) return null;
  const data = await r.json();
  const c = data?.current;
  if (!c) return null;

  return {
    tempF: c.temperature_2m,
    feelsF: c.apparent_temperature,
    windMph: c.wind_speed_10m,
    precipIn: c.precipitation,
    code: c.weather_code,
    time: c.time,
    tz: data.timezone,
  };
}

function codeToSummary(code) {
  const c = Number(code);
  if (!Number.isFinite(c)) return "weather";
  if (c === 0) return "clear";
  if (c === 1 || c === 2) return "mostly clear";
  if (c === 3) return "cloudy";
  if (c === 45 || c === 48) return "foggy";
  if (c >= 51 && c <= 57) return "drizzle";
  if (c >= 61 && c <= 67) return "rain";
  if (c >= 71 && c <= 77) return "snow";
  if (c >= 80 && c <= 82) return "rain showers";
  if (c >= 85 && c <= 86) return "snow showers";
  if (c === 95) return "thunderstorms";
  if (c === 96 || c === 99) return "thunderstorms with hail";
  return "mixed conditions";
}

function detectIntent(message) {
  const t = message.toLowerCase();

  if (looksLikeMath(message)) return "math";
  if (/\bwhat time is it\b|\btime\b/.test(t)) return "time";
  if (/\bweather\b|\bforecast\b|\btemperature\b|\brain\b|\bsnow\b/.test(t)) return "weather";
  if (/\buse my location\b|\buse location\b|\blocation\b/.test(t)) return "location_request";
  if (/tired of (this )?(argument|loop)|keep going in circles|same fight|same argument|this again/i.test(message))
    return "loop_fatigue";

  return "chat";
}

async function callOpenAI({ messages }) {
  if (!OPENAI_API_KEY) {
    return { ok: false, error: "Missing OPENAI_API_KEY in Netlify env vars (Production)." };
  }

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: OPENAI_MODEL, messages, temperature: 0.8 }),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    return { ok: false, error: `OpenAI API error (${r.status}). ${text || ""}`.trim() };
  }

  const data = await r.json();
  const content = data?.choices?.[0]?.message?.content;
  return { ok: true, content: content || "" };
}

exports.handler = async (event) => {
  // ✅ Healthcheck: proves which function version is live
  if (event.httpMethod === "GET") {
    return json(200, {
      ok: true,
      version: VERSION,
      model: OPENAI_MODEL,
      hasKey: Boolean(OPENAI_API_KEY),
      hint: "POST JSON to this endpoint with {message, history, clientTime, location, zip}.",
    });
  }

  if (event.httpMethod === "OPTIONS") return json(200, { ok: true, version: VERSION });

  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Use POST /api/simo", version: VERSION });

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }

  const message = safeTrim(body.message);
  const history = Array.isArray(body.history) ? body.history : [];
  const clientTime = body.clientTime || null;
  const location = body.location || null;
  const zip = safeTrim(body.zip || "");

  if (!message) return json(400, { ok: false, error: "Missing message", version: VERSION });

  const intent = detectIntent(message);

  // ✅ Math: answer only unless asked for steps
  if (intent === "math") {
    const result = evalBasicMath(message);
    if (result === null) {
      return json(200, { ok: true, reply: "Give me the exact expression (e.g., `217 x 22`).", meta: { intent, version: VERSION } });
    }
    if (!wantsSteps(message)) {
      return json(200, { ok: true, reply: `${formatNumber(result)}`, meta: { intent, version: VERSION } });
    }
    // steps requested → model can explain
  }

  // ✅ Time: never refuse; use clientTime if present
  if (intent === "time") {
    if (clientTime?.iso && clientTime?.tz) {
      const dt = new Date(clientTime.iso);
      const readable = dt.toLocaleString("en-US", {
        timeZone: clientTime.tz,
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      return json(200, { ok: true, reply: `It’s ${readable} (${clientTime.tz}).`, meta: { intent, version: VERSION } });
    }
    return json(200, {
      ok: true,
      reply: "Tell me your city/timezone (or refresh the page) and I’ll tell you the time.",
      meta: { intent, needsClientTime: true, version: VERSION },
    });
  }

  // ✅ Location prompt
  if (intent === "location_request") {
    return json(200, { ok: true, reply: "Yep. Tap **Use my location** or type your ZIP/city and I’ll pull the weather.", meta: { intent, needsGeolocation: true, version: VERSION } });
  }

  // ✅ Weather: ZIP or geolocation; never refuse if data exists
  if (intent === "weather") {
    let lat = null, lon = null, label = "";

    if (zip && isProbablyZip(zip)) {
      const geo = await zipToLatLonUS(zip);
      if (!geo) return json(200, { ok: true, reply: "That ZIP didn’t resolve. Try again (5 digits) or give city/state.", meta: { intent, version: VERSION } });
      lat = geo.lat; lon = geo.lon; label = geo.label;
    } else if (location?.lat != null && location?.lon != null) {
      lat = Number(location.lat); lon = Number(location.lon); label = "your area";
    } else {
      const maybeZipInMsg = message.match(/\b\d{5}(?:-\d{4})?\b/);
      if (maybeZipInMsg?.[0] && isProbablyZip(maybeZipInMsg[0])) {
        const geo = await zipToLatLonUS(maybeZipInMsg[0]);
        if (geo) { lat = geo.lat; lon = geo.lon; label = geo.label; }
      }
    }

    if (lat == null || lon == null) {
      return json(200, { ok: true, reply: "Send your ZIP or tap **Use my location** and I’ll give the current weather.", meta: { intent, needsGeolocation: true, needsZip: true, version: VERSION } });
    }

    const wx = await openMeteoCurrent(lat, lon);
    if (!wx) return json(200, { ok: true, reply: "Weather’s glitching on my end. Try again, or tell me what you’re planning and I’ll help you plan around it.", meta: { intent, version: VERSION } });

    const summary = codeToSummary(wx.code);
    const temp = Math.round(wx.tempF);
    const feels = Math.round(wx.feelsF);
    const wind = Math.round(wx.windMph);
    const rainNote = wx.precipIn && wx.precipIn > 0 ? ` Precip: ${wx.precipIn.toFixed(2)} in.` : "";

    return json(200, {
      ok: true,
      reply: `Right now in ${label}: ${temp}°F (feels like ${feels}°F), ${summary}. Wind ~${wind} mph.${rainNote}`,
      meta: { intent, source: "open-meteo", tz: wx.tz, version: VERSION },
    });
  }

  // ✅ Loop fatigue: no therapy lecture, no circles
  if (intent === "loop_fatigue") {
    return json(200, {
      ok: true,
      reply:
        "Yeah… that loop is exhausting. No more circles.\n\nPick one:\n1) One sentence: what do you want from them?\n2) Copy/paste what they said that set you off.\n3) Just vent — I’m here, no lectures.",
      meta: { intent, version: VERSION },
    });
  }

  // Everything else → OpenAI with best-friend prompt
  const system = systemPrompt({ clientTime, location, zip });

  const messages = [
    { role: "system", content: system },
    ...history
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-12),
    { role: "user", content: message },
  ];

  const oa = await callOpenAI({ messages });
  if (!oa.ok) {
    return json(200, {
      ok: true,
      reply: "I’m here — connection hiccup. Say it again in one line and I’ll grab it.",
      meta: { intent, version: VERSION, error: oa.error },
    });
  }

  return json(200, { ok: true, reply: oa.content, meta: { intent, version: VERSION } });
};

function systemPrompt({ clientTime, location, zip }) {
  const ct = clientTime?.iso && clientTime?.tz ? `Client time available: ${clientTime.iso} (${clientTime.tz}).` : "Client time not provided.";
  const loc = location?.lat != null && location?.lon != null ? `Client location available: lat ${location.lat}, lon ${location.lon}.` : "Client location not provided.";
  const zp = zip ? `ZIP provided: ${zip}.` : "ZIP not provided.";

  return `
You are Simo: the user's private best friend who can handle anything on a moment’s notice.

Style:
- Human, warm, confident, calm. Match the user's tone.
- No therapy-speak by default. No generic “communicate better” lectures unless asked.
- Keep answers efficient; don’t over-explain.

Rules:
- Math: give ONLY the answer unless they ask for steps.
- Time/weather/location: do NOT refuse or loop. If info exists, answer. If missing, ask once.
- If the user is tired of a repeating argument loop: one empathic line + 2–3 options. No lectures.

Context:
- ${ct}
- ${loc}
- ${zp}
`.trim();
}
